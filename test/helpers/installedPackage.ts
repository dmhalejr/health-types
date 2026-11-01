import { spawnSync } from 'child_process';
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { generate } from '../../tools/generator';
import { FhirVersion } from '../../tools/retriever/constants';
import { makeTempDir } from './tempDir';

const root = join(__dirname, '..', '..');
const dataDir = join(root, 'data');
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');

export interface InstalledPackage {
  /** A project that has the packed package installed in node_modules. */
  app: string;
  /** Declaration files written for each release. */
  files: Record<string, number>;
  /** Temporary directories to remove when done. */
  dirs: string[];
}

/**
 * Builds the package for `versions` from the real HL7 data, packs it with the
 * real manifest, LICENSE and README, and installs the tarball into a fresh
 * project, as a user would.
 */
export const installPackage = (
  versions: readonly FhirVersion[],
): InstalledPackage => {
  const pkg = makeTempDir({});
  const dest = makeTempDir({});
  const app = makeTempDir({
    'package.json': '{"name":"app","private":true}\n',
  });
  const files: Record<string, number> = {};

  versions.forEach((version: FhirVersion) => {
    generate({
      version,
      dataDir,
      out: join(pkg, 'generated'),
      extension: '.d.ts',
    });
    files[version] = readdirSync(join(pkg, 'generated', version)).length;
  });
  ['package.json', 'LICENSE', 'README.md'].forEach((file: string) =>
    copyFileSync(join(root, file), join(pkg, file)),
  );

  const pack = spawnSync(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', dest],
    {
      cwd: pkg,
      encoding: 'utf-8',
    },
  );
  const tarball = join(dest, JSON.parse(pack.stdout)[0].filename);
  const install = spawnSync(
    'npm',
    ['install', tarball, '--ignore-scripts', '--no-audit', '--no-fund'],
    {
      cwd: app,
      encoding: 'utf-8',
    },
  );

  if (install.status !== 0)
    throw new Error(`npm install failed: ${install.stderr}`);

  return { app, files, dirs: [pkg, dest, app] };
};

/** Compiles `files` (relative to `app`) with the repository's TypeScript. */
export const compile = (
  app: string,
  files: string[],
  compilerOptions: Record<string, unknown>,
): { status: number | null; output: string } => {
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
      files: files.map((file: string) => `../${file}`),
    }),
  );

  const result = spawnSync(process.execPath, [tsc, '-p', join(app, 'cfg')], {
    cwd: app,
    encoding: 'utf-8',
  });

  return { status: result.status, output: result.stdout + result.stderr };
};
