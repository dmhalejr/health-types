import { spawnSync } from 'child_process';
import { copyFileSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertOnlyVersions } from '../tools/build-types';
import { FHIR_VERSIONS } from '../tools/retriever/constants';
import { makeTempDir, removeTempDir } from './helpers/tempDir';

const root = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

describe('package.json describes a types-only package', () => {
  it('has no runtime code, entry point, binary or dependencies of any kind', () => {
    [
      'main',
      'module',
      'bin',
      'browser',
      'dependencies',
      'peerDependencies',
      'optionalDependencies',
      'bundledDependencies',
    ].forEach((field: string) =>
      expect(manifest[field], field).toBeUndefined(),
    );
    expect(manifest.sideEffects).toBe(false);
  });

  it('ships the declaration files under generated/ and nothing else', () => {
    expect(manifest.files).toEqual(['generated/**/*.d.ts']);
  });

  it('maps health-types/<VERSION>/<Name> to the declaration, types first', () => {
    expect(manifest.exports['./*']).toEqual({ types: './generated/*.d.ts' });
    expect(Object.keys(manifest.exports['./*'])[0]).toBe('types');
    expect(manifest.exports['./package.json']).toBe('./package.json');
  });

  it('has typesVersions for TypeScript projects that still use classic node resolution', () => {
    expect(manifest.typesVersions).toEqual({ '*': { '*': ['generated/*'] } });
  });

  it('rebuilds on npm pack and npm publish, so a stale or missing generated/ cannot ship', () => {
    // prepack runs for both; prepublishOnly would run for publish only, and as well it would build twice.
    expect(manifest.scripts.prepack).toBe('npm run build:package');
    expect(manifest.scripts.prepublishOnly).toBeUndefined();
    expect(manifest.scripts['build:package']).toContain('tools/build-types.ts');
  });

  it('names the license and the repository', () => {
    expect(manifest.license).toBe('MIT');
    expect(manifest.repository.url).toContain('dmhalejr/health-types');
  });
});

describe('npm pack', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach(removeTempDir));

  /** A copy of the real package.json, LICENSE and README beside generated output and a pile of things that must never ship. */
  const project = (): string => {
    const dir = makeTempDir({
      'generated/R4/Patient.d.ts': 'export interface Patient {}\n',
      'generated/R5/Observation.d.ts': 'export interface Observation {}\n',
      'generated/R4/Stray.ts': 'export const stray = 1;\n',
      'generated/notes.txt': 'notes\n',
      'src/index.ts': 'x\n',
      'lib/index.js': 'x\n',
      'tools/cli.ts': 'x\n',
      'test/a.test.ts': 'x\n',
      'data/R4/valuesets.json': '{}\n',
      'output/a.json': '{}\n',
      'docs/notes.md': 'x\n',
      'tasks/plan.md': 'x\n',
      'SPEC.md': 'x\n',
      'example/Practitioner.ts': 'x\n',
      'Practitioner.ts': 'x\n',
      '.env': 'SECRET=1\n',
      'node_modules/x/index.js': 'x\n',
      'tsconfig.json': '{}\n',
      'vitest.config.mts': 'x\n',
    });

    dirs.push(dir);
    ['package.json', 'LICENSE', 'README.md'].forEach((file: string) =>
      copyFileSync(join(root, file), join(dir, file)),
    );

    return dir;
  };

  const packed = (cwd: string): { paths: string[]; size: number } => {
    const result = spawnSync(
      'npm',
      ['pack', '--dry-run', '--json', '--ignore-scripts'],
      { cwd, encoding: 'utf-8' },
    );
    const report = JSON.parse(result.stdout)[0];

    return {
      paths: report.files.map((file: { path: string }) => file.path).sort(),
      size: report.size,
    };
  };

  it('contains only the declarations, package.json, LICENSE and README.md', () => {
    expect(packed(project()).paths).toEqual([
      'LICENSE',
      'README.md',
      'generated/R4/Patient.d.ts',
      'generated/R5/Observation.d.ts',
      'package.json',
    ]);
  });

  it('leaves out a stray .ts file and any other file inside generated/', () => {
    const paths = packed(project()).paths;

    expect(paths).not.toContain('generated/R4/Stray.ts');
    expect(paths).not.toContain('generated/notes.txt');
  });

  it('leaves out source, tooling, tests, data, docs, secrets and the prototype', () => {
    const paths = packed(project()).paths;

    [
      'src',
      'lib',
      'tools',
      'test',
      'data',
      'output',
      'docs',
      'tasks',
      'example',
      'node_modules',
    ].forEach((folder: string) =>
      expect(
        paths.filter((p: string) => p.startsWith(`${folder}/`)),
        folder,
      ).toEqual([]),
    );
    [
      'SPEC.md',
      'Practitioner.ts',
      '.env',
      'tsconfig.json',
      'vitest.config.mts',
    ].forEach((file: string) => expect(paths, file).not.toContain(file));
  });
});

