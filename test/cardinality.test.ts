import { describe, expect, it } from 'vitest';
import { emitDefinition } from '../tools/generator/emit';
import { deriveRequired } from '../tools/generator/cardinality';
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
    prop('status'),
    prop('kind'),
    prop('valueString'),
    prop('part', { kind: 'array', item: { kind: 'ref', name: 'Thing_Part' } }),
    prop('extra', {
      kind: 'array',
      item: { kind: 'ref', name: 'Thing_Extra1' },
    }),
    prop('tags', { kind: 'array', item: string }),
  ],
  Thing_Part: [prop('use')],
  Thing_Extra1: [prop('use')],
};
const propertiesOf = (name: string): PropertyModel[] => models[name] ?? [];

const element = (
  path: string,
  min: number,
  extra: Partial<SpecElement> = {},
): SpecElement => ({
  path,
  min,
  max: '1',
  types: ['string'],
  ...extra,
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
  deriveRequired(definitions, propertiesOf, (name: string) => name in models);

describe('deriveRequired', () => {
  it('requires a top-level element with min 1 and not one with min 0', () => {
    const { required } = derive([
      sd('Thing', [element('Thing.status', 1), element('Thing.kind', 0)]),
    ]);

    expect([...required]).toEqual(['Thing.status']);
  });

  it('requires a backbone child, and follows a digit-suffixed type instead of guessing its name', () => {
    const { required } = derive([
      sd('Thing', [
        element('Thing.part.use', 1),
        element('Thing.extra.use', 1),
      ]),
    ]);

    expect([...required].sort()).toEqual([
      'Thing_Extra1.use',
      'Thing_Part.use',
    ]);
  });

  it('requires a datatype element', () => {
    const { required } = derive([
      sd('Thing', [element('Thing.status', 1)], 'complex-type'),
    ]);

    expect(required.has('Thing.status')).toBe(true);
  });

  it('requires a min-1 array, which only means the field must be present', () => {
    expect(
      derive([
        sd('Thing', [element('Thing.tags', 1, { max: '*' })]),
      ]).required.has('Thing.tags'),
    ).toBe(true);
  });

  it('leaves a choice element optional: min 1 there means "one of these"', () => {
    const result = derive([
      sd('Thing', [
        element('Thing.value[x]', 1, { types: ['string', 'boolean'] }),
      ]),
    ]);

    expect(result.required.size).toBe(0);
    expect(result.skipped.choice).toBe(1);
  });

  it('skips slices and counts them', () => {
    const result = derive([
      sd('Thing', [element('Thing.status', 1, { sliceName: 'special' })]),
    ]);

    expect(result.required.size).toBe(0);
    expect(result.skipped.sliced).toBe(1);
  });

  it('skips a StructureDefinition that has no generated definition, such as SimpleQuantity', () => {
    expect(
      derive([sd('SimpleQuantity', [element('SimpleQuantity.value', 1)])])
        .required.size,
    ).toBe(0);
  });

  it('skips primitive-type StructureDefinitions', () => {
    expect(
      derive([sd('Thing', [element('Thing.status', 1)], 'primitive-type')])
        .required.size,
    ).toBe(0);
  });

  it('ignores the root element of a snapshot', () => {
    expect(derive([sd('Thing', [element('Thing', 1)])]).required.size).toBe(0);
  });

  it('reports a path that does not resolve instead of dropping it', () => {
    expect(
      derive([sd('Thing', [element('Thing.vanished', 1)])]).unresolved,
    ).toEqual(['Thing.vanished']);
  });
});

describe('required in the model', () => {
  const definitions: Definitions = {
    string: { type: 'string' },
    Thing: {
      properties: {
        a: { $ref: '#/definitions/string' },
        b: { $ref: '#/definitions/string' },
        c: { $ref: '#/definitions/string' },
      },
      required: ['a'],
    },
  };
  const required = new Set(['Thing.b', 'Elsewhere.c']);

  it('is required when the schema says so, the spec says so, or both', () => {
    const output = emitDefinition(
      buildDefinitionModel('Thing', definitions, { required }),
    );

    expect(output).toContain('  a: string;');
    expect(output).toContain('  b: string;');
    expect(output).toContain('  c?: string;');
  });

  it('never makes a property optional that the schema requires', () => {
    expect(
      emitDefinition(
        buildDefinitionModel('Thing', definitions, { required: new Set() }),
      ),
    ).toContain('  a: string;');
  });

  it('does not change the set or the definitions', () => {
    const before = JSON.stringify(definitions);

    buildDefinitionModel('Thing', definitions, { required });

    expect(JSON.stringify(definitions)).toBe(before);
    expect([...required]).toEqual(['Thing.b', 'Elsewhere.c']);
  });
});
