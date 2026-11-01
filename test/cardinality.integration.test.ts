import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CardinalityResult,
  deriveRequired,
} from '../tools/generator/cardinality';
import { schemaPath } from '../tools/generator/load';
import { buildDefinitionModel, Definitions } from '../tools/generator/model';
import { loadSpec, Spec } from '../tools/generator/spec-index';
import { PropertyModel } from '../tools/generator/types';
import { FhirVersion } from '../tools/retriever/constants';

const dataDir = join(__dirname, '..', 'data');

/** Properties the spec requires that the schema leaves optional (measured 2026-10-31). */
const NEWLY_REQUIRED: Record<FhirVersion, number> = {
  STU3: 344,
  R4: 408,
  R4B: 427,
  R5: 458,
};

interface Context {
  definitions: Definitions;
  propertiesOf: (name: string) => PropertyModel[];
  spec: Spec;
  result: CardinalityResult;
}

// Loaded in beforeAll, not while collecting tests, so the suites skip cleanly without data.
const load = (version: FhirVersion): Context => {
  const definitions: Definitions = JSON.parse(
    readFileSync(schemaPath(dataDir, version), 'utf-8'),
  ).definitions;
  const cache = new Map<string, PropertyModel[]>();
  const propertiesOf = (name: string): PropertyModel[] => {
    if (!cache.has(name))
      cache.set(name, buildDefinitionModel(name, definitions).properties);

    return cache.get(name) as PropertyModel[];
  };
  const spec = loadSpec(dataDir, version);
  const result = deriveRequired(
    spec.structureDefinitions,
    propertiesOf,
    (n: string) => n in definitions,
  );

  return { definitions, propertiesOf, spec, result };
};

(Object.keys(NEWLY_REQUIRED) as FhirVersion[]).forEach((version: FhirVersion) =>
  describe.skipIf(!existsSync(schemaPath(dataDir, version)))(
    `${version}: required fields from the specification`,
    () => {
      let context: Context;

      beforeAll(() => {
        context = load(version);
      });

      it('resolves every element path to a generated property', () => {
        expect(context.result.unresolved).toEqual([]);
      });

      it('makes exactly the measured number of schema-optional properties required', () => {
        const newly = [...context.result.required].filter((key: string) => {
          const [definition, ...rest] = key.split('.');
          const property = context
            .propertiesOf(definition)
            .find((p) => p.name === rest.join('.'));

          return property && !property.required;
        });

        expect(newly).toHaveLength(NEWLY_REQUIRED[version]);
      });

      it('leaves choice elements optional', () => {
        expect(context.result.skipped.choice).toBeGreaterThan(0);
      });

      it('matches the specification for every non-abstract resource', () => {
        const { definitions, propertiesOf, spec, result } = context;
        const model = (name: string) =>
          buildDefinitionModel(name, definitions, { required: result.required })
            .properties;
        const wrong: string[] = [];
        let checked = 0;

        spec.structureDefinitions
          .filter(
            (sd) =>
              sd.kind === 'resource' && !sd.abstract && sd.name in definitions,
          )
          .forEach((sd) => {
            const properties = model(sd.name);

            sd.elements
              .filter(
                (e) =>
                  e.path.split('.').length === 2 && !e.path.endsWith('[x]'),
              )
              .forEach((element) => {
                const found = properties.find(
                  (p) => p.name === element.path.split('.')[1],
                );

                if (!found) return;
                checked++;
                if (element.min >= 1 && !found.required)
                  wrong.push(`${element.path} should be required`);
                if (element.min < 1 && found.required) {
                  const inSchema = propertiesOf(sd.name).find(
                    (p) => p.name === found.name,
                  );

                  if (!inSchema?.required)
                    wrong.push(`${element.path} should be optional`);
                }
              });
          });

        expect(checked).toBeGreaterThan(1000);
        expect(wrong).toEqual([]);
      });
    },
  ),
);

describe.skipIf(!existsSync(schemaPath(dataDir, 'R4')))('R4 examples', () => {
  let required: ReadonlySet<string>;

  beforeAll(() => {
    required = load('R4').result.required;
  });

  it.each([
    'Appointment.status',
    'Extension.url',
    'Binary.contentType',
    'Observation.status',
  ])('%s is required by the spec', (key: string) =>
    expect(required.has(key)).toBe(true),
  );

  it('keeps optional what the spec leaves optional', () => {
    ['Patient.gender', 'Patient.name', 'Extension.id'].forEach((key: string) =>
      expect(required.has(key), key).toBe(false),
    );
  });
});
