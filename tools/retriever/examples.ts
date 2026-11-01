import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { unzipSync } from 'fflate';
import { assertSafePath } from './archive';
import { FhirVersion } from './constants';
import { download, FetchLike, fetchWithTimeout } from './fetcher';

/** Directory, under `<dataDir>/<version>/`, that receives the official examples. */
export const EXAMPLES_DIR = 'examples';

export const examplesUrl = (version: FhirVersion): string =>
  `https://hl7.org/fhir/${version}/examples-json.zip`;

export interface RetrieveExamplesOptions {
  version: FhirVersion;
  dataDir?: string;
  force?: boolean;
  fetchImpl?: FetchLike;
  log?: (message: string) => void;
}

export interface ExamplesResult {
  directory: string;
  /** True when the examples were already present and nothing was downloaded. */
  skipped: boolean;
}

const dirOf = (path: string): string => path.split('/').slice(0, -1).join('/');

/**
 * Reads the JSON examples out of HL7's `examples-json.zip`. The files sit at
 * the zip root for most versions but under an `examples-json/` folder for R4B,
 * next to macOS `__MACOSX/` metadata, so the folder holding the most `.json`
 * files (the root on a tie) is taken and flattened. Unsafe paths are refused.
 */
export const extractExamples = (
  zip: Uint8Array,
): Record<string, Uint8Array> => {
  const entries = unzipSync(zip, {
    filter: (file) =>
      file.name.endsWith('.json') &&
      !file.name.startsWith('__MACOSX/') &&
      file.name.split('/').length <= 2,
  });
  const folders = new Map<string, string[]>();

  Object.keys(entries).forEach((path: string) => {
    assertSafePath(path);
    folders.set(dirOf(path), [...(folders.get(dirOf(path)) ?? []), path]);
  });

  const [best] = [...folders].sort(
    (a, b) => b[1].length - a[1].length || a[0].length - b[0].length,
  );

  if (!best) {
    throw new Error('Archive contains no .json examples');
  }

  return Object.fromEntries(
    best[1].map((path: string) => [
      path.split('/').pop() as string,
      entries[path],
    ]),
  );
};

const isRetrieved = (directory: string): boolean => {
  try {
    return readdirSync(directory).some((name: string) =>
      name.endsWith('.json'),
    );
  } catch {
    return false;
  }
};

/** Downloads the official examples of one FHIR version into `<dataDir>/<version>/examples`. */
export const retrieveExamples = async ({
  version,
  dataDir = 'data',
  force = false,
  fetchImpl = fetchWithTimeout,
  log = () => undefined,
}: RetrieveExamplesOptions): Promise<ExamplesResult> => {
  const directory = join(dataDir, version, EXAMPLES_DIR);

  if (!force && isRetrieved(directory)) {
    log(`${version} examples: already present, skipping`);

    return { directory, skipped: true };
  }

  const url = examplesUrl(version);

  log(`${version} examples: downloading ${url}`);
  const files = extractExamples(await download(url, fetchImpl));
  const staging = join(
    dataDir,
    version,
    `.${EXAMPLES_DIR}.partial-${process.pid}`,
  );

  try {
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    Object.entries(files).forEach(([name, bytes]: [string, Uint8Array]) =>
      writeFileSync(join(staging, name), bytes),
    );
    rmSync(directory, { recursive: true, force: true });
    renameSync(staging, directory);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }

  log(
    `${version} examples: ${
      Object.keys(files).length
    } files stored in ${directory}`,
  );

  return { directory, skipped: false };
};
