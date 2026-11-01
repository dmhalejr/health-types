import { PropertyLookup, resolveElement, SpecDefinition } from './spec-index';

export interface CardinalityResult {
  /** `Definition.property` keys the specification requires (`min >= 1`). */
  required: ReadonlySet<string>;
  /** Element paths that did not resolve to a generated property; should be empty. */
  unresolved: string[];
  skipped: { choice: number; sliced: number };
}

/**
 * The properties the specification requires, keyed by the generated
 * definition and property they map to. Choice elements (`value[x]`) are left
 * out: `min = 1` there means "one of these", not "all of these". Slices are
 * left out. StructureDefinitions without a generated definition (abstract
 * bases, `SimpleQuantity`, logical models) are skipped.
 */
export const deriveRequired = (
  structureDefinitions: SpecDefinition[],
  propertiesOf: PropertyLookup,
  hasDefinition: (name: string) => boolean,
): CardinalityResult => {
  const required = new Set<string>();
  const result = {
    unresolved: [] as string[],
    skipped: { choice: 0, sliced: 0 },
  };

  structureDefinitions
    .filter(
      (sd: SpecDefinition) =>
        sd.kind !== 'primitive-type' && hasDefinition(sd.name),
    )
    .forEach((sd: SpecDefinition) =>
      sd.elements
        .filter((element) => element.min >= 1 && element.path.includes('.'))
        .forEach((element) => {
          if (element.sliceName) {
            result.skipped.sliced++;
          } else if (element.path.endsWith('[x]')) {
            result.skipped.choice++;
          } else {
            const resolved = resolveElement(element.path, propertiesOf);

            if (resolved) {
              required.add(`${resolved.definition}.${resolved.property.name}`);
            } else {
              result.unresolved.push(element.path);
            }
          }
        }),
    );

  return { required, ...result };
};
