# Decision log

The decisions that shaped the project, in the order they were made, with the reason and what each replaced. Measurements quoted here are in [schema-notes.md](schema-notes.md). The task numbers (T1 to T16) refer to [../tasks/todo.md](../tasks/todo.md). Dates are when the decision was made.

| # | Decision | Status |
|---|---|---|
| D1 | Squash the repository history into one commit | Open item: keep a bundle of the old history |
| D2 | License the code MIT | Decided |
| D3 | Delete `stringify.ts` | Done |
| D4 | Fix truncation and required fields before the first release | Done |
| D5 | Name the package and repository `health-types` | Decided: renamed from `fhir-types` because of HL7's trademark policy |
| D6 | Support STU3, R4, R4B and R5; exclude DSTU2 | Decided |
| D7 | Keep the prototype's sample output until publishing | Decided |
| D8 | One file per type, no index, shared types imported | Decided |
| D9 | The package contains only type declarations | Decided |
| D10 | `generated/` is the package, built on `prepack` | Decided |
| D11 | Test with Vitest | Decided |
| D12 | Derive code unions from value sets | Decided |
| D13 | A property is required when the schema or the specification says so | Decided |
| D14 | The specification wins on which properties exist | Decided |
| D15 | Wrap long unions | Decided |
| D16 | Model primitive extensions (`_name`) | Decided, replaces an earlier decision to drop them |
| D17 | Arrays of primitives stay strict | Decided |
| D18 | Check against HL7's official examples before a release | Decided |
| D19 | Toolchain: Vitest 5, Node 22.12, TypeScript 4.9 | Decided |
| D20 | Continuous integration | Decided |
| D21 | Versioning and releases | Decided |

## D1. Squash the repository history (2026-10-31)

**Decided.** The public repository starts from one fresh commit. `data/` (165 MB of downloaded HL7 files that the prototype had committed) and the 23 commits from 2020-08-20 to 2023-01-20 are not carried over.
**Why.** The old history is mostly the 165 MB of data and the prototype's trial and error. A squash keeps the repository small and avoids rewriting history to remove the data.
**Consequence.** The prototype disappears from the public history, although the aim was to capture all of the work done. Before squashing, the old history is kept as a `git bundle` outside the repository, and the README's History section tells the story.

## D2. License the code MIT (2026-10-31)

**Decided.** MIT, with a `LICENSE` file. `package.json` said ISC without a file.
**Why.** ISC and MIT are near-equivalent; MIT is the more familiar. The FHIR definitions the types are derived from are CC0 (HL7 states this on `hl7.org/fhir/license.html` for STU3, R4, R4B and R5) and are credited in the README.

## D3. Delete `stringify.ts` (2026-10-31)

**Decided and done (T2).** The 418-line file was an unreferenced adaptation of a serializer from the `telejson` package, with unconfirmed provenance. It was removed with the dependencies only it used. Nothing replaced it.

## D4. Fix truncation and required fields before the first release (2026-10-31)

**Decided.** The prototype cut recursive types off as `{}` and lost which fields were required. These were first listed as known limitations; they became release blockers.
**Why.** A types package that accepts anything for `Reference.identifier` is not worth publishing. The prototype's iterative inlining could not fix it, so the generator was rewritten as a one-pass emitter that writes one file per type (D8).

## D5. Name the package and repository `health-types` (2026-10-31, changed 2026-11-01)

**Decided.** The npm package and the GitHub repository are named `health-types` (`dmhalejr/health-types`). The name was free on npm when checked on 2026-11-01.
**History.** The package was first named `fhir-types` (free on npm on 2026-10-31; a second candidate, `straight-fhir`, was also free). While the attribution for the README was being written, HL7's trademark policy came up (`hl7.org/fhir/license.html`, section "FHIR Trademark"): using "FHIR" "to brand your product or service (e.g. as part of the product name) without the express written consent of Health Level Seven International is strictly prohibited", although HL7 "will grant express written permission for libraries, applications, web sites, documentation" and so on when the usage follows its rules. Asking HL7 for written permission, renaming and publishing anyway were weighed, and the owner chose to rename. Fourteen candidates without "FHIR" or "HL7" were all free on npm; `health-types` was chosen over `clinical-types`, `healthcare-types` and `straight-types`.
**Consequences.** "FHIR" and "HL7" appear in the README only to describe the standard, with the ® symbol and HL7's required sentence, and not in the package, repository or command-line name (a test checks this). The GitHub repository still has to be renamed from `dmhalejr/fhir-types` to `dmhalejr/health-types` before publishing, because `package.json` points at the new address (GitHub redirects the old one). npm can refuse a name it judges too close to an existing one, so the name is re-checked at publish time.
**Keywords.** The owner chose to keep "fhir" and "hl7" as package keywords (search tags, not branding) and to add one per supported release (`fhir-stu3`, `fhir-r4`, `fhir-r4b`, `fhir-r5`) and `hl7-fhir`. A test ties the per-release keywords to the releases the package supports. The GitHub repository was renamed to `dmhalejr/health-types` on 2026-11-01 (the old address redirects).

