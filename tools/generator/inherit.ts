import type { Definitions, SchemaNode } from './model';

/** A definition with its `allOf` inheritance resolved into one property list. */
export interface FlatDefinition {
  description?: string;
  properties: Record<string, SchemaNode>;
  required: string[];
}

const baseName = (ref: string): string => ref.split('/').pop() as string;

/**
 * STU3 describes a type as `allOf: [ {$ref: base}?, {description, properties,
 * required} ]`. Flattening copies the whole base chain into the type:
 * base properties first, a more derived definition replacing a repeated name
 * in place, `required` lists merged, and the description taken from the
 * definition's own part.
 */
export const flattenDefinition = (
  name: string,
  definitions: Definitions,
  chain: string[] = [],
): FlatDefinition => {
  const node = definitions[name];

  if (!node) {
    throw new Error(`Unknown definition "${name}"`);
  }

  if (!node.allOf) {
    return {
      description: node.description,
      properties: node.properties ?? {},
      required: node.required ?? [],
    };
  }

  const path = [...chain, name];
  const flat: FlatDefinition = {
    description: node.description,
    properties: {},
    required: [],
  };

  node.allOf.forEach((part: SchemaNode) => {
    if (part.$ref) {
      const base = baseName(part.$ref);

      if (!definitions[base]) {
        throw new Error(`Definition "${name}" extends unknown base "${base}"`);
      }

      if (path.includes(base)) {
        throw new Error(`Inheritance cycle: ${[...path, base].join(' -> ')}`);
      }

      const inherited = flattenDefinition(base, definitions, path);

      Object.assign(flat.properties, inherited.properties);
      flat.required.push(...inherited.required);

      return;
    }

    Object.assign(flat.properties, part.properties ?? {});
    flat.required.push(...(part.required ?? []));
    flat.description = part.description ?? flat.description;
  });

  flat.required = [...new Set(flat.required)];

  return flat;
};
