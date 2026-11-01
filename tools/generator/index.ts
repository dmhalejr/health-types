import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { deriveAlignment } from './alignment';
import { deriveCodeBindings, toBindingMap } from './bindings';
import { deriveRequired } from './cardinality';
import { emitDefinition, EmitOptions } from './emit';
import {
  FhirVersion,
  isSupportedVersion,
  loadDefinitions,
  SUPPORTED_VERSIONS,
} from './load';
import {
  buildDefinitionModel,
  Definitions,
  ModelOptions,
  objectDefinitionNames,
} from './model';
import { collectRefs } from './refs';
import { loadSpec } from './spec-index';
import { PropertyModel } from './types';

export interface GenerateTypesOptions extends EmitOptions, ModelOptions {
  /** File extension: `.d.ts` for the published package (default `.ts`). */
  extension?: '.ts' | '.d.ts';
  /** Generate only these definitions and everything they refer to, so the output compiles. */
  only?: string[];
}

const distance = (a: string, b: string): number => {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];

    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];

      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }

  return row[b.length];
};

/** Known names that look like `name`: same letters in another case, or one or two edits away. */
export const suggestNames = (name: string, known: string[]): string[] =>
  known
    .filter(
      (candidate: string) =>
        candidate.toLowerCase() === name.toLowerCase() ||
        distance(candidate.toLowerCase(), name.toLowerCase()) <= 2,
    )
    .sort()
    .slice(0, 3);

/**
 * The definitions to generate for `roots`: the roots and, transitively, every
 * definition they import. The members of a union such as `ResourceList` are
 * not followed (every resource is reachable through it); `generateTypes`
 * lists only the generated ones in the union instead. Throws for a name the
 * version does not have.
 */
export const closureOf = (
  roots: string[],
  definitions: Definitions,
  options: ModelOptions = {},
): string[] => {
  const known = objectDefinitionNames(definitions);
  const unknown = roots.filter((name: string) => !known.includes(name));

  if (unknown.length > 0) {
    const hints = unknown
      .map((name: string) => {
        const similar = suggestNames(name, known);

        return similar.length > 0
          ? `"${name}" (did you mean ${similar.join(', ')}?)`
          : `"${name}"`;
      })
      .join(', ');

    throw new Error(`Unknown definition ${hints}`);
  }

  const seen = new Set<string>();
  const queue = [...roots];

  while (queue.length > 0) {
    const name = queue.pop() as string;

    if (!seen.has(name)) {
      seen.add(name);
      const model = buildDefinitionModel(name, definitions, options);

      if (!model.unionOf) queue.push(...collectRefs(model));
    }
  }

  return [...seen].sort();
};

/**
 * Empties a directory the generator wrote to, so files of an earlier run do
 * not linger. Refuses a directory holding anything but `.ts` files: that is
 * not ours to delete.
 */
export const cleanGeneratedDir = (dir: string): void => {
  if (!existsSync(dir)) return;

  const foreign = readdirSync(dir).filter(
    (entry: string) => !entry.endsWith('.ts'),
  );

  if (foreign.length > 0) {
    throw new Error(
      `Refusing to clean ${dir}: it holds files that are not generated .ts files (${foreign
        .slice(0, 3)
        .join(', ')}). Remove it yourself or choose another --out.`,
    );
  }

  rmSync(dir, { recursive: true, force: true });
};

/**
 * Runs `write` against a staging directory beside `dir`, then replaces `dir`
 * with it. If `write` throws, or `dir` holds files that are not ours, `dir`
 * is left exactly as it was.
 */
