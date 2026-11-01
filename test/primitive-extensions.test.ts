import { describe, expect, it } from 'vitest';
import { collectRefs } from '../tools/generator/refs';
import { emitDefinition } from '../tools/generator/emit';
import { buildDefinitionModel, Definitions } from '../tools/generator/model';

const definitions: Definitions = {
  string: { type: 'string' },
  Element: {
    description: 'Base definition for all elements.',
    properties: {
      id: { $ref: '#/definitions/string' },
      _id: { description: 'Extensions for id', $ref: '#/definitions/Element' },
    },
  },
  Person: {
    properties: {
      birthDate: {
        description: 'The birth date.',
        $ref: '#/definitions/string',
      },
      _birthDate: {
        description: 'Extensions for birthDate',
        $ref: '#/definitions/Element',
      },
      given: { type: 'array', items: { $ref: '#/definitions/string' } },
      _given: {
        description: 'Extensions for given',
        type: 'array',
        items: { $ref: '#/definitions/Element' },
      },
      name: { $ref: '#/definitions/string' },
      _name: { $ref: '#/definitions/Element' },
    },
    required: ['birthDate', 'name'],
  },
};

const model = (name: string) => buildDefinitionModel(name, definitions);
const emit = (name: string) => emitDefinition(model(name));

describe('primitive extensions', () => {
  it('keeps `_name` right after its primitive, optional and typed Element', () => {
    expect(model('Person').properties.map((p) => p.name)).toEqual([
      'birthDate',
      '_birthDate',
      'given',
      '_given',
      'name',
      '_name',
    ]);
    expect(emit('Person')).toContain(
      '  /** Extensions for birthDate */\n  _birthDate?: Element;',
    );
  });

  it('writes the `_name` of an array-valued primitive as an array that may hold null', () => {
    expect(emit('Person')).toContain('_given?: (Element | null)[];');
    expect(emit('Person')).toContain('given?: string[];');
  });

  it('never makes `_name` required, even when its primitive is', () => {
    const properties = model('Person').properties;

    expect(properties.find((p) => p.name === 'birthDate')?.required).toBe(true);
    expect(properties.find((p) => p.name === '_birthDate')?.required).toBe(
      false,
    );
    expect(emit('Person')).toContain('  birthDate: string;');
  });

  it('imports Element once, and not into Element itself', () => {
    expect(emit('Person').match(/import type \{ Element \}/g)).toHaveLength(1);
    expect(collectRefs(model('Person'))).toEqual(['Element']);
    expect(emit('Element')).not.toContain('import');
    expect(emit('Element')).toContain('_id?: Element;');
  });

  it('is not turned into a union by a binding', () => {
    const bound = buildDefinitionModel('Person', definitions, {
      bindings: new Map([['Person._birthDate', ['x']]]),
    });

    expect(bound.properties.find((p) => p.name === '_birthDate')?.type).toEqual(
      {
        kind: 'ref',
        name: 'Element',
      },
    );
  });
});

describe('primitive extensions the schema leaves out', () => {
  const schema: Definitions = {
    string: { type: 'string' },
    canonical: { type: 'string' },
    Element: { properties: { id: { $ref: '#/definitions/string' } } },
    Meta: {
      properties: {
        id: { $ref: '#/definitions/string' },
        profile: {
          description: 'Profiles.',
          type: 'array',
          items: { $ref: '#/definitions/canonical' },
        },
        source: { $ref: '#/definitions/canonical' },
        tag: { $ref: '#/definitions/string' },
        _tag: { $ref: '#/definitions/Element' },
      },
    },
    Narrative: {
      properties: {
        status: { enum: ['generated'] },
        div: { $ref: '#/definitions/string' },
      },
    },
    Thing: {
      properties: {
        resourceType: { const: 'Thing' },
        count: { type: 'integer' },
      },
    },
  };
  const names = (name: string, from: Definitions = schema) =>
    buildDefinitionModel(name, from).properties.map(
      (property) => property.name,
    );

  it('adds `_name` right after a primitive that has none', () => {
    expect(names('Meta')).toEqual([
      'id',
      'profile',
      '_profile',
      'source',
      '_source',
      'tag',
      '_tag',
    ]);
  });

  it('uses the array form for an array of primitives and the plain form otherwise', () => {
    const output = emitDefinition(buildDefinitionModel('Meta', schema));

    expect(output).toContain(
      '  /** Extensions for profile */\n  _profile?: (Element | null)[];',
    );
    expect(output).toContain(
      '  /** Extensions for source */\n  _source?: Element;',
    );
  });

  it('does not add a second `_name` where the schema has one', () => {
    expect(
      names('Meta').filter((name: string) => name === '_tag'),
    ).toHaveLength(1);
  });

  it('leaves element ids and the narrative XHTML alone', () => {
    expect(names('Meta')).not.toContain('_id');
    expect(names('Narrative')).toEqual(['status', 'div']);
  });

  it('adds nothing for a constant, and adds `_count` only for real primitives', () => {
    expect(names('Thing')).toEqual(['resourceType', 'count', '_count']);
  });

  it('adds nothing when the schema has no Element definition', () => {
    const bare: Definitions = {
      string: { type: 'string' },
      Plain: { properties: { name: { $ref: '#/definitions/string' } } },
    };

    expect(names('Plain', bare)).toEqual(['name']);
  });
});
