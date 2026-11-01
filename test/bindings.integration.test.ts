import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BindingResult,
  CodeBinding,
  deriveCodeBindings,
} from '../tools/generator/bindings';
import { schemaPath } from '../tools/generator/load';
import { buildDefinitionModel, Definitions } from '../tools/generator/model';
import { loadSpec } from '../tools/generator/spec-index';
import { PropertyModel, TypeModel } from '../tools/generator/types';
import { FhirVersion } from '../tools/retriever/constants';

const dataDir = join(__dirname, '..', 'data');

/**
 * What the resolver derives from each version's own HL7 data (measured
 * 2026-10-31). `skipped` is every required `code` binding that stays `string`.
 */
const EXPECTED: Record<
  FhirVersion,
  { derived: number; skipped: number; bothWithSchema: number }
> = {
  STU3: { derived: 294, skipped: 10, bothWithSchema: 223 },
  R4: { derived: 338, skipped: 14, bothWithSchema: 245 },
  R4B: { derived: 354, skipped: 14, bothWithSchema: 26 },
  R5: { derived: 386, skipped: 177, bothWithSchema: 26 },
};

const literalOf = (type: TypeModel): string[] | undefined =>
  type.kind === 'literal'
    ? type.values
    : type.kind === 'array'
    ? literalOf(type.item)
    : undefined;

(Object.keys(EXPECTED) as FhirVersion[]).forEach((version: FhirVersion) =>
  describe.skipIf(!existsSync(schemaPath(dataDir, version)))(
    `${version}: code bindings from value sets`,
    () => {
      let propertiesOf: (name: string) => PropertyModel[];
      let result: BindingResult;

      // Loaded in beforeAll, not while collecting tests, so the suite can skip without data.
      beforeAll(() => {
        const definitions: Definitions = JSON.parse(
          readFileSync(schemaPath(dataDir, version), 'utf-8'),
        ).definitions;
        const cache = new Map<string, PropertyModel[]>();

        propertiesOf = (name: string): PropertyModel[] => {
          if (!cache.has(name))
            cache.set(name, buildDefinitionModel(name, definitions).properties);

          return cache.get(name) as PropertyModel[];
        };

        const spec = loadSpec(dataDir, version);

        result = deriveCodeBindings(
          spec.structureDefinitions,
          spec.terminology,
          propertiesOf,
          (name: string) => name in definitions,
        );
      });

      it('resolves every element path to a generated property', () => {
        expect(result.unresolved).toEqual([]);
      });

      it('derives the measured number of unions and skips', () => {
        expect({
          derived: result.bindings.length,
          skipped: result.skipped.length,
        }).toEqual({
          derived: EXPECTED[version].derived,
          skipped: EXPECTED[version].skipped,
        });
      });

      it('agrees exactly with the schema where the schema inlines an enum', () => {
        const compared = result.bindings.flatMap((binding: CodeBinding) => {
          const property = propertiesOf(binding.definition).find(
            (p) => p.name === binding.property,
          );
          const inline = property && literalOf(property.type);

          return inline ? [{ binding, inline }] : [];
        });
        const mismatches = compared.filter(
          ({ binding, inline }) =>
            inline.length !== binding.codes.length ||
            !inline.every((code: string) => binding.codes.includes(code)),
        );

        expect(compared).toHaveLength(EXPECTED[version].bothWithSchema);
        expect(
          mismatches.map(
            ({ binding }) => `${binding.definition}.${binding.property}`,
          ),
        ).toEqual([]);
      });

      it('has no duplicate codes in any list', () => {
        result.bindings.forEach((binding: CodeBinding) =>
          expect(
            new Set(binding.codes).size,
            `${binding.definition}.${binding.property}`,
          ).toBe(binding.codes.length),
        );
      });
    },
  ),
);
