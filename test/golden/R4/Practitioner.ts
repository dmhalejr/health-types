import type { CodeableConcept } from './CodeableConcept';
import type { Element } from './Element';
import type { Identifier } from './Identifier';
import type { Practitioner_Qualification } from './Practitioner_Qualification';

/** A person who is directly or indirectly involved in the provisioning of healthcare. */
export interface Practitioner {
  /** This is a Practitioner resource */
  resourceType: 'Practitioner';

  /** The logical id of the resource, as used in the URL for the resource. Once assigned, this value never changes. */
  id?: string;

  /** A reference to a set of rules that were followed when the resource was constructed, and which must be understood when processing the content. Often, this is a reference to an implementation guide that defines the special rules along with other profiles etc. */
  implicitRules?: string;

  /** Extensions for implicitRules */
  _implicitRules?: Element;

  /** The base language in which the resource is written. */
  language?: string;

  /** Extensions for language */
  _language?: Element;

  /** An identifier that applies to this person in this role. */
  identifier?: Identifier[];

  /** Whether this practitioner's record is in active use. */
  active?: boolean;

  /** Extensions for active */
  _active?: Element;

  /** Administrative Gender - the gender that the person is considered to have for administration and record keeping purposes. */
  gender?: 'male' | 'female' | 'other' | 'unknown';

  /** Extensions for gender */
  _gender?: Element;

  /** The date of birth for the practitioner. */
  birthDate?: string;

  /** Extensions for birthDate */
  _birthDate?: Element;

  /** The official certifications, training, and licenses that authorize or otherwise pertain to the provision of care by the practitioner.  For example, a medical license issued by a medical board authorizing the practitioner to practice medicine within a certian locality. */
  qualification?: Practitioner_Qualification[];

  /** A language the practitioner can use in patient communication. */
  communication?: CodeableConcept[];
}
