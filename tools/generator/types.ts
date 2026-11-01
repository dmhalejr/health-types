/** Version-independent description of one FHIR type, read by the emitter. */
export interface DefinitionModel {
  name: string;
  description?: string;
  properties: PropertyModel[];
  /**
   * Set for union definitions such as `ResourceList` (a schema `oneOf`): the
   * names of the member types. Such a definition has no properties.
   */
  unionOf?: string[];
}

export interface PropertyModel {
  name: string;
  description?: string;
  /** True only when the schema lists the property in `required`. */
  required: boolean;
  type: TypeModel;
}

export type TypeModel =
  | { kind: 'primitive'; name: 'string' | 'number' | 'boolean' }
  /** A union of string literals; a single value is a constant. */
  | { kind: 'literal'; values: string[] }
  /** `nullableItems`: entries may be null, as FHIR JSON writes placeholders in primitive arrays. */
  | { kind: 'array'; item: TypeModel; nullableItems?: boolean }
  | { kind: 'object'; properties: PropertyModel[] }
  /** Reference to another generated type, by definition name. */
  | { kind: 'ref'; name: string };
