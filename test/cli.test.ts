import { spawnSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Deps, run } from '../tools/cli';
import { schemaPath } from '../tools/generator/load';
import { makeTempDir, removeTempDir } from './helpers/tempDir';
import { typecheckDir } from './helpers/typecheck';

const root = join(__dirname, '..');
const dataDir = join(root, 'data');

interface Result {
  code: number;
  out: string;
  err: string;
  deps: {
    retrieve: ReturnType<typeof vi.fn>;
    retrieveExamples: ReturnType<typeof vi.fn>;
    generate: ReturnType<typeof vi.fn>;
  };
}

const cli = async (
  args: string[],
  overrides: Partial<Record<keyof Deps, unknown>> = {},
): Promise<Result> => {
  const deps = {
    retrieve: vi.fn(async () => []),
    retrieveExamples: vi.fn(async () => ({ directory: 'x', skipped: false })),
    generate: vi.fn(() => ['A', 'B', 'C']),
    ...overrides,
  };
  let out = '';
  let err = '';
  const code = await run(args, deps as unknown as Deps, {
    out: (text: string) => (out += text),
    err: (text: string) => (err += text),
  });

  return { code, out, err, deps: deps as Result['deps'] };
};

describe('usage', () => {
  it('prints help and exits 0', async () => {
    const result = await cli(['--help']);

    expect(result.code).toBe(0);
    expect(result.out).toContain('fetch');
    expect(result.out).toContain('generate');
  });

  it('prints the options of a command', async () => {
    const result = await cli(['generate', '--help']);

    expect(result.code).toBe(0);
    [
      '--version',
      '--resource',
      '--out',
      '--data',
      '--line-width',
      '--no-clean',
    ].forEach((flag: string) => expect(result.out).toContain(flag));
  });

  it('exits 2 and shows usage when no command is given', async () => {
    const result = await cli([]);

    expect(result.code).toBe(2);
    expect(result.err).toContain('Usage: health-types');
  });

  it('exits 2 for an unknown command', async () => {
    const result = await cli(['build']);

    expect(result.code).toBe(2);
    expect(result.err).toContain("unknown command 'build'");
  });

  it('exits 2 when generate has no --version', async () => {
    const result = await cli(['generate']);

    expect(result.code).toBe(2);
    expect(result.err).toContain(
      "required option '--version <version>' not specified",
    );
    expect(result.deps.generate).not.toHaveBeenCalled();
  });

  it.each([['generate'], ['fetch']])(
    'exits 2 and lists the versions for a bad one (%s)',
    async (command: string) => {
      const result = await cli([command, '--version', 'R9']);

      expect(result.code).toBe(2);
      expect(result.err).toContain(
        '"R9" is not a FHIR version. Choose one of STU3, R4, R4B, R5.',
      );
    },
  );

  it.each([[','], [' '], [',,']])(
    'exits 2 for a --resource that names nothing (%s)',
    async (value: string) => {
      const result = await cli([
        'generate',
        '--version',
        'R4',
        '--resource',
        value,
      ]);

      expect(result.code).toBe(2);
      expect(result.err).toContain('names no resource');
      expect(result.deps.generate).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['generate', '--out'],
    ['generate', '--data'],
    ['fetch', '--data'],
  ])('exits 2 for an empty %s %s', async (command: string, flag: string) => {
    const args =
      command === 'generate'
        ? [command, '--version', 'R4', flag, '']
        : [command, flag, ''];
    const result = await cli(args);

    expect(result.code).toBe(2);
    expect(result.err).toContain('the directory must not be empty');
  });

  it.each([['5'], ['abc'], ['80.5']])(
    'exits 2 for a bad --line-width (%s)',
    async (width: string) => {
      const result = await cli([
        'generate',
        '--version',
        'R4',
        '--line-width',
        width,
      ]);

      expect(result.code).toBe(2);
      expect(result.err).toContain('is not a whole number of at least 20');
    },
  );
});

