# HL7 JSON Schema shapes: STU3, R4, R4B, R5

Findings from task T1. Counts were taken on 2026-10-31 from the schemas HL7 publishes at
`https://hl7.org/fhir/<VERSION>/definitions.json.zip`.

## Summary

| | STU3 | R4 | R4B | R5 |
|---|---|---|---|---|
| Layout | combined `fhir.schema.json` (490 definitions) **plus** 155 per-resource files that repeat the same definitions | one combined `fhir.schema.json` | one combined | one combined |
| JSON Schema draft | draft-04 | draft-06 | draft-06 | draft-06 |
| Definitions | 490 | 680 | 699 | 857 |
| Resources (`discriminator.mapping`) | n/a (114 definitions derive from `DomainResource`, plus `Binary`, `Bundle`, `Parameters`) | 146 | 141 | 158 |
| `allOf` | **978 uses** (inheritance) | 0 | 0 | 0 |
| `oneOf` | 2 | 1 (`ResourceList`) | 1 | 1 |
| Cross-type refs | `#/definitions/X` (combined file) | `#/definitions/X` | same | same |
| Coded fields | inline `enum` | inline `enum` (246) | `$ref: #/definitions/code` (27 enums) | same as R4B |
| `required` | on the body schema inside `allOf` | on the definition (317 of 680) | 326 of 699 | 398 of 857 |
| `resourceType` | `{"type":"string","enum":["Patient"]}` | `{"const":"Patient"}` | `const` | `const` |
| `_field` primitive extensions | yes | 2,467 | 2,517 | 3,053 |
| Base type defs | `Resource`, `DomainResource`, `Element` files | `Element`, `ResourceList`; no `Resource` def | same | same |
| Notable quirk | per-datatype schemas also carry patterns | R4 zip: `definitions.json.zip/fhir.schema.json.zip` nested; schema inside the inner zip | outer zip holds `definitions.json/fhir.schema.json.zip` (extra directory) | inner zip is at the zip root, and definitions add `"type": "object"` |

No definition in R4/R4B/R5 has unresolved `$ref`s. All three share one structure, so a single loader covers them. STU3 needs its own loader.

## R4 / R4B / R5 (flat combined schema)
- `definitions` maps name to either an object type (`properties`, `additionalProperties`, optional `required`) or a primitive type (`pattern` + `type` + `description`: `string`, `date`, `boolean`, `decimal`, `integer`, ...).
- Primitives: JSON `type` is only `string`, `boolean`, or `number`. Dates, ids, codes etc. are strings with a `pattern`. Patterns are dropped.
- Properties are either inline (`type`, `enum`, `const`), `$ref`, or `type: array` with `items.$ref` (3,070 / 3,140 / 3,901 arrays).
- `resourceType` is a `const`.
- Choice types (`value[x]`) are already expanded into separate properties (e.g. Observation has `valueQuantity`, `valueString`, ...; Extension has 50 to 54 `value*` fields). The generator does not need to parse `[x]`. Whether to express "at most one `value*`" in TS is a design choice (default: independent optional fields).
- `_field` properties exist for every primitive and reference `Element`.
- `ResourceList` is the only `oneOf` and lists all resource types (used by `Bundle.entry.resource`, `contained`, etc.). It is mutually recursive with most resources.
- **Cycles are everywhere:** 176-196 direct two-way cycles per version plus self-references (`Extension`, `Composition_Section`, ...). Output files must use `import type`.
- **R4 vs R4B/R5 difference that affects output:** in R4 a coded field like `Patient.gender` is an inline `enum` (`'male' | 'female' | ...`). In R4B and R5 the same field is `$ref: code` (a plain string), so value sets are lost. Measured coverage (approximate matching): required-binding `code` fields found in the schema are 265 in R4 (179 with an enum), 278 in R4B (0) and 460 in R5 (0). Resolution: tasks T10b/T10c derive unions from `profiles-resources.json` + `valuesets.json` for every version.
- R5 object definitions add `"type": "object"`; the emitter must not require its absence.

