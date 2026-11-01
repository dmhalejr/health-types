import { readFileSync } from 'fs';
import { join } from 'path';
import { Definitions } from './model';

/** FHIR versions this generator can currently read. */
export const SUPPORTED_VERSIONS = ['STU3', 'R4', 'R4B', 'R5'] as const;

export type FhirVersion = (typeof SUPPORTED_VERSIONS)[number];

export const isSupportedVersion = (version: string): version is FhirVersion =>
  (SUPPORTED_VERSIONS as readonly string[]).includes(version);

/** Path where the retriever extracts the combined schema for a version. */
export const schemaPath = (dataDir: string, version: FhirVersion): string =>
  join(dataDir, version, 'fhir.schema.json', 'fhir.schema.json');

export const loadDefinitions = (
  dataDir: string,
  version: FhirVersion,
): Definitions => {
  const path = schemaPath(dataDir, version);

  try {
    return JSON.parse(readFileSync(path, 'utf-8')).definitions;
  } catch (error) {
    throw new Error(
      `Could not read the ${version} schema at ${path}: ${
        (error as Error).message
      }`,
    );
  }
};
