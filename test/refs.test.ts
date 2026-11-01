import { readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { emitDefinition } from '../tools/generator/emit';
import {
  buildDefinitionModel,
  Definitions,
  objectDefinitionNames,
} from '../tools/generator/model';
import { collectRefs } from '../tools/generator/refs';
import { DefinitionModel } from '../tools/generator/types';
import { expectGolden } from './helpers/golden';
import { makeTempDir, removeTempDir } from './helpers/tempDir';
import { typecheckDir } from './helpers/typecheck';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'r4-mini.schema.json'), 'utf-8'),
) as { definitions: Definitions };

const ref = (name: string) => ({ kind: 'ref' as const, name });

const model = (name: string, types: DefinitionModel['properties']) => ({
  name,
  properties: types,
});

describe('collectRefs', () => {
  it('finds refs directly, in arrays, and in nested objects', () => {
    const result = collectRefs(
      model('A', [
        { name: 'a', required: false, type: ref('B') },
        {
          name: 'b',
          required: false,
          type: { kind: 'array', item: ref('C') },
        },
        {
          name: 'c',
          required: false,
          type: {
            kind: 'object',
            properties: [{ name: 'd', required: false, type: ref('D') }],
          },
        },
      ]),
    );

    expect(result).toEqual(['B', 'C', 'D']);
  });

  it('dedupes, sorts, and omits the definition itself', () => {
    const result = collectRefs(
      model('A', [
        { name: 'z', required: false, type: ref('Zed') },
        { name: 'b1', required: false, type: ref('Bee') },
        { name: 'b2', required: false, type: ref('Bee') },
        { name: 'self', required: false, type: ref('A') },
      ]),
    );

    expect(result).toEqual(['Bee', 'Zed']);
  });

  it('returns nothing for primitive-only definitions', () => {
    expect(
      collectRefs(
        model('A', [
          {
            name: 'a',
            required: true,
            type: { kind: 'primitive', name: 'string' },
          },
        ]),
      ),
    ).toEqual([]);
  });
});

describe('imports in emitted source', () => {
  it('writes one sorted `import type` per referenced type, then a blank line', () => {
    const output = emitDefinition(
      model('A', [
        { name: 'z', required: false, type: ref('Zed') },
        { name: 'b', required: false, type: ref('Bee') },
      ]),
    );

    expect(
      output.startsWith(
        [
          "import type { Bee } from './Bee';",
          "import type { Zed } from './Zed';",
          '',
          'export interface A {',
        ].join('\n'),
      ),
    ).toBe(true);
  });

  it('does not import itself and leaves import-free files unchanged', () => {
    const output = emitDefinition(
      model('Node', [{ name: 'child', required: false, type: ref('Node') }]),
    );

    expect(output).not.toContain('import');
    expect(output).toContain('child?: Node;');
  });
});

describe('golden output with references', () => {
  it.each([
    'Practitioner',
    'Practitioner_Qualification',
    'Identifier',
    'Reference',
  ])('%s', (name: string) => {
    expectGolden(
      `R4/${name}.ts`,
      emitDefinition(buildDefinitionModel(name, fixture.definitions)),
    );
  });
});

describe('whole fixture output', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach(removeTempDir));

  const generate = (): string => {
    const dir = makeTempDir({});
    dirs.push(dir);

    objectDefinitionNames(fixture.definitions).forEach((name: string) =>
      writeFileSync(
        join(dir, `${name}.ts`),
        emitDefinition(buildDefinitionModel(name, fixture.definitions)),
      ),
    );

    return dir;
  };

  it('generates one file per object definition', () => {
    expect(objectDefinitionNames(fixture.definitions).sort()).toEqual([
      'CodeableConcept',
      'Coding',
      'Element',
      'Identifier',
      'Period',
      'Practitioner',
      'Practitioner_Qualification',
      'Reference',
    ]);
  });

  it('type-checks, including the Reference <-> Identifier cycle', () => {
    expect(typecheckDir(generate())).toEqual([]);
  });

  it('fails to type-check when an imported file is missing', () => {
    const dir = generate();
    rmSync(join(dir, 'Period.ts'));

    expect(typecheckDir(dir).join('\n')).toContain("'./Period'");
  });
});