### What `required` means
Output optionality follows the schema's `required` list exactly. That list is **narrower than FHIR cardinality**: for example `Observation.status` is 1..1 in the spec but only `code` and `resourceType` are `required` in the R4 JSON Schema, and `Extension.url` is not required at all. Of 680 R4 definitions, 248 list a required field other than `resourceType`. Generated types therefore accept some payloads the FHIR spec would reject.

**Measured against the spec's own element lists** (`profiles-resources.json`, top-level elements of each non-abstract resource, 2026-10-31):

| | R4 | STU3 |
|---|---|---|
| Resources compared | 146 | 117 |
| Resources whose property names equal the spec's exactly (ignoring the `resourceType` discriminator) | 146 | 114 |
| Exceptions | none | `Binary`, `Bundle`, `Parameters`: an extra `extension` (the `Resource` inherits `Element` quirk) |
| Fields the spec requires (`min >= 1`) | 318 | 223 |
| ...of which the schema marks required | 119 | 77 |
| ...of which the schema leaves optional | 199 (63%) | 146 (65%) |
| Fields typed required although the spec says optional | 0 | 0 |

So the property sets are right and nothing is over-required, but about two thirds of the spec-mandatory top-level fields come out optional. Choice elements (`value[x]` with `min = 1`) mean "one of these", so they could not simply be marked required anyway. Resolution: task T10d marks a property required when the schema or the spec's `min >= 1` says so (decision D13 in decisions.md).

**Mapping spec elements to schema properties (measured 2026-10-31).** Element paths of any depth (`ClaimResponse.addItem.detail.productOrService`) resolve exactly by walking the generated model from the root definition: property, then its referenced type, then the next property. Building names from the path fails because HL7 gives colliding backbone types numeric suffixes (`ClaimResponse_Detail1`, `TestScript_Rule3`; 11 to 14 such owners are hit per version). Result of the walk over every non-sliced, non-choice `min >= 1` element of every non-abstract definition in `profiles-resources.json` and `profiles-types.json`:

| | STU3 | R4 | R4B | R5 |
|---|---|---|---|---|
| Elements with `min >= 1` | 546 | 725 | 750 | 847 |
| Resolved to a schema property | 546 | 725 | 750 | 847 |
| Unresolved | 0 | 0 | 0 | 0 |
| StructureDefinitions skipped because the schema has no definition for them (abstract bases, logical models, `SimpleQuantity`, `MoneyQuantity`) | 2 | 6 | 5 | 7 |
| Properties that newly become required | 344 | 408 | 427 | 458 |

## STU3 (combined file with `allOf` inheritance)
**Note:** an earlier version of these notes said STU3 has no combined schema. It does: `fhir.schema.json` (draft-04, 490 definitions, local `#/definitions/X` refs only) sits next to 155 per-resource `Name.schema.json` files. After normalising `$ref`s, every definition in the per-resource files is identical to the one in the combined file, so the generator only needs the combined file, exactly as for R4.
- Same layout path as R4: `data/STU3/fhir.schema.json/fhir.schema.json`. No `discriminator` and no primitive definitions: primitive types are inline (`type` + `pattern`).
- 489 definitions are `{"allOf": [ {"$ref": base}?, {description, properties, required?} ]}`; `ResourceList` is the only `oneOf`.
- Inheritance chain: `Patient` -> `DomainResource` -> `Resource` -> `Element`. Bases: `BackboneElement` (335 definitions), `DomainResource` (114), `Element` (30), `Quantity` (5: `Age`, `Count`, `Distance`, `Duration`, `Money`), `Resource` (4).
- Properties redefined along a chain: `id`, `_id`, `extension`; the more derived definition wins.
- `resourceType` is `{"type":"string","enum":["Patient"]}`, listed in the resource's own `required`.
- Quirk: in this schema `Resource` itself inherits `Element`, so a resource that derives directly from `Resource` also gets Element's `extension`.
- Ten properties carry `enum` and `items` on the same node (for example `Timing_Repeat.when`): an array whose items are constrained, not a single enum value.
- Types: `string` 1424, `boolean` 135, `number` 195, `array` 1071; the rest are `$ref`.

