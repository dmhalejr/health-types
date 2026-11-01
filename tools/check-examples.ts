import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import ts from 'typescript';
import { generate } from './generator';
import { isSupportedVersion } from './generator/load';
import { EXAMPLES_DIR, retrieveExamples } from './retriever/examples';

/**
 * Type-checks HL7's official example resources, as object literals, against
 * the generated types of one FHIR version. A release gate: an example that
 * the types reject for a reason the example does not share is a bug here.
 */

export type Category =
  | 'primitive-extension'
  | 'excess-property'
  | 'not-assignable'
  | 'missing-required'
  | 'null-placeholder'
  | 'too-complex'
  | 'other';

/**
 * Whose fault a rejection is. `missing-required` means the example lacks a
 * field the specification requires, `too-complex` is a compiler limit on huge
 * literals, and `null-placeholder` is a known, documented limitation (arrays of
 * primitives are not nullable); none of these fails the gate. The rest do.
 */
export const GENERATOR_CATEGORIES: Category[] = [
  'primitive-extension',
  'excess-property',
  'not-assignable',
  'other',
];

export interface Classified {
  category: Category;
  /** `Type.property` or a short excerpt, for the report. */
  detail: string;
}

/** Sorts one TypeScript diagnostic (code and flattened message) into a category. */
export const classify = (code: number, message: string): Classified => {
  if (code === 2590)
    return { category: 'too-complex', detail: 'union type too complex' };

  let match = message.match(/'"?(\w+)"?' does not exist in type '([^']+)'/);

  if (match) {
    return {
      category: match[1].startsWith('_')
        ? 'primitive-extension'
        : 'excess-property',
      detail: `${match[2].replace(/ \| undefined$/, '')}.${match[1]}`,
    };
  }

  match = message.match(
    /Property '(\w+)' is missing in type .* but required in type '([^']+)'/,
  );
  if (match)
    return { category: 'missing-required', detail: `${match[2]}.${match[1]}` };

  match = message.match(
    /Type '"?([^']*?)"?' is not assignable to type '([^']{0,60})/,
  );
  if (match) {
    const detail = `${match[1].slice(0, 30)} -> ${match[2]}`;

    // FHIR JSON puts null in an array of primitives where only the matching
    // `_name` entry has content; the types do not allow that (documented).
    return {
      category: match[1] === 'null' ? 'null-placeholder' : 'not-assignable',
      detail,
    };
  }

  return { category: 'other', detail: message.slice(0, 100) };
};

export interface Options {
  version: string;
  dataDir: string;
  /** Examples type-checked per compiler program; keeps memory bounded. */
  batch: number;
}

export interface Report {
  checked: number;
  passed: number;
  failedFiles: Map<Category, Set<string>>;
  details: Map<Category, Map<string, number>>;
}

export const checkExamples = async (
  { version, dataDir, batch }: Options,
  log: (m: string) => void,
): Promise<Report> => {
  if (!isSupportedVersion(version))
    throw new Error(`Unsupported FHIR version "${version}"`);

  await retrieveExamples({ version, dataDir, log });
  const work = mkdtempSync(join(tmpdir(), 'health-types-examples-'));

  try {
    const names = new Set(
      generate({ version, dataDir, out: join(work, 'gen') }),
    );
    const list = readFileSync(
      join(work, 'gen', version, 'ResourceList.ts'),
      'utf-8',
    );
    const resources = new Set(
      (list.match(/^ {2}\| (\w+)/gm) ?? []).map((l) =>
        l.replace(/^ {2}\| /, ''),
      ),
    );
    const exampleDir = join(dataDir, version, EXAMPLES_DIR);
    const origin = new Map<string, string>();

    mkdirSync(join(work, 'ex'));
    readdirSync(exampleDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .forEach((file) => {
        let json: { resourceType?: unknown };

        try {
          json = JSON.parse(readFileSync(join(exampleDir, file), 'utf-8'));
        } catch {
          return;
        }

        const type = json && json.resourceType;

        if (
          typeof type !== 'string' ||
          !names.has(type) ||
          !resources.has(type)
        )
          return;

        const id = `e${String(origin.size).padStart(4, '0')}.ts`;

        origin.set(id, file);
        writeFileSync(
          join(work, 'ex', id),
          `import type { ${type} } from '../gen/${version}/${type}';\nexport const value: ${type} = ${JSON.stringify(
            json,
          )};\n`,
        );
      });

    log(
      `${version}: type-checking ${origin.size} examples in batches of ${batch}`,
    );
    const files = [...origin.keys()].map((id) => join(work, 'ex', id));
    const report: Report = {
      checked: files.length,
      passed: 0,
      failedFiles: new Map(),
      details: new Map(),
    };
    const failed = new Set<string>();

    for (let i = 0; i < files.length; i += batch) {
      const program = ts.createProgram(files.slice(i, i + batch), {
        noEmit: true,
        strict: true,
        target: ts.ScriptTarget.ES2019,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        types: [],
        skipLibCheck: true,
      });

      ts.getPreEmitDiagnostics(program)
        .filter(
          (d) => d.file && d.file.fileName.includes(`${join(work, 'ex')}`),
        )
        .forEach((d) => {
          const file = origin.get(
            (d.file as ts.SourceFile).fileName.split('/').pop() as string,
          ) as string;
          const { category, detail } = classify(
            d.code,
            ts.flattenDiagnosticMessageText(d.messageText, ' | '),
          );

          failed.add(file);
          if (!report.failedFiles.has(category))
            report.failedFiles.set(category, new Set());
          report.failedFiles.get(category)?.add(file);
          if (!report.details.has(category))
            report.details.set(category, new Map());
          report.details
            .get(category)
            ?.set(detail, (report.details.get(category)?.get(detail) ?? 0) + 1);
        });
    }

    report.passed = report.checked - failed.size;

    return report;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
};

const arg = (name: string, fallback?: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);

  return index >= 0 ? process.argv[index + 1] : fallback;
};

const main = async (): Promise<void> => {
  const version = arg('version');

  if (!version) {
    console.error(
      'Usage: npm run check:examples -- --version <STU3|R4|R4B|R5> [--data data] [--batch 200]',
    );
    process.exit(2);
  }

  const report = await checkExamples(
    {
      version,
      dataDir: arg('data', 'data') as string,
      batch: Number(arg('batch', '200')),
    },
    console.log,
  );
  const percent = ((100 * report.passed) / report.checked).toFixed(1);

  console.log(
    `\n${version}: ${report.passed} of ${report.checked} official examples pass (${percent}%)`,
  );
  [...report.failedFiles]
    .sort((a, b) => b[1].size - a[1].size)
    .forEach(([category, files]) => {
      const top = [...(report.details.get(category) ?? [])]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

      console.log(
        `  ${String(files.size).padStart(5)} files  ${category}${
          GENERATOR_CATEGORIES.includes(category) ? '   <-- generator' : ''
        }`,
      );
      console.log(`         ${top.map(([d, n]) => `${d} (${n})`).join(' ; ')}`);
    });

  const defects = GENERATOR_CATEGORIES.reduce(
    (sum, c) => sum + (report.failedFiles.get(c)?.size ?? 0),
    0,
  );

  console.log(
    defects === 0
      ? "No rejection is the generator's doing."
      : `${defects} file(s) rejected for reasons that point at the generator.`,
  );
  process.exit(defects === 0 ? 0 : 1);
};

if (require.main === module) {
  main().catch((error: Error) => {
    console.error(error.message);
    process.exit(2);
  });
}