describe('assertOnlyVersions', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach(removeTempDir));
  const out = (files: Record<string, string>): string => {
    const dir = makeTempDir(files);

    dirs.push(dir);

    return dir;
  };

  it('accepts a directory holding only version folders', () => {
    expect(() =>
      assertOnlyVersions(out({ 'R4/A.d.ts': 'x', 'R5/A.d.ts': 'x' }), [
        'R4',
        'R5',
      ]),
    ).not.toThrow();
  });

  it('rejects anything else, naming it', () => {
    expect(() =>
      assertOnlyVersions(
        out({ 'R4/A.d.ts': 'x', 'R3/A.d.ts': 'x', 'old.txt': 'x' }),
        ['R4', 'R5'],
      ),
    ).toThrow(/not FHIR versions \((R3, old\.txt|old\.txt, R3)\)/);
  });
});

describe('the name does not use the trademarks of HL7', () => {
  // HL7's policy prohibits using "FHIR" or "HL7" in a product name without written consent (D5).
  const cli = readFileSync(join(root, 'tools', 'cli.ts'), 'utf-8');

  it('keeps them out of the package name, its URLs and the command-line name', () => {
    expect(manifest.name).toBe('health-types');
    [
      manifest.name,
      manifest.repository.url,
      manifest.bugs.url,
      manifest.homepage,
    ].forEach((value: string) => expect(value, value).not.toMatch(/fhir|hl7/i));
    expect(cli).toMatch(/\.name\('health-types'\)/);
  });

  it('keeps "fhir" and "hl7" as search keywords, one per supported release', () => {
    // Descriptive tags for finding the package, not branding (decided with D5).
    ['fhir', 'hl7', 'hl7-fhir'].forEach((word: string) =>
      expect(manifest.keywords).toContain(word),
    );
    FHIR_VERSIONS.forEach((version: string) =>
      expect(manifest.keywords, version).toContain(
        `fhir-${version.toLowerCase()}`,
      ),
    );
    expect(new Set(manifest.keywords).size).toBe(manifest.keywords.length);
  });

  it('uses them only in descriptions, which name the standard', () => {
    expect(manifest.description).toContain('FHIR');
    expect(readFileSync(join(root, 'README.md'), 'utf-8')).toContain(
      'HL7® FHIR® standard',
    );
  });
});

describe('the old name is gone from everything that ships or runs', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry: string) => {
      const path = join(dir, entry);

      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  const files = [
    join(root, 'README.md'),
    join(root, 'CONTRIBUTING.md'),
    join(root, 'package.json'),
    ...walk(join(root, 'tools')),
    ...walk(join(root, 'test')).filter(
      (path: string) =>
        !path.includes(`${join('test', 'fixtures')}`) && path.endsWith('.ts'),
    ),
  ];

  it('does not mention fhir-types in the README, CONTRIBUTING, the manifest, the tooling or the tests', () => {
    // Only this file may spell it, to say that it must not appear.
    const offenders = files.filter(
      (path: string) =>
        !path.endsWith('package.test.ts') &&
        readFileSync(path, 'utf-8').includes('fhir-types'),
    );

    expect(
      offenders.map((path: string) => path.replace(`${root}/`, '')),
    ).toEqual([]);
  });
});
