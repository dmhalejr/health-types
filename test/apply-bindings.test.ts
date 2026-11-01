import { describe, expect, it } from 'vitest';
import { emitDefinition } from '../tools/generator/emit';
import {
  buildDefinitionModel,
  CodeBindings,
  Definitions,
} from '../tools/generator/model';

const definitions: Definitions = {
  string: { type: 'string' },
  code: { type: 'string' },
  Other: { properties: { status: { $ref: '#/definitions/code' } } },
  Thing: {
    description: 'A thing.',
    properties: {
      resourceType: { const: 'Thing' },
      status: { description: 'The status.', $ref: '#/definitions/code' },
      use: { type: 'array', items: { $ref: '#/definitions/code' } },
      gender: { enum: ['male', 'female'] },
      note: { $ref: '#/definitions/string' },
      count: { type: 'integer' },
    },
    required: ['resourceType', 'status'],
  },
  Instance: {
    properties: {
      id: { $ref: '#/definitions/string' },
      resourceType: { $ref: '#/definitions/code' },
    },
    required: ['resourceType'],
  },
};

const emit = (name: string, bindings?: CodeBindings): string =>
  emitDefinition(buildDefinitionModel(name, definitions, { bindings }));

const bindings: CodeBindings = new Map([
  ['Thing.status', ['active', 'retired']],
  ['Thing.use', ['usual', 'old']],
  ['Thing.gender', ['other-1', 'other-2']],
  ['Thing.note', ['x']],
  ['Thing.count', ['1']],
  ['Thing.missing', ['y']],
  ['Instance.resourceType', ['Account', 'Patient']],
]);

describe('applying code bindings', () => {
  it('leaves everything alone without bindings', () => {
    expect(emit('Thing')).toContain('status: string;');
    expect(emit('Thing')).toContain('use?: string[];');
  });

  it('turns a plain string into a union of the codes, keeping required and the comment', () => {
    expect(emit('Thing', bindings)).toContain(
      "  /** The status. */\n  status: 'active' | 'retired';",
    );
  });

  it('turns an array of strings into an array of the union', () => {
    expect(emit('Thing', bindings)).toContain("use?: ('usual' | 'old')[];");
  });

  it('keeps a schema enum: the schema wins over the derived list', () => {
    expect(emit('Thing', bindings)).toContain("gender?: 'male' | 'female';");
  });

  it('ignores a binding on a number or on a string that is not a code field', () => {
    const output = emit('Thing', bindings);

    expect(output).toContain('count?: number;');
    expect(output).toContain("note?: 'x';");
  });

  it('ignores bindings that name a property the definition lacks, or another definition', () => {
    expect(emit('Thing', bindings)).not.toContain('missing');
    expect(emit('Other', bindings)).toContain('status?: string;');
  });

  it('keeps the single-value resourceType discriminator first', () => {
    expect(emit('Thing', bindings)).toContain(
      "export interface Thing {\n  resourceType: 'Thing';",
    );
  });

  it('does not treat a many-valued field called resourceType as the discriminator', () => {
    const names = buildDefinitionModel('Instance', definitions, {
      bindings,
    }).properties.map((property) => property.name);

    expect(names).toEqual(['id', 'resourceType']);
    expect(emit('Instance', bindings)).toContain(
      "resourceType: 'Account' | 'Patient';",
    );
  });

  it('does not change the bindings map or the definitions', () => {
    const before = JSON.stringify(definitions);

    emit('Thing', bindings);

    expect(JSON.stringify(definitions)).toBe(before);
    expect(bindings.get('Thing.status')).toEqual(['active', 'retired']);
  });
});
