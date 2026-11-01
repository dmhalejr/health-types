import type { CodeableConcept } from './CodeableConcept';
import type { Element } from './Element';
import type { Period } from './Period';
import type { Reference } from './Reference';

/** An identifier - identifies some entity uniquely and unambiguously. Typically this is used for business identifiers. */
export interface Identifier {
  /** Unique id for the element within a resource (for internal references). This may be any string value that does not contain spaces. */
  id?: string;

  /** The purpose of this identifier. */
  use?: 'usual' | 'official' | 'temp' | 'secondary' | 'old';

  /** Extensions for use */
  _use?: Element;

  /** A coded type for the identifier that can be used to determine which identifier to use for a specific purpose. */
  type?: CodeableConcept;

  /** Establishes the namespace for the value - that is, a URL that describes a set values that are unique. */
  system?: string;

  /** Extensions for system */
  _system?: Element;

  /** The portion of the identifier typically relevant to the user and which is unique within the context of the system. */
  value?: string;

  /** Extensions for value */
  _value?: Element;

  /** Time period during which identifier is/was valid for use. */
  period?: Period;

  /** Organization that issued/manages the identifier. */
  assigner?: Reference;
}
