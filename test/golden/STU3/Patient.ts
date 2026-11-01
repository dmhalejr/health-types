import type { CodeableConcept } from './CodeableConcept';
import type { Element } from './Element';
import type { Extension } from './Extension';
import type { HumanName } from './HumanName';
import type { Identifier } from './Identifier';
import type { Meta } from './Meta';
import type { Narrative } from './Narrative';
import type { Patient_Contact } from './Patient_Contact';
import type { Reference } from './Reference';
import type { ResourceList } from './ResourceList';

/** Demographics and other administrative information about an individual or animal receiving care or other health-related services. */
export interface Patient {
  /** This is a Patient resource */
  resourceType: 'Patient';

  /** The logical id of the resource, as used in the URL for the resource. Once assigned, this value never changes. */
  id?: string;

  /** Extensions for id */
  _id?: Element;

  /** May be used to represent additional information that is not part of the basic definition of the resource. In order to make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. */
  extension?: Extension[];

  /** The metadata about the resource. This is content that is maintained by the infrastructure. Changes to the content may not always be associated with version changes to the resource. */
  meta?: Meta;

  /** A reference to a set of rules that were followed when the resource was constructed, and which must be understood when processing the content. */
  implicitRules?: string;

  /** Extensions for implicitRules */
  _implicitRules?: Element;

  /** The base language in which the resource is written. */
  language?: string;

  /** Extensions for language */
  _language?: Element;

  /** A human-readable narrative that contains a summary of the resource, and may be used to represent the content of the resource to a human. The narrative need not encode all the structured data, but is required to contain sufficient detail to make it "clinically safe" for a human to just read the narrative. Resource definitions may define what content should be represented in the narrative to ensure clinical safety. */
  text?: Narrative;

  /** These resources do not have an independent existence apart from the resource that contains them - they cannot be identified independently, and nor can they have their own independent transaction scope. */
  contained?: ResourceList[];

  /** May be used to represent additional information that is not part of the basic definition of the resource, and that modifies the understanding of the element that contains it. Usually modifier elements provide negation or qualification. In order to make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions. */
  modifierExtension?: Extension[];

  /** An identifier for this patient. */
  identifier?: Identifier[];

  /** Whether this patient record is in active use. */
  active?: boolean;

  /** Extensions for active */
  _active?: Element;

  /** A name associated with the individual. */
  name?: HumanName[];

  /** Administrative Gender - the gender that the patient is considered to have for administration and record keeping purposes. */
  gender?: 'male' | 'female' | 'other' | 'unknown';

  /** Extensions for gender */
  _gender?: Element;

  /** The date of birth for the individual. */
  birthDate?: string;

  /** Extensions for birthDate */
  _birthDate?: Element;

  /** Indicates if the individual is deceased or not. */
  deceasedBoolean?: boolean;

  /** Extensions for deceasedBoolean */
  _deceasedBoolean?: Element;

  /** Indicates if the individual is deceased or not. */
  deceasedDateTime?: string;

  /** Extensions for deceasedDateTime */
  _deceasedDateTime?: Element;

  /** This field contains a patient's most recent marital (civil) status. */
  maritalStatus?: CodeableConcept;

  /** Indicates whether the patient is part of a multiple (bool) or indicates the actual birth order (integer). */
  multipleBirthBoolean?: boolean;

  /** Extensions for multipleBirthBoolean */
  _multipleBirthBoolean?: Element;

  /** Indicates whether the patient is part of a multiple (bool) or indicates the actual birth order (integer). */
  multipleBirthInteger?: number;

  /** Extensions for multipleBirthInteger */
  _multipleBirthInteger?: Element;

  /** A contact party (e.g. guardian, partner, friend) for the patient. */
  contact?: Patient_Contact[];

  /** Patient's nominated care provider. */
  generalPractitioner?: Reference[];

  /** Organization that is the custodian of the patient record. */
  managingOrganization?: Reference;
}
