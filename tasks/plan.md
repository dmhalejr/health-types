# Implementation Plan: health-types 0.1.0 open-source release

Source of truth: [SPEC.md](../SPEC.md). Task details and acceptance criteria: [tasks/todo.md](todo.md).

## Overview
Turn the existing prototype into (a) maintainer tooling, a `commander` CLI that downloads HL7 FHIR JSON Schemas (STU3, R4, R4B, R5) and generates one TypeScript file per resource/datatype, with correct required/optional fields and no `{}` truncation, shared types imported rather than inlined, and (b) a published npm package `health-types` that contains **only those generated type files**. The CLI and generator are never shipped to consumers. Then clean the repo, document it, add CI, squash history, and publish.

## Findings that shape the plan (checked against `data/R4` and hl7.org)
- The R4 `fhir.schema.json` is **flat**: 680 entries in `definitions`, each type refers to others by `$ref`, and every definition has its own `required` list (e.g. Patient: `["resourceType"]`). Enums are plain arrays; arrays use `items.$ref`.
- `https://hl7.org/fhir/R4B/definitions.json.zip` and `.../R5/definitions.json.zip` both return HTTP 200, so the retriever can fetch them like R4/STU3. T1 verified that both share R4's shape; STU3 ships a combined schema with `allOf` inheritance.
- The current generator inlines `$ref`s iteratively (up to 30 passes, mutating objects) and string-builds nested TS. That approach is the root cause of the `{}` truncation, the 35 KB single-file output, and the loss of `required`.

## Architecture Decisions
1. **Rewrite the emitter instead of patching the inliner.** New pipeline: `load schema → walk definitions once → emit one file per definition`. A `$ref` becomes `import type { X } from './X'`. This removes `scan`/`stillHasRefs`/`cleanup` and solves truncation, duplication, and recursion (type-only imports permit cycles) in one move. Cost: the legacy logic is replaced, not preserved; commented-out code is deleted only after the new golden tests pass (SPEC boundary).
2. **Required handling:** a property is non-optional only if it is in the definition's `required` array; everything else gets `?`.
3. **Golden-file tests plus whole-output `tsc --noEmit`** are the correctness gate. Fixtures are small hand-trimmed schemas checked into `test/fixtures/`; full-version runs are a CI/manual step using downloaded data, never committed data.
4. **Output layout:** `generated/<VERSION>/<Name>.ts`, no barrels. `package.json` `exports` maps `./R4/*` etc. into `generated/`; `files: ["generated"]`.
5. **The generated types are the package.** `generated/` is git-ignored and produced at build/prepublish time to keep the repo small.
6. **Types-only package; tooling is not shipped.** Generator, retriever and CLI live in `tools/`, all their dependencies (including `commander`) are `devDependencies`, there is no `bin` and no runtime `dependencies`. `package.json` `files` whitelists only `generated/` (npm adds `package.json`, `LICENSE`, `README.md`). A test inspects `npm pack --dry-run` to enforce this.
7. **Coded fields are aligned across versions by value-set data, not by what each schema happens to inline.** HL7's R4 schema inlines enums for about two thirds of required-binding `code` fields and R4B/R5 inline none. T10b/T10c derive the allowed codes from `profiles-resources.json` and `valuesets.json` (already in each download), so a field gets a union whenever its binding is `required` and the code list can be enumerated within a size cap (400); otherwise it stays `string`. A schema `enum`, when present, wins.
8. **Required fields combine the schema and the spec.** HL7's JSON Schema marks far fewer fields required than the spec's cardinality (R4: 119 of 318 top-level `min >= 1` fields; STU3: 77 of 223), and nothing it marks is over-required. T10d makes a property required when either the schema or the spec (`min >= 1` from `profiles-*.json`) says so. Choice elements stay optional. T10b's `spec-index` module (element-path to definition/property mapping, done by walking the schema) is shared by T10b and T10d.
9. **The specification wins where HL7's schema disagrees with it.** Measured at every depth: R5 leaks 86 properties into 11 resources; STU3 adds `extension` to `Resource`, `Binary`, `Bundle`, `Parameters`; all versions put `modifierExtension` on datatype children the spec types as `Element` (R4 14, R4B 13, R5 17 definitions); STU3 over-lists choice alternatives (126 extra properties) and names four properties after the `SimpleQuantity` profile instead of `doseQuantity`/`rateQuantity`. T10e keeps a property only if the definition's StructureDefinition snapshot lists it (choice expanded, `*` keeps all) and renames the four `SimpleQuantity` keys. R4 and R4B output therefore changes (class 3). The earlier decision to keep the STU3 quirk is reversed.
10. **Primitive extensions are modelled.** Checking HL7's official examples against the generated types (R4 2,911, R5 2,824) showed the only generator-caused rejections are the dropped `_name` fields (61 and 40 files). T10g keeps them as optional `Element` properties and reverses the round-4 decision to drop them. The example check becomes a script and a release gate.
11. **Development on Node ≥ 22.12** (Vitest 5; the published package is types only and has no Node requirement), Vitest for tests, `commander` for CLI, built-in `fetch` + a small unzip dependency replace `node-fetch` and `execSync('unzip')`.

