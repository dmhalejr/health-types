import type { Element } from './Element';
import type { Extension } from './Extension';
import type { ResourceList } from './ResourceList';

/** A container for a collection of resources. */
export interface Bundle_Entry {
  /** Unique id for the element within a resource (for internal references). This may be any string value that does not contain spaces. */
  id?: string;

  /** May be used to represent additional information that is not part of the basic definition of the element. To make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of the basic definition of the element and that modifies the understanding of the element in which it is contained and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * The Absolute URL for the resource.  The fullUrl SHALL NOT disagree with the id in the resource - i.e. if the fullUrl is not a urn:uuid, the URL shall be version-independent URL consistent with the Resource.id. The fullUrl is a version independent reference to the resource. The fullUrl element SHALL have a value except that:
   * * fullUrl can be empty on a POST (although it does not need to when specifying a temporary id for reference in the bundle)
   * * Results from operations might involve resources that are not identified.
   */
  fullUrl?: string;

  /** Extensions for fullUrl */
  _fullUrl?: Element;

  /** The Resource for the entry. The purpose/meaning of the resource is determined by the Bundle.type. */
  resource?: ResourceList;
}