## Measured: full STU3 generation (task T9)
490 files (489 definitions plus the `ResourceList` union), 1.6 MB of source (1,591,652 bytes), strict `tsc` clean, no placeholders. 10 array-level enums are emitted as arrays of unions (for example `Timing_Repeat.when`). The base types `Element`, `BackboneElement`, `Resource` and `DomainResource` are emitted because STU3 defines them. Quirk kept as in the schema: `Resource` inherits `Element`, so `Binary`, `Bundle` and `Parameters` carry an `extension` field that the FHIR specification does not give them. R4 output is byte-identical to before the change. Task T10e later removed this `extension` from those three resources and from `Resource` itself.

## Measured: R4B and R5 generation (task T10)
Both versions use the same loader as R4; no code change was needed to read them. Output type-checks as a whole (strict, about 0.3 s each) with no placeholders.

| | R4B | R5 |
|---|---|---|
| Files | 679 | 836 |
| Source size | 2.4 MB | 3.0 MB |
| Resources compared with the spec's element lists | 141 | 158 |
| Property names identical to the spec | 141 | 147 |
| Spec-required top-level fields / left optional by the schema / over-required | 319 / 207 / 0 | 330 / 210 / 0 |

**R5 schema vs spec.** HL7's published R5 JSON Schema gives 11 resources properties that the specification's own definition does not list: `ChargeItemDefinition` (7), `Citation` (1), `CompartmentDefinition` (4), `ConditionDefinition` (12), `Evidence` (3), `EvidenceReport` (16), `EvidenceVariable` (2), `MedicationKnowledge` (23), `ObservationDefinition` (6), `Questionnaire` (6), `SpecimenDefinition` (6). They look like fields of the `CanonicalResource`/`MetadataResource` abstract bases that leaked into resources that do not use them (some descriptions still contain unresolved `{{title}}` templates). The generated types first followed the schema, with a test pinning the counts; task T10e then dropped these properties, so the types now follow the specification (decision D14 in decisions.md).

**Deeper comparison, every depth (measured for task T10e).** Comparing each definition's properties with the children its StructureDefinition snapshot lists (resources, backbone children and datatypes; 489 to 834 definitions per version) found more than the resource-level cases above. The `resourceType` discriminator is excluded; choice elements are expanded from the snapshot's type codes, and elements typed `*` are treated as keeping every alternative.

| Class of disagreement (schema has it, spec does not) | STU3 | R4 | R4B | R5 |
|---|---|---|---|---|
| `modifierExtension` on datatype children the spec types as `Element` (`Timing_Repeat`, `ElementDefinition_Binding`, ...) | 11 definitions | 14 | 13 | 17 |
| `extension` from `Resource` inheriting `Element` (`Resource`, `Binary`, `Bundle`, `Parameters`) | 4 | 0 | 0 | 0 |
| Base-type properties leaked into 11 resources | 0 | 0 | 0 | 86 properties |
| Choice alternatives beyond the spec's list (`Parameters_Parameter.valueElement`, `valueBackboneElement`, `valueUuid`, `ElementDefinition.defaultValue*`, ...) | 126 properties | 0 | 0 | 0 |
| Properties named after the `SimpleQuantity` profile instead of the spec's JSON key | 13 extra names (4 real renames: `Dosage.doseSimpleQuantity`, `Dosage.rateSimpleQuantity`, `MedicationAdministration_Dosage.rateSimpleQuantity`, `NutritionOrder_Administration.rateSimpleQuantity`) | 0 | 0 | 0 |
| Anything else | 0 | 0 | 0 | 0 |

The spec lists properties the schema lacks only in STU3 and only for the four `SimpleQuantity` cases (`doseQuantity`, `rateQuantity`). That case is why dropping alone would be wrong: it would delete the only dose and rate properties. The first 20 of the 126 STU3 choice extras were inspected by hand; T10e's first step lists all of them.

Side effect for the other tests: R4 and R4B output is not unaffected by T10e, because of the `modifierExtension` class.

**R5 `Base`.** The only empty definition in any version: `Base` has `properties: {}` and `additionalProperties: false` and nothing refers to it. It is emitted as `export type Base = Record<string, never>;`, since an empty interface would accept any value.

## Measured: value-set resolver (task T10b)
`deriveCodeBindings` reads each version's StructureDefinitions and `valuesets.json` and lists the allowed codes for every element of type `code` with a **required** binding. Measured 2026-10-31 (size cap 400):

