import { Command, CommanderError, InvalidArgumentError } from 'commander';
import { generate } from './generator';
import {
  FHIR_VERSIONS,
  FhirVersion,
  isFhirVersion,
} from './retriever/constants';
import { retrieveExamples } from './retriever/examples';
import { retrieveFHIRSchemas } from './retriever/fetcher';

/**
 * Maintainer command line: downloads HL7's definitions and generates the
 * types. It produces the package contents and is not part of them: it has no
 * `bin` entry and `commander` is a development dependency.
 */

export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
}

export interface Deps {
  retrieve: typeof retrieveFHIRSchemas;
  retrieveExamples: typeof retrieveExamples;
  generate: typeof generate;
}

const defaultDeps: Deps = {
  retrieve: retrieveFHIRSchemas,
  retrieveExamples,
  generate,
};
const defaultIo: Io = {
  out: (text: string) => process.stdout.write(text),
  err: (text: string) => process.stderr.write(text),
};

const versionList = FHIR_VERSIONS.join(', ');

const parseVersion = (value: string): FhirVersion => {
  if (!isFhirVersion(value)) {
    throw new InvalidArgumentError(
      `"${value}" is not a FHIR version. Choose one of ${versionList}.`,
    );
  }

  return value;
};

/** `--version R4 R5` or `--version all`; repeatable. */
const collectVersions = (
  value: string,
  previous: FhirVersion[] = [],
): FhirVersion[] => [
  ...previous,
  ...(value === 'all' ? [...FHIR_VERSIONS] : [parseVersion(value)]),
];

/** `--resource Patient Observation` or `--resource Patient,Observation`; repeatable. */
const collectNames = (value: string, previous: string[] = []): string[] => {
  const names = value
    .split(',')
    .map((name: string) => name.trim())
    .filter(Boolean);

  if (names.length === 0) {
    throw new InvalidArgumentError(`"${value}" names no resource.`);
  }

  return [...previous, ...names];
};

/** A directory option must name something: an empty path would silently mean the working directory. */
const parseDir = (value: string): string => {
  if (value.trim() === '') {
    throw new InvalidArgumentError('the directory must not be empty.');
  }

  return value;
};

const parseWidth = (value: string): number => {
  const width = Number(value);

  if (!Number.isInteger(width) || width < 20) {
    throw new InvalidArgumentError(
      `"${value}" is not a whole number of at least 20.`,
    );
  }

  return width;
};

interface FetchFlags {
  version?: FhirVersion[];
  data: string;
  force?: boolean;
  examples?: boolean;
}

interface GenerateFlags {
  version: FhirVersion;
  resource?: string[];
  out: string;
  data: string;
  lineWidth?: number;
  clean: boolean;
  declaration?: boolean;
}

export const buildProgram = (
  deps: Deps,
  io: Io,
  setExitCode: (code: number) => void,
): Command => {
  const line = (text: string): void => io.out(`${text}\n`);
  const fail = (error: unknown): void => {
    io.err(`error: ${(error as Error).message}\n`);
    setExitCode(1);
  };

  const program = new Command()
    .name('health-types')
    .description(
      'Downloads HL7 FHIR definitions and generates TypeScript types from them (maintainer tool).',
    )
    .exitOverride()
    .configureOutput({ writeOut: io.out, writeErr: io.err });

  program
    .command('fetch')
    .description(
      'Download the HL7 definitions (schema, profiles and value sets) into the data directory.',
    )
    .option(
      '--version <version...>',
      `FHIR version(s): ${versionList}, or "all" (default: all)`,
      collectVersions,
    )
    .option('--data <dir>', 'where to store the downloads', parseDir, 'data')
    .option('--force', 'download again even if the version is already present')
    .option('--examples', 'also download the official example resources')
    .action(async (flags: FetchFlags) => {
      const versions = flags.version ?? [...FHIR_VERSIONS];

      try {
        await deps.retrieve({
          versions,
          dataDir: flags.data,
          force: flags.force,
          log: line,
        });

        if (flags.examples) {
          for (const version of versions) {
            await deps.retrieveExamples({
              version,
              dataDir: flags.data,
              force: flags.force,
              log: line,
            });
          }
        }
      } catch (error) {
        fail(error);
      }
    });

  program
    .command('generate')
    .description(
      'Generate the TypeScript types of one FHIR version into <out>/<version>/.',
    )
    .requiredOption(
      '--version <version>',
      `FHIR version: ${versionList}`,
      parseVersion,
    )
    .option(
      '--resource <name...>',
      'only these types and everything they refer to (default: all)',
      collectNames,
    )
    .option(
      '--out <dir>',
      'output directory; files go to <dir>/<version>/',
      parseDir,
      'generated',
    )
    .option('--data <dir>', 'where the downloads are', parseDir, 'data')
    .option(
      '--line-width <columns>',
      'wrap unions longer than this many columns',
      parseWidth,
    )
    .option('--declaration', 'write .d.ts files, as in the published package')
    .option('--no-clean', 'keep files of earlier runs in <out>/<version>/')
    .action((flags: GenerateFlags) => {
      try {
        const written = deps.generate({
          version: flags.version,
          resources: flags.resource,
          out: flags.out,
          dataDir: flags.data,
          lineWidth: flags.lineWidth,
          clean: flags.clean,
          extension: flags.declaration ? '.d.ts' : undefined,
        });
        const subject = flags.resource
          ? `${flags.resource.join(', ')} and what it needs`
          : 'all types';

        line(
          `${flags.version}: wrote ${written.length} types (${subject}) to ${flags.out}/${flags.version}`,
        );
      } catch (error) {
        fail(error);
      }
    });

  return program;
};

/**
 * Runs the CLI and returns the exit code: 0 on success (and for `--help`),
 * 1 when a command fails, 2 for wrong usage.
 */
export const run = async (
  argv: string[],
  deps: Deps = defaultDeps,
  io: Io = defaultIo,
): Promise<number> => {
  let code = 0;
  const program = buildProgram(deps, io, (value: number) => {
    code = value;
  });

  try {
    await program.parseAsync(argv, { from: 'user' });
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode === 0 ? 0 : 2;

    io.err(`error: ${(error as Error).message}\n`);

    return 1;
  }

  return code;
};

if (require.main === module) {
  run(process.argv.slice(2)).then((code: number) => {
    process.exitCode = code;
  });
}
