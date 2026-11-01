# Task list: health-types 0.1.0

Plan: [plan.md](plan.md) · Spec: [../SPEC.md](../SPEC.md)
Definition of done for every task: `npm run type-check`, `npm run lint`, and `npm test` pass (once T3 exists).

## Phase 0: Foundations

- [x] **T1: Spike: verify schema shape for STU3, R4B, R5** (S)
  - Acceptance: a short `docs/schema-notes.md` states, per version, whether the combined schema has `definitions`, `discriminator.mapping`, `required`, `$ref`, `oneOf`/`allOf` in the same form as R4; lists any differences; says how STU3 (per-resource files vs combined) must be loaded.
  - Verify: notes cite real counts/keys from downloaded data (data kept in git-ignored `data/`).
  - Depends on: none. Files: `docs/schema-notes.md`.

- [x] **T2: Repo hygiene** (M)
  - Acceptance: `src/utils/stringify.ts` and its exclusive deps removed; eslint/prettier/typescript-eslint moved to `devDependencies`; `LICENSE` (MIT) added and `package.json` license, description, `engines.node >=18`, `.nvmrc` updated; `.gitignore` covers `data/`, `generated/`, `.DS_Store`, `lib/`, `output/`; tracked `.DS_Store` removed from the index; `data/` untracked (kept on disk).
  - Verify: `npm ci && npm run type-check && npm run build` pass; `git ls-files | wc -l` drops sharply; no references to removed packages (`git grep`).
  - Depends on: none. Files: `package.json`, `package-lock.json`, `.gitignore`, `.nvmrc`, `LICENSE`, `src/utils/*`.

- [x] **T3: Test harness and fixtures** (S)
  - Acceptance: Vitest configured; `npm test` runs; `test/fixtures/` contains a tiny trimmed schema (Practitioner + Identifier + Coding + Reference + Period, with one cycle); helper compiles a generated directory with the TS compiler API and returns diagnostics.
  - Verify: one smoke test passes; helper reports an error for a deliberately broken file.
  - Depends on: T2. Files: `vitest.config.mts`, `test/helpers/typecheck.ts`, `test/fixtures/*.json`, `package.json`.

### Checkpoint A
- [x] Build, lint and tests were green and the schema findings (T1) were reviewed before the emitter design was locked.

## Phase 1: New generator (R4)

- [x] **T4: Emitter core** (M)
  - Acceptance: given one definition, emits a TS file with JSDoc from `description`, string/number/boolean/integer mapped, enum arrays → string unions, `array` → `T[]`, nested inline objects, and `?` on every property not in `required`. Pure functions, no input mutation.
  - Verify: golden test for a flat fixture definition; unit tests for each mapping.
  - Depends on: T3. Files: `tools/generator/emit.ts`, `tools/generator/types.ts`, `test/emit.test.ts`, `test/golden/*.ts`.

- [x] **T5: `$ref` to type imports, including cycles** (M)
  - Acceptance: `$ref` and `items.$ref` produce `import type { X } from './X'`, deduplicated and sorted, no self-import; cyclic fixture (Reference ↔ Identifier) generates files that type-check.
  - Verify: golden test for Practitioner fixture; typecheck helper reports zero diagnostics on fixture output.
  - Depends on: T4. Files: `tools/generator/refs.ts`, `tools/generator/emit.ts`, `test/refs.test.ts`, `test/golden/*.ts`.

- [x] **T6: Choice types, `allOf`/`oneOf`, Resource unions, primitive extensions** (M)
  - Acceptance: `value[x]` properties (e.g. `valueString`, `valueQuantity`) emitted as separate optional fields; `allOf`/`oneOf` flattened or unioned deterministically; `ResourceList` becomes a union of resource types; `_field` properties dropped (decision recorded in SPEC; rule isolated in one function so it can be reversed).
  - Verify: tests using trimmed real R4 definitions (Observation, Extension, Bundle) from `data/R4`; typecheck passes.
  - Depends on: T5. Files: `tools/generator/emit.ts`, `tools/generator/choice.ts`, `test/choice.test.ts`, `test/fixtures/*`.

- [x] **T7: Full R4 generation and type-check** (M)
  - Acceptance: a `generate({version:'R4', out})` function writes one file per definition; whole output passes `tsc --noEmit`; no `{}` placeholder for any resolvable type (asserted by a test); Practitioner output reviewed against the old example by hand.
  - Verify: run against `data/R4`; record file count, total size, and `tsc` time in `docs/schema-notes.md`.
  - Depends on: T6. Files: `tools/generator/index.ts`, `test/r4.integration.test.ts`, `docs/schema-notes.md`.

