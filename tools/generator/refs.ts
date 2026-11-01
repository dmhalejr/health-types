import { DefinitionModel, TypeModel } from './types';

const typeRefs = (type: TypeModel): string[] => {
  switch (type.kind) {
    case 'ref':
      return [type.name];
    case 'array':
      return typeRefs(type.item);
    case 'object':
      return type.properties.flatMap((property) => typeRefs(property.type));
    default:
      return [];
  }
};

/**
 * Names of the other generated types a definition refers to: unique, sorted,
 * and never the definition itself (a self-reference needs no import).
 */
export const collectRefs = (model: DefinitionModel): string[] =>
  [
    ...new Set([
      ...(model.unionOf ?? []),
      ...model.properties.flatMap((property) => typeRefs(property.type)),
    ]),
  ]
    .filter((name: string) => name !== model.name)
    .sort();
