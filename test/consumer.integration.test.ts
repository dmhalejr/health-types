import { spawnSync } from 'child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generate } from '../tools/generator';
import { schemaPath } from '../tools/generator/load';
import { makeTempDir, removeTempDir } from './helpers/tempDir';

const root = join(__dirname, '..');
const dataDir = join(root, 'data');
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const haveData = (['R4', 'R5'] as const).every((v) =>
  existsSync(schemaPath(dataDir, v)),
);

const GOOD = `
import type { Patient } from 'health-types/R4/Patient';
import type { Observation } from 'health-types/R5/Observation';
import type { ResourceList } from 'health-types/R4/ResourceList';

export const patient: Patient = {
  resourceType: 'Patient',
  gender: 'female',
  birthDate: '1990-01-01',
  _birthDate: { id: 'b1' },
  name: [{ family: 'Hale', given: ['D'] }],
};
export const observation: Observation = { resourceType: 'Observation', status: 'final', code: { text: 'heart rate' } };
export const listed: ResourceList = patient;
`;

// Every line marked @ts-expect-error must really be an error, or the compile fails.
const STRICT = `
import type { Patient } from 'health-types/R4/Patient';
import type { Observation } from 'health-types/R5/Observation';

// @ts-expect-error a gender outside the value set
export const a: Patient = { resourceType: 'Patient', gender: 'robot' };
// @ts-expect-error a field the specification requires
export const b: Observation = { resourceType: 'Observation', code: { text: 'x' } };
// @ts-expect-error a property the specification does not define
export const c: Patient = { resourceType: 'Patient', favouriteColour: 'blue' };
`;

describe.skipIf(!haveData)(
  'the packed package, installed into another project',
  () => {
    const dirs: string[] = [];
    let app: string;

    beforeAll(() => {
      const pkg = makeTempDir({});
      const dest = makeTempDir({});

      app = makeTempDir({ 'package.json': '{"name":"app","private":true}\n' });
      dirs.push(pkg, dest, app);
      (['R4', 'R5'] as const).forEach((version) =>
        generate({
          version,
          dataDir,
          out: join(pkg, 'generated'),
          extension: '.d.ts',
        }),
      );
      ['package.json', 'LICENSE', 'README.md'].forEach((f: string) =>
        copyFileSync(join(root, f), join(pkg, f)),
      );

      const pack = spawnSync(
        'npm',
        ['pack', '--ignore-scripts', '--json', '--pack-destination', dest],
        { cwd: pkg, encoding: 'utf-8' },
      );
      const tarball = join(dest, JSON.parse(pack.stdout)[0].filename);
      const install = spawnSync(
        'npm',
        ['install', tarball, '--ignore-scripts', '--no-audit', '--no-fund'],
        { cwd: app, encoding: 'utf-8' },
      );

      expect(install.status, install.stderr).toBe(0);
      writeFileSync(join(app, 'good.ts'), GOOD);
      writeFileSync(join(app, 'strict.ts'), STRICT);
      writeFileSync(
        join(app, 'missing-version.ts'),
        "import type { X } from 'health-types/R4/Nope';\nexport type Y = X;\n",
      );
      writeFileSync(
        join(app, 'bare.ts'),
        "import type { Patient } from 'health-types';\nexport type Y = Patient;\n",
      );
    }, 180_000);

    afterAll(() => dirs.splice(0).forEach(removeTempDir));

    const compile = (
      file: string,
      compilerOptions: Record<string, unknown>,
    ) => {
      mkdirSync(join(app, 'cfg'), { recursive: true });
      writeFileSync(
        join(app, 'cfg', 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            strict: true,
            noEmit: true,
            skipLibCheck: false,
            types: [],
            target: 'es2019',
            ...compilerOptions,
          },
          files: [`../${file}`],
        }),
      );

      return spawnSync(process.execPath, [tsc, '-p', join(app, 'cfg')], {
        cwd: app,
        encoding: 'utf-8',
      });
    };

    const modes: [string, Record<string, unknown>][] = [
      [
        'classic node resolution (typesVersions)',
        { module: 'commonjs', moduleResolution: 'node' },
      ],
      [
        'node16 resolution (exports)',
        { module: 'node16', moduleResolution: 'node16' },
      ],
    ];

    it('installs only the declarations, package.json, LICENSE and README.md', () => {
      const installed = join(app, 'node_modules', 'health-types');

      expect(readdirSync(installed).sort()).toEqual([
        'LICENSE',
        'README.md',
        'generated',
        'package.json',
      ]);
      expect(readdirSync(join(installed, 'generated')).sort()).toEqual([
        'R4',
        'R5',
      ]);
    });

    it.each(modes)(
      'compiles real imports of R4 and R5 types: %s',
      (_label, options) => {
        const result = compile('good.ts', options);

        expect(result.stdout + result.stderr).toBe('');
        expect(result.status).toBe(0);
      },
    );

    it.each(modes)(
      'rejects wrong data, so the types really constrain: %s',
      (_label, options) => {
        const result = compile('strict.ts', options);

        expect(result.stdout + result.stderr).toBe('');
        expect(result.status).toBe(0);
      },
    );

    it.each(modes)(
      'fails for a type that does not exist: %s',
      (_label, options) => {
        const result = compile('missing-version.ts', options);

        expect(result.status).not.toBe(0);
        expect(result.stdout).toContain('Nope');
      },
    );

    it.each(modes)(
      'has no root entry point to import: %s',
      (_label, options) => {
        const result = compile('bare.ts', options);

        expect(result.status).not.toBe(0);
        expect(result.stdout).toMatch(/health-types/);
      },
    );
  },
);