### Checkpoint B
- [x] R4 types generated and compiled; the `Practitioner` and `Observation` output and the layout were reviewed before continuing. Review found one bug, fixed: `xhtml` had been emitted as an empty interface.

## Phase 2: All versions

- [x] **T8: Retriever for STU3, R4, R4B, R5** (M)
  - Acceptance: downloads `definitions.json.zip` for each version with Node ≥18 `fetch`, extracts with a small zip library (no `execSync('unzip')`), extracts nested `fhir.schema.json.zip`, keeps `profiles-resources.json`, `profiles-types.json` and `valuesets.json` (T10b reads them; datatype bindings such as `Quantity.comparator` live in `profiles-types.json`), throws descriptive errors (status, URL), skips re-download if present.
  - Verify: unit tests with mocked fetch and a tiny fixture zip; manual run for R4B.
  - Depends on: T2 (parallel with T4–T7). Files: `tools/retriever/*`, `test/retriever.test.ts`, `package.json`.

- [x] **T9: STU3 generation (inheritance flattening)** (M)
  - Acceptance:
    1. `STU3` is a supported version and loads the combined `data/STU3/fhir.schema.json/fhir.schema.json` (same path layout as R4; the per-resource files are not used).
    2. Definitions of the form `allOf: [ {$ref: base}?, {description, properties, required?} ]` are flattened: base chain resolved recursively (Patient -> DomainResource -> Resource -> Element), properties merged base-first with the more derived definition winning on a repeated name (`id`, `_id`, `extension`) while keeping the first position, `required` lists unioned, description taken from the definition's own part. A missing base or a base cycle throws an error naming the definition.
    3. `resourceType` is listed first in every resource, as in R4.
    4. A property with both `type: array` and an `enum` (10 of them, e.g. `Timing_Repeat.when`) becomes an array of the literal union, not a bare union.
    5. All 489 object definitions plus `ResourceList` are emitted, including the base types (`Element`, `BackboneElement`, `Resource`, `DomainResource`).
    6. Output type-checks as a whole, has no empty-object or empty-interface placeholders, and R4 output is byte-identical to before (R4 goldens and integration tests unchanged).
  - Verify: unit tests on a trimmed STU3 fixture (`test/fixtures/stu3-mini.schema.json`, derived from the real file) with goldens for `Patient` (3-level chain), `Patient_Contact` (BackboneElement), `Age` (Quantity base) and `Timing_Repeat` (array enum); error tests for missing base and base cycle; full-STU3 integration test (skipped without data) asserting file count, whole-output `tsc`, no placeholders, `resourceType` first, array-enum shape.
  - Depends on: T7, T8. Files: `tools/generator/inherit.ts` (new), `tools/generator/model.ts`, `tools/generator/load.ts`, `test/stu3.test.ts`, `test/stu3.integration.test.ts` (+ fixture and golden assets).

- [x] **T10: R4B and R5 generation** (S)
  - Acceptance: both versions generate and type-check; any version-specific differences handled in the loader/emitter with tests.
  - Verify: integration tests against downloaded data.
  - Depends on: T1, T7, T8. Files: `tools/generator/load.ts`, `test/r4b.integration.test.ts`, `test/r5.integration.test.ts`.