| | STU3 | R4 | R4B | R5 |
|---|---|---|---|---|
| Required `code` bindings resolved to a code list | 294 | 338 | 354 | 386 |
| Stay `string` (cannot be listed) | 10 | 14 | 14 | 177 |
| Element paths that did not resolve to a property | 0 | 0 | 0 | 0 |
| Fields where the schema also inlines an enum | 223 | 245 | 26 | 26 |
| ...of which the derived list is identical to the schema's | 223 | 245 | 26 | 26 |

The derived lists therefore reproduce every enum HL7's own schemas inline (agreement bar was 95%; the result is 100%), and add 71 (STU3), 93 (R4), 328 (R4B) and 360 (R5) fields the schema leaves as `string`.

Why fields stay `string`:
- **R5, 162 fields:** `language` on every resource is bound to `urn:ietf:bcp:47` (all languages), an external code system.
- **All versions, 12 fields (STU3 9):** MIME types (`Binary.contentType`, `CapabilityStatement.format`, ...) bound to `urn:ietf:bcp:13` / the BCP 13 RFC, external.
- **Singles:** `Money.currency` (ISO 4217, external), `SampledData.intervalUnit` (UCUM, R5), `DeviceMetric.color` (R5, code system has no content), `Composition.confidentiality` (its v3 value set is not in the file).
- No finite list was dropped for size: the longest are 203, 211, 213, 231 and 346 codes, hence the cap of 400. R4's own schema inlines the 346-code `ImplementationGuide.license`, so a lower cap would have made R4 stricter than R4B and R5.

Review checks beyond the schema comparison (the schema inlines an enum for only 223/245 of these fields, so the rest has no ground truth):
- No definition.property is derived twice, and none with conflicting lists.
- Cross-version consistency: of the fields derived in both R4 and R4B, 314 have identical lists and 20 differ (resource-type lists grew from 148 to 143-plus-new types, `fhirVersion` lists gained versions); R4B to R5 has 222 identical and 68 differing (new statuses such as `ClinicalImpression.status`, `Bundle.type` gained `subscription-notification`). The differences look like real specification changes, not resolver noise.
- Abstract types are kept. R5's `health-types` code system flags 10 concepts (`Resource`, `DomainResource`, `Element`, ...) with the property `abstract-type`; value sets that include the whole system list them, and fields such as `OperationDefinition.resource` legitimately use `Resource`. Only `notSelectable` grouping concepts are removed. Other concept flags (`abstract` in `referencerange-meaning` and `questionnaire-item-control`) occur only in code systems used by non-required bindings.
- Test strength: 12 deliberate breaks of the resolver, bindings and walker were each caught by at least one test (exclude ignored, intersection as union, version suffix kept, no cycle guard, incomplete code systems accepted, notSelectable ignored, cap lowered, filters treated as whole systems, any binding strength accepted, slices not skipped, walker unable to pass through arrays, STU3 `valueSetUri` ignored). Real data never reaches the filter branch: no required `code` binding in any version uses a filter-based include, so that branch is covered by the unit test only.
- Data hygiene: no duplicate ValueSet or CodeSystem URL in any version's file; every derived code is plain printable ASCII (no quotes, backslashes, whitespace or empty strings), so no escaping is involved.
- Where the unions will land (T10c input): every derived binding targets one of four property shapes: a plain `string` (STU3 63, R4 85, R4B 307, R5 334), an array of `string` (8, 8, 21, 26), a property that already is a literal union from a schema enum (213, 231, 23, 23) or an array of one (10, 14, 3, 3). All 294/338/354/386 are currently optional properties.
- Forecast of added output: 57 KB (STU3), 76 KB (R4), 74 KB (R4B) and 92 KB (R5) of union text over 3.8 to 5.9 thousand codes; 17 to 18 lists per version have more than 100 codes.

Two details the comparison with the schema enums settled: a not-selectable grouping concept (Questionnaire item type `question`) is left out of a whole-code-system include but its children are kept, which is what the schema does; and a code system counts only if it is `complete` in the same file.