describe('fetch', () => {
  it('downloads all four versions into data by default', async () => {
    const { code, deps } = await cli(['fetch']);

    expect(code).toBe(0);
    expect(deps.retrieve).toHaveBeenCalledTimes(1);
    expect(deps.retrieve.mock.calls[0][0]).toMatchObject({
      versions: ['STU3', 'R4', 'R4B', 'R5'],
      dataDir: 'data',
    });
    expect(deps.retrieve.mock.calls[0][0].force).toBeUndefined();
    expect(deps.retrieveExamples).not.toHaveBeenCalled();
  });

  it('takes one or several versions, "all", --data and --force', async () => {
    const some = await cli([
      'fetch',
      '--version',
      'R4',
      'R5',
      '--data',
      'd',
      '--force',
    ]);

    expect(some.deps.retrieve.mock.calls[0][0]).toMatchObject({
      versions: ['R4', 'R5'],
      dataDir: 'd',
      force: true,
    });

    const repeated = await cli([
      'fetch',
      '--version',
      'R4',
      '--version',
      'STU3',
    ]);

    expect(repeated.deps.retrieve.mock.calls[0][0].versions).toEqual([
      'R4',
      'STU3',
    ]);

    const all = await cli(['fetch', '--version', 'all']);

    expect(all.deps.retrieve.mock.calls[0][0].versions).toEqual([
      'STU3',
      'R4',
      'R4B',
      'R5',
    ]);
  });

  it('also downloads the official examples with --examples, for each version', async () => {
    const { deps } = await cli([
      'fetch',
      '--version',
      'R4',
      'R5',
      '--examples',
    ]);

    expect(
      deps.retrieveExamples.mock.calls.map(([options]) => options.version),
    ).toEqual(['R4', 'R5']);
    expect(deps.retrieveExamples.mock.calls[0][0]).toMatchObject({
      dataDir: 'data',
    });
  });

  it('reports progress through the log callback', async () => {
    const retrieve = vi.fn(
      async ({ log }: { log: (message: string) => void }) => {
        log('R4: downloading');

        return [];
      },
    );
    const result = await cli(['fetch', '--version', 'R4'], { retrieve });

    expect(result.out).toBe('R4: downloading\n');
  });

  it('exits 1 with a one-line message when a download fails', async () => {
    const retrieve = vi.fn(async () => {
      throw new Error(
        'Failed to download https://hl7.org/x: HTTP 404 Not Found',
      );
    });
    const result = await cli(['fetch', '--version', 'R4'], { retrieve });

    expect(result.code).toBe(1);
    expect(result.err).toBe(
      'error: Failed to download https://hl7.org/x: HTTP 404 Not Found\n',
    );
  });
});

describe('generate', () => {
  it('generates one version with the defaults and says what it wrote', async () => {
    const result = await cli(['generate', '--version', 'R4']);

    expect(result.code).toBe(0);
    expect(result.deps.generate).toHaveBeenCalledWith({
      version: 'R4',
      resources: undefined,
      out: 'generated',
      dataDir: 'data',
      lineWidth: undefined,
      clean: true,
    });
    expect(result.out).toBe('R4: wrote 3 types (all types) to generated/R4\n');
  });

  it('takes resources as several values, a comma list, or repeated flags', async () => {
    const spaced = await cli([
      'generate',
      '--version',
      'R4',
      '--resource',
      'Patient',
      'Observation',
    ]);
    const commas = await cli([
      'generate',
      '--version',
      'R4',
      '--resource',
      'Patient,Observation',
    ]);
    const repeated = await cli([
      'generate',
      '--version',
      'R4',
      '--resource',
      'Patient',
      '--resource',
      'Observation',
    ]);

    [spaced, commas, repeated].forEach((result) =>
      expect(result.deps.generate.mock.calls[0][0].resources).toEqual([
        'Patient',
        'Observation',
      ]),
    );
    expect(spaced.out).toContain('(Patient, Observation and what it needs)');
  });

  it('passes --out, --data, --line-width and --no-clean through', async () => {
    const result = await cli([
      'generate',
      '--version',
      'R5',
      '--out',
      'o',
      '--data',
      'd',
      '--line-width',
      '100',
      '--no-clean',
    ]);

    expect(result.deps.generate.mock.calls[0][0]).toMatchObject({
      version: 'R5',
      out: 'o',
      dataDir: 'd',
      lineWidth: 100,
      clean: false,
    });
    expect(result.out).toContain('to o/R5');
  });

  it('writes declaration files with --declaration', async () => {
    const result = await cli(['generate', '--version', 'R4', '--declaration']);

    expect(result.deps.generate.mock.calls[0][0].extension).toBe('.d.ts');
  });

  it('exits 1 with a one-line message when generation fails', async () => {
    const generate = vi.fn(() => {
      throw new Error('Unknown definition "Pateint" (did you mean Patient?)');
    });
    const result = await cli(
      ['generate', '--version', 'R4', '--resource', 'Pateint'],
      { generate },
    );

    expect(result.code).toBe(1);
    expect(result.err).toBe(
      'error: Unknown definition "Pateint" (did you mean Patient?)\n',
    );
    expect(result.out).toBe('');
  });
});