- [x] **T10b: Value-set resolver (required-binding `code` fields to literal unions)** (M)
  - Why: R4 only has unions for about two thirds of its required-binding `code` fields, and R4B/R5 have none (see `docs/schema-notes.md`). The same HL7 download contains the binding data, so all versions can be aligned.
  - Acceptance: a pure module reads `profiles-resources.json` and `profiles-types.json` (StructureDefinitions) and `valuesets.json` and returns, per `Definition.property`, the allowed code list for every element of type `code` whose binding strength is `required`. Resolves `ValueSet.compose.include` with explicit `concept` lists, whole-CodeSystem includes (only when the CodeSystem is in the same file with `content: complete`, flattening its concept hierarchy), and nested `valueSet` includes (union); applies `exclude`. Anything it cannot enumerate (filters, external systems, imports it can't resolve, more than the size cap) resolves to "no union" (stays `string`). Size cap is one named constant, 400 codes (measured: the longest finite lists have 203 to 346 codes, and R4's own schema inlines the 346-code `ImplementationGuide.license`, so a lower cap would make R4 stricter than R4B/R5). Only elements of type `code` are in scope; `Coding` and `CodeableConcept` fields with required bindings stay structural. Maps an element path to its generated definition and property by **walking the schema** from the root definition (`Patient` -> property `contact` -> its referenced type -> property `gender`), never by building a name from the path: HL7 disambiguates colliding backbone types with numeric suffixes (`ClaimResponse_Detail1`, `TestScript_Rule3`), which name-guessing gets wrong. Any StructureDefinition without a schema definition is skipped: abstract bases and logical models (`MetadataResource`, `CanonicalResource`) and the constraint profiles `SimpleQuantity` and `MoneyQuantity`. Measured: no constraint-derived type has a schema definition, so no profile can silently change a base type's cardinality. Choice types are handled. The StructureDefinition reader and this path mapper live in a shared module (`tools/generator/spec-index.ts`) that T10d reuses; it also exposes each element's `min`.
  - Validation: on R4, for fields that have both a schema `enum` and a derived list, the lists are equal in at least 95% of cases, and every mismatch is listed in `docs/schema-notes.md` with the reason. A report of derived vs schema coverage per version is committed as a test snapshot.
  - Verify: unit tests with small hand-made ValueSet/CodeSystem fixtures (explicit concepts, hierarchy, nested include, exclude, filter -> none, over cap -> none) and an R4 data test (skipped without data).
  - Depends on: T7, T8. Files: `tools/generator/valuesets.ts`, `tools/generator/bindings.ts`, `test/valuesets.test.ts`, `test/bindings.r4.test.ts`, `docs/schema-notes.md`.

- [x] **T10c: Apply bindings to generated types, all versions** (M)
  - Acceptance: the model builder takes an optional bindings map; a `code`-typed property with a derived list becomes a literal union (arrays as `('a' | 'b')[]`), otherwise stays `string`. Where the schema already has an `enum` it is kept (the schema is authoritative); derived lists only fill gaps. Applied for STU3, R4, R4B and R5 so the same field gets the same type in every version where the code list is the same. Output stays deterministic and type-checks.
  - Verify: unit tests with injected bindings (string and array of strings become unions, a schema enum is kept, numbers and unrelated definitions untouched, the single-value `resourceType` discriminator stays first while a many-valued field of that name does not); integration tests per version (skipped without data) asserting that exactly the forecast number of property lines change (STU3 71, R4 93, R4B 328, R5 360) and nothing else, `Patient.gender` has one type in all four versions, `ActivityDefinition.kind` and `.intent` are unions in R4, R4B and R5, and R5 `language` and `Binary.contentType` stay `string`; whole-output `tsc` for each version through the full-version suites. (The planned over-cap golden no longer applies: with the cap at 400 no finite list is skipped for size.)
  - Depends on: T9, T10, T10b. Files: `tools/generator/model.ts`, `tools/generator/index.ts`, `tools/generator/load.ts`, `test/bindings.golden.test.ts`, `test/golden/*`.

- [x] **T10f: Wrap long unions over several lines** (S) *(do before T10d, so later goldens are written once)*
  - Why: measured on 2026-10-31 (T10c review), every union is one line. The longest line is 4,935 characters (`ImplementationGuide.license`, 346 codes) and 17 lists per version have more than 100 codes, which is hard to read in the source and in go-to-definition, and makes diffs of regenerated output unreadable.
  - Rule: a union (or an array of a union) whose single-line form would exceed 80 columns is written one member per line, Prettier style:
    ```
      use?:
        | 'usual'
        | 'official'
        ...;
      kinds?: (
        | 'a'
        | 'b'
      )[];
    ```
    Unions that fit stay on one line (`gender?: 'male' | 'female' | 'other' | 'unknown';`). Nested properties indent accordingly. JSDoc description lines are comments and are not wrapped. The emitter takes a `lineWidth` option (default 80; `Infinity` keeps the old single-line form, used by the tests).
  - Acceptance: the rule above; wrapping changes layout only: for every file, parsing and re-printing the wrapped and the single-line output with the TypeScript printer gives identical text; no code (non-comment) line of any generated file is longer than 100 characters in any version, except single-specifier `import type { LongName } from './LongName';` lines for type names of about 50 characters or more, which stay on one line as Prettier leaves them (47 in R4, 36 in R5).
  - Verify: unit tests (short union stays one line, long union wraps, array of long union, deeper indentation, quotes escaped, `lineWidth: Infinity` restores the old form); the printer-equality test over the fixtures and, with data, over every generated file of all four versions; a max-code-line-length check in the full-version suites; goldens regenerated and reviewed (`Timing_Repeat` is the one existing golden that changes); whole-output `tsc` passes.
  - Depends on: T10c. Files: `tools/generator/emit.ts`, `test/format.test.ts`, `test/helpers/fullVersion.ts`, `test/golden/*`.