## Measured: unions applied to the output (task T10c)
`generate()` now derives the code bindings for the version and applies them while building each definition. A string (or array of strings) with a required binding becomes a union; a property that already is a union keeps the schema's enum.

| | STU3 | R4 | R4B | R5 |
|---|---|---|---|---|
| Property lines that changed (string to union) | 71 | 93 | 328 | 360 |
| Files that changed | 56 | 69 | 223 | 241 |
| Source size before / after | 1,591,652 / 1,636,098 | 2,327,924 / 2,384,282 | 2,367,017 / 2,438,335 | 3,002,098 / 3,090,713 |
| Strict `tsc` over the whole output | 0 errors, 0.26 s | 0 errors, 0.22 s | 0 errors, 0.23 s | 0 errors, 0.24 s |

The changed-line counts equal the forecast from T10b exactly, and no file changed in any other way. `Patient.gender` is now `'male' | 'female' | 'other' | 'unknown'` in all four versions, and R4's `ActivityDefinition.kind` (15 codes) and `.intent` (9 codes), which the R4 schema left as `string`, are unions in R4, R4B and R5. R5 `language` stays `string` (bound to all of BCP-47) as do the MIME-type fields.

One bug found while measuring: `ExampleScenario_Instance.resourceType` is an ordinary optional field that the bindings turn into a union of resource-type names, and the "discriminator first" rule moved it to the top because it was a `resourceType` literal. A discriminator is a single constant, so the rule now requires exactly one value.

From here on R4 and R4B output is no longer byte-identical to the earlier baselines: that was true until T10c.

## Measured: wrapped unions (task T10f)
A union that does not fit in 80 columns is written one member per line (an array of one in parentheses). Layout only: the TypeScript printer gives identical text for the wrapped and single-line forms of every generated file, in all four versions.

| | STU3 | R4 | R4B | R5 |
|---|---|---|---|---|
| Files | 490 | 660 | 679 | 836 |
| Source size | 1.65 MB | 2.40 MB | 2.45 MB | 3.11 MB |
| Lines | 26,278 | 37,645 | 38,261 | 47,706 |
| Longest code line, imports aside | 80 | 92 | 80 | 80 |

Before wrapping the longest line was 4,935 characters (`ImplementationGuide.license`, now 347 lines). The only code lines over 80 characters are two plain property declarations with very long names in R4 (`MedicinalProductAuthorization_JurisdictionalAuthorization[]`, 92 characters); single-specifier `import type` lines for type names of about 50 characters or more also stay on one line, as Prettier leaves them (47 in R4, 36 in R5). JSDoc description lines are comments and are not wrapped.

## Measured: required fields from the specification (task T10d)
A property is required when the schema's `required` list or the spec's `min >= 1` says so. Choice elements (`value[x]`) and slices are skipped; StructureDefinitions without a generated definition are skipped; an element path that does not resolve fails the build.

| | STU3 | R4 | R4B | R5 |
|---|---|---|---|---|
| Spec elements with `min >= 1`, resolved | 546 | 725 | 750 | 847 |
| Unresolved | 0 | 0 | 0 | 0 |
| Properties that newly become required | 344 | 408 | 427 | 458 |

An automated check over every non-abstract resource (more than 1,000 top-level elements per version): every non-choice element with `min >= 1` is required in the output, and nothing with `min = 0` is required unless the schema itself requires it. Examples in R4: `Observation.status` (a wrapped union), `Appointment.status`, `Extension.url` and `Binary.contentType` are now required; `Patient.gender`, `Patient.name` and `Extension.id` stay optional.

Consequences for users: an object literal missing a spec-required field no longer type-checks, so incomplete drafts need `Partial<T>`. A required array only means the field is present, not non-empty. A required primitive may legally be sent as only its `_field` extension (a data-absent reason, for example); those fields are not modelled.

## End-to-end check against HL7's official examples (2026-10-31)
Every official example resource that the schema knows (`examples-json.zip` from hl7.org: 2,911 for R4, 2,824 for R5) was type-checked as a TypeScript object literal against the generated types of its version, with all of T5 to T10f applied. The check needed batching and a larger heap (a single program for 2,900 large literals ran out of memory) and takes about 80 s for R4 and 55 s for R5.

