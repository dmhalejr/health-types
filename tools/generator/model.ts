import { Alignment, alignProperties } from './alignment';
import { flattenDefinition } from './inherit';
import { DefinitionModel, PropertyModel, TypeModel } from './types';

/** The subset of JSON Schema keywords used by the HL7 R4+ schemas. */
export interface SchemaNode {
  description?: string;
  type?: string;
  enum?: string[];
  const?: unknown;
  $ref?: string;
  items?: SchemaNode;
  properties?: Record<string, SchemaNode>;
  required?: string[];
  oneOf?: SchemaNode[];
  allOf?: SchemaNode[];
}

export type Definitions = Record<string, SchemaNode>;

const PRIMITIVE_TYPES: Record<string, 'string' | 'number' | 'boolean'> = {
  string: 'string',
  number: 'number',
  integer: 'number',
  boolean: 'boolean',
};

/**
 * FHIR primitives the schema gives no JSON type: `xhtml` is just a
 * description, but its value is a string of escaped XHTML.
 */
const UNTYPED_PRIMITIVES: Record<string, 'string'> = { xhtml: 'string' };

/**
 * FHIR primitives such as `date` or `code` are plain JSON types plus a
 * pattern. Returns the TypeScript primitive, or undefined for object types.
 */
export const primitiveOf = (
  name: string,
  node: SchemaNode,
): 'string' | 'number' | 'boolean' | undefined =>
  name in UNTYPED_PRIMITIVES
    ? UNTYPED_PRIMITIVES[name]
    : !node.properties && node.type !== undefined
    ? PRIMITIVE_TYPES[node.type]
    : undefined;

/** `_birthDate` style properties carry the id and extensions of a primitive. */
const isPrimitiveExtension = (propertyName: string): boolean =>
  propertyName.startsWith('_');

/** Primitives that carry no extensions: element ids, and the XHTML of a narrative. */
const isExtensible = (definition: string, propertyName: string): boolean =>
  propertyName !== 'id' && `${definition}.${propertyName}` !== 'Narrative.div';

const isPrimitiveType = (type: TypeModel): boolean =>
  type.kind === 'primitive' ||
  (type.kind === 'array' && isPrimitiveType(type.item));

/**
 * HL7's schemas define a `_name` for most primitives but leave it out for
 * others (every `canonical`: `StructureDefinition.baseDefinition`,
 * `Meta.profile`, ...), although the specification allows extensions on them
 * and official examples use them. Adds the missing ones, in the same shape.
 */
const withMissingPrimitiveExtensions = (
  properties: PropertyModel[],
  definition: string,
  definitions: Definitions,
): PropertyModel[] => {
  if (!definitions.Element) return properties;

  const names = new Set(
    properties.map((property: PropertyModel) => property.name),
  );

  return properties.flatMap((property: PropertyModel) => {
    if (
      isPrimitiveExtension(property.name) ||
      names.has(`_${property.name}`) ||
      !isPrimitiveType(property.type) ||
      !isExtensible(definition, property.name)
    ) {
      return [property];
    }

    const element: TypeModel = { kind: 'ref', name: 'Element' };

    return [
      property,
      {
        name: `_${property.name}`,
        description: `Extensions for ${property.name}`,
        required: false,
        type:
          property.type.kind === 'array'
            ? { kind: 'array', item: element, nullableItems: true }
            : element,
      },
    ];
  });
};

const buildType = (
  node: SchemaNode,
  path: string,
  definitions: Definitions,
): TypeModel => {
  if (node.$ref) {
    const name = node.$ref.split('/').pop() as string;
    const target = definitions[name];

    if (!target) {
      throw new Error(`Unresolved $ref "${node.$ref}" at ${path}`);
    }

    const primitive = primitiveOf(name, target);

    return primitive
      ? { kind: 'primitive', name: primitive }
      : { kind: 'ref', name };
  }

  if (node.type === 'array') {
    if (!node.items) {
      throw new Error(`Array without items at ${path}`);
    }

    // STU3 sometimes puts the enum on the array node: it constrains the items.
    if (node.enum && (node.items.enum || node.items.$ref)) {
      throw new Error(
        `Unsupported enum on an array of constrained items at ${path}`,
      );
    }

    const items = node.enum ? { ...node.items, enum: node.enum } : node.items;

    return { kind: 'array', item: buildType(items, `${path}[]`, definitions) };
  }

  if (node.const !== undefined) {
    if (typeof node.const !== 'string') {
      throw new Error(`Unsupported non-string const at ${path}`);
    }

    return { kind: 'literal', values: [node.const] };
  }

  if (node.enum) {
    return { kind: 'literal', values: node.enum };
  }

  if (node.properties) {
    return {
      kind: 'object',
      properties: buildProperties(node, path, definitions),
    };
  }

  if (node.type && node.type in PRIMITIVE_TYPES) {
    return { kind: 'primitive', name: PRIMITIVE_TYPES[node.type] };
  }

  throw new Error(`Unsupported schema at ${path}`);
};