- [x] **T10d: Required fields from spec cardinality** (M)
  - Why: measured on 2026-10-31 (see `docs/schema-notes.md`), the schemas leave about two thirds of spec-mandatory top-level fields optional (R4: 199 of 318, STU3: 146 of 223), and none are over-required. Required handling was a stated priority.
  - Acceptance: a property is required when the schema's `required` list says so **or** the spec element has `min >= 1`. Elements are read from `profiles-resources.json` and `profiles-types.json` through the shared `spec-index` module (T10b), covering top-level elements, backbone children (`Patient.contact.name`) and datatype elements (`Extension.url`). Choice elements (`value[x]`) stay optional, because `min = 1` means "one of these". Elements with a `sliceName` are skipped and counted. Paths resolve by walking the schema (see T10b); measured on 2026-10-31 every `min >= 1` element of every non-abstract definition resolved (STU3 546, R4 725, R4B 750, R5 847, none unmapped), so any path that fails to resolve is an error that fails the build instead of being skipped. Measured effect: 344 (STU3), 408 (R4), 427 (R4B) and 458 (R5) properties newly become required, counting nested backbone and datatype elements. Applies to STU3, R4, R4B and R5. A `min >= 1` array is a required array (non-emptiness is not expressible and is not claimed).
  - Verify: unit tests with synthetic StructureDefinitions (top-level, backbone, a digit-suffixed collision such as `ClaimResponse.addItem.detail`, datatype, choice stays optional, slice skipped, a StructureDefinition without a schema definition such as `SimpleQuantity` skipped, unresolvable path throws); integration assertions on real data instead of goldens (`Appointment.status`, `Extension.url`, `Binary.contentType`, `Observation.status` required; `Patient.gender`, `Patient.name`, `Extension.id` optional); an automated version of the T9 review check: for every non-abstract resource in R4 and STU3 (skipped without data), every non-choice top-level element with `min >= 1` is required in the output and nothing with `min = 0` is required unless the schema says so; whole-output `tsc` passes for each version.
  - Depends on: T10b (shared `spec-index`), T10c (to avoid overlapping edits to `model.ts`). Files: `tools/generator/spec-index.ts`, `tools/generator/model.ts`, `tools/generator/index.ts`, `test/cardinality.test.ts`, `test/cardinality.integration.test.ts`.

