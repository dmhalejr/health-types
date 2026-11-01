import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generate } from '../tools/generator';
import { loadDefinitions, schemaPath } from '../tools/generator/load';
import { objectDefinitionNames } from '../tools/generator/model';
import { makeTempDir, removeTempDir } from './helpers/tempDir';
import { typecheckDir } from './helpers/typecheck';

const dataDir = join(__dirname, '..', 'data');

describe('generate (argument handling)', () => {
  it('rejects an unsupported FHIR version', () => {
    expect(() => generate({ version: 'DSTU2' })).toThrow(
      'Unsupported FHIR version "DSTU2"',
    );
  });

  it('explains where it looked when the schema is missing', () => {
    expect(() =>
      generate({ version: 'R4', dataDir: join(__dirname, 'no-such-dir') }),
    ).toThrow(/Could not read the R4 schema at .*no-such-dir/);
  });
});

// Needs the real HL7 schema (git-ignored; downloaded by the retriever).
describe.skipIf(!existsSync(schemaPath(dataDir, 'R4')))(
  'full R4 generation',
  () => {
    let out: string;
    let outDir: string;
    let names: string[];
    const read = (name: string): string =>
      readFileSync(join(outDir, `${name}.ts`), 'utf-8');

    // Not at collection time: the suite must be skippable without the data.
    beforeAll(() => {
      out = makeTempDir({});
      outDir = join(out, 'R4');
      names = generate({ version: 'R4', dataDir, out });
    });
    afterAll(() => removeTempDir(out));

    it('writes one file per object or union definition', () => {
      const expected = objectDefinitionNames(loadDefinitions(dataDir, 'R4'));

      expect(names.length).toBeGreaterThan(600);
      expect(names).toHaveLength(expected.length);
      expect(readdirSync(outDir).sort()).toEqual(
        expected.map((name: string) => `${name}.ts`).sort(),
      );
    });

    it('has no file names that collide on a case-insensitive disk', () => {
      const lower = names.map((name: string) => name.toLowerCase());

      expect(new Set(lower).size).toBe(lower.length);
    });

    it('type-checks the entire output', () => {
      expect(typecheckDir(outDir)).toEqual([]);
    }, 120_000);

    it('contains no empty-object or empty-interface placeholders', () => {
      const code = (name: string): string =>
        read(name)
          .split('\n')
          .filter((line: string) => !/^\s*(\/\*\*|\*)/.test(line))
          .join('\n');

      const offenders = names.filter((name: string) =>
        /\{\s*\}|Record<string, unknown>/.test(code(name)),
      );

      expect(offenders).toEqual([]);
    });

    it('treats xhtml as a string, not a generated type', () => {
      expect(names).not.toContain('xhtml');
      expect(read('Narrative')).toContain('div: string;');
      expect(read('Narrative')).not.toContain('xhtml');
    });

    it('produces the expected shape for Patient', () => {
      const patient = read('Patient');

      expect(patient).toContain("resourceType: 'Patient';");
      expect(patient).toContain(
        "import type { HumanName } from './HumanName';",
      );
      expect(patient).toContain('name?: HumanName[];');
      expect(patient).toContain(
        "gender?: 'male' | 'female' | 'other' | 'unknown';",
      );
      expect(patient).toContain('_birthDate?: Element;');
    });

    it('emits ResourceList as a union covering every resource', () => {
      const list = read('ResourceList');

      expect(list).toContain('export type ResourceList =');
      expect(list).toContain('  | Patient');
      expect(list.match(/^ {2}\| /gm)).toHaveLength(
        Object.keys(
          JSON.parse(readFileSync(schemaPath(dataDir, 'R4'), 'utf-8'))
            .discriminator.mapping,
        ).length,
      );
    });
  },
);
