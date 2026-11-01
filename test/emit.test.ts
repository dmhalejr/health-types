import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { emitDefinition } from '../tools/generator/emit';
import {
  buildDefinitionModel,
  Definitions,
  SchemaNode,
} from '../tools/generator/model';
import { expectGolden } from './helpers/golden';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'r4-mini.schema.json'), 'utf-8'),
) as { definitions: Definitions };

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }

  return value;
};

const emit = (name: string, definitions: Definitions): string =>
  emitDefinition(buildDefinitionModel(name, definitions));

const withProperties = (
  properties: Record<string, SchemaNode>,
  required?: string[],
): Definitions => ({
  string: { type: 'string' },
  integer: { type: 'number' },
  Thing: { description: 'A thing.', properties, required },
  Other: { properties: {} },
});

describe('golden output from the R4 fixture', () => {
  it.each(['Coding', 'Period'])('%s', (name: string) => {
    expectGolden(`R4/${name}.ts`, emit(name, fixture.definitions));
  });
});

describe('type mapping', () => {
  it('maps JSON types and primitive $refs to TypeScript primitives', () => {
    const output = emit(
      'Thing',
      withProperties({
        a: { type: 'string' },
        b: { type: 'boolean' },
        c: { type: 'integer' },
        d: { type: 'number' },
        e: { $ref: '#/definitions/string' },
        f: { $ref: '#/definitions/integer' },
      }),
    );

    expect(output).toContain('a?: string;');
    expect(output).toContain('b?: boolean;');
    expect(output).toContain('c?: number;');
    expect(output).toContain('d?: number;');
    expect(output).toContain('e?: string;');
    expect(output).toContain('f?: number;');
  });

  it('maps the untyped xhtml primitive to string', () => {
    const output = emit('Thing', {
      ...withProperties({ div: { $ref: '#/definitions/xhtml' } }),
      xhtml: { description: 'xhtml - escaped html' },
    });

    expect(output).toContain('div?: string;');
    expect(output).not.toContain('import');
  });

  it('refuses to emit an empty interface for a typeless definition', () => {
    expect(() =>
      emit('Mystery', { Mystery: { description: 'no shape' } }),
    ).toThrow('Definition "Mystery" has no properties, type or oneOf');
  });

  it('maps enum to a union and const to a single literal', () => {
    const output = emit(
      'Thing',
      withProperties({
        gender: { enum: ['male', 'female'] },
        resourceType: { const: 'Thing' },
      }),
    );

    expect(output).toContain("gender?: 'male' | 'female';");
    expect(output).toContain("resourceType?: 'Thing';");
  });

  it('escapes quotes and backslashes in literals', () => {
    const output = emit(
      'Thing',
      withProperties({ x: { enum: ["it's", 'a\\b'] } }),
    );

    expect(output).toContain("x?: 'it\\'s' | 'a\\\\b';");
  });

  it('maps arrays, parenthesising multi-value unions', () => {
    const output = emit(
      'Thing',
      withProperties({
        names: { type: 'array', items: { type: 'string' } },
        uses: { type: 'array', items: { enum: ['a', 'b'] } },
        one: { type: 'array', items: { enum: ['a'] } },
      }),
    );

    expect(output).toContain('names?: string[];');
    expect(output).toContain("uses?: ('a' | 'b')[];");
    expect(output).toContain("one?: 'a'[];");
  });

  it('maps $ref to a non-primitive definition to its name', () => {
    const definitions = {
      ...withProperties({
        other: { $ref: '#/definitions/Other' },
        others: { type: 'array', items: { $ref: '#/definitions/Other' } },
      }),
    };

    const output = emit('Thing', definitions);

    expect(output).toContain('other?: Other;');
    expect(output).toContain('others?: Other[];');
  });

  it('emits nested inline objects and arrays of objects', () => {
    const output = emit(
      'Thing',
      withProperties({
        nested: {
          properties: { inner: { type: 'string' } },
          required: ['inner'],
        },
        list: {
          type: 'array',
          items: { properties: { n: { type: 'integer' } } },
        },
      }),
    );

    expect(output).toContain(
      ['  nested?: {', '    inner: string;', '  };'].join('\n'),
    );
    expect(output).toContain(
      ['  list?: {', '    n?: number;', '  }[];'].join('\n'),
    );
  });
});

describe('required and optional', () => {
  it('marks only properties listed in `required` as non-optional', () => {
    const output = emit(
      'Thing',
      withProperties({ must: { type: 'string' }, may: { type: 'string' } }, [
        'must',
      ]),
    );

    expect(output).toContain('must: string;');
    expect(output).toContain('may?: string;');
  });

  it('ignores `required` entries that name no property', () => {
    const output = emit(
      'Thing',
      withProperties({ may: { type: 'string' } }, ['ghost']),
    );

    expect(output).toContain('may?: string;');
    expect(output).not.toContain('ghost');
  });
});

describe('comments', () => {
  it('emits JSDoc for the interface and its properties', () => {
    const output = emit(
      'Thing',
      withProperties({ a: { type: 'string', description: 'The a.' } }),
    );

    expect(output).toContain('/** A thing. */\nexport interface Thing {');
    expect(output).toContain('  /** The a. */\n  a?: string;');
  });

  it('keeps `*/` in a description from closing the comment', () => {
    const output = emit(
      'Thing',
      withProperties({ a: { type: 'string', description: 'bad */ text' } }),
    );

    expect(output).toContain('/** bad *\\/ text */');
  });

  it('uses a multi-line block for multi-line descriptions', () => {
    const output = emit(
      'Thing',
      withProperties({ a: { type: 'string', description: 'one\ntwo' } }),
    );

    expect(output).toContain(
      ['  /**', '   * one', '   * two', '   */'].join('\n'),
    );
  });
});

describe('definitions with no properties', () => {
  it('emits an empty-object type alias, never an empty interface', () => {
    const output = emit('Other', {
      Other: { description: 'Nothing here.', properties: {}, type: 'object' },
    });

    expect(output).toBe(
      '/** Nothing here. */\nexport type Other = Record<string, never>;\n',
    );
  });
});

describe('purity and errors', () => {
  it('does not mutate its input', () => {
    const definitions = deepFreeze(
      withProperties({
        a: { enum: ['x'] },
        _a: { $ref: '#/definitions/Other' },
      }),
    );

    expect(() => emit('Thing', definitions)).not.toThrow();
  });

  it('is deterministic', () => {
    const definitions = withProperties({ a: { type: 'string' } });

    expect(emit('Thing', definitions)).toBe(emit('Thing', definitions));
  });

  it('throws with the path for an unresolved $ref', () => {
    expect(() =>
      emit('Thing', withProperties({ a: { $ref: '#/definitions/Nope' } })),
    ).toThrow('Unresolved $ref "#/definitions/Nope" at Thing.a');
  });

  it('throws with the path for an unsupported schema', () => {
    expect(() => emit('Thing', withProperties({ a: {} }))).toThrow(
      'Unsupported schema at Thing.a',
    );
  });

  it('throws for an unknown definition', () => {
    expect(() => emit('Nope', withProperties({}))).toThrow(
      'Unknown definition "Nope"',
    );
  });
});
