import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { generate } from './generator';
import { FHIR_VERSIONS, FhirVersion } from './retriever/constants';
import { retrieveFHIRSchemas } from './retriever/fetcher';
import { typecheckDir } from './typecheck';

/**
 * Builds the published package: the `.d.ts` files of every FHIR version in
 * `generated/`, which `package.json` ships and nothing else. Run by
 * `prepack` (so both `npm pack` and `npm publish` rebuild); it is part of the maintainer tooling, not of the package.
 */

export interface BuildOptions {
  dataDir?: string;
  out?: string;
  versions?: readonly FhirVersion[];
  retrieve?: typeof retrieveFHIRSchemas;
  log?: (message: string) => void;
}

export interface BuiltVersion {
  version: FhirVersion;
  files: number;
  bytes: number;
}

const directoryBytes = (dir: string): number =>
  readdirSync(dir).reduce(
    (sum: number, entry: string) => sum + statSync(join(dir, entry)).size,
    0,
  );

/** The package contains one directory per version and nothing else. */
export const assertOnlyVersions = (
  out: string,
  versions: readonly string[],
): void => {
  const unexpected = readdirSync(out).filter(
    (entry: string) => !versions.includes(entry),
  );

  if (unexpected.length > 0) {
    throw new Error(
      `${out} holds entries that are not FHIR versions (${unexpected.join(
        ', ',
      )}); remove them before publishing`,
    );
  }
};

export const buildPackage = async ({
  dataDir = 'data',
  out = 'generated',
  versions = FHIR_VERSIONS,
  retrieve = retrieveFHIRSchemas,
  log = () => undefined,
}: BuildOptions = {}): Promise<BuiltVersion[]> => {
  await retrieve({ versions, dataDir, log });

  const built = versions.map((version: FhirVersion) => {
    const names = generate({
      version,
      dataDir,
      out,
      clean: true,
      extension: '.d.ts',
    });
    const dir = join(out, version);
    const problems = typecheckDir(dir);

    if (problems.length > 0) {
      throw new Error(
        `${version}: the generated declarations do not compile:\n${problems
          .slice(0, 5)
          .join('\n')}`,
      );
    }

    log(`${version}: ${names.length} declaration files compile`);

    return { version, files: names.length, bytes: directoryBytes(dir) };
  });

  assertOnlyVersions(out, versions);

  return built;
};

if (require.main === module) {
  buildPackage({ log: console.log })
    .then((built: BuiltVersion[]) => {
      built.forEach(({ version, files, bytes }) =>
        console.log(
          `${version}: ${files} files, ${(bytes / 1048576).toFixed(2)} MB`,
        ),
      );
    })
    .catch((error: Error) => {
      console.error(`error: ${error.message}`);
      process.exitCode = 1;
    });
}
