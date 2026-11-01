import { describe, expect, it } from 'vitest';
import { alignProperties, deriveAlignment } from '../tools/generator/alignment';
import { emitDefinition } from '../tools/generator/emit';
import { buildDefinitionModel, Definitions } from '../tools/generator/model';
import { SpecDefinition, SpecElement } from '../tools/generator/spec-index';
import { PropertyModel } from '../tools/generator/types';

const string: PropertyModel['type'] = { kind: 'primitive', name: 'string' };
const prop = (
  name: string,
  type: PropertyModel['type'] = string,
): PropertyModel => ({
  name,
  required: false,
  type,
});
const models: Record<string, PropertyModel[]> = {
  Thing: [
    prop('resourceType', { kind: 'literal', values: ['Thing'] }),
    prop('id'),
    prop('extension'),
    prop('stray'),
    prop('_stray'),
    prop('name'),
    prop('_name'),
    prop('valueString'),
    prop('valueUuid'),
    prop('valueQuantity'),
    prop('doseSimpleQuantity'),
    prop('part', { kind: 'array', item: { kind: 'ref', name: 'Thing_Part1' } }),
  ],
  Thing_Part1: [prop('use'), prop('modifierExtension')],
};
const propertiesOf = (name: string): PropertyModel[] => models[name] ?? [];
const element = (path: string, types: string[] = ['string']): SpecElement => ({
  path,
  min: 0,
  max: '1',
  types,
});
const sd = (
  name: string,
  elements: SpecElement[],
  kind = 'resource',
): SpecDefinition => ({
  name,
  kind,
  abstract: false,
  elements,
});
const derive = (definitions: SpecDefinition[]) =>
  deriveAlignment(definitions, propertiesOf, (name: string) => name in models);

const spec = sd('Thing', [
  element('Thing'),
  element('Thing.id'),
  element('Thing.extension', ['Extension']),
  element('Thing.name'),
  element('Thing.value[x]', ['string', 'Quantity']),
  element('Thing.dose[x]', ['Quantity']),
  element('Thing.part', []),
  element('Thing.part.use'),
]);
const names = (properties: PropertyModel[]): string[] =>
  properties.map((p) => p.name);

describe('deriveAlignment', () => {
  const alignment = derive([spec]);

  it('lists the children of every element path, following the schema into digit-suffixed types', () => {
    expect([...(alignment.listed.get('Thing')?.names ?? [])].sort()).toEqual(
      [
        'doseQuantity',
        'extension',
        'id',
        'name',
        'part',
        'valueQuantity',
        'valueString',
      ].sort(),
    );
    expect([...(alignment.listed.get('Thing_Part1')?.names ?? [])]).toEqual([
      'use',
    ]);
  });

  it('expands a choice element into one name per type', () => {
    const listed = alignment.listed.get('Thing')?.names;

    expect(listed?.has('valueString') && listed.has('valueQuantity')).toBe(
      true,
    );
    expect(listed?.has('valueUuid')).toBe(false);
  });

  it('keeps every alternative of a choice element typed `*`', () => {
    const wide = derive([sd('Thing', [element('Thing.value[x]', ['*'])])]);

    expect(wide.listed.get('Thing')?.wildcards).toEqual(['value']);
  });

  it('renames a property named after the SimpleQuantity profile when the spec lists the Quantity key', () => {
    expect([...alignment.renames]).toEqual([
      ['Thing.doseSimpleQuantity', 'doseQuantity'],
    ]);
  });

  it('skips StructureDefinitions without a generated definition and primitive types', () => {
    expect(
      derive([
        sd('Mystery', [element('Mystery.x')]),
        sd('Thing', [element('Thing.id')], 'primitive-type'),
      ]).listed.size,
    ).toBe(0);
  });

  it('reports a spec parent that does not resolve', () => {
    expect(
      derive([
        sd('Thing', [
          element('Thing.part', []),
          element('Thing.part.use'),
          element('Thing.vanished', []),
          element('Thing.vanished.x'),
        ]),
      ]).unresolved,
    ).toEqual(['Thing.vanished']);
  });

  it('reports a definition that two spec paths list differently', () => {
    const result = derive([
      sd('Thing', [element('Thing.part', []), element('Thing.part.use')]),
      sd('Thing', [
        element('Thing.part', []),
        element('Thing.part.use'),
        element('Thing.part.extra'),
      ]),
    ]);

    expect(result.conflicts).toEqual(['Thing_Part1']);
  });

  it('accepts a definition that two spec paths list identically', () => {
    const same = sd('Thing', [
      element('Thing.part', []),
      element('Thing.part.use'),
    ]);

    expect(derive([same, same]).conflicts).toEqual([]);
  });
});