## Dependency graph
```
T1 schema spike ─┐
T2 hygiene ──────┼─> T3 test harness ─> T4 emitter core ─> T5 refs/imports ─> T6 choice/unions/etc ─> T7 full R4 run
                 │                                                                                     │
T8 retriever ────┴──────────────────────────────────────────────────────────> T9 STU3, T10 R4B/R5 <─────┘
                                                                         T11 CLI ─> T12 package layout ─> T13 delete legacy
                                                                         T14 docs, T15 CI ─> T16 security scan/squash/publish
```
Parallelizable once T3 is done: T8 (retriever) is independent of T4–T7. T14 (docs) can be drafted alongside T11–T13. Everything else is sequential.

## Task List (details in todo.md)

### Phase 0: Foundations and de-risking
- [ ] T1 Spike: verify schema shape for STU3, R4B, R5 vs R4
- [ ] T2 Repo hygiene: remove `stringify.ts`, fix deps, MIT license, ignore `data/`
- [ ] T3 Test harness and fixtures
### Checkpoint A: harness green, schema shapes known

### Phase 1: New generator (R4)
- [ ] T4 Emitter core: primitives, enums, arrays, objects, required/optional
- [ ] T5 `$ref` → type imports, including cycles
- [ ] T6 Choice types, `allOf`/`oneOf`, `Resource` unions, `_field` primitive extensions
- [ ] T7 Full R4 generation; whole-output `tsc --noEmit`
### Checkpoint B: R4 complete and type-checks

### Phase 2: All versions
- [ ] T8 Retriever for STU3/R4/R4B/R5 with node-native unzip
- [ ] T9 STU3 generation
- [ ] T10 R4B and R5 generation
- [ ] T10b Value-set resolver: derive literal unions for required-binding `code` fields
- [ ] T10c Apply those unions to every version
- [ ] T10f Wrap long unions over several lines (layout only; run before T10d so goldens are written once)
- [ ] T10d Required fields from spec cardinality (`min >= 1`), all versions
- [ ] T10g Model primitive extensions (`_name` fields) and keep the official-example check as a script
- [ ] T10e Align property sets with the specification (drop what the spec lacks, rename STU3 `SimpleQuantity` keys)
Execution order in this phase: T10b, T10c, T10f, T10d, T10g, T10e.

### Checkpoint C: four versions generate, type-check, and share one union rule

### Phase 3: CLI and packaging
- [ ] T11 `commander` maintainer CLI in `tools/` (`fetch`, `generate`), not shipped
- [ ] T12 Types-only package layout, `exports` map, pack-contents guard
- [ ] T13 Remove legacy code
### Checkpoint D: tarball is types-only and import works from a scratch project

### Phase 4: Release
- [ ] T14 README, docs, CONTRIBUTING, HL7 attribution
- [ ] T15 GitHub Actions CI
- [ ] T16 Secret scan, squash to fresh initial commit, publish (each external step needs the owner's explicit approval)
### Checkpoint E: all SPEC success criteria met

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| R4B/R5 schema differs from R4 | High | T1 spike first; adapt loader before emitter hardens |
| Circular type references (Extension ↔ Element, Reference ↔ Identifier) | High | `import type` only; test with a cyclic fixture in T5 |
| Output volume (~680 files per version) slows `tsc` or bloats package | Med | Measure in T7; consider `isolatedModules`/per-version `tsc` project |
| Choice types (`value[x]`) and `oneOf` shapes differ from assumptions | Med | T6 builds from real R4 examples (Observation, Extension) |
| Package size on npm | Med | Measure in T12; ship `.d.ts` only |
| Value-set resolution is wrong or too loose (filters, hierarchy, external systems) | Med | Resolve only what can be enumerated; cross-check against R4 schema enums (95% agreement bar); anything uncertain stays `string` |
| Large unions slow `tsc` or bloat the package | Low | Size cap constant; measure in T10c and T12 |
| Spec-required fields make types stricter than users expect (partial objects stop compiling) | Med | Document it; recommend `Partial<T>` for drafts; the rule is one function so it can be made opt-in later |
| Pruning drops a property real data uses because a snapshot lacks its element, or leaves a wrong key behind | Med | Rule measured on all four versions at every depth; five known classes only, anything else stops the task; renames for the STU3 `SimpleQuantity` keys; all drops and renames pinned by a test |
| A required primitive can legally be sent as only its `_field` extension (for example `_status`), which our types do not model | Low | Document as a limitation; consistent with dropping `_field` properties |
| Element paths that do not map to schema properties (HL7 numeric-suffixed names like `ClaimResponse_Detail1`) | Med | Resolve by walking the schema from the root definition, not by building names; verified 0 unmapped across all four versions; an unresolvable path fails the build |
| History squash loses authorship record | Low | Accepted by the owner (D1 in docs/decisions.md) |
| Publishing is irreversible | High | T16 gated on explicit approval; dry-run `npm pack` first |

## Decisions closed
- Generated types are the package, in git-ignored `generated/` (they could be committed instead to make them browsable on GitHub).
- Vitest.
- `_field` primitive extensions were dropped and documented; reversed in D16 in docs/decisions.md after the official-example check (T10g).

## Open items
- Re-check the npm name before publishing (D5 in `docs/decisions.md`); the GitHub repository is already renamed.
- A `git bundle` of the old history before the squash (D1).
