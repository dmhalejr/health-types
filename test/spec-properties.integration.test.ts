import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadDefinitions, schemaPath } from '../tools/generator/load';
import { prepare } from '../tools/generator';
import { buildDefinitionModel, Definitions } from '../tools/generator/model';
import { FhirVersion } from '../tools/retriever/constants';

const dataDir = join(__dirname, '..', 'data');
const cap = (s: string): string => s[0].toUpperCase() + s.slice(1);

interface SnapshotElement {
  path: string;
  type?: { code: string }[];
}

/** Top-level property names the specification gives a resource. */
const specProperties = (elements: SnapshotElement[]): Set<string> =>
  new Set(
    elements
      .filter(
        (element: SnapshotElement) => element.path.split('.').length === 2,
      )
      .flatMap((element: SnapshotElement) => {
        const name = element.path.split('.')[1];

        return name.endsWith('[x]')
          ? (element.type ?? []).map((t) => name.slice(0, -3) + cap(t.code))
          : [name];
      }),
  );

/**
 * The generated properties are aligned with the specification (T10e), so no
 * resource has a property the specification does not list. This used to be a
 * table of the schema's known disagreements (R5: 86 properties in 11
 * resources; STU3: `extension` on Binary, Bundle and Parameters).
 */
const KNOWN_EXTRA_PROPERTIES: Record<FhirVersion, Record<string, number>> = {
  STU3: {},
  R4: {},
  R4B: {},
  R5: {},
};

(Object.keys(KNOWN_EXTRA_PROPERTIES) as FhirVersion[]).forEach(
  (version: FhirVersion) =>
    describe.skipIf(!existsSync(schemaPath(dataDir, version)))(
      `${version}: generated properties against the specification`,
      () => {
        let resourceCount = 0;
        const extras: Record<string, number> = {};
        const missing: string[] = [];

        // Loaded in beforeAll, not while collecting tests, so the suite skips cleanly without data.
        beforeAll(() => {
          const definitions: Definitions = loadDefinitions(dataDir, version);
          const { options } = prepare({ version, dataDir });
          const profiles = JSON.parse(
            readFileSync(
              join(dataDir, version, 'profiles-resources.json'),
              'utf-8',
            ),
          ).entry.map(
            (entry: { resource: Record<string, unknown> }) => entry.resource,
          );

          const resources = profiles.filter(
            (sd: Record<string, unknown>) =>
              sd.resourceType === 'StructureDefinition' &&
              sd.kind === 'resource' &&
              !sd.abstract &&
              definitions[sd.name as string],
          );

          resourceCount = resources.length;
          resources.forEach(
            (sd: {
              name: string;
              snapshot: { element: SnapshotElement[] };
            }) => {
              const spec = specProperties(sd.snapshot.element);
              const generated = buildDefinitionModel(
                sd.name,
                definitions,
                options,
              )
                .properties.map((p) => p.name)
                // `_name` primitive extensions are not spec elements of their own
                // (T10e keeps `_x` exactly when `x` is kept).
                .filter(
                  (name: string) =>
                    name !== 'resourceType' && !name.startsWith('_'),
                );
              const extra = generated.filter((name: string) => !spec.has(name));

              if (extra.length > 0) extras[sd.name] = extra.length;
              [...spec]
                .filter((name: string) => !generated.includes(name))
                .forEach((name: string) => missing.push(`${sd.name}.${name}`));
            },
          );
        });

        it('covers every non-abstract resource', () => {
          expect(resourceCount).toBeGreaterThan(100);
        });

        it('never leaves out a property the specification defines', () => {
          expect(missing).toEqual([]);
        });

        it('has only the known extra properties', () => {
          expect(extras).toEqual(KNOWN_EXTRA_PROPERTIES[version]);
        });
      },
    ),
);