## D6. Support STU3, R4, R4B and R5; exclude DSTU2 (2026-10-31)

**Decided.** The prototype handled STU3 and R4. "Newer versions should be supported", so R4B and R5 were added. DSTU2 stays out: its schema has a different shape.
**Verified in T1.** R4, R4B and R5 share one structure. STU3 ships a combined schema too, but writes inheritance as `allOf` and has no primitive definitions (handled in `inherit.ts`).

## D7. Keep the prototype's sample output until publishing (2026-10-31)

**Decided.** `example/Practitioner.*` and the copies at the repository root stayed until the release step and were then removed (2026-11-01).

## D8. One file per type, no index, shared types imported (2026-10-31)

**Decided.** `health-types/R4/Patient` is one file; shared datatypes such as `Identifier` are their own files that others `import type`.
**Why.** "Barrel files seem to be out of style"; consumers load only what they use. Importing instead of inlining is also what removes the truncation (D4): `import type` allows mutually recursive types (`Reference` and `Identifier`).
**Replaced.** The prototype inlined every referenced type into one nested interface per resource (35 KB for `Practitioner`; 5.1 KB now, with the shared types imported).

## D9. The package contains only type declarations (2026-10-31)

**Decided.** The command line, downloader, generator, tests and docs are tooling and never ship. No `main`, `bin` or dependencies; `commander` and everything else is a dev dependency. `package.json` `files` is `generated/**/*.d.ts`.
**Why.** "The commander infrastructure is basically meant to create the output but not meant for direct consumption by people downloading the package." A test packs the real manifest in a project full of files that must not ship.
**Consequence.** `exports` maps `health-types/<VERSION>/<Name>`, and `typesVersions` serves projects on classic `node10` resolution. There is deliberately no root import.

## D10. `generated/` is the package, built on `prepack` (2026-10-31, hook changed 2026-11-01)

**Decided.** The generated types are the package; `generated/` is git-ignored and built when the package is packed.
**Hook.** It first ran on `prepublishOnly`. A test with a scratch package showed `npm pack` runs `prepack` but not `prepublishOnly`, which would let `npm pack` tar a stale or empty `generated/`. `prepack` runs for both, so the build runs once.
**Also.** The shared type-check helper had `skipLibCheck: true`, under which TypeScript does not look inside `.d.ts` files, so a planted error went unreported. The check now runs with it off.

## D11. Test with Vitest (2026-10-31)

**Decided.** Vitest; suites that need HL7's data skip themselves, so a clone without downloads still runs a passing, smaller suite.

## D12. Derive code unions from value sets (2026-10-31)

**Decided.** A `code` field with a `required` binding becomes a union of its codes when they can be listed from the release's own `valuesets.json` (at most 400); everything else stays `string`. A schema `enum` wins when present.
**Why.** R4's schema inlines a union for 179 of its 265 required-binding code fields, R4B and R5's for none, so the same field would differ between releases. The derived lists reproduce every enum the schemas inline (STU3 223 of 223, R4 245 of 245) and add 71, 93, 328 and 360 fields.
**Cap.** First 200. The longest finite lists have 203 to 346 codes and R4's own schema inlines the 346-code `ImplementationGuide.license`, so a lower cap would make R4 stricter than R4B and R5.
**Replaced.** "Generate `string` for `code` in R4B and R5, faithful to each schema".

## D13. A property is required when the schema or the specification says so (2026-10-31)

**Decided.** Required if HL7's JSON Schema lists it or the specification gives the element a minimum of 1. Choice elements (`value[x]`) stay optional, since "minimum 1" there means "one of these".
**Why.** The schema leaves 199 of R4's 318 required top-level fields optional (STU3 146 of 223) and over-requires nothing. This makes 344 (STU3), 408 (R4), 427 (R4B) and 458 (R5) more properties required.
**Consequence.** Types are stricter than a half-built draft: use `Partial<T>`. Element paths are resolved by walking the schema, because HL7's numbered backbone names (`ClaimResponse_Detail1`) cannot be guessed; an unresolved path fails the build.

## D14. The specification wins on which properties exist (2026-10-31)

