import type { CodeableConcept } from './CodeableConcept';
import type { Coding } from './Coding';
import type { Element } from './Element';
import type { Identifier } from './Identifier';
import type { Period } from './Period';
import type { Quantity } from './Quantity';
import type { Reference } from './Reference';

/** Optional Extension Element - found in all resources. */
export interface Extension {
  /** Unique id for the element within a resource (for internal references). This may be any string value that does not contain spaces. */
  id?: string;

  /** May be used to represent additional information that is not part of the basic definition of the element. To make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. */
  extension?: Extension[];

  /** Source of the definition for the extension code - a logical name or a URL. */
  url?: string;

  /** Extensions for url */
  _url?: Element;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueBase64Binary?: string;

  /** Extensions for valueBase64Binary */
  _valueBase64Binary?: Element;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueBoolean?: boolean;

  /** Extensions for valueBoolean */
  _valueBoolean?: Element;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueCanonical?: string;

  /** Extensions for valueCanonical */
  _valueCanonical?: Element;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueCode?: string;

  /** Extensions for valueCode */
  _valueCode?: Element;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueDate?: string;

  /** Extensions for valueDate */
  _valueDate?: Element;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueDateTime?: string;

  /** Extensions for valueDateTime */
  _valueDateTime?: Element;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueDecimal?: number;

  /** Extensions for valueDecimal */
  _valueDecimal?: Element;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueId?: string;

  /** Extensions for valueId */
  _valueId?: Element;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueInstant?: string;

  /** Extensions for valueInstant */
  _valueInstant?: Element;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueInteger?: number;

  /** Extensions for valueInteger */
  _valueInteger?: Element;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueMarkdown?: string;

  /** Extensions for valueMarkdown */
  _valueMarkdown?: Element;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueOid?: string;

  /** Extensions for valueOid */
  _valueOid?: Element;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valuePositiveInt?: number;

  /** Extensions for valuePositiveInt */
  _valuePositiveInt?: Element;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueString?: string;

  /** Extensions for valueString */
  _valueString?: Element;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueTime?: string;

  /** Extensions for valueTime */
  _valueTime?: Element;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueUnsignedInt?: number;

  /** Extensions for valueUnsignedInt */
  _valueUnsignedInt?: Element;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueUri?: string;

  /** Extensions for valueUri */
  _valueUri?: Element;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueUrl?: string;

  /** Extensions for valueUrl */
  _valueUrl?: Element;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueUuid?: string;

  /** Extensions for valueUuid */
  _valueUuid?: Element;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueCodeableConcept?: CodeableConcept;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueCoding?: Coding;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueIdentifier?: Identifier;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valuePeriod?: Period;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueQuantity?: Quantity;

  /** Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list). */
  valueReference?: Reference;
}