const buildProperties = (
  node: SchemaNode,
  path: string,
  definitions: Definitions,
): PropertyModel[] => {
  const required = new Set(node.required ?? []);

  return Object.entries(node.properties ?? {}).map(
    ([name, property]: [string, SchemaNode]) => {
      const type = buildType(property, `${path}.${name}`, definitions);

      return {
        name,
        description: property.description,
        required: required.has(name),
        // In an array of primitives an entry with a value but no extension has
        // a null in the matching `_name` array, which HL7's schema forbids.
        type:
          isPrimitiveExtension(name) && type.kind === 'array'
            ? { ...type, nullableItems: true }
            : type,
      };
    },
  );
};

/** Only unions of other generated types are supported (HL7's `ResourceList`). */
const buildUnionMembers = (
  members: SchemaNode[],
  name: string,
  definitions: Definitions,
): string[] =>
  members
    .map((member: SchemaNode, index: number) => {
      const type = buildType(member, `${name}.oneOf[${index}]`, definitions);

      if (type.kind !== 'ref') {
        throw new Error(`Unsupported oneOf member at ${name}.oneOf[${index}]`);
      }

      return type.name;
    })
    .sort();

/** Allowed codes per `Definition.property` (see bindings.ts). */
export type CodeBindings = ReadonlyMap<string, string[]>;

/**
 * Turns a plain string (or array of strings) into a union of the allowed
 * codes. A property that already is a union keeps it: the schema's own enum
 * wins, and the derived list only fills gaps.
 */
const applyBinding = (
  property: PropertyModel,
  codes: string[],
): PropertyModel => {
  const { type } = property;

  if (type.kind === 'primitive' && type.name === 'string') {
    return { ...property, type: { kind: 'literal', values: codes } };
  }

  if (
    type.kind === 'array' &&
    type.item.kind === 'primitive' &&
    type.item.name === 'string'
  ) {
    return {
      ...property,
      type: { kind: 'array', item: { kind: 'literal', values: codes } },
    };
  }

  return property;
};

/**
 * The discriminator is a single constant ('Patient'). A field that merely is
 * called `resourceType` and allows many values (ExampleScenario instances use
 * one that names any resource) is an ordinary field.
 */
const isDiscriminator = (property: PropertyModel): boolean =>
  property.name === 'resourceType' &&
  property.type.kind === 'literal' &&
  property.type.values.length === 1;

/**
 * Keeps the `resourceType` discriminator (a literal such as 'Patient')
 * leading whatever order inheritance produced. A plain string field that
 * happens to be called `resourceType` stays where the schema put it.
 */
const resourceTypeFirst = (properties: PropertyModel[]): PropertyModel[] => [
  ...properties.filter(isDiscriminator),
  ...properties.filter((property: PropertyModel) => !isDiscriminator(property)),
];

const alignedProperties = (
  properties: PropertyModel[],
  definition: string,
  alignment?: Alignment,
): PropertyModel[] =>
  alignment
    ? alignProperties(definition, properties, alignment).properties
    : properties;

/** Converts one named schema definition into the model the emitter reads. */
export interface ModelOptions {
  /** Turns string properties with a required value set into unions of its codes. */
  bindings?: CodeBindings;
  /**
   * `Definition.property` keys the specification requires. A property is
   * required when this or the schema's own `required` list says so.
   */
  required?: ReadonlySet<string>;
  /** Keeps the properties the specification lists and renames HL7's profile-named keys. */
  alignment?: Alignment;
}

export const buildDefinitionModel = (
  name: string,
  definitions: Definitions,
  { bindings, required, alignment }: ModelOptions = {},
): DefinitionModel => {
  const node = definitions[name];

  if (!node) {
    throw new Error(`Unknown definition "${name}"`);
  }

  if (node.oneOf) {
    return {
      name,
      description: node.description,
      properties: [],
      unionOf: buildUnionMembers(node.oneOf, name, definitions),
    };
  }

  if (!node.properties && !node.allOf) {
    // Emitting an empty interface would silently accept any value.
    throw new Error(`Definition "${name}" has no properties, type or oneOf`);
  }

  const flat = flattenDefinition(name, definitions);

  return {
    name,
    description: flat.description,
    properties: resourceTypeFirst(
      alignedProperties(
        withMissingPrimitiveExtensions(
          buildProperties(
            { properties: flat.properties, required: flat.required },
            name,
            definitions,
          ),
          name,
          definitions,
        ),
        name,
        alignment,
      ).map((property: PropertyModel) => {
        const key = `${name}.${property.name}`;
        const codes = bindings?.get(key);
        const bound = codes ? applyBinding(property, codes) : property;

        return required?.has(key) ? { ...bound, required: true } : bound;
      }),
    ),
  };
};

/** Names of the definitions that become their own generated file. */
export const objectDefinitionNames = (definitions: Definitions): string[] =>
  Object.keys(definitions).filter(
    (name: string) => !primitiveOf(name, definitions[name]),
  );
