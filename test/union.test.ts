import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { emitDefinition } from '../tools/generator/emit';
import {
  buildDefinitionModel,
  Definitions,
  objectDefinitionNames,
} from '../tools/generator/model';
import { expectGolden } from './helpers/golden';
import { makeTempDir, removeTempDir } from './helpers/tempDir';
import { typecheckDir } from './helpers/typecheck';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'r4-choice.schema.json'), 'utf-8'),
) as { definitions: Definitions };

const emit = (name: string, definitions: Definitions = fixture.definitions) =>
  emitDefinition(buildDefinitionModel(name, definitions));

describe('oneOf unions', () => {
  it('emits ResourceList as a sorted union type importing every member', () => {
    expect(emit('ResourceList')).toBe(
      [
        "import type { Bundle } from './Bundle';",
        "import type { Observation } from './Observation';",
        '',
        'export type ResourceList =',
        '  | Bundle',
        '  | Observation;',
        '',
      ].join('\n'),
    );
  });

  it('keeps the union member order independent of schema order', () => {
    const definitions: Definitions = {
      B: { properties: {} },
      A: { properties: {} },
      U: { oneOf: [{ $ref: '#/definitions/B' }, { $ref: '#/definitions/A' }] },
    };

    expect(emit('U', definitions)).toContain('  | A\n  | B;');
  });

  it('rejects oneOf members that are not references', () => {
    const definitions: Definitions = { U: { oneOf: [{ type: 'string' }] } };

    expect(() => emit('U', definitions)).toThrow(
      'Unsupported oneOf member at U.oneOf[0]',
    );
  });

  it('types a property referring to the union', () => {
    const output = emit('Bundle_Entry');

    expect(output).toContain(
      "import type { ResourceList } from './ResourceList';",
    );
    expect(output).toContain('resource?: ResourceList;');
  });
});

describe('choice types (value[x])', () => {
  it('emits each alternative as its own optional field', () => {
    const output = emit('Observation');

    ['valueQuantity', 'valueString', 'valueBoolean', 'valuePeriod'].forEach(
      (name: string) => expect(output).toMatch(new RegExp(`  ${name}\\?: `)),
    );
    expect(output).toContain('valueBoolean?: boolean;');
    expect(output).toContain('valueQuantity?: Quantity;');
  });

  it('handles a self-referencing type with many alternatives', () => {
    const output = emit('Extension');

    expect(output).toContain('extension?: Extension[];');
    expect(output).not.toContain('import type { Extension }');
    // HL7's JSON Schema does not list Extension.url as required.
    expect(output).toContain('url?: string;');
  });

  it('honours `required` from the schema (Observation.code)', () => {
    const output = emit('Observation');

    expect(output).toContain('  code: CodeableConcept;');
    expect(output).toContain("  resourceType: 'Observation';");
    expect(output).toContain('status?:');
  });
});

describe('golden output', () => {
  it.each(['ResourceList', 'Bundle_Entry', 'Observation', 'Extension'])(
    '%s',
    (name: string) => expectGolden(`R4choice/${name}.ts`, emit(name)),
  );
});

describe('whole fixture', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach(removeTempDir));

  it('type-checks, including the ResourceList <-> resource cycle', () => {
    const dir = makeTempDir({});
    dirs.push(dir);

    objectDefinitionNames(fixture.definitions).forEach((name: string) =>
      writeFileSync(join(dir, `${name}.ts`), emit(name)),
    );

    expect(typecheckDir(dir)).toEqual([]);
  });
});
