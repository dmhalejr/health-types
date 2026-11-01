import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generate } from '../tools/generator';
import { loadDefinitions, schemaPath } from '../tools/generator/load';
import { objectDefinitionNames } from '../tools/generator/model';
import { makeTempDir, removeTempDir } from './helpers/tempDir';
import { typecheckDir } from './helpers/typecheck';

const dataDir = join(__dirname, '..', 'data');

// Needs the real HL7 schema (git-ignored; downloaded by the retriever).
describe.skipIf(!existsSync(schemaPath(dataDir, 'STU3')))(
  'full STU3 generation',
  () => {
    let out: string;
    let outDir: string;
    let names: string[];
    const read = (name: string): string =>
      readFileSync(join(outDir, `${name}.ts`), 'utf-8');

    beforeAll(() => {
      out = makeTempDir({});
      outDir = join(out, 'STU3');
      names = generate({ version: 'STU3', dataDir, out });
    });
    afterAll(() => removeTempDir(out));

    it('writes one file per definition, including the base types', () => {
      const expected = objectDefinitionNames(loadDefinitions(dataDir, 'STU3'));

      expect(names).toHaveLength(expected.length);
      expect(names.length).toBeGreaterThan(450);
      expect(readdirSync(outDir)).toHaveLength(expected.length);
      ['Element', 'BackboneElement', 'Resource', 'DomainResource'].forEach(
        (name: string) => expect(names).toContain(name),
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

    it('leads every resource with its required resourceType literal', () => {
      const resources = names.filter((name: string) =>
        /^  resourceType: '/m.test(read(name)),
      );

      expect(resources.length).toBeGreaterThan(100);
      resources.forEach((name: string) => {
        const firstProperty = read(name).match(/^ {2}(\w+\??):/m);

        expect(firstProperty && firstProperty[1], name).toBe('resourceType');
      });
    });

    it('inherits properties from the whole chain', () => {
      const patient = read('Patient');

      ['  id?:', '  meta?:', '  text?:', '  contained?:', '  gender?:'].forEach(
        (fragment: string) => expect(patient).toContain(fragment),
      );
      expect(patient).toContain(
        "gender?: 'male' | 'female' | 'other' | 'unknown';",
      );
    });

    it('types array-level enums as arrays', () => {
      expect(read('Timing_Repeat').replace(/\s+/g, ' ')).toMatch(
        /when\?: \( \| 'MORN' \| /,
      );
    });

    it('emits ResourceList as a union with every resource', () => {
      const list = read('ResourceList');

      expect(list).toContain('export type ResourceList =');
      expect(list).toContain('  | Patient');
      expect(list.match(/^ {2}\| /gm)?.length ?? 0).toBeGreaterThan(100);
    });
  },
);
