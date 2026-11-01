import { readFileSync } from 'fs';
import { join } from 'path';
import { PropertyModel, TypeModel } from './types';

/** One element of a StructureDefinition snapshot, reduced to what we use. */
export interface SpecElement {
  path: string;
  min: number;
  max: string;
  /** Type codes, such as `code` or `Quantity`; empty for backbone elements. */
  types: string[];
  sliceName?: string;
  binding?: {
    strength: string;
    /** Canonical URL of the bound value set, whichever field carried it. */
    valueSet?: string;
  };
}

export interface SpecDefinition {
  name: string;
  kind: string;
  abstract: boolean;
  elements: SpecElement[];
}

interface RawElement {
  path: string;
  min?: number;
  max?: string;
  type?: { code: string }[];
  sliceName?: string;
  binding?: {
    strength: string;
    valueSet?: string;
    valueSetUri?: string;
    valueSetReference?: { reference?: string };
  };
}

interface RawStructureDefinition {
  resourceType: string;
  name: string;
  kind: string;
  abstract?: boolean;
  snapshot?: { element: RawElement[] };
}

const toElement = (raw: RawElement): SpecElement => ({
  path: raw.path,
  min: raw.min ?? 0,
  max: raw.max ?? '1',
  types: (raw.type ?? []).map((type) => type.code),
  sliceName: raw.sliceName,
  binding: raw.binding && {
    strength: raw.binding.strength,
    valueSet:
      raw.binding.valueSet ??
      raw.binding.valueSetUri ??
      raw.binding.valueSetReference?.reference,
  },
});

/** Reads the StructureDefinitions that have a snapshot out of a HL7 profiles bundle. */
export const readStructureDefinitions = (bundle: {
  entry: { resource: RawStructureDefinition }[];
}): SpecDefinition[] =>
  bundle.entry
    .map((entry) => entry.resource)
    .filter(
      (resource) =>
        resource.resourceType === 'StructureDefinition' && resource.snapshot,
    )
    .map((resource) => ({
      name: resource.name,
      kind: resource.kind,
      abstract: resource.abstract === true,
      elements: (resource.snapshot as { element: RawElement[] }).element.map(
        toElement,
      ),
    }));

export interface Spec {
  structureDefinitions: SpecDefinition[];
  /** ValueSet and CodeSystem resources, as published. */
  terminology: unknown[];
}

const readJson = (path: string) => {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    throw new Error(`Could not read ${path}: ${(error as Error).message}`);
  }
};

/** Loads the spec files the retriever keeps for one version. */
export const loadSpec = (dataDir: string, version: string): Spec => ({
  structureDefinitions: [
    'profiles-resources.json',
    'profiles-types.json',
  ].flatMap((file: string) =>
    readStructureDefinitions(readJson(join(dataDir, version, file))),
  ),
  terminology: readJson(join(dataDir, version, 'valuesets.json')).entry.map(
    (entry: { resource: unknown }) => entry.resource,
  ),
});

/** Properties of a generated definition; the walker never builds names itself. */
export type PropertyLookup = (definition: string) => PropertyModel[];

const referencedDefinition = (type: TypeModel): string | undefined =>
  type.kind === 'ref'
    ? type.name
    : type.kind === 'array'
    ? referencedDefinition(type.item)
    : undefined;

/**
 * The generated definition an element path stands for (`Patient.contact`
 * is `Patient_Contact`), found by walking the generated types like
 * `resolveElement`. Undefined when any step does not exist.
 */
export const resolveDefinition = (
  path: string,
  propertiesOf: PropertyLookup,
): string | undefined => {
  const [root, ...steps] = path.split('.');
  let definition: string | undefined = root;

  for (const step of steps) {
    const next: PropertyModel | undefined = definition
      ? propertiesOf(definition).find((p) => p.name === step)
      : undefined;

    definition = next && referencedDefinition(next.type);
  }

  return definition;
};

export interface ResolvedElement {
  definition: string;
  property: PropertyModel;
}

/**
 * Finds the generated property for an element path by walking the generated
 * types from the root definition (`Patient` -> `contact` -> its type ->
 * `gender`). HL7 gives colliding backbone types numeric suffixes
 * (`ClaimResponse_Detail1`), so names cannot be built from paths.
 * Returns undefined when any step does not exist.
 */
export const resolveElement = (
  path: string,
  propertiesOf: PropertyLookup,
): ResolvedElement | undefined => {
  const [root, ...rest] = path.split('.');
  const property = rest.pop();
  let definition: string | undefined = root;

  for (const step of rest) {
    const next: PropertyModel | undefined = definition
      ? propertiesOf(definition).find((p) => p.name === step)
      : undefined;

    definition = next && referencedDefinition(next.type);
  }

  const found = definition
    ? propertiesOf(definition).find((p) => p.name === property)
    : undefined;

  return definition && found ? { definition, property: found } : undefined;
};