- [x] **T10g: Model primitive extensions (`_name` properties)** (M) *(do before T10e, whose rule must know about them)*
  - Why: measured on 2026-10-31 (T10d review, `docs/schema-notes.md`), HL7's official examples contain `_name` fields (`_birthDate`, `_event`, `_family`, `_baseDefinition`, ...): 61 of 2,911 R4 files (2.1%) and 40 of 2,824 R5 files (1.4%) are rejected only because the types drop them, and they are the one rejection the generator causes. They are legal FHIR JSON: a `_name` carries an `id` or extensions for a primitive. This reverses the round-4 decision to drop them (which said to revisit if the other choice was more correct).
  - Rule: every `_name` property the schema defines is kept, optional, typed `Element` (`_birthDate?: Element;`), in the schema's order right after its primitive. An array-valued primitive's `_name` is an array whose entries may be `null`, as FHIR JSON writes placeholders for entries that have a value but no extension: `(Element | null)[]`. Confirmed against the data on 2026-10-31: the schemas define 142 (R4) and 150 (R5) array-valued `_name` properties as plain arrays of `Element`, which forbids `null`, but three official examples use null placeholders (R4 `_given`; R5 `_base` and `_given`). The model gets a flag on array types for nullable items. Arrays of primitives themselves (`given`) are not made nullable: no official example needs it, it would touch every primitive array, and it is documented as a limitation. `_name` is never required, never bound to a value set, and not counted as a property the spec lacks (T10e keeps `_x` exactly when `x` is kept).
  - Found while building it: HL7's schemas define a `_name` for most primitives but omit it for every `canonical` (72 properties in R4, 74 in R4B, 111 in R5, none in STU3), although the spec allows extensions on them and official examples use `_baseDefinition` and `_profile`. The generator therefore adds the missing `_name` (same shape, description "Extensions for name") for every primitive property that lacks one, except element `id`s and `Narrative.div`, which carry no extensions.
  - Result: see "Measured: primitive extensions and the official-example check" in `docs/schema-notes.md`. No official example is rejected because of the generator in any of the four versions. Nine R4B examples put `null` in an array of primitives (`Timing.event: [null]`), which the types do not allow; the check reports this as its own category (`null-placeholder`), a documented limitation that does not fail the gate. The premise above that "no official example needs it" was only true for R4, R5 and STU3.
  - Acceptance: the types above; the model builder no longer filters `_` names; every generated file still imports `Element` only when it uses it; whole-output `tsc` passes for all four versions; the official-example check (below) shows no remaining rejection caused by a `_name` field in R4 and R5; any other rejection it reveals (for example `null` placeholders inside a primitive array) is analysed and either fixed or documented before the task is closed.
  - The official-example check becomes a maintained script, `tools/check-examples.ts` with `npm run check:examples -- --version R4`: it downloads `examples-json.zip` for the version into the git-ignored `data/` area, type-checks every known example in batches of 200 with a larger heap, and prints the pass rate and the failures by category. It is not part of `npm test` (about a minute and 20 MB per version) but T16 uses it as a release gate.
  - Verify: unit tests (a `_name` property is kept after its primitive, optional, typed `Element`; an array-valued primitive's `_name` is the array form; not required; not bound; `Element` imported once); updated tests that assumed `_birthDate` is absent (`emit`, `r4.integration`, `fullVersion`, `spec-properties`); the example check on R4 and R5 recorded in `docs/schema-notes.md` with before/after numbers.
  - Depends on: T10f (formatting settled), T10d. Files: `tools/generator/model.ts`, `tools/check-examples.ts`, `package.json`, `test/primitive-extensions.test.ts`, `test/spec-properties.integration.test.ts` (+ updated assertions in existing tests).

- [x] **T10e: Align property sets with the specification** (M)
  - Why: measured at every depth on 2026-10-31 (see `docs/schema-notes.md`), HL7's schemas disagree with their own specification in more than the 14 resources first seen. Classes of disagreement: (1) R5 leaks 86 base-type properties into 11 resources; (2) STU3's `Resource`-inherits-`Element` quirk adds `extension` to `Resource`, `Binary`, `Bundle` and `Parameters`; (3) `modifierExtension` appears on datatype children that the spec types as plain `Element` (R4 14, R4B 13, R5 17, STU3 11 definitions, e.g. `Timing_Repeat`, `ElementDefinition_Binding`); (4) STU3 choice elements list more alternatives than the spec allows, 126 extra properties such as `Parameters_Parameter.valueElement`, `valueBackboneElement`, `valueUuid`; (5) STU3 names four properties after the `SimpleQuantity` profile (`doseSimpleQuantity`, `rateSimpleQuantity`) where the real JSON key and the spec say `doseQuantity` and `rateQuantity`. R4 and R4B are **not** unaffected: class 3 changes them.
  - Rule: a property of a generated definition is kept only if the definition's StructureDefinition snapshot lists an element for it (choice elements expanded to `valueString`, `valueQuantity`, ...; an element typed `*` keeps every alternative). `resourceType` is never dropped, and a `_x` primitive-extension property is kept exactly when `x` is kept (T10g). Dropping alone is wrong for class 5, where it would remove the only dose and rate properties and leave the real JSON key missing: for a property named `<x>SimpleQuantity` whose `<x>Quantity` the spec lists, rename it to the spec's name.
  - Acceptance: the measurement above is automated and its results (dropped and renamed properties, per version and class) are pinned by a test, so any upstream change fails loudly; after the change the generated property names equal the spec's for every definition that has a StructureDefinition snapshot, in all four versions, and `KNOWN_EXTRA_PROPERTIES` in `test/spec-properties.integration.test.ts` is empty. Any disagreement outside the five classes stops the task for review. Definitions without a snapshot (and primitives) are untouched.
  - Done as specified, with these changes: the pinned results are counts per class and the exact rename list rather than every dropped name, and the goldens became assertions on real data (`Dosage` has `doseQuantity`, `Binary` has no `extension`, R5 `EvidenceReport` has no `version`, R4 `Timing_Repeat` has no `modifierExtension`) because goldens built from real data cannot run without it. `generate()` is split into `prepare()` (derives bindings, required fields and alignment) and the writing step, so tests can switch one derived input off.
  - Verify: unit tests with synthetic StructureDefinitions (extra dropped, choice expansion kept, `*` keeps all alternatives, `resourceType` kept, rename applied, definition without a snapshot untouched); goldens: R5 `EvidenceReport` without `version`, STU3 `Binary` without `extension`, STU3 `Dosage` with `doseQuantity`, R4 `Timing_Repeat` without `modifierExtension`; R4 and R4B output differs from before only by the class-3 drops (diff reviewed and recorded); whole-output `tsc` passes for each version.
  - Depends on: T10b (shared `spec-index`), T10d (shares the property rules in `model.ts`). Files: `tools/generator/spec-index.ts`, `tools/generator/model.ts`, `test/alignment.test.ts`, `test/spec-properties.integration.test.ts`, `test/golden/*`.

### Checkpoint C
- [x] All four versions generate and compile, with value-set unions, spec-based required fields and spec-aligned property sets applied consistently; the per-version coverage report was reviewed.

## Phase 3: CLI and packaging

- [x] **T11: `commander` maintainer CLI (not shipped)** (M)
  - Acceptance: `health-types fetch --version <v>` and `health-types generate --version <v> [--resource <Name>] [--out <dir>]`; `--help`; non-zero exit and a clear message on bad input; no top-level side effects on import. Lives in `tools/`, exposed only as `npm run fetch` / `npm run generate` scripts; **no `bin` field**; `commander` is a devDependency.
  - Built as: `tools/cli.ts` (`commander` 14), run through `npm run fetch -- ...`, `npm run generate -- ...` and `npm run cli -- --help`. `fetch` takes `--version` (several values, repeated, or `all`; default all), `--data`, `--force` and `--examples`; `generate` takes a required `--version`, `--resource` (several values or a comma list), `--out`, `--data`, `--line-width` and `--no-clean`. Exit codes: 0 success and help, 1 a command failed (one line, `error: ...`), 2 wrong usage.
  - Found while building it: the dependency closure of any resource used to be the whole version, because `Patient` imports `ResourceList` (via `contained`) and `ResourceList` imports every resource. `--resource` therefore follows the members of a union no further and writes `ResourceList` with only the generated resources (`never` when none), so `--resource Patient` writes 44 types instead of 660 and they compile on their own. `generate` empties `<out>/<version>` first (a mistyped resource is rejected before anything is deleted) and refuses a directory holding anything but `.ts` files. A mistyped name gets a suggestion (`Unknown definition "Pateint" (did you mean Patient?)`).
  - Review fixes (2026-11-01): `--resource ,` used to parse to an empty list, report success with 0 types and empty the output folder; it is now a usage error (exit 2), as are empty `--out` and `--data` values, and the library refuses `resources: []`. `generate` now writes to a staging folder beside the output and swaps it in only when everything was written, so a failure (or a refused folder) leaves the previous output untouched and no staging folder behind. Real failures are covered end to end: exit 1 with one line for a missing data directory, `--out data` refuses and leaves the downloads alone.
  - Verify: CLI tests invoking the built binary; manual `generate --resource Patient`.
  - Depends on: T7, T8. Files: `tools/cli.ts`, `package.json`, `test/cli.test.ts`.

- [x] **T12: Types-only package layout, `exports` map, pack-contents guard** (M)
  - Acceptance: `prepublishOnly` fetches, generates all four versions, emits `.d.ts`; `exports` maps `health-types/R4/Patient` to `generated/R4/Patient`; `files: ["generated"]` yields a tarball containing only `generated/`, `package.json`, `LICENSE`, `README.md`; `dependencies` is empty and there is no `bin`/`main`; a test parses `npm pack --dry-run --json` and fails on any other path. Tarball size recorded.
  - Verify: install the tarball in a scratch project and compile an import of `health-types/R4/Patient` and `health-types/R5/Observation`. Also done by hand with the full four-version tarball: TypeScript 5.9.3 under node10, node16, nodenext and bundler (with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `isolatedModules`, `verbatimModuleSyntax`), and TypeScript 7.0.2 under node16, nodenext and bundler, importing one type from each of STU3, R4, R4B and R5; wrong data is rejected in every mode.
  - Built as: `npm run build:package` (`tools/build-types.ts`; `prepack` runs it) fetches if needed, writes `.d.ts` files straight from the generator (no `tsc` emit step, so no `tsconfig.build.json`), type-checks each version with `skipLibCheck` off, and fails if `generated/` holds anything but version folders. `package.json`: `files: ["generated/**/*.d.ts"]`, `exports: { "./*": { "types": "./generated/*.d.ts" } }`, `typesVersions` for classic node resolution, `sideEffects: false`, no `main`/`bin`/dependencies. Still `private: true` until T16.
  - Hook changed in review: `prepublishOnly` was replaced by `prepack`. Tested with a scratch package: `npm pack` runs `prepack` but not `prepublishOnly`, so with the latter alone `npm pack` would tar whatever `generated/` held, stale or empty. `prepack` runs for `npm pack`, `npm pack --dry-run` and `npm publish` (which would also run `prepublishOnly` and build twice, hence only one hook). The tests pass `--ignore-scripts` so they do not trigger the build.
  - Found while building it: the shared type-check helper had `skipLibCheck: true`, under which TypeScript does not look inside `.d.ts` files at all (a planted error went unreported); it now lives in `tools/typecheck.ts` with the setting off. A `--declaration` flag on `generate` writes `.d.ts` files.
  - Measured: 2,665 declaration files, build takes under 3 seconds, tarball 0.69 MB (722,430 bytes), 9.8 MB unpacked, 2,668 entries (the declarations plus `package.json`, `LICENSE`, `README.md`).
  - Done in: `package.json`, `tools/build-types.ts`, `tools/typecheck.ts`, `test/package.test.ts` (manifest, `npm pack --dry-run` in a project full of things that must not ship, version-folder guard), `test/consumer.integration.test.ts` (packs and installs the real tarball and compiles it).

- [x] **T13: Remove legacy code** (S)
  - Note: new code is written under `tools/` from T4 onward; `src/` holds only legacy code until this task deletes it.
  - Acceptance: old `scan`, `cleanup`, `stillHasRefs`, `transform`, and commented-out blocks in `src/index.ts` removed, plus unused `src/interfaces.ts` types; nothing references them.
  - Done more broadly than the acceptance text: the whole prototype went, not just the named functions: `src/` (13 files), `output/`, `.babelrc`, and the scripts `build`, `build:types`, `build:js` and `start`. Ten development dependencies went with it (`@babel/*` x6, `ts-node-dev`, `node-fetch`, `@types/node-fetch`, `json-stream-stringify`) and `ts-node` became a direct dependency, since the scripts use it and it had only been there through `ts-node-dev`. The three `tsconfig` files became one (`tsc --noEmit` over `tools` and `test`). A fresh install is 214 packages instead of 398, `npm audit` shows 14 moderate advisories instead of 16 (all in the ESLint 7 stack) and ESLint reports no warnings at all. The root `Practitioner.*` and `example/` stay until publish time, as decided.
  - Verify: `git grep` clean; all tests still green.
  - Depends on: T7. Files: `src/transform/`, `src/utils/*`, `src/index.ts`, `src/interfaces.ts`.

### Checkpoint D
- [x] The tarball is types-only (no CLI, no dependencies) and installs and compiles in a scratch project.

## Phase 4: Release

- [x] **T14: README, docs, CONTRIBUTING, attribution** (M)
  - Public-facing wording (done): `SPEC.md` is one current specification instead of nine chronological "Decisions (round N)" sections; the reasons behind each decision are in `docs/decisions.md` as a dated log (what was decided, why, what it replaced); first- and second-person phrases and process wording were reworded neutrally in `SPEC.md`, `tasks/` and `docs/`. The files stay in the repository as the record of the work.
  - History: the prototype and its 23 commits (2020-08 to 2023-01) are not in the public history after the squash (D1 in docs/decisions.md), so the README has a History section (a 2020 prototype that inlined `$ref`s, rebuilt in 2026 around a one-pass generator and the specification's own data) and `docs/decisions.md` records the reasons.
  - Acceptance: README covers what/why, install, import examples per version, the string-versus-union rule (required bindings with an enumerable code list become unions, everything else stays `string`), the required rule (required when the schema or the spec's `min >= 1` says so; choice elements stay optional), the fact that the property set follows the specification where HL7's schema disagrees with it and the caveat that types can be stricter than a half-built draft object (use `Partial<T>` for drafts) (consumer-facing; no CLI mention), with generator usage in `CONTRIBUTING.md` only, output rules (required/optional, choice types, dropped `_` fields), limitations, roadmap, HL7 CC0 attribution; `CONTRIBUTING.md` with dev commands.
  - Done as specified, plus: `docs/architecture.md` (pipeline and modules), `docs/decisions.md` (19 dated decisions with reasons and what each replaced), `SPEC.md` rewritten as one current specification, and the licence findings in `docs/schema-notes.md`. The README's code blocks are compiled by `test/readme.integration.test.ts` against the real packed package under two resolution modes (with the expected errors checked), the type counts in its table are compared with the real output, and the HL7 wording it must contain is asserted; four deliberate corruptions of the README were each caught. A shared helper, `test/helpers/installedPackage.ts`, packs and installs the real package.
  - Findings while writing: HL7's trademark policy restricts "FHIR" in a product name without written consent (D5: the owner chose to rename the package `health-types`); a handful of unions take code values from DICOM and UCUM lists, so the README has a third-party notice; no SNOMED CT or LOINC content is used.
  - Verified on a clean copy (no `node_modules`, no data), following CONTRIBUTING verbatim: `npm ci` (214 packages), `npm run fetch -- --version all` (7 seconds, 194 MB), `npm test` on the fresh download (421 tests pass), `npm run type-check`, `npm run lint`, the `generate` example (47 types), `npm run build:package` and `npm pack --dry-run` (726.6 kB, 2,668 files). All 30 relative links and anchors in the documents resolve.
  - Verify: following the README on a clean clone works verbatim.
  - Depends on: T12. Files: `README.md`, `CONTRIBUTING.md`, `docs/`.

- [x] **T15: GitHub Actions CI** (S)
  - Acceptance: workflow runs install, lint, type-check, unit tests, and an R4 integration job on push and PR on Node 22 and 24 (Vitest 5 needs Node 22.12 or newer; the published package has no Node requirement).
  - Built as: `.github/workflows/ci.yml` (jobs `check` and `integration`, Node 22 and 24) and `.github/workflows/examples.yml` (the release gate, one job per release, manual or on `v*` tags); a `lint:check` script (no fixing, no warnings); the `yaml` development dependency and `test/ci.test.ts` (19 checks: scripts exist, Node versions suffice, actions pinned to official majors, read-only permissions, timeouts, no secrets, data fetched before the tests that need it; each rule was confirmed by breaking it). Actions use `@v7`, the current majors on 2026-11-01 (the first draft used `@v4`, three majors behind).
  - Found while verifying: running the workflow's commands in a clean copy showed `lint:check` failing on an unused variable in a new test, which the everyday `lint` (`--quiet`) did not report. Fixed; the whole sequence then passed: `npm ci`, `lint:check`, `type-check`, `npm test` (306 pass, 138 skip without data), `npm run fetch -- --version all`, `npm test` (444 pass), `npm pack --dry-run` (2,668 files, 726.7 kB).
  - Not done: the first run on GitHub. `actionlint` is not installed here, so the workflows were checked by parsing them with `yaml` and by the structure test, and by running their commands locally on macOS rather than on Linux runners.
  - Verify: workflow lints (`actionlint` or dry run); passes on the first push.
  - Depends on: T11. Files: `.github/workflows/ci.yml`.

- [ ] **T16: Release steps** (S) *(each external step requires the owner's explicit approval)*
  - Progress 2026-11-01: done: gitleaks scan (clean), history bundle, prototype removal, squash, tag `v0.1.0`, GitHub release with the tarball, first CI and examples runs (green on GitHub). Waiting for the owner: making the repository public, `npm publish`.
  - Before the squash, keep the old history: `git bundle create ../health-types-history.bundle --all` (stored outside the public repo; restorable with `git clone`), and say so in the squashed commit message.
  - Acceptance: secret scan (gitleaks) clean; repo squashed into one fresh initial commit; `npm pack --dry-run` reviewed; the npm name re-checked (D5 in `docs/decisions.md`: the package was renamed because of HL7's trademark policy; the GitHub repository is already `dmhalejr/health-types`); GitHub repo made public; `npm publish` run only after the owner's approval.
  - Verify: SPEC success criteria 1-9 all checked.
  - Depends on: T13, T14, T15. Files: none (git/npm operations).

### Checkpoint E
- [ ] All SPEC success criteria met; ready to publish.
