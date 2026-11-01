import type { Element } from './Element';
import type { Extension } from './Extension';
import type { Meta } from './Meta';
import type { Reference } from './Reference';

/** A binary resource can contain any content, whether text, image, pdf, zip archive, etc. */
export interface Binary {
  /** This is a Binary resource */
  resourceType: 'Binary';

  /** The logical id of the resource, as used in the URL for the resource. Once assigned, this value never changes. */
  id?: string;

  /** Extensions for id */
  _id?: Element;

  /** May be used to represent additional information that is not part of the basic definition of the element. In order to make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. */
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

  /** MimeType of the binary content represented as a standard MimeType (BCP 13). */
  contentType?: string;

  /** Extensions for contentType */
  _contentType?: Element;

  /** Treat this binary as if it was this other resource for access control purposes. */
  securityContext?: Reference;

  /** The actual content, base64 encoded. */
  content?: string;

  /** Extensions for content */
  _content?: Element;
}
