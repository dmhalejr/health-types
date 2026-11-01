import { PropertyLookup, resolveElement, SpecDefinition } from './spec-index';
import { createValueSetResolver } from './valuesets';

export interface CodeBinding {
  definition: string;
  property: string;
  valueSet: string;
  codes: string[];
}

/** The derived bindings as a lookup keyed by `Definition.property`. */
export const toBindingMap = (
  bindings: CodeBinding[],
): ReadonlyMap<string, string[]> =>
  new Map(
    bindings.map((binding: CodeBinding) => [
      `${binding.definition}.${binding.property}`,
      binding.codes,
    ]),
  );

export interface SkippedBinding {
  path: string;
  reason: string;
}

export interface BindingResult {
  bindings: CodeBinding[];
  /** Required `code` bindings that could not become a union, with the reason. */
  skipped: SkippedBinding[];
  /** Element paths that did not resolve to a generated property; should be empty. */
  unresolved: string[];
}

/**
 * The allowed codes for every element of type `code` whose binding strength is
 * `required`, keyed by the generated definition and property it maps to.
 * StructureDefinitions without a generated definition (abstract bases,
 * `SimpleQuantity`, logical models) are skipped.
 */
export const deriveCodeBindings = (
  structureDefinitions: SpecDefinition[],
  terminology: unknown[],
  propertiesOf: PropertyLookup,
  hasDefinition: (name: string) => boolean,
  maxSize?: number,
): BindingResult => {
  const resolve = createValueSetResolver(terminology, maxSize);
  const result: BindingResult = { bindings: [], skipped: [], unresolved: [] };

  structureDefinitions
    .filter(
      (sd: SpecDefinition) =>
        sd.kind !== 'primitive-type' && hasDefinition(sd.name),
    )
    .forEach((sd: SpecDefinition) =>
      sd.elements
        .filter(
          (element) =>
            element.types.length === 1 &&
            element.types[0] === 'code' &&
            element.binding?.strength === 'required' &&
            !element.sliceName &&
            element.path.includes('.'),
        )
        .forEach((element) => {
          const resolved = resolveElement(element.path, propertiesOf);

          if (!resolved) {
            result.unresolved.push(element.path);

            return;
          }

          const valueSet = element.binding?.valueSet;
          const resolution = valueSet
            ? resolve(valueSet)
            : { reason: 'binding names no value set' };

          if ('codes' in resolution) {
            result.bindings.push({
              definition: resolved.definition,
              property: resolved.property.name,
              valueSet: valueSet as string,
              codes: resolution.codes,
            });
          } else {
            result.skipped.push({
              path: element.path,
              reason: resolution.reason,
            });
          }
        }),
    );

  return result;
};
