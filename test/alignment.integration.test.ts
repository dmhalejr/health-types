import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  Alignment,
  alignProperties,
  deriveAlignment,
} from '../tools/generator/alignment';
import { schemaPath } from '../tools/generator/load';
import {
  buildDefinitionModel,
  Definitions,
  objectDefinitionNames,
} from '../tools/generator/model';
import { loadSpec } from '../tools/generator/spec-index';
import { PropertyModel } from '../tools/generator/types';
import { FhirVersion } from '../tools/retriever/constants';

const dataDir = join(__dirname, '..', 'data');

/** The R5 resources whose schema carries base-type properties the specification does not list. */
const R5_LEAK = new Set([
  'ChargeItemDefinition',
  'Citation',
  'CompartmentDefinition',
  'ConditionDefinition',
  'Evidence',
  'EvidenceReport',
  'EvidenceVariable',
  'MedicationKnowledge',
  'ObservationDefinition',
  'Questionnaire',
  'SpecimenDefinition',
]);

type Class =
  | 'modifierExtension on an Element-typed datatype child'
  | 'extension via STU3 Resource inheriting Element'
  | 'R5 base-type leak'
  | 'choice alternative beyond the specification'
  | 'SimpleQuantity key duplicating a Quantity key'
  | 'UNCLASSIFIED';

interface Expected {
  modifier: number;
  extension: number;
  leak: number;
  choice: number;
  simpleQuantityKeys: number;
  renames: string[];
}

/** What aligning with the specification removes, measured 2026-10-31. Anything else is a failure. */
const EXPECTED: Record<FhirVersion, Expected> = {
  STU3: {
    modifier: 11,
    extension: 4,
    leak: 0,
    choice: 126,
    simpleQuantityKeys: 9,
    renames: [
      'Dosage.doseSimpleQuantity->doseQuantity',
      'Dosage.rateSimpleQuantity->rateQuantity',
      'MedicationAdministration_Dosage.rateSimpleQuantity->rateQuantity',
      'NutritionOrder_Administration.rateSimpleQuantity->rateQuantity',
    ],
  },
  R4: {
    modifier: 14,
    extension: 0,
    leak: 0,
    choice: 0,
    simpleQuantityKeys: 0,
    renames: [],
  },
  R4B: {
    modifier: 13,
    extension: 0,
    leak: 0,
    choice: 0,
    simpleQuantityKeys: 0,
    renames: [],
  },
  R5: {
    modifier: 17,
    extension: 0,
    leak: 86,
    choice: 0,
    simpleQuantityKeys: 0,
    renames: [],
  },
};

interface Analysis {
  alignment: Alignment;
  counts: Map<Class, string[]>;
  renamed: string[];
  missing: string[];
  extra: string[];
}

const analyse = (version: FhirVersion): Analysis => {
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
  const alignment = deriveAlignment(
    spec.structureDefinitions,
    propertiesOf,
    (n: string) => n in definitions,
  );
  const bases = new Set<string>();

  spec.structureDefinitions.forEach((sd) =>
    sd.elements.forEach((e) => {
      const last = e.path.split('.').pop() as string;

      if (last.endsWith('[x]')) bases.add(last.slice(0, -3));
    }),
  );

  const classify = (definition: string, name: string): Class => {
    if (name === 'modifierExtension')
      return 'modifierExtension on an Element-typed datatype child';
    if (version === 'STU3' && name === 'extension')
      return 'extension via STU3 Resource inheriting Element';
    if (version === 'R5' && R5_LEAK.has(definition)) return 'R5 base-type leak';
    if (/SimpleQuantity$/.test(name))
      return 'SimpleQuantity key duplicating a Quantity key';
    if (
      [...bases].some(
        (base) => name.startsWith(base) && name.length > base.length,
      )
    ) {
      return 'choice alternative beyond the specification';
    }

    return 'UNCLASSIFIED';
  };

  const counts = new Map<Class, string[]>();
  const renamed: string[] = [];
  const missing: string[] = [];
  const extra: string[] = [];

  objectDefinitionNames(definitions).forEach((name: string) => {
    const result = alignProperties(name, propertiesOf(name), alignment);
    const listed = alignment.listed.get(name);

    result.renamed.forEach(([from, to]) =>
      renamed.push(`${name}.${from}->${to}`),
    );
    result.dropped
      .filter((property: string) => !property.startsWith('_'))
      .forEach((property: string) => {
        const kind = classify(name, property);

        counts.set(kind, [...(counts.get(kind) ?? []), `${name}.${property}`]);
      });

    if (listed) {
      const present = new Set(result.properties.map((p) => p.name));

      [...listed.names]
        .filter((n) => !present.has(n))
        .forEach((n) => missing.push(`${name}.${n}`));
      result.properties
        .filter(
          (p) =>
            !p.name.startsWith('_') &&
            !(p.name === 'resourceType' && p.type.kind === 'literal'),
        )
        .filter(
          (p) =>
            !listed.names.has(p.name) &&
            !listed.wildcards.some(
              (w) => p.name.startsWith(w) && p.name.length > w.length,
            ),
        )
        .forEach((p) => extra.push(`${name}.${p.name}`));
    }
  });

  return { alignment, counts, renamed, missing, extra };
};

