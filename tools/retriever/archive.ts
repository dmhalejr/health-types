import { unzipSync } from 'fflate';
import { KEPT_FILES, SCHEMA_ARCHIVE } from './constants';

export interface ExtractedDefinitions {
  /** Kept definition files, by file name. */
  files: Record<string, Uint8Array>;
  /** Contents of the inner schema archive, by relative path. */
  schemaFiles: Record<string, Uint8Array>;
}

const dirname = (path: string): string =>
  path.split('/').slice(0, -1).join('/');

const basename = (path: string): string => path.split('/').pop() as string;

/** Archive entries come from the network, so refuse paths that could escape. */
export const assertSafePath = (path: string): void => {
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').includes('..')
  ) {
    throw new Error(`Refusing unsafe path in archive: "${path}"`);
  }
};

/**
 * Reads the HL7 `definitions.json.zip`. The schema archive sits at the zip
 * root for R5 but under a `definitions.json/` directory for R4B, so the
 * other files are taken from the same directory as the schema archive.
 */
export const extractDefinitions = (zip: Uint8Array): ExtractedDefinitions => {
  const outer = unzipSync(zip);
  const schemaEntry = Object.keys(outer).find(
    (path: string) => basename(path) === SCHEMA_ARCHIVE,
  );

  if (!schemaEntry) {
    throw new Error(`Archive does not contain ${SCHEMA_ARCHIVE}`);
  }

  const directory = dirname(schemaEntry);
  const entryFor = (name: string): string =>
    directory ? `${directory}/${name}` : name;

  const missing = KEPT_FILES.filter((name: string) => !outer[entryFor(name)]);

  if (missing.length > 0) {
    throw new Error(`Archive is missing: ${missing.join(', ')}`);
  }

  const schemaFiles = Object.fromEntries(
    Object.entries(unzipSync(outer[schemaEntry])).filter(
      ([path]: [string, Uint8Array]) => !path.endsWith('/'),
    ),
  );

  Object.keys(schemaFiles).forEach(assertSafePath);

  if (Object.keys(schemaFiles).length === 0) {
    throw new Error(`${SCHEMA_ARCHIVE} is empty`);
  }

  return {
    files: Object.fromEntries(
      KEPT_FILES.map((name: string) => [name, outer[entryFor(name)]]),
    ),
    schemaFiles,
  };
};