| | R4 | R5 |
|---|---|---|
| Examples checked | 2,911 | 2,824 |
| Pass with no error | 2,650 (91.0%) | 2,783 (98.5%) |
| Reject: the example omits a field the spec requires | 198 (188 per-resource `*-questionnaire.json` files, whose display items have no `Questionnaire.item.linkId`; 10 `SearchParameter` examples without `base`) | 0 |
| Reject: the example uses a primitive extension (`_name`) | 61 files, 9 names (`_baseDefinition` 30, `_event` 9, `_birthDate` 8, `_family` 5, `_gender` 5, ...) | 40 files, 10 names (`_event` 9, `_birthDate` 8, `_profile` 6, `_family` 5, `_gender` 5, ...) |
| TypeScript gives up ("union type too complex", TS2590) | 2 (`dataelements.json`, `search-parameters.json`, large Bundles) | 1 (`search-parameters.json`) |
| Reject: a code outside a generated union | 0 | 0 |
| Reject: an ordinary property the types do not have | 0 | 0 |

What this says:
- **Unions and property sets hold up on real data.** Across roughly 5,700 official resources there is not one code outside a derived union and not one ordinary property missing from the types. That is the strongest evidence so far for T10b to T10d.
- **Required fields only reject non-conformant examples.** All 198 R4 cases are examples that really lack a `min = 1` field (the R5 versions of those examples are fixed). The cost is that real-world data with the same gaps will not compile without `Partial<T>`.
- **The one rejection the generator itself causes is `_name` extensions**, which are deliberately not modelled: 61 R4 files (2.1%) and 40 R5 files (1.4%). The extension fields are legal FHIR JSON (they carry `id` or extensions for a primitive).
- **TS2590** appears for huge literals typed against `ResourceList` (146 to 158 members); it is a compiler limit on inline literals, not a type error.

## Primitive extensions in the schemas and examples (2026-10-31)
- Every `_name` property in the schemas has a base property `name` (0 orphans in all four versions). 1,725 (STU3), 2,467 (R4), 2,517 (R4B) and 3,053 (R5) exist; about 96% are `{"$ref": "Element"}` and the rest (88, 142, 141, 150) are arrays of `Element`.
- In the official examples: R4 has 1,130 `_name` keys in 61 files and R5 has 81 in 41 files; 13 (R4, 11 files) and 49 (R5, 17 files) are array-valued. Arrays that contain `null` placeholders occur in 3 files: R4 `_given`; R5 `_base` (31 times) and `_given`. The HL7 schema forbids `null` there, the FHIR JSON rules require it, so the array form of `_name` is `(Element | null)[]`.
- Estimated size effect: about 70 bytes per property, so roughly 170 KB for R4 plus one `Element` import per file (about 8% of the output).

## Measured: primitive extensions and the official-example check (task T10g)
`_name` properties are now kept (they were dropped before), typed `Element`, with `(Element | null)[]` for arrays. HL7's schemas omit `_name` for every `canonical` primitive (72 properties in R4, 74 in R4B, 111 in R5, none in STU3); the generator adds those too, in the same shape, and leaves out element `id`s and `Narrative.div`.

Output: +175 KB in R4 (2.40 to 2.58 MB, about 7%); R5 3.33 MB, R4B 2.63 MB, STU3 1.81 MB.

`npm run check:examples -- --version <V>` type-checks every official example of a version (downloaded into `data/<V>/examples`, about a minute each):

| | STU3 | R4 | R4B | R5 |
|---|---|---|---|---|
| Examples checked | 1,664 | 2,911 | 3,022 | 2,824 |
| Pass | 1,490 (89.5%) | 2,711 (93.1%) | 2,999 (99.2%) | 2,822 (99.9%) |
| Omit a field the spec requires | 174 | 198 | 13 | 1 |
| `null` inside an array of primitives | 0 | 0 | 9 | 0 |
| TypeScript gives up on a huge literal (TS2590) | 0 | 2 | 1 | 1 |
| Rejected because of the generator | 0 | 0 | 0 | 0 |

Before this task R4 passed 91.0% and R5 98.5%; the rejections that disappeared were the 61 and 40 files using `_name` fields.