describe('the CLI is maintainer tooling, not part of the package', () => {
  const manifest = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf-8'),
  );

  it('has no bin entry and no runtime dependencies, and commander is a development dependency', () => {
    expect(manifest.bin).toBeUndefined();
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.devDependencies.commander).toBeDefined();
  });

  it('is reached only through npm scripts', () => {
    expect(manifest.scripts.fetch).toContain('tools/cli.ts fetch');
    expect(manifest.scripts.generate).toContain('tools/cli.ts generate');
  });

  it('does nothing when imported', () => {
    const before = process.exitCode;

    expect(typeof run).toBe('function');
    expect(process.exitCode).toBe(before);
  });
});

describe('as a process', () => {
  const spawn = (args: string[]) =>
    spawnSync(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', 'tools/cli.ts', ...args],
      {
        cwd: root,
        encoding: 'utf-8',
      },
    );

  it('prints help and exits 0', () => {
    const result = spawn(['--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: health-types');
  });

  it('exits 2 with a message on stderr for wrong usage', () => {
    const result = spawn(['generate', '--version', 'R9']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('is not a FHIR version');
  });
});

describe.skipIf(!existsSync(schemaPath(dataDir, 'R4')))(
  'generate against the real R4 data',
  () => {
    const dirs: string[] = [];
    afterEach(() => dirs.splice(0).forEach(removeTempDir));
    const tmp = (files: Record<string, string> = {}): string => {
      const dir = makeTempDir(files);
      dirs.push(dir);

      return dir;
    };
    const real = (out: string, extra: string[]) =>
      run(
        [
          'generate',
          '--version',
          'R4',
          '--out',
          out,
          '--data',
          dataDir,
          ...extra,
        ],
        undefined,
        {
          out: () => undefined,
          err: (text: string) => {
            errors.push(text);
          },
        },
      );
    const errors: string[] = [];

    afterEach(() => errors.splice(0));

    it('writes Patient and what it needs, not the whole version, and the files compile on their own', async () => {
      const out = tmp();

      expect(await real(out, ['--resource', 'Patient'])).toBe(0);

      const files = readdirSync(join(out, 'R4'));

      expect(files.length).toBeGreaterThan(20);
      expect(files.length).toBeLessThan(100);
      expect(files).toContain('Patient.ts');
      expect(files).toContain('Extension.ts');
      expect(files).not.toContain('Observation.ts');
      expect(readFileSync(join(out, 'R4', 'ResourceList.ts'), 'utf-8')).toBe(
        "import type { Patient } from './Patient';\n\nexport type ResourceList =\n  | Patient;\n",
      );
      expect(typecheckDir(join(out, 'R4'))).toEqual([]);
    });

    it('writes several resources into one compiling set', async () => {
      const out = tmp();

      expect(await real(out, ['--resource', 'Patient,Observation'])).toBe(0);

      const files = readdirSync(join(out, 'R4'));

      expect(files).toEqual(
        expect.arrayContaining(['Patient.ts', 'Observation.ts', 'Quantity.ts']),
      );
      expect(typecheckDir(join(out, 'R4'))).toEqual([]);
    });

    it('removes files of an earlier run, unless --no-clean', async () => {
      const out = tmp();

      await real(out, ['--resource', 'Period']);
      writeFileSync(join(out, 'R4', 'Old.ts'), 'export const old = 1;\n');
      expect(await real(out, ['--resource', 'Period', '--no-clean'])).toBe(0);
      expect(existsSync(join(out, 'R4', 'Old.ts'))).toBe(true);
      expect(await real(out, ['--resource', 'Period'])).toBe(0);
      expect(existsSync(join(out, 'R4', 'Old.ts'))).toBe(false);
    });

    it('refuses to clean a directory with other files and leaves it alone', async () => {
      const out = tmp();

      await real(out, ['--resource', 'Period']);
      writeFileSync(join(out, 'R4', 'notes.txt'), 'mine');

      expect(await real(out, ['--resource', 'Period'])).toBe(1);
      expect(errors.join('')).toContain('Refusing to clean');
      expect(readFileSync(join(out, 'R4', 'notes.txt'), 'utf-8')).toBe('mine');
      expect(existsSync(join(out, 'R4', 'Period.ts'))).toBe(true);
    });

    it('reports a misspelt resource with a suggestion, before touching the directory', async () => {
      const out = tmp();

      await real(out, ['--resource', 'Period']);

      expect(await real(out, ['--resource', 'Pateint'])).toBe(1);
      expect(errors.join('')).toContain(
        'Unknown definition "Pateint" (did you mean Patient?)',
      );
      expect(existsSync(join(out, 'R4', 'Period.ts'))).toBe(true);
    });

    it('writes a union alone as never', async () => {
      const out = tmp();

      expect(await real(out, ['--resource', 'ResourceList'])).toBe(0);
      expect(readFileSync(join(out, 'R4', 'ResourceList.ts'), 'utf-8')).toBe(
        'export type ResourceList = never;\n',
      );
    });
  },
);
