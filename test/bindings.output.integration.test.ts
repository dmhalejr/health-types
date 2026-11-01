import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generate, generateTypes, prepare } from '../tools/generator';
import { schemaPath } from '../tools/generator/load';
import { makeTempDir, removeTempDir } from './helpers/tempDir';
import { FhirVersion } from '../tools/retriever/constants';

const dataDir = join(__dirname, '..', 'data');
const available = (version: FhirVersion): boolean =>
  existsSync(schemaPath(dataDir, version));

/** String properties that gain a union: derived bindings minus the schema's own enums (T10b). */
const NEWLY_UNIONS: Record<FhirVersion, number> = {
  STU3: 71,
  R4: 93,
  R4B: 328,
  R5: 360,
};

const dirs: string[] = [];
const tempDir = (): string => {
  const dir = makeTempDir({});
  dirs.push(dir);

  return dir;
};
afterAll(() => dirs.splice(0).forEach(removeTempDir));

/** One property as written (a wrapped union included), whitespace collapsed. */
const line = (
  dir: string,
  version: FhirVersion,
  file: string,
  property: string,
): string => {
  const match = readFileSync(join(dir, version, `${file}.ts`), 'utf-8').match(
    new RegExp(`^ {2}${property}\\??:[\\s\\S]*?;$`, 'm'),
  );

  return match
    ? match[0].replace(/\s+/g, ' ').trim()
    : `(no ${file}.${property})`;
};

(Object.keys(NEWLY_UNIONS) as FhirVersion[]).forEach((version: FhirVersion) =>
  describe.skipIf(!available(version))(
    `${version}: unions in the generated types`,
    () => {
      let withBindings: string;
      let without: string;

      beforeAll(() => {
        withBindings = tempDir();
        // One line per property, so a changed line is a changed property.
        generate({ version, dataDir, out: withBindings, lineWidth: Infinity });
        without = tempDir();
        // Same required fields and alignment, only the code bindings left out.
        const { definitions, options } = prepare({ version, dataDir });

        generateTypes(definitions, join(without, version), {
          ...options,
          bindings: undefined,
          lineWidth: Infinity,
        });
      });

      it('changes exactly the properties that gain a union, and nothing else', () => {
        const files = readdirSync(join(without, version));
        let changedLines = 0;

        files.forEach((file: string) => {
          const before = readFileSync(
            join(without, version, file),
            'utf-8',
          ).split('\n');
          const after = readFileSync(
            join(withBindings, version, file),
            'utf-8',
          ).split('\n');

          expect(after.length, file).toBe(before.length);
          // Requiredness (the `?`) is T10d's business; here only the type counts.
          const type = (text: string): string =>
            text.replace(/^(\s*\w+)\?:/, '$1:');

          before.forEach((text: string, index: number) => {
            if (type(text) !== type(after[index])) changedLines++;
          });
        });

        expect(readdirSync(join(withBindings, version))).toEqual(files);
        expect(changedLines).toBe(NEWLY_UNIONS[version]);
      });

      it('turns the status of Patient-level codes into unions where the list is known', () => {
        expect(line(withBindings, version, 'Patient', 'gender')).toBe(
          "gender?: 'male' | 'female' | 'other' | 'unknown';",
        );
      });

      it('leaves a code bound to an external system as a plain string', () => {
        // The spec requires Binary.contentType (min 1), so it is not optional.
        expect(line(withBindings, version, 'Binary', 'contentType')).toBe(
          'contentType: string;',
        );
      });
    },
  ),
);

describe.skipIf(!(['R4', 'R4B', 'R5'] as FhirVersion[]).every(available))(
  'the same field gets the same type in every version',
  () => {
    const out = tempDir();

    beforeAll(() => {
      (['STU3', 'R4', 'R4B', 'R5'] as FhirVersion[])
        .filter(available)
        .forEach((version: FhirVersion) => generate({ version, dataDir, out }));
    });

    it('gives Patient.gender one type in all versions', () => {
      const versions = (['STU3', 'R4', 'R4B', 'R5'] as FhirVersion[]).filter(
        available,
      );
      const lines = versions.map((version: FhirVersion) =>
        line(out, version, 'Patient', 'gender'),
      );

      expect(new Set(lines).size).toBe(1);
    });

    it('closes the R4 gap: ActivityDefinition.kind and .intent are unions in R4, R4B and R5', () => {
      (['R4', 'R4B', 'R5'] as FhirVersion[]).forEach((version: FhirVersion) => {
        expect(line(out, version, 'ActivityDefinition', 'kind')).toMatch(
          /kind\?: (\| )?'Appointment' \| /,
        );
        expect(line(out, version, 'ActivityDefinition', 'intent')).toMatch(
          /intent\?: (\| )?'proposal' \| 'plan' \| /,
        );
      });
    });

    it('keeps R5 language as string: it is bound to all of BCP-47', () => {
      expect(line(out, 'R5', 'Patient', 'language')).toBe('language?: string;');
    });
  },
);
