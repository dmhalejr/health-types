import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { emitDefinition } from '../tools/generator/emit';
import {
  DefinitionModel,
  PropertyModel,
  TypeModel,
} from '../tools/generator/types';
import {
  buildDefinitionModel,
  Definitions,
  objectDefinitionNames,
} from '../tools/generator/model';
import { printed } from './helpers/printed';

const literal = (...values: string[]): TypeModel => ({
  kind: 'literal',
  values,
});
const property = (
  name: string,
  type: TypeModel,
  required = false,
): PropertyModel => ({
  name,
  type,
  required,
});
const model = (...properties: PropertyModel[]): DefinitionModel => ({
  name: 'Thing',
  properties,
});
const many = (count: number, prefix = 'code'): string[] =>
  Array.from({ length: count }, (_, i) => `${prefix}-${i}`);

describe('wrapping long unions', () => {
  it('keeps a union that fits within 80 columns on one line', () => {
    const output = emitDefinition(
      model(property('gender', literal('male', 'female', 'other', 'unknown'))),
    );

    expect(output).toContain(
      "  gender?: 'male' | 'female' | 'other' | 'unknown';",
    );
  });

  it('writes one member per line, Prettier style, when it does not fit', () => {
    const output = emitDefinition(
      model(property('status', literal(...many(12)))),
    );

    expect(output).toContain(
      ['  status?:', "    | 'code-0'", "    | 'code-1'"].join('\n'),
    );
    expect(output).toContain("    | 'code-11';\n}");
  });

  it('puts an array of a long union in parentheses, one member per line', () => {
    const output = emitDefinition(
      model(
        property('uses', { kind: 'array', item: literal(...many(12)) }, true),
      ),
    );

    expect(output).toContain(['  uses: (', "    | 'code-0'"].join('\n'));
    expect(output).toContain("    | 'code-11'\n  )[];");
  });

  it('keeps an array of a short union on one line', () => {
    const output = emitDefinition(
      model(property('uses', { kind: 'array', item: literal('a', 'b') })),
    );

    expect(output).toContain("  uses?: ('a' | 'b')[];");
  });

  it('measures the width including the indentation of nested properties', () => {
    const nested: TypeModel = {
      kind: 'object',
      properties: [property('kind', literal(...many(4, 'a-long-code-value')))],
    };
    const output = emitDefinition(model(property('inner', nested)));

    expect(output).toContain("    kind?:\n      | 'a-long-code-value-0'");
  });

  it('wraps exactly at the limit', () => {
    // "  x?: 'aaaaa' | 'bbbbb' | ... ;" built to 80 and to 81 columns.
    const at80 = literal('a'.repeat(33), 'b'.repeat(33));
    const output80 = emitDefinition(model(property('x', at80)));
    const line80 = output80
      .split('\n')
      .find((l: string) => l.startsWith('  x?:')) as string;

    expect(line80.length).toBe(80);
    expect(output80).not.toContain('x?:\n');

    const output81 = emitDefinition(
      model(property('x', literal('a'.repeat(34), 'b'.repeat(33)))),
    );

    expect(output81).toContain('  x?:\n    | ');
  });

  it('escapes quotes in wrapped members', () => {
    const output = emitDefinition(
      model(property('x', literal("it's", ...many(15)))),
    );

    expect(output).toContain("    | 'it\\'s'");
  });

  it('never wraps a single constant or a union alias', () => {
    expect(
      emitDefinition(
        model(property('resourceType', literal('A'.repeat(120)), true)),
      ),
    ).toContain(`  resourceType: '${'A'.repeat(120)}';`);
  });

  it('keeps the old one-line form with lineWidth Infinity', () => {
    const output = emitDefinition(
      model(property('status', literal(...many(30)))),
      {
        lineWidth: Infinity,
      },
    );

    expect(
      output.split('\n').filter((l: string) => l.startsWith('  status?:')),
    ).toHaveLength(1);
    expect(output).not.toContain('    | ');
  });

  it('does not change the model', () => {
    const input = model(property('status', literal(...many(12))));
    const before = JSON.stringify(input);

    emitDefinition(input);

    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('wrapping is layout only', () => {
  const wide = (
    name: string,
    properties: PropertyModel[],
  ): DefinitionModel => ({ name, properties });
  const cases: [string, DefinitionModel][] = [
    [
      'one long union',
      wide('A', [property('status', literal(...many(40)), true)]),
    ],
    [
      'an array of a long union',
      wide('B', [
        property('uses', { kind: 'array', item: literal(...many(40)) }),
      ]),
    ],
    [
      'a long union nested in an object',
      wide('C', [
        property('inner', {
          kind: 'object',
          properties: [property('x', literal(...many(40)))],
        }),
      ]),
    ],
    [
      'mixed short and long',
      wide('D', [
        property('a', literal('x', 'y')),
        property('b', literal(...many(40))),
      ]),
    ],
  ];

  it.each(cases)(
    'prints identically wrapped and unwrapped: %s',
    (_label: string, input: DefinitionModel) => {
      expect(printed(emitDefinition(input))).toBe(
        printed(emitDefinition(input, { lineWidth: Infinity })),
      );
    },
  );

  it('holds for every fixture definition, with long unions injected', () => {
    ['r4-mini', 'r4-choice', 'stu3-mini'].forEach((fixture: string) => {
      const { definitions } = JSON.parse(
        readFileSync(
          join(__dirname, 'fixtures', `${fixture}.schema.json`),
          'utf-8',
        ),
      ) as { definitions: Definitions };
      const bindings = new Map<string, string[]>();

      objectDefinitionNames(definitions).forEach((name: string) =>
        buildDefinitionModel(name, definitions).properties.forEach((p) => {
          if (p.type.kind === 'primitive' && p.type.name === 'string')
            bindings.set(`${name}.${p.name}`, many(60));
        }),
      );

      objectDefinitionNames(definitions).forEach((name: string) => {
        const input = buildDefinitionModel(name, definitions, { bindings });

        expect(printed(emitDefinition(input)), `${fixture}/${name}`).toBe(
          printed(emitDefinition(input, { lineWidth: Infinity })),
        );
      });
    });
  });

  it('actually wrapped something in that run', () => {
    const output = emitDefinition(model(property('s', literal(...many(60)))));

    expect(output.split('\n').length).toBeGreaterThan(60);
  });
});