**Decided.** A property is kept only if its definition's structure definition lists it (choice elements expanded; a choice typed `*` keeps every alternative); four STU3 keys named after a profile are renamed.
**Why.** Measured at every depth, HL7's schemas disagree with their own specification in five ways: R5 leaks 86 base-type properties into 11 resources; STU3 gives `Resource` an `extension` it should not have; `modifierExtension` appears on datatype children typed `Element` (all releases); STU3 lists 126 choice alternatives too many; STU3 names `doseQuantity` as `doseSimpleQuantity`. No official example uses any removed property.
**Replaced.** An earlier plan to keep the STU3 quirk as the schema has it.

## D15. Wrap long unions (2026-10-31)

**Decided.** A union wider than 80 columns is written one member per line. The longest line had been 4,935 characters (`ImplementationGuide.license`). Layout only, verified with the TypeScript printer; imports of very long type names stay on one line.

## D16. Model primitive extensions (2026-10-31)

**Decided.** Every primitive property has an optional `_name?: Element`, and `(Element | null)[]` for repeating primitives. HL7's schemas omit it for every `canonical`; the generator adds those. Element ids and `Narrative.div` carry no extensions.
**Why.** Type-checking HL7's official examples showed these were the only rejections the generator itself caused: 61 of 2,911 R4 files and 40 of 2,824 R5 files.
**Replaced.** An earlier decision (2026-10-31) to drop `_name` fields and revisit if they mattered.

## D17. Arrays of primitives stay strict (2026-11-01)

**Decided.** `given?: string[]`, not `(string | null)[]`, although FHIR JSON allows `null` where only the extension has content.
**Why.** Only nine R4B official examples need it (none in STU3, R4 or R5), and `| null` would make every ordinary loop over such an array handle `null`. Documented as a limitation; the example check reports it separately and does not fail the gate.

## D18. Check against HL7's official examples before a release (2026-11-01)

**Decided.** `npm run check:examples` type-checks every example HL7 publishes against the types of its release. It is a release gate: a rejection is acceptable only if the example is wrong (missing a required field), a compiler limit is hit, or it is the documented `null` case.
**Result.** No rejection is the generator's doing (STU3 89.5%, R4 93.1%, R4B 99.2%, R5 99.9% pass).

## D19. Toolchain (2026-11-01)

**Decided.** Vitest 5 (the 3.x line had two critical advisories in its tooling), which needs Node 22.12 or newer and `@types/node` 22. TypeScript stays at 4.9 because the ESLint 7 and typescript-eslint 4 stack requires it. `package.json` declares `devEngines` for Node; the published package has no Node requirement. The prototype's Babel build and ten development dependencies were removed (T13).

## D20. Continuous integration (2026-11-01)

**Decided.** Two GitHub Actions workflows, in `.github/workflows/`:
- `ci.yml` runs on pushes to `master` and on every pull request, on Node 22 and 24 (Vitest 5 needs 22.12 or newer; the published package has no Node requirement). A `check` job runs `npm ci`, `npm run lint:check`, `npm run type-check` and `npm test` without any download, so the suites that need HL7's data skip. An `integration` job downloads all four releases (about 200 MB, seconds) and runs the full suite, then `npm pack --dry-run`, which builds the package through `prepack`.
- `examples.yml` is the release gate for HL7's official examples: one job per release, started by hand or by a `v*` tag. It is slow, so it does not run on every push.
**Choices.** CI lints with `lint:check` (`--max-warnings 0`, no `--fix`) because the everyday `lint` rewrites files and hides warnings with `--quiet`: the first clean-room run of the workflow's commands found an unused variable that `lint` had not shown. Workflows have read-only permissions, no secrets and no `pull_request_target`; actions are limited to official ones pinned to their current major version (`@v7`, checked against the latest releases on 2026-11-01), which a test enforces. Pinning to commit SHAs would be stricter and can be done later. HL7's data is downloaded each run rather than cached, so a change HL7 makes to a published release shows up as a failing pinned number.
**Added.** `yaml` as a development dependency, so that a test can check the workflows' structure (scripts exist, Node versions suffice, actions pinned, no secrets) without pattern-matching text.

## D21. Versioning and releases (2026-11-01)

**Decided.** Semantic versioning, `MAJOR.MINOR.PATCH`, tags `vX.Y.Z`. Before 1.0 the project stays on `0.1.x` and each release bumps the patch number; the first is `0.1.0`. The first releases are GitHub releases carrying the tarball that `npm pack` builds, so the exact package contents can be inspected before anything is published to npm. `"private": true` stays in `package.json` until the owner decides to publish, which makes an accidental `npm publish` fail.