What the remaining rejections are:
- **Missing required fields:** examples that really lack a `min = 1` field (STU3 and R4: `Questionnaire.item.linkId` in the generated `*-questionnaire.json` files; `SearchParameter.base`; STU3 also `ElementDefinition.type.code`). The one R5 case, `QuestionnaireResponse.questionnaire`, is an example that gives only `_questionnaire`: the documented limitation that a required primitive may legally be sent as only its extension.
- **`null` placeholders in primitive arrays:** nine R4B examples (`ActivityDefinition` examples with `Timing.event: [null]` next to `_event`). FHIR JSON requires `null` there when only the extension has content. The types keep `event: string[]` because making every array of primitives nullable would make ordinary code pay for a case that appears in none of the R4, R5 or STU3 examples; it is a documented limitation, and the decision (2026-11-01) is to keep arrays of primitives strict.
- **TS2590:** the compiler's union-complexity limit on very large inline literals typed against `ResourceList`.

## Measured: property sets aligned with the specification (task T10e)
Each generated definition keeps a property only if its StructureDefinition lists it (choice elements expanded per type, `*` keeps every alternative, the single-constant `resourceType` discriminator kept, a `_name` kept exactly when its primitive is). Four STU3 profile-named keys are renamed. Measured at every depth on 489 (STU3), 659 (R4), 678 (R4B) and 834 (R5) definitions:

| What was removed | STU3 | R4 | R4B | R5 |
|---|---|---|---|---|
| `modifierExtension` on datatype children the spec types as `Element` | 11 | 14 | 13 | 17 |
| `extension` from `Resource` inheriting `Element` (`Resource`, `Binary`, `Bundle`, `Parameters`) | 4 | 0 | 0 | 0 |
| Base-type properties leaked into 11 resources | 0 | 0 | 0 | 86 |
| Choice alternatives the spec does not list (`Parameters_Parameter.valueElement`, ...) | 126 | 0 | 0 | 0 |
| `...SimpleQuantity` keys that duplicate a `...Quantity` key | 9 | 0 | 0 | 0 |
| Renamed to the spec's JSON key (`Dosage.doseSimpleQuantity` to `doseQuantity`, `rateSimpleQuantity` to `rateQuantity` in `Dosage`, `MedicationAdministration_Dosage`, `NutritionOrder_Administration`) | 4 | 0 | 0 | 0 |
| Anything else | 0 | 0 | 0 | 0 |
| Definitions the spec lists inconsistently / spec parents with no generated type | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

After the change, for every definition the specification describes, the generated property names equal the specification's exactly (no missing, no extra), in all four versions. Output: STU3 1.77 MB, R4 2.56 MB, R4B 2.62 MB, R5 3.30 MB.

The official-example check gives the same pass rates as before the change (STU3 89.5%, R4 93.1%, R4B 99.2%, R5 99.9%) and still nothing is rejected because of the generator: none of the 300 or so removed properties is used by any official example.

## Development dependencies (2026-11-01)
`npm audit --omit=dev` finds nothing: the package has no runtime dependencies. The full audit lists 19 advisories in development tooling (17 moderate, 2 critical). The two critical ones were Vitest 3.2.7 (`vitest` itself via `@vitest/mocker`, and `tinypool`). **Resolved 2026-11-01** by upgrading to Vitest 5.0.5 (with Vite 8.3.5 and `@types/node@22`; TypeScript 4.9 still parses everything, which the newest `@types/node` did not allow): the full audit now shows 0 critical and 16 moderate advisories, none related to Vitest, and `npm audit --omit=dev` still finds nothing. The remaining moderate ones are the old ESLint 7 and typescript-eslint 4 stack (T13 removed Babel CLI and ts-node-dev with the prototype: 14 moderate advisories remain, all in that lint stack). Consequence: development needs Node 22.12 or newer, recorded as `devEngines` in `package.json` (the published package contains only types, so it has no Node requirement and no `engines` field). The Vitest 5 config is `vitest.config.mts`: Vite warns that an ES-module config in a `.ts` file of a CommonJS package will stop loading by default. None of this is published or runs in the shipped package.

