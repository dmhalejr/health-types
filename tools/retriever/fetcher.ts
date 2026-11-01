import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { extractDefinitions } from './archive';
import {
  definitionsUrl,
  FHIR_VERSIONS,
  FhirVersion,
  KEPT_FILES,
  SCHEMA_DIR,
} from './constants';

const DOWNLOAD_TIMEOUT_MS = 120_000;

/** The part of `fetch` this module uses; lets tests supply a fake. */
export type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export const fetchWithTimeout: FetchLike = (url: string) =>
  fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });

export interface RetrieveOptions {
  versions?: readonly FhirVersion[];
  /** Where schemas are stored (default `data`); one subdirectory per version. */
  dataDir?: string;
  /** Download again even if the version is already present. */
  force?: boolean;
  fetchImpl?: FetchLike;
  log?: (message: string) => void;
}

export interface RetrieveResult {
  version: FhirVersion;
  directory: string;
  /** True when the version was already present and nothing was downloaded. */
  skipped: boolean;
}

const isRetrieved = (directory: string): boolean => {
  const schemaDir = join(directory, SCHEMA_DIR);

  return (
    KEPT_FILES.every((name: string) => existsSync(join(directory, name))) &&
    existsSync(schemaDir) &&
    readdirSync(schemaDir).length > 0
  );
};

export const download = async (
  url: string,
  fetchImpl: FetchLike,
): Promise<Uint8Array> => {
  let response;

  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new Error(`Could not reach ${url}: ${(error as Error).message}`);
  }

  if (!response.ok) {
    throw new Error(
      `Failed to download ${url}: HTTP ${response.status} ${response.statusText}`.trim(),
    );
  }

  return new Uint8Array(await response.arrayBuffer());
};

const writeAll = (root: string, files: Record<string, Uint8Array>): void =>
  Object.entries(files).forEach(([path, bytes]: [string, Uint8Array]) => {
    const target = join(root, path);

    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  });

const retrieveVersion = async (
  version: FhirVersion,
  dataDir: string,
  force: boolean,
  fetchImpl: FetchLike,
  log: (message: string) => void,
): Promise<RetrieveResult> => {
  const directory = join(dataDir, version);

  if (!force && isRetrieved(directory)) {
    log(`${version}: already present, skipping (use force to download again)`);

    return { version, directory, skipped: true };
  }

  const url = definitionsUrl(version);

  log(`${version}: downloading ${url}`);
  const { files, schemaFiles } = extractDefinitions(
    await download(url, fetchImpl),
  );

  // Extract beside the destination, then swap, so a failure leaves nothing half-written.
  const staging = join(dataDir, `.${version}.partial-${process.pid}`);

  try {
    rmSync(staging, { recursive: true, force: true });
    writeAll(staging, files);
    writeAll(join(staging, SCHEMA_DIR), schemaFiles);
    rmSync(directory, { recursive: true, force: true });
    renameSync(staging, directory);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }

  log(`${version}: stored in ${directory}`);

  return { version, directory, skipped: false };
};

/** Downloads and extracts the HL7 JSON Schema and binding data per version. */
export const retrieveFHIRSchemas = async ({
  versions = FHIR_VERSIONS,
  dataDir = 'data',
  force = false,
  fetchImpl = fetchWithTimeout,
  log = () => undefined,
}: RetrieveOptions = {}): Promise<RetrieveResult[]> => {
  mkdirSync(dataDir, { recursive: true });

  return Promise.all(
    versions.map((version: FhirVersion) =>
      retrieveVersion(version, dataDir, force, fetchImpl, log),
    ),
  );
};
