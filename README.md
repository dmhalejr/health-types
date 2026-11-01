# health-types

TypeScript types for the HL7® FHIR® standard, generated from HL7's own definitions. Four releases: **STU3**, **R4**, **R4B** and **R5**.

- **Types only.** No runtime code, no dependencies; install it as a dev dependency.
- **One file per type**, imported by name. There is no index to pull in, so you load only what you use.
- **Documented.** Every property carries the description from the specification as JSDoc.
- **Faithful to the specification, not just to its JSON Schema.** Required fields, coded values and the set of properties come from the structure definitions and value sets that HL7 publishes next to the schema (see [What the types say](#what-the-types-say)).

```ts
import type { Observation } from 'health-types/R4/Observation';

const heartRate: Observation = {
  resourceType: 'Observation',
  status: 'final', // required by the specification
  code: { text: 'Heart rate' }, // required by the specification
  subject: { reference: 'Patient/example' },
  valueQuantity: { value: 72, unit: 'beats/minute' },
};
```

## Install

```bash
npm install --save-dev health-types
```

TypeScript 4.9 or newer. The published files are checked with TypeScript 4.9 and 5.9 (resolution modes `node10`, `node16`, `nodenext` and `bundler`) and with TypeScript 7.0 (`node16`, `nodenext`, `bundler`; version 7 no longer has `node10`).

## Use

The import path is `health-types/<VERSION>/<TypeName>`:

| Folder | FHIR release | Types |
|---|---|---|
| `health-types/STU3/…` | 3.0.2 | 490 |
| `health-types/R4/…` | 4.0.1 | 660 |
| `health-types/R4B/…` | 4.3.0 | 679 |
| `health-types/R5/…` | 5.0.0 | 836 |

**Always use `import type`.** The package contains declarations only; a plain `import { Patient } …` has nothing to load at run time and fails in bundlers that do not erase it. TypeScript's `verbatimModuleSyntax` and `isolatedModules` options catch it for you.

```ts
import type { Patient } from 'health-types/R4/Patient';
import type { Patient as PatientR5 } from 'health-types/R5/Patient';

const patient: Patient = {
  resourceType: 'Patient',
  name: [{ family: 'Chalmers', given: ['Peter', 'James'] }],
  gender: 'male',
  birthDate: '1974-12-25',
};

// The same name exists in every release; import the one you work with.
export const upgraded: PatientR5 = { resourceType: 'Patient', gender: 'male' };
```

**Naming.** Resources and datatypes keep their FHIR names (`Patient`, `HumanName`, `CodeableConcept`). A backbone element is named after its parent, as in HL7's schema: `Patient_Contact`, `Bundle_Entry`. Where two backbone elements of one resource would collide, HL7 adds a number (`ClaimResponse_Detail1`). `ResourceList` is the union of every resource; it types `contained`, `Bundle.entry.resource` and `Parameters.parameter.resource`.

```ts
import type { Bundle } from 'health-types/R4/Bundle';
import type { Patient } from 'health-types/R4/Patient';
import type { ResourceList } from 'health-types/R4/ResourceList';

const patient: Patient = { resourceType: 'Patient' };

export const bundle: Bundle = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: [{ resource: patient }],
};

// `resourceType` tells the members of the union apart, so TypeScript narrows them.
export const describe = (resource: ResourceList): string => {
  switch (resource.resourceType) {
    case 'Patient':
      return resource.name?.[0]?.family ?? 'unnamed patient';
    case 'Observation':
      return resource.code.text ?? 'observation';
    default:
      return resource.resourceType;
  }
};
```

## What the types say

**Required fields.** A property is required (no `?`) when HL7's JSON Schema lists it as required *or* the specification gives it a minimum cardinality of 1. The schema alone is much looser than the specification: for R4 it leaves 199 of 318 required top-level fields optional. A required array means the field must be present, not that it must be non-empty.

```ts
import type { Observation } from 'health-types/R4/Observation';

// @ts-expect-error `status` and `code` are required by the specification
export const incomplete: Observation = { resourceType: 'Observation' };

// Drafts and work in progress: Partial makes every top-level property optional.
// It is shallow, so objects nested inside still have to be complete.
export const draft: Partial<Observation> = { status: 'preliminary' };
```

**Choice elements.** `value[x]` becomes one optional property per allowed type: `valueQuantity`, `valueString`, `valueBoolean` and so on. They are never marked required, because "minimum 1" on a choice means "one of these", which a property list cannot say. Setting two at once compiles; the specification forbids it.

**Coded values.** A field of type `code` becomes a union of the allowed codes when its binding is `required` and the value set can be listed from the release's own terminology (at most 400 codes). Every other `code` field stays `string`: extensible, preferred and example bindings by design, and lists that live outside the download, such as languages (BCP-47), MIME types, currencies (ISO 4217) or UCUM units. This is the same in all four releases, which the schemas alone are not: R4 inlines some of these unions, while R4B and R5 inline none for required bindings.

```ts
import type { Patient } from 'health-types/R4/Patient';

export const ok: Patient = { resourceType: 'Patient', gender: 'female' };

// @ts-expect-error 'robot' is not in the administrative-gender value set
export const wrong: Patient = { resourceType: 'Patient', gender: 'robot' };
```

**Primitive extensions.** Any primitive can carry an `id` or extensions beside its value, which FHIR JSON writes as a `_name` property. Every primitive therefore has an optional `_name?: Element`, and a repeating primitive has `_name?: (Element | null)[]`, since FHIR JSON puts `null` where an entry has a value but no extension. Element `id`s and `Narrative.div` carry no extensions and have none.

```ts
import type { Patient } from 'health-types/R4/Patient';

export const withBirthTime: Patient = {
  resourceType: 'Patient',
  birthDate: '1974-12-25',
  _birthDate: {
    extension: [
      {
        url: 'http://hl7.org/fhir/StructureDefinition/patient-birthTime',
        valueDateTime: '1974-12-25T14:35:45-05:00',
      },
    ],
  },
};
```

**Properties follow the specification.** HL7's JSON Schemas disagree with their own specification in a few places: R5 gives eleven resources properties the specification does not list, `modifierExtension` appears on datatype children that are plain `Element`s, STU3 adds `extension` to `Binary`, `Bundle` and `Parameters`, and STU3 names four properties after a profile (`doseSimpleQuantity` instead of `doseQuantity`). The types follow the specification; [the findings](docs/schema-notes.md) list every case.

**Everything else.** Dates and times are strings; `decimal`, `integer` and the other numeric primitives are `number`; `xhtml` is `string`. A `Reference` is not typed by its target resource.

## Limitations

These types describe the shape of FHIR JSON. They are not a validator.

- **No validation beyond the shape.** Patterns (date and URI formats), maximum cardinalities, FHIRPath invariants, reference targets, profiles and implementation guides are out of scope.
- **A required primitive that arrives only as `_name`.** FHIR JSON may send `_status` (for example a data-absent reason) without `status`. The types require `status`. One of 2,824 official R5 examples does this.
- **`null` inside arrays of primitives.** FHIR JSON writes `null` in a primitive array where only the matching `_name` entry has content (`"event": [null]` beside `"_event": [{…}]`). `_name` arrays accept it; the primitive arrays stay `string[]` so ordinary code needs no null checks. Nine of 3,022 official R4B examples need it.
- **Huge inline literals.** TypeScript can give up with "union type too complex" (TS2590) on a very large object literal typed against `ResourceList`. Four official examples across the releases are that big.
- **Only `code` fields get value-set unions.** `Coding` and `CodeableConcept` bindings are not modelled.
- **DSTU2 is not included.** Its schema has a different shape.

## How well do they fit real data?

Every example resource that HL7 publishes was type-checked, as an object literal, against the types of its release (`npm run check:examples`, described in [CONTRIBUTING](CONTRIBUTING.md)):

| Release | Examples | Pass | Rejected because the example omits a required field | Rejected for any other reason |
|---|---|---|---|---|
| STU3 | 1,664 | 89.5% | 174 | 0 |
| R4 | 2,911 | 93.1% | 198 | 2 (compiler limit) |
| R4B | 3,022 | 99.2% | 13 | 9 (`null` in a primitive array), 1 (compiler limit) |
| R5 | 2,824 | 99.9% | 1 | 1 (compiler limit) |

No example is rejected because of a wrong code, a missing property or any other defect of the types. Measured 2026-11-01; [docs/schema-notes.md](docs/schema-notes.md) has the method and the rest of the numbers.

## Where it comes from

The types are generated from the definitions HL7 publishes for each release at `https://hl7.org/fhir/<release>/definitions.json.zip`: the JSON Schema, the structure definitions of every resource and datatype, and the value sets. The generator is in this repository (`tools/`) and is not part of the package. [CONTRIBUTING](CONTRIBUTING.md) explains how to run it and [docs/architecture.md](docs/architecture.md) how it works.

## Attribution and third-party notices

The FHIR specification and its definitions are released by HL7 under [CC0 1.0 Universal](https://hl7.org/fhir/license.html), and these types are derived from them. This project is independent and is not endorsed by HL7.

HL7®, FHIR® and the FHIR [FLAME DESIGN]® are the registered trademarks of Health Level Seven International, and their use does not constitute endorsement by HL7.

Some code lists in the HL7 terminology are excerpts from other standards, and HL7 marks them with their owners' notices. A few union types contain code values taken from them. No SNOMED CT or LOINC content is used.

| Fields | Source of the code values |
|---|---|
| `Timing.repeat.durationUnit` and `periodUnit` (all releases) | UCUM, © 1989-2013 Regenstrief Institute, Inc. and The UCUM Organization. See [the terms of use](http://unitsofmeasure.org/trac//wiki/TermsOfUse). |
| `AuditEvent.action` (all releases), `AuditEvent.outcome` and `AuditEvent.network.type` (STU3, R4, R4B), `ImagingStudy.availability` and `ImagingStudy.series.availability` (STU3) | DICOM Standard, Part 16: Content Mapping Resource, © 2011 National Electrical Manufacturers Association |

Only the short code identifiers are used, not definitions or other text.

## History

The project began in 2020 as a prototype that repeatedly inlined the `$ref`s of HL7's JSON Schema into one large nested interface per resource. That could not express recursive types (they were cut off as `{}`), duplicated shared datatypes in every file, lost which fields were required, and covered one resource at a time. In 2026 it was rebuilt around a one-pass generator that writes one file per type and imports shared types, and that reads the specification's own data (structure definitions and value sets) as well as the schema. The reasons behind each design decision are in [docs/decisions.md](docs/decisions.md).

## License

[MIT](LICENSE) for this project's own code. The FHIR definitions the types are derived from are CC0 (see above).