export const replaceGeneratedDir = <T>(
  dir: string,
  write: (staging: string) => T,
): T => {
  const staging = `${dir}.partial-${process.pid}`;

  mkdirSync(dirname(dir), { recursive: true });
  rmSync(staging, { recursive: true, force: true });

  try {
    const result = write(staging);

    cleanGeneratedDir(dir);
    renameSync(staging, dir);

    return result;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
};

/**
 * Writes `<outDir>/<Name>.ts` for every object or union definition (or for
 * `only` and what it needs) and returns the names written, sorted.
 */
export const generateTypes = (
  definitions: Definitions,
  outDir: string,
  {
    bindings,
    required,
    alignment,
    lineWidth,
    only,
    extension = '.ts',
  }: GenerateTypesOptions = {},
): string[] => {
  const names = only
    ? closureOf(only, definitions, { bindings, required, alignment })
    : objectDefinitionNames(definitions).sort();

  const generated = new Set(names);

  mkdirSync(outDir, { recursive: true });
  names.forEach((name: string) => {
    const model = buildDefinitionModel(name, definitions, {
      bindings,
      required,
      alignment,
    });

    writeFileSync(
      join(outDir, `${name}${extension}`),
      emitDefinition(
        // A subset's union lists only what exists, so the files compile on their own.
        only && model.unionOf
          ? {
              ...model,
              unionOf: model.unionOf.filter((member: string) =>
                generated.has(member),
              ),
            }
          : model,
        { lineWidth },
      ),
    );
  });

  return names;
};

export interface GenerateOptions extends EmitOptions {
  version: string;
  /** Only these definitions (and what they import); default all. */
  resources?: string[];
  /** Write `.d.ts` files, as in the published package (default `.ts`). */
  extension?: '.ts' | '.d.ts';
  /** Empty `<out>/<version>` first, so files of an earlier run do not linger. */
  clean?: boolean;
  /** Directory the retriever downloaded schemas into (default `data`). */
  dataDir?: string;
  /** Output root; files go to `<out>/<version>/` (default `generated`). */
  out?: string;
}

export interface Prepared {
  definitions: Definitions;
  /** Bindings, required fields and alignment derived from the version's own spec data. */
  options: GenerateTypesOptions;
}

/**
 * Reads one version's schema and spec data and derives everything the
 * generator applies on top of the schema: code unions, required fields and
 * the property alignment. Fails if any spec path does not map to a type.
 */
export const prepare = ({
  version,
  dataDir = 'data',
}: Pick<GenerateOptions, 'version' | 'dataDir'>): Prepared => {
  if (!isSupportedVersion(version)) {
    throw new Error(
      `Unsupported FHIR version "${version}". Supported: ${SUPPORTED_VERSIONS.join(
        ', ',
      )}`,
    );
  }

  const definitions = loadDefinitions(dataDir, version as FhirVersion);
  const spec = loadSpec(dataDir, version);
  const models = new Map<string, PropertyModel[]>();
  const propertiesOf = (name: string): PropertyModel[] => {
    if (!models.has(name)) {
      models.set(name, buildDefinitionModel(name, definitions).properties);
    }

    return models.get(name) as PropertyModel[];
  };

  const derived = deriveCodeBindings(
    spec.structureDefinitions,
    spec.terminology,
    propertiesOf,
    (name: string) => name in definitions,
  );

  if (derived.unresolved.length > 0) {
    throw new Error(
      `${version}: element paths with no generated property: ${derived.unresolved.join(
        ', ',
      )}`,
    );
  }

  const cardinality = deriveRequired(
    spec.structureDefinitions,
    propertiesOf,
    (name: string) => name in definitions,
  );

  if (cardinality.unresolved.length > 0) {
    throw new Error(
      `${version}: element paths with no generated property: ${cardinality.unresolved.join(
        ', ',
      )}`,
    );
  }

  const alignment = deriveAlignment(
    spec.structureDefinitions,
    propertiesOf,
    (name: string) => name in definitions,
  );

  if (alignment.conflicts.length > 0 || alignment.unresolved.length > 0) {
    throw new Error(
      `${version}: the specification lists some definitions inconsistently (${alignment.conflicts.join(
        ', ',
      )}) or names paths with no generated type (${alignment.unresolved.join(
        ', ',
      )})`,
    );
  }

  return {
    definitions,
    options: {
      bindings: toBindingMap(derived.bindings),
      required: cardinality.required,
      alignment,
    },
  };
};

/** Generates all types for one FHIR version and returns the names written. */
export const generate = ({
  version,
  dataDir = 'data',
  out = 'generated',
  lineWidth,
  resources,
  clean = false,
  extension,
}: GenerateOptions): string[] => {
  if (resources && resources.length === 0) {
    throw new Error(
      'No resources given: name at least one, or leave resources out to generate everything',
    );
  }

  const { definitions, options } = prepare({ version, dataDir });
  const outDir = join(out, version);

  if (resources) closureOf(resources, definitions, options); // fail before writing anything

  const write = (dir: string): string[] =>
    generateTypes(definitions, dir, {
      ...options,
      lineWidth,
      only: resources,
      extension,
    });

  return clean ? replaceGeneratedDir(outDir, write) : write(outDir);
};