## Measured: the packed package (task T12)
`npm run build:package` writes the four versions as `.d.ts` files into `generated/` and type-checks each with `skipLibCheck` off (TypeScript otherwise skips `.d.ts` files, so a check with the option on verifies nothing about them).

| | STU3 | R4 | R4B | R5 | Total |
|---|---|---|---|---|---|
| Declaration files | 490 | 660 | 679 | 836 | 2,665 |
| Size | 1.69 MB | 2.44 MB | 2.50 MB | 3.14 MB | 9.8 MB |

`npm pack` gives 2,668 entries (the 2,665 declarations plus `package.json`, `LICENSE` and `README.md`), a 722,430-byte (0.69 MB) tarball and 9.8 MB unpacked. The build takes under 3 seconds.

Consumers import `health-types/<VERSION>/<Name>` with `import type`. Checked against the real four-version tarball: TypeScript 5.9.3 under `node10`, `node16`, `nodenext` and `bundler`, and TypeScript 7.0.2 under `node16`, `nodenext` and `bundler` (TypeScript 7 no longer has `node10`), with `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and `isolatedModules`; `verbatimModuleSyntax` with `bundler`. `exports` serves the modern modes and `typesVersions` the classic `node10` one. There is deliberately no root entry point: `import 'health-types'` does not resolve.

## Licences and third-party content (2026-11-01)
- **The specification is CC0.** HL7's licence pages for STU3, R4, R4B and R5 (`https://hl7.org/fhir/<release>/license.html`) state that the specification is licensed under Creative Commons "No Rights Reserved" (CC0); the current page says HL7 dedicates the specification to the public domain using CC0 1.0. The structure definitions in the downloads carry no `copyright` field of their own.
- **The "FHIR" trademark has a policy.** The same page says HL7 protects the "FHIR" trademark; non-trademark uses should carry the ® symbol and the sentence "HL7, FHIR and the FHIR [FLAME DESIGN] are the registered trademarks of Health Level Seven International and their use does not constitute endorsement by HL7"; and that using the marks "to brand your product or service (e.g. as part of the product name) without the express written consent of Health Level Seven International is strictly prohibited", while HL7 "will grant express written permission for libraries, applications, web sites, documentation" and so on when the usage follows its rules. The README carries the required wording; the package was renamed `health-types` for this reason (D5 in [decisions.md](decisions.md)).
- **Third-party content in the terminology.** Some value sets and code systems in the downloads carry other owners' notices: SNOMED CT (69 value sets in R4, 80 in R5), LOINC (11 in R5), DICOM, UCUM, and "example set" notices. The 294 to 386 unions per release were traced back to their sources (value sets and the code systems they include): none uses SNOMED CT or LOINC content. Five to seven unions per release take code values from lists HL7 excerpts from other standards, which the README lists: UCUM for `Timing.repeat.durationUnit` and `periodUnit` (all releases); DICOM Part 16 for `AuditEvent.action` (all releases), `AuditEvent.outcome` and `AuditEvent.network.type` (STU3, R4, R4B) and `ImagingStudy.availability` and `ImagingStudy.series.availability` (STU3). Only short code identifiers are used.

## Design consequences
1. **One internal model.** The schema, whatever its dialect, is read into `{ name, description, properties }` (see [architecture.md](architecture.md)). R4, R4B and R5 map directly; STU3 additionally flattens `allOf` inheritance (`inherit.ts`). No per-resource loader is needed.
2. **Choice types need no parsing.** The schemas already expand `value[x]` into one property per type; only STU3 needs its `allOf` flattened, and `ResourceList` is the one `oneOf`.
3. **Base types.** R4 and later have no `Resource` or `DomainResource` definition, but every resource repeats `id`, `meta`, `implicitRules`, `language` and the rest as its own properties, so nothing more is needed. STU3 inherits them and is flattened.
4. **The downloads differ per release.** The schema archive sits at a different path inside each zip, so the retriever finds `fhir.schema.json.zip` by name.
5. **Inline enums are incomplete and uneven**, so coded fields are derived from the value sets instead ([D12](decisions.md)).

The reasons behind each rule the generator follows are in [decisions.md](decisions.md).
