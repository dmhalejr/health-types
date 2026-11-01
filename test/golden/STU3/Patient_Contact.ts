import type { CodeableConcept } from './CodeableConcept';
import type { Element } from './Element';
import type { Extension } from './Extension';
import type { HumanName } from './HumanName';
import type { Period } from './Period';
import type { Reference } from './Reference';

/** Demographics and other administrative information about an individual or animal receiving care or other health-related services. */
export interface Patient_Contact {
  /** unique id for the element within a resource (for internal references). This may be any string value that does not contain spaces. */
  id?: string;

  /** Extensions for id */
  _id?: Element;

  /** May be used to represent additional information that is not part of the basic definition of the element. In order to make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. */
  extension?: Extension[];

  /** May be used to represent additional information that is not part of the basic definition of the element, and that modifies the understanding of the element that contains it. Usually modifier elements provide negation or qualification. In order to make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions. */
  modifierExtension?: Extension[];

  /** The nature of the relationship between the patient and the contact person. */
  relationship?: CodeableConcept[];

  /** A name associated with the contact person. */
  name?: HumanName;

  /** Administrative Gender - the gender that the contact person is considered to have for administration and record keeping purposes. */
  gender?: 'male' | 'female' | 'other' | 'unknown';

  /** Extensions for gender */
  _gender?: Element;

  /** Organization on behalf of which the contact is acting or for which the contact is working. */
  organization?: Reference;

  /** The period during which this contact person or organization is valid to be contacted relating to this patient. */
  period?: Period;
}
