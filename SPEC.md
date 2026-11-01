# Specification: health-types

Status: built. The generator, the command line, the package layout and the tests are done for all four releases; the documentation and the CI workflows are written, and the release steps remain (see [Success criteria](#success-criteria)). Why the project is built the way it is: [docs/decisions.md](docs/decisions.md). How it works: [docs/architecture.md](docs/architecture.md). Measured findings about HL7's schemas: [docs/schema-notes.md](docs/schema-notes.md).

## Objective

`health-types` is an npm package of TypeScript type declarations for the HL7® FHIR® standard, releases **STU3, R4, R4B and R5**, generated from the definitions HL7 publishes (the JSON Schema, the structure definitions and the value sets). One declaration file per resource, datatype and backbone element, with the specification's descriptions as JSDoc.

**Who it is for.** TypeScript developers who handle FHIR JSON and want accurate, documented types without writing them by hand or depending on a large runtime library.

**What good looks like.** The types accept the JSON the specification allows and reject what it does not, as far as the shape of the JSON can say it: required fields, allowed codes of required value sets, the properties that exist. The check is HL7's own example resources, which must not be rejected for any reason that is the generator's fault.

**The release goal.** Publish the repository and the package openly, with an honest account of what is covered and what is not, a clean and reasonably small repository, and the history of the work captured.

### Starting point

The project began in 2020 as a prototype (23 commits, 2020-08-20 to 2023-01-20, one author) that repeatedly inlined the `$ref`s of HL7's JSON Schema into one nested interface per resource. At commit `629f04b` it had:

- a downloader for STU3 and R4, a reference resolver (up to 30 passes), a cleanup step and a string-building emitter, but a generation pipeline that was commented out in its entry point;
- output of 35 KB for `Practitioner`, with recursive types cut off as `{}`, shared datatypes duplicated, no optional or required marks and one resource at a time;
- 165 MB of downloaded HL7 files committed, no tests, no license file (`package.json` said ISC), no CI, a 418-line unreferenced serializer of unconfirmed origin, and a stub README.

All of that was replaced (see [decisions](docs/decisions.md)). The prototype's sample output (`example/Practitioner.*` and copies at the root) was removed at the release step; the prototype's history is kept in a `git bundle`.

## What the package contains

Only `.d.ts` files: `health-types/<VERSION>/<Name>`, plus `package.json`, `LICENSE` and `README.md`. No JavaScript, no dependencies, no entry point to import. The rules the types follow, each with its measurements in the decision log:

| Rule | Summary | Decision |
|---|---|---|
| One file per type | Shared types are imported (`import type`), so recursive types work; `ResourceList` is the union of resources | D8 |
| Required fields | Required when the schema or the specification (minimum 1) says so; choice elements stay optional | D13 |
| Coded fields | A union when the binding is required and the code list can be enumerated (at most 400); otherwise `string` | D12 |
| Property set | Follows the structure definitions where HL7's schema disagrees with them | D14 |
| Primitive extensions | Optional `_name?: Element`, `(Element \| null)[]` for repeating primitives | D16 |
| Arrays of primitives | `string[]`, not nullable | D17 |
| Layout | Unions wider than 80 columns wrap, one member per line | D15 |

## Tech stack

- TypeScript 4.9 (strict) for type-checking; `ts-node` runs the maintainer tooling. No JavaScript is emitted: the package is declaration files.
- Vitest 5 for tests. `commander` 14 for the command line. `fflate` for unzipping. ESLint 7 and Prettier 2 (`semi`, `singleQuote`, `trailingComma: all`).
- Node 22.12 or newer to work on the project (`devEngines`, `.nvmrc`). The published package has no Node requirement and no dependencies.

## Commands

```
npm run fetch -- [--version R4 R5 | all] [--data data] [--force] [--examples]
npm run generate -- --version R4 [--resource Patient,Observation] [--out generated] [--data data]
                    [--line-width 80] [--declaration] [--no-clean]
npm run cli -- --help
npm test                                           # Vitest; suites that need HL7's data skip without it
npm run test:watch
npm run type-check                                 # tools and test
npm run lint                                       # ESLint with Prettier, fixes what it can
npm run lint:check                                 # the same without fixing, and no warnings allowed (what CI runs)
npm run check:examples -- --version R4             # HL7's examples against the generated types
npm run build:package                              # all four releases as .d.ts in generated/ (run by `prepack`)
```

Exit codes of the command line: 0 success, 1 a command failed, 2 wrong usage. `--resource` writes the named types and what they import, with `ResourceList` limited to the written types. `generate` replaces `<out>/<version>` through a staging folder, so a failed run keeps the previous output, and refuses a folder that holds anything but `.ts` files. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Project structure

```
tools/generator/       schema and specification data to TypeScript: load, model, inherit, emit, refs, index,
                       and the three derivations from the specification: bindings (value sets), cardinality
                       (required), alignment (property sets), sharing spec-index (reader and path walker)
tools/retriever/       downloads definitions and examples from hl7.org
tools/cli.ts           the command line (fetch, generate); not shipped
tools/build-types.ts   builds the package; tools/check-examples.ts the release gate; tools/typecheck.ts the shared check
test/                  suites, fixtures (trimmed HL7 schemas) and golden files
docs/                  architecture, decision log, findings about HL7's schemas
tasks/                 the plan and task list the work was done from
.github/workflows/     ci.yml (every push and pull request) and examples.yml (the release gate)
data/                  downloaded HL7 inputs and examples (git-ignored)
generated/<VERSION>/   the package contents (git-ignored, built by `prepack`)
```

## Code style

Prettier through ESLint, two-space indent, single quotes, named exports, strict TypeScript. Functions that build the output are pure, take data and return data, and do not mutate their input. Importing a module never does anything.

```ts
/**
 * Names of the other generated types a definition refers to: unique, sorted,
 * and never the definition itself (a self-reference needs no import).
 */
export const collectRefs = (model: DefinitionModel): string[] =>
  [
    ...new Set([
      ...(model.unionOf ?? []),
      ...model.properties.flatMap((property) => typeRefs(property.type)),
    ]),
  ]
    .filter((name: string) => name !== model.name)
    .sort();
```

## Testing strategy

- **Unit tests** on small hand-made schemas, with golden files for a few generated types.
- **Integration tests** on HL7's real downloads, one suite per release: the whole output type-checks, has no empty placeholders, and agrees with the specification's element lists. Measured counts are pinned, so a change upstream fails the test.
- **Package tests** pack the real manifest among files that must not ship, then install the real tarball and compile imports against it under two module-resolution modes.
- **The official examples** (`npm run check:examples`) are the release gate.
- Suites that need the downloads skip cleanly without them. Every new test is checked by breaking the code on purpose. The suite also passes in shuffled order.

## Boundaries

- **Always.** Run `npm test`, `npm run type-check` and `npm run lint` before a commit; change the generator, never a generated file; keep the README's limitations truthful; credit HL7 and any third-party content.
- **Ask first.** Rewriting git history; adding or upgrading a dependency; changing the license or the package name; changing the output rules; publishing.
- **Never.** Commit HL7's data dumps or generated output; ship anything but declarations in the package; claim validation the types cannot give.

## Success criteria

Release-ready when all are true. State on 2026-11-01:

| # | Criterion | State |
|---|---|---|
| 1 | A fresh clone installs from the lockfile and passes type-check, lint and tests; the repository is under 5 MB | Met: about 1 MB in about 90 files |
| 2 | A documented command downloads a release and generates its types | Met: `npm run fetch`, `npm run generate` |
| 3 | No dead code from the prototype | Met: removed in T13 |
| 4 | LICENSE, README, CONTRIBUTING, CI workflow | Met: all four exist; the workflow's first run on GitHub is still to come |
| 5 | `stringify.ts` removed or attributed | Met: removed |
| 6 | Tests run in CI and pass | Met locally by running the workflow's commands in a clean copy (444 tests with data; 306 pass and 138 skip without); the first run on GitHub is pending |
| 7 | No secrets or personal data in files or history | Open: scan before the squash (T16) |
| 8 | Stray files | `.DS_Store` ignored; the prototype's sample output goes at release (T16) |
| 9 | No high or critical advisories in runtime dependencies | Met: there are no runtime dependencies. 14 moderate advisories remain in the lint stack |
| 10 | Unions, required fields and property sets match the specification | Met, pinned by tests for all four releases |
| 11 | The official-example gate shows no rejection that is the generator's doing | Met: STU3 89.5%, R4 93.1%, R4B 99.2%, R5 99.9% pass |
| 12 | The package contains only declarations, `package.json`, `LICENSE`, `README.md` | Met: 2,668 files, about 727 kB packed; checked by test |

## Known limitations

Documented in the README for users: the types describe shape, not validity; a required primitive sent only as `_name`; `null` in primitive arrays; the compiler's union limit on huge literals; value-set unions only for `code` fields; no DSTU2.

## Open items

- **Re-check that the npm name `health-types` is still free** at publish time ([D5](docs/decisions.md): the package was renamed because of HL7's trademark policy; the GitHub repository is already renamed).
- **Keep the old history** as a `git bundle` before the squash (D1).
- **The first run of the workflows on GitHub**, and **the release steps** (T16: secret scan, squash, removing the prototype's sample output, the first publish).
