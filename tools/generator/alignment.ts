import {
  PropertyLookup,
  resolveDefinition,
  SpecDefinition,
} from './spec-index';
import { PropertyModel } from './types';

interface Listed {
  names: ReadonlySet<string>;
  /** Bases of choice elements typed `*` (any type): every `<base><Type>` is allowed. */
  wildcards: readonly string[];
}

export interface Alignment {
  /** Per generated definition, the property names its StructureDefinition lists. */
  listed: ReadonlyMap<string, Listed>;
  /** `Definition.property` -> the name the specification gives it. */
  renames: ReadonlyMap<string, string>;
  /** Definitions that two spec paths list differently; should be empty. */
  conflicts: string[];
  /** Spec parents that did not resolve to a generated definition; should be empty. */
  unresolved: string[];
}

const capitalise = (word: string): string =>
  word[0].toUpperCase() + word.slice(1);

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean =>
  a.size === b.size && [...a].every((name: string) => b.has(name));

/** Names a snapshot element stands for: itself, or one per type for `value[x]`. */
const namesOf = (
  path: string,
  types: string[],
): { names: string[]; wildcard?: string } => {
  const last = path.split('.').pop() as string;

  if (!last.endsWith('[x]')) return { names: [last] };

  const base = last.slice(0, -3);

  return {
    names: types
      .filter((type) => type !== '*')
      .map((type) => base + capitalise(type)),
    wildcard: types.includes('*') ? base : undefined,
  };
};

/**
 * What the specification says each generated definition contains, read from
 * the children of every element path in the StructureDefinitions, plus the
 * properties HL7's schema names after a profile (`doseSimpleQuantity`) where
 * the specification and the JSON key are `doseQuantity`.
 */
export const deriveAlignment = (
  structureDefinitions: SpecDefinition[],
  propertiesOf: PropertyLookup,
  hasDefinition: (name: string) => boolean,
): Alignment => {
  const listed = new Map<
    string,
    { names: Set<string>; wildcards: Set<string> }
  >();
  const conflicts = new Set<string>();
  const unresolved: string[] = [];

  structureDefinitions
    .filter(
      (sd: SpecDefinition) =>
        sd.kind !== 'primitive-type' && hasDefinition(sd.name),
    )
    .forEach((sd: SpecDefinition) => {
      const children = new Map<
        string,
        { names: Set<string>; wildcards: Set<string> }
      >();

      sd.elements
        .filter((element) => element.path.includes('.'))
        .forEach((element) => {
          const parent = element.path.split('.').slice(0, -1).join('.');
          const entry = children.get(parent) ?? {
            names: new Set<string>(),
            wildcards: new Set<string>(),
          };
          const { names, wildcard } = namesOf(element.path, element.types);

          names.forEach((name: string) => entry.names.add(name));
          if (wildcard) entry.wildcards.add(wildcard);
          children.set(parent, entry);
        });

      children.forEach((entry, parent) => {
        const definition = resolveDefinition(parent, propertiesOf);

        if (!definition) {
          unresolved.push(parent);

          return;
        }

        const existing = listed.get(definition);

        if (!existing) {
          listed.set(definition, entry);
        } else if (!sameSet(existing.names, entry.names)) {
          conflicts.add(definition);
        }
      });
    });

  const renames = new Map<string, string>();

  listed.forEach((entry, definition) => {
    const present = new Set(
      propertiesOf(definition).map((p: PropertyModel) => p.name),
    );

    present.forEach((name: string) => {
      const target = name.replace(/SimpleQuantity$/, 'Quantity');

      if (
        target !== name &&
        !entry.names.has(name) &&
        entry.names.has(target) &&
        !present.has(target)
      ) {
        renames.set(`${definition}.${name}`, target);
      }
    });
  });

  return {
    listed: new Map(
      [...listed].map(([k, v]) => [
        k,
        { names: v.names, wildcards: [...v.wildcards] },
      ]),
    ),
    renames,
    conflicts: [...conflicts],
    unresolved,
  };
};

/** A single constant `resourceType` is JSON's discriminator, not a spec element. */
const isDiscriminator = (property: PropertyModel): boolean =>
  property.name === 'resourceType' &&
  property.type.kind === 'literal' &&
  property.type.values.length === 1;

export interface AlignedProperties {
  properties: PropertyModel[];
  dropped: string[];
  renamed: [string, string][];
}

/**
 * Keeps the properties the specification lists for a definition (and the
 * discriminator), renames the ones HL7's schema names after a profile, and
 * drops the rest. A `_name` follows its primitive. Definitions the
 * specification does not describe are returned untouched.
 */
export const alignProperties = (
  definition: string,
  properties: PropertyModel[],
  alignment: Alignment,
): AlignedProperties => {
  const listed = alignment.listed.get(definition);

  if (!listed) return { properties, dropped: [], renamed: [] };

  const outcome = new Map<string, string | null>();

  properties
    .filter((property: PropertyModel) => !property.name.startsWith('_'))
    .forEach((property: PropertyModel) => {
      const renamed = alignment.renames.get(`${definition}.${property.name}`);
      const isListed =
        isDiscriminator(property) ||
        listed.names.has(property.name) ||
        listed.wildcards.some(
          (base: string) =>
            property.name.startsWith(base) &&
            property.name.length > base.length,
        );

      outcome.set(property.name, renamed ?? (isListed ? property.name : null));
    });

  const aligned: PropertyModel[] = [];
  const dropped: string[] = [];
  const renamed: [string, string][] = [];

  properties.forEach((property: PropertyModel) => {
    const base = property.name.startsWith('_')
      ? property.name.slice(1)
      : property.name;
    const target = outcome.get(base);

    if (target === undefined || target === null) {
      dropped.push(property.name);
    } else {
      const name = property.name.startsWith('_') ? `_${target}` : target;

      if (name !== property.name) renamed.push([property.name, name]);
      aligned.push({ ...property, name });
    }
  });

  return { properties: aligned, dropped, renamed };
};