describe('alignProperties', () => {
  const alignment = derive([spec]);
  const aligned = alignProperties('Thing', models.Thing, alignment);

  it('drops what the specification does not list and keeps the order of the rest', () => {
    expect(names(aligned.properties)).toEqual([
      'resourceType',
      'id',
      'extension',
      'name',
      '_name',
      'valueString',
      'valueQuantity',
      'doseQuantity',
      'part',
    ]);
    expect(aligned.dropped).toEqual(['stray', '_stray', 'valueUuid']);
  });

  it('keeps the single-constant resourceType discriminator though no element lists it', () => {
    expect(names(aligned.properties)).toContain('resourceType');
  });

  it('lets a `_name` follow its primitive: kept with it, dropped with it, renamed with it', () => {
    expect(names(aligned.properties)).toContain('_name');
    expect(names(aligned.properties)).not.toContain('_stray');
    expect(aligned.renamed).toEqual([['doseSimpleQuantity', 'doseQuantity']]);
  });

  it('keeps every `<base><Type>` for a wildcard choice, but not the bare base', () => {
    const wide = derive([sd('Thing', [element('Thing.value[x]', ['*'])])]);
    const result = alignProperties(
      'Thing',
      [prop('value'), prop('valueString'), prop('valueBoolean'), prop('other')],
      wide,
    );

    expect(names(result.properties)).toEqual(['valueString', 'valueBoolean']);
  });

  it('applies to backbone types the same way', () => {
    expect(
      names(
        alignProperties('Thing_Part1', models.Thing_Part1, alignment)
          .properties,
      ),
    ).toEqual(['use']);
  });

  it('returns a definition the specification does not describe untouched', () => {
    const properties = [prop('a'), prop('b')];

    expect(alignProperties('Unknown', properties, alignment)).toEqual({
      properties,
      dropped: [],
      renamed: [],
    });
  });

  it('does not change its input', () => {
    const before = JSON.stringify(models.Thing);

    alignProperties('Thing', models.Thing, alignment);

    expect(JSON.stringify(models.Thing)).toBe(before);
  });
});

describe('alignment in the model', () => {
  const definitions: Definitions = {
    string: { type: 'string' },
    Quantity: { properties: {} },
    Thing: {
      properties: {
        id: { $ref: '#/definitions/string' },
        stray: { $ref: '#/definitions/string' },
        doseSimpleQuantity: { $ref: '#/definitions/Quantity' },
      },
    },
  };
  const alignment = deriveAlignment(
    [
      sd('Thing', [
        element('Thing.id'),
        element('Thing.dose[x]', ['Quantity']),
      ]),
    ],
    (name: string) => buildDefinitionModel(name, definitions).properties,
    (name: string) => name in definitions,
  );

  it('drops and renames in the emitted type, and the renamed property takes the spec requirement', () => {
    const output = emitDefinition(
      buildDefinitionModel('Thing', definitions, {
        alignment,
        required: new Set(['Thing.doseQuantity']),
      }),
    );

    expect(output).toContain('  doseQuantity: Quantity;');
    expect(output).toContain('  id?: string;');
    expect(output).not.toContain('stray');
    expect(output).not.toContain('SimpleQuantity');
  });

  it('is not applied without an alignment', () => {
    expect(
      emitDefinition(buildDefinitionModel('Thing', definitions)),
    ).toContain('stray?: string;');
  });
});
