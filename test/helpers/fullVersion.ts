import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generate } from '../../tools/generator';
import {
  FhirVersion,
  loadDefinitions,
  schemaPath,
} from '../../tools/generator/load';
import { objectDefinitionNames } from '../../tools/generator/model';
import { printed } from './printed';
import { makeTempDir, removeTempDir } from './tempDir';
import { typecheckDir } from './typecheck';

const dataDir = join(__dirname, '..', '..', 'data');

/**
 * Checks that hold for the whole generated output of one FHIR version.
 * Needs the real HL7 schema (git-ignored; downloaded by the retriever), and
 * skips cleanly without it.
 */
export const describeFullVersion = (
  version: FhirVersion,
  minFiles: number,
): void => {
  describe.skipIf(!existsSync(schemaPath(dataDir, version)))(
    `full ${version} generation`,
    () => {
      let out: string;
      let outDir: string;
      let names: string[];
      const read = (name: string): string =>
        readFileSync(join(outDir, `${name}.ts`), 'utf-8');

      beforeAll(() => {
        out = makeTempDir({});
        outDir = join(out, version);
        names = generate({ version, dataDir, out });
      });
      afterAll(() => removeTempDir(out));

      it('writes one file per object or union definition', () => {
        const expected = objectDefinitionNames(
          loadDefinitions(dataDir, version),
        );

        expect(names).toHaveLength(expected.length);
        expect(names.length).toBeGreaterThan(minFiles);
        expect(readdirSync(outDir)).toHaveLength(expected.length);
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

        expect(
          names.filter((name: string) =>
            /\{\s*\}|Record<string, unknown>/.test(code(name)),
          ),
        ).toEqual([]);
      });

      // Single-specifier imports of very long type names are left on one line, as Prettier does.
      it('keeps every line of code within 100 characters, imports aside', () => {
        const tooLong = names.flatMap((name: string) =>
          read(name)
            .split('\n')
            .filter(
              (text: string) =>
                !/^\s*(\/\*\*|\*)/.test(text) &&
                !text.startsWith('import ') &&
                text.length > 100,
            )
            .map((text: string) => `${name}: ${text.length} characters`),
        );

        expect(tooLong).toEqual([]);
      });

      it('prints the same as the single-line form, so wrapping is layout only', () => {
        const flat = makeTempDir({});

        try {
          generate({ version, dataDir, out: flat, lineWidth: Infinity });

          names.forEach((name: string) =>
            expect(printed(read(name)), name).toBe(
              printed(readFileSync(join(flat, version, `${name}.ts`), 'utf-8')),
            ),
          );
        } finally {
          removeTempDir(flat);
        }
      }, 120_000);

      it('leads every resource with its required resourceType literal', () => {
        const resources = names.filter((name: string) =>
          /^ {2}resourceType: '/m.test(read(name)),
        );

        expect(resources.length).toBeGreaterThan(100);
        resources.forEach((name: string) => {
          const first = read(name).match(/^ {2}(\w+\??):/m);

          expect(first && first[1], name).toBe('resourceType');
        });
      });

      it('gives Patient its inherited and own properties', () => {
        const patient = read('Patient');

        [
          '  id?:',
          '  meta?:',
          '  text?:',
          '  contained?:',
          '  gender?:',
        ].forEach((fragment: string) => expect(patient).toContain(fragment));
        expect(patient).toContain("resourceType: 'Patient';");
        expect(patient).toContain('_birthDate?: Element;');
      });

      it('emits ResourceList as a union of every resource', () => {
        const mapping = JSON.parse(
          readFileSync(schemaPath(dataDir, version), 'utf-8'),
        ).discriminator.mapping;

        expect(read('ResourceList').match(/^ {2}\| /gm)).toHaveLength(
          Object.keys(mapping).length,
        );
      });
    },
  );
};
