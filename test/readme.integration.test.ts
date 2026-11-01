import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schemaPath } from '../tools/generator/load';
import { FHIR_VERSIONS } from '../tools/retriever/constants';
import {
  compile,
  installPackage,
  InstalledPackage,
} from './helpers/installedPackage';
import { removeTempDir } from './helpers/tempDir';

const root = join(__dirname, '..');
const readme = readFileSync(join(root, 'README.md'), 'utf-8');
const haveData = FHIR_VERSIONS.every((v) =>
  existsSync(schemaPath(join(root, 'data'), v)),
);

/** The fenced ```ts blocks of the README, in order. */
const blocks = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)].map(
  (match) => match[1],
);

describe('README', () => {
  it('has runnable examples for the main ideas', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(6);
    expect(blocks.join('\n')).toContain('@ts-expect-error');
  });

  it('only imports from the package the way it recommends', () => {
    blocks.forEach((block: string) => {
      const imports = block.match(/^import .*$/gm) ?? [];

      imports.forEach((line: string) => expect(line).toMatch(/^import type /));
      imports.forEach((line: string) =>
        expect(line).toMatch(/from 'health-types\/(STU3|R4|R4B|R5)\/\w+'/),
      );
    });
  });

  it('names the trademark owner as HL7 requires and credits the licence', () => {
    expect(readme).toContain('HL7® FHIR® standard');
    expect(readme).toContain(
      'registered trademarks of Health Level Seven International',
    );
    expect(readme).toContain(
      'their use does not constitute endorsement by HL7',
    );
    expect(readme).toContain('CC0 1.0 Universal');
  });
});

describe.skipIf(!haveData)('README against the real package', () => {
  let installed: InstalledPackage;

  beforeAll(() => {
    installed = installPackage(FHIR_VERSIONS);
    blocks.forEach((block: string, index: number) =>
      writeFileSync(join(installed.app, `readme-${index}.ts`), block),
    );
  }, 240_000);

  afterAll(() => installed?.dirs.forEach(removeTempDir));

  const modes: [string, Record<string, unknown>][] = [
    [
      'classic node resolution',
      { module: 'commonjs', moduleResolution: 'node' },
    ],
    ['node16 resolution', { module: 'node16', moduleResolution: 'node16' }],
  ];

  it.each(modes)(
    'every example compiles, and every expected error is one: %s',
    (_label, options) => {
      const result = compile(
        installed.app,
        blocks.map((_b, i) => `readme-${i}.ts`),
        options,
      );

      expect(result.output).toBe('');
      expect(result.status).toBe(0);
    },
  );

  it('states the number of types per release correctly', () => {
    FHIR_VERSIONS.forEach((version: string) => {
      const row = readme.match(
        new RegExp(
          `\\| \`health-types/${version}/…\` \\| [\\d.]+ \\| ([\\d,]+) \\|`,
        ),
      );

      expect(row, `${version} row`).not.toBeNull();
      expect(Number((row as RegExpMatchArray)[1].replace(',', ''))).toBe(
        installed.files[version],
      );
    });
  });
});
