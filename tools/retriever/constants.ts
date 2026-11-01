/** FHIR versions with a downloadable JSON Schema. DSTU2 is deliberately absent. */
export const FHIR_VERSIONS = ['STU3', 'R4', 'R4B', 'R5'] as const;

export type FhirVersion = (typeof FHIR_VERSIONS)[number];

export const isFhirVersion = (value: string): value is FhirVersion =>
  (FHIR_VERSIONS as readonly string[]).includes(value);

export const definitionsUrl = (version: FhirVersion): string =>
  `https://hl7.org/fhir/${version}/definitions.json.zip`;

/** The archive entry holding the JSON Schema; its directory varies by version. */
export const SCHEMA_ARCHIVE = 'fhir.schema.json.zip';

/**
 * Files kept from the definitions archive next to the schema. Binding
 * strengths and value sets (used to derive union types) live in these.
 */
export const KEPT_FILES = [
  'profiles-resources.json',
  'profiles-types.json',
  'valuesets.json',
] as const;

/** Directory, under `<dataDir>/<version>/`, that receives the extracted schema. */
export const SCHEMA_DIR = 'fhir.schema.json';
