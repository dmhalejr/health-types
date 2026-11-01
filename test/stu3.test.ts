import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { emitDefinition } from '../tools/generator/emit';
import { flattenDefinition } from '../tools/generator/inherit';
import {
  buildDefinitionModel,
  Definitions,
  objectDefinitionNames,
} from '../tools/generator/model';
import { expectGolden } from './helpers/golden';
import { makeTempDir, removeTempDir } from './helpers/tempDir';
import { typecheckDir } from './helpers/typecheck';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'stu3-mini.schema.json'), 'utf-8'),
) as { definitions: Definitions };

const emit = (name: string, definitions: Definitions = fixture.definitions) =>
  emitDefinition(buildDefinitionModel(name, definitions));

const model = (name: string, definitions: Definitions = fixture.definitions) =>
  buildDefinitionModel(name, definitions);

describe('flattenDefinition', () => {
  const defs: Definitions = {
    Base: {
      allOf: [
        {
          description: 'base',
          properties: { id: { type: 'string' }, a: { type: 'string' } },
          required: ['id'],
        },
      ],
    },
    Mid: {
      allOf: [
        { $ref: '#/definitions/Base' },
        {
          description: 'mid',
          properties: { b: { type: 'string' } },
          required: ['b'],
        },
      ],
    },
    Leaf: {
      allOf: [
        { $ref: '#/definitions/Mid' },
        {
          description: 'leaf',
          properties: { a: { type: 'boolean' }, c: { type: 'string' } },
          required: ['c', 'b'],
        },
      ],
    },
    Plain: { description: 'plain', properties: { p: { type: 'string' } } },
  };

  it('puts base properties first and lets a derived one replace in place', () => {
    const flat = flattenDefinition('Leaf', defs);

    expect(Object.keys(flat.properties)).toEqual(['id', 'a', 'b', 'c']);
    expect(flat.properties.a).toEqual({ type: 'boolean' });
  });

  it('merges required lists without duplicates and uses the own description', () => {
    const flat = flattenDefinition('Leaf', defs);

    expect(flat.required).toEqual(['id', 'b', 'c']);
    expect(flat.description).toBe('leaf');
  });

  it('passes a definition without allOf through unchanged', () => {
    expect(flattenDefinition('Plain', defs)).toEqual({
      description: 'plain',
      properties: { p: { type: 'string' } },
      required: [],
    });
  });

  it('does not mutate its input', () => {
    const before = JSON.stringify(defs);

    flattenDefinition('Leaf', defs);

    expect(JSON.stringify(defs)).toBe(before);
  });

  it('names the definition when the base is unknown', () => {
    expect(() =>
      flattenDefinition('X', {
        X: { allOf: [{ $ref: '#/definitions/Nope' }] },
      }),
    ).toThrow('Definition "X" extends unknown base "Nope"');
  });

  it('names an unknown definition instead of crashing', () => {
    expect(() => flattenDefinition('Nope', defs)).toThrow(
      'Unknown definition "Nope"',
    );
  });

  it('reports a cycle in the inheritance chain', () => {
    const cyclic: Definitions = {
      A: { allOf: [{ $ref: '#/definitions/B' }, { properties: {} }] },
      B: { allOf: [{ $ref: '#/definitions/A' }, { properties: {} }] },
    };

    expect(() => flattenDefinition('A', cyclic)).toThrow(
      'Inheritance cycle: A -> B -> A',
    );
  });
});

describe('array-level enum guard', () => {
  it('refuses to drop an enum it cannot apply to the items', () => {
    const definitions: Definitions = {
      A: {
        properties: {
          x: {
            type: 'array',
            enum: ['a'],
            items: { $ref: '#/definitions/B' },
          },
        },
      },
      B: { properties: {} },
    };

    expect(() => buildDefinitionModel('A', definitions)).toThrow(
      'Unsupported enum on an array of constrained items at A.x',
    );
  });
});

describe('STU3 fixture output', () => {
  it.each(['Patient', 'Patient_Contact', 'Age', 'Binary', 'Timing_Repeat'])(
    'golden %s',
    (name: string) => expectGolden(`STU3/${name}.ts`, emit(name)),
  );

  it('keeps resourceType first and required, though it is defined last', () => {
    const [first] = model('Patient').properties;

    expect(first.name).toBe('resourceType');
    expect(first.required).toBe(true);
    expect(emit('Patient')).toContain("resourceType: 'Patient';");
  });

  it('inherits through the whole chain (Element, Resource, DomainResource)', () => {
    const names = model('Patient').properties.map((property) => property.name);

    [
      'id',
      'extension',
      'meta',
      'text',
      'contained',
      'modifierExtension',
    ].forEach((name: string) => expect(names).toContain(name));
    expect(names.filter((name: string) => name === 'id')).toHaveLength(1);
    expect(names.filter((name: string) => name === 'extension')).toHaveLength(
      1,
    );
  });

  it('lets a BackboneElement child and a Quantity subtype inherit', () => {
    expect(model('Patient_Contact').properties.map((p) => p.name)).toContain(
      'modifierExtension',
    );
    expect(model('Age').properties.map((p) => p.name)).toEqual(
      expect.arrayContaining(['value', 'comparator', 'unit', 'system', 'code']),
    );
  });

  it('documents the schema quirk: Resource inherits Element, so Binary has extension', () => {
    expect(model('Binary').properties.map((p) => p.name)).toContain(
      'extension',
    );
  });

  it('turns an enum on an array node into an array of the union', () => {
    const output = emit('Timing_Repeat');

    // Wrapped one member per line, so compare with the whitespace collapsed.
    expect(output.replace(/\s+/g, ' ')).toMatch(
      /when\?: \( \| 'MORN' \| 'AFT'/,
    );
    expect(output).toMatch(/\)\[\];/);
  });

  it('emits the base types and the union too', () => {
    expect(objectDefinitionNames(fixture.definitions).sort()).toEqual(
      Object.keys(fixture.definitions).sort(),
    );
  });
});

describe('STU3 fixture as a whole', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach(removeTempDir));

  it('type-checks, including inheritance-derived and cyclic imports', () => {
    const dir = makeTempDir({});
    dirs.push(dir);

    objectDefinitionNames(fixture.definitions).forEach((name: string) =>
      writeFileSync(join(dir, `${name}.ts`), emit(name)),
    );

    expect(typecheckDir(dir)).toEqual([]);
  });
});