(Object.keys(EXPECTED) as FhirVersion[]).forEach((version: FhirVersion) =>
  describe.skipIf(!existsSync(schemaPath(dataDir, version)))(
    `${version}: alignment with the specification`,
    () => {
      let analysis: Analysis;

      // Loaded in beforeAll, not while collecting tests, so the suite skips cleanly without data.
      beforeAll(() => {
        analysis = analyse(version);
      });

      const count = (kind: Class): number =>
        analysis.counts.get(kind)?.length ?? 0;

      it('lists every definition consistently and resolves every spec path', () => {
        expect(analysis.alignment.conflicts).toEqual([]);
        expect(analysis.alignment.unresolved).toEqual([]);
      });

      it('removes only the known kinds of disagreement, and nothing unclassified', () => {
        expect(analysis.counts.get('UNCLASSIFIED') ?? []).toEqual([]);
        expect({
          modifier: count(
            'modifierExtension on an Element-typed datatype child',
          ),
          extension: count('extension via STU3 Resource inheriting Element'),
          leak: count('R5 base-type leak'),
          choice: count('choice alternative beyond the specification'),
          simpleQuantityKeys: count(
            'SimpleQuantity key duplicating a Quantity key',
          ),
        }).toEqual({
          modifier: EXPECTED[version].modifier,
          extension: EXPECTED[version].extension,
          leak: EXPECTED[version].leak,
          choice: EXPECTED[version].choice,
          simpleQuantityKeys: EXPECTED[version].simpleQuantityKeys,
        });
      });

      it('renames exactly the profile-named keys', () => {
        expect([...analysis.renamed].sort()).toEqual(EXPECTED[version].renames);
      });

      it('leaves every definition with exactly the properties the specification lists', () => {
        expect(analysis.missing).toEqual([]);
        expect(analysis.extra).toEqual([]);
        expect(analysis.alignment.listed.size).toBeGreaterThan(450);
      });
    },
  ),
);

const generated = (version: FhirVersion, name: string): string[] => {
  const definitions: Definitions = JSON.parse(
    readFileSync(schemaPath(dataDir, version), 'utf-8'),
  ).definitions;
  const spec = loadSpec(dataDir, version);
  const unaligned = (n: string): PropertyModel[] =>
    buildDefinitionModel(n, definitions).properties;
  const alignment = deriveAlignment(
    spec.structureDefinitions,
    unaligned,
    (n: string) => n in definitions,
  );

  return buildDefinitionModel(name, definitions, { alignment }).properties.map(
    (p) => p.name,
  );
};

describe.skipIf(!existsSync(schemaPath(dataDir, 'STU3')))(
  'STU3 examples of aligned definitions',
  () => {
    it('gives Dosage the JSON keys doseQuantity and rateQuantity, not the profile-named ones', () => {
      const names = generated('STU3', 'Dosage');

      expect(names).toContain('doseQuantity');
      expect(names).toContain('rateQuantity');
      expect(names.filter((n) => n.endsWith('SimpleQuantity'))).toEqual([]);
    });

    it('takes the stray extension off Binary, Bundle, Parameters and Resource but not off DomainResource types', () => {
      ['Binary', 'Bundle', 'Parameters', 'Resource'].forEach((name: string) =>
        expect(generated('STU3', name), name).not.toContain('extension'),
      );
      expect(generated('STU3', 'Patient')).toContain('extension');
    });

    it('drops the choice alternatives the specification does not list', () => {
      const names = generated('STU3', 'Parameters_Parameter');

      expect(names).toContain('valueString');
      expect(names).not.toContain('valueElement');
      expect(names).not.toContain('valueBackboneElement');
    });
  },
);

describe.skipIf(!existsSync(schemaPath(dataDir, 'R5')))(
  'R5 examples of aligned definitions',
  () => {
    it('removes the base-type properties that leaked into EvidenceReport and MedicationKnowledge', () => {
      expect(generated('R5', 'EvidenceReport')).not.toContain('version');
      expect(generated('R5', 'MedicationKnowledge')).not.toContain('copyright');
      expect(generated('R5', 'Questionnaire')).toContain('version');
      expect(generated('R5', 'Questionnaire')).not.toContain('author');
    });
  },
);

describe.skipIf(!existsSync(schemaPath(dataDir, 'R4')))(
  'R4 examples of aligned definitions',
  () => {
    it('takes modifierExtension off datatype children typed Element but keeps it on backbone elements', () => {
      expect(generated('R4', 'Timing_Repeat')).not.toContain(
        'modifierExtension',
      );
      expect(generated('R4', 'Patient_Contact')).toContain('modifierExtension');
      expect(generated('R4', 'Patient')).toContain('modifierExtension');
    });

    it('keeps the primitive extensions that go with kept primitives', () => {
      expect(generated('R4', 'Patient')).toContain('_birthDate');
      expect(generated('R4', 'Timing_Repeat')).toContain('_count');
    });
  },
);
