# Contributing

This repository holds the generator that produces the [`health-types`](README.md) package. The package itself contains only generated type declarations; everything else here, the downloader, the generator, the command line and the tests, is tooling and is not published.

## Requirements

- **Node 22.12 or newer** (`nvm use` reads `.nvmrc`) and npm 10.9 or newer. `package.json` declares this in `devEngines`, so npm refuses to run the scripts on an older Node. The published package has no Node requirement.
- About 200 MB of disk for the four downloads, and about 600 MB more if you also fetch the official examples.

```bash
git clone https://github.com/dmhalejr/health-types.git
cd health-types
npm ci
```

## Everyday commands

| Command | What it does |
|---|---|
| `npm run fetch` | Download HL7's definitions into `data/` (`--version R4 R5` or `all`, `--force`, `--examples`). |
| `npm run generate -- --version R4` | Write the types of one release into `generated/R4/`. |
| `npm test` | Run the test suite. |
| `npm run type-check` | Type-check `tools/` and `test/`. |
| `npm run lint` | ESLint and Prettier (fixes what it can). |
| `npm run lint:check` | The same without fixing and with no warnings allowed; this is what CI runs. |
| `npm run check:examples -- --version R4` | Type-check every official example against the generated types. |
| `npm run build:package` | Build the four releases as `.d.ts` files, the contents of the package. |
| `npm run cli -- --help` | Help for the command line. |

Arguments after `--` go to the script. Both `fetch` and `generate` print one line per step, exit 0 on success, 1 when a command fails and 2 for wrong usage.

### Generating

```bash
npm run fetch -- --version R4
npm run generate -- --version R4 --resource Patient,Observation --out /tmp/types
```

`--resource` writes the named types and everything they import, so the files compile on their own; `ResourceList` then lists only the types that were written. `--declaration` writes `.d.ts` files as the package does and `--line-width 100` changes where long unions wrap. `generate` replaces `<out>/<version>` as a whole through a staging folder, so a failed run keeps the previous output, and it refuses a folder that holds anything but `.ts` files.

## Tests

`npm test` runs without any download. The suites that need HL7's data skip themselves, so a plain clone reports a smaller, passing run; after `npm run fetch -- --version all` the full suite runs (about 15 seconds).

- **Unit tests** use small hand-made schemas. The fixtures in `test/fixtures/` are trimmed copies of HL7's own schemas (CC0) that keep real shapes: cycles, inheritance, choice types, a `oneOf` union.
- **Golden files** in `test/golden/` hold the exact text of a few generated types. After an intended change to the output, run `UPDATE_GOLDEN=1 npx vitest run test/<file>` and **read the diff** before keeping it.
- **Integration tests** run on the real downloads. They check the whole output of each release: it type-checks as a whole, has no empty placeholders, and agrees with the specification's own element lists. Many pin measured numbers (how many unions, how many required fields, which properties are removed). When HL7 republishes a release the numbers move and the tests fail on purpose: confirm the change is real, then update the number and the matching entry in [docs/schema-notes.md](docs/schema-notes.md).
- **Package tests** pack the real manifest in a project full of things that must never ship, install the real tarball in another project and compile imports against it under two module-resolution modes.
- **The official examples** are not part of `npm test` (a minute and 20 MB to 200 MB per release). `npm run check:examples` is the release gate: no rejection may be the generator's doing.

Test-writing conventions: load data in `beforeAll`, never while the file is being collected (a suite must skip cleanly without data); break the code on purpose once to check a new test fails; keep tests free of timing and ordering assumptions (the suite also passes with `--sequence.shuffle`).

## How the code is organised

See [docs/architecture.md](docs/architecture.md) for the pipeline and the modules, and [docs/decisions.md](docs/decisions.md) for why it is built this way. In short:

```
tools/generator/   schema and specification data to TypeScript
tools/retriever/   downloads from hl7.org
tools/cli.ts       fetch and generate
tools/build-types.ts, check-examples.ts, typecheck.ts   package build, release gate, shared type-check
test/              suites, fixtures, golden files
docs/              architecture, decision log, findings about HL7's schemas
tasks/             the plan and task list the work was done from
```

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `master` and every pull request, on Node 22 and 24: lint (`lint:check`), type-check and the tests, once without data and once on freshly downloaded HL7 data, then `npm pack --dry-run`. Run the same commands before you push. `.github/workflows/examples.yml` runs the official-examples gate for each release; start it by hand from the Actions tab, or push a `v*` tag. A test checks the workflows' structure, so changing them means keeping `test/ci.test.ts` in step.

## Versions and releases

The project uses semantic versioning: `MAJOR.MINOR.PATCH`. Until 1.0 it stays at `0.1.x` and every release is a patch bump (`0.1.0`, `0.1.1`, ...); a change to the output rules or the import paths would be a minor bump, and `1.0.0` comes when the types are declared stable. A release is a git tag `vX.Y.Z` that matches `package.json`, with the tarball from `npm pack` (`health-types-X.Y.Z.tgz`) attached to a GitHub release. Pushing the tag starts the official-examples workflow. Publishing to npm is a separate, manual step.

## Style

- TypeScript in strict mode, Prettier through ESLint (`npm run lint` rewrites files), two-space indent, single quotes, named exports.
- Generator functions are pure: they take data and return data, do not mutate their input and do no I/O. Reading and writing happens in `tools/retriever/`, `tools/generator/load.ts`, `tools/generator/index.ts` and the scripts.
- Importing a module never does anything: scripts guard their entry with `require.main === module`.
- Errors name what failed and what to do, in one line.
- Commit messages follow the `feat:`, `fix:`, `chore:`, `docs:` and `test:` prefixes the history already uses.

## Changing what the types look like

The rules for the output (required fields, code unions, property sets, primitive extensions, layout) are recorded in [docs/decisions.md](docs/decisions.md) together with the measurements behind them. A change to a rule should come with a new entry there, an update to the golden files and the numbers it moves, and a run of `npm run check:examples` for every release. Do not edit generated files by hand; change the generator.

## Dependencies

The package has none and must stay that way: `tools/` and `test/` use development dependencies only. Adding or upgrading one deserves a note in the pull request. The linter stack (ESLint 7, typescript-eslint 4) pins TypeScript to 4.9; moving it forward is a separate change.

## Adding a FHIR release

1. Add its name to `FHIR_VERSIONS` in `tools/retriever/constants.ts` and to `SUPPORTED_VERSIONS` in `tools/generator/load.ts`.
2. `npm run fetch -- --version <name> --examples`, then `npm run generate -- --version <name>`.
3. Run `npm run check:examples -- --version <name>` and read the report. Anything under "generator" is a defect to understand first.
4. Add the release to the pinned numbers in `test/*.integration.test.ts`. Those tables are typed by release, so `npm run type-check` fails until the new release has an entry. Record the measurements in `docs/schema-notes.md`.

## Releasing (maintainers)

The package is built by `npm pack` and `npm publish` themselves, through the `prepack` script, so a stale or missing `generated/` cannot ship. Before publishing:

1. `npm test`, `npm run type-check`, `npm run lint`.
2. `npm run check:examples -- --version <v>` for each of STU3, R4, R4B and R5.
3. `npm pack --dry-run` and read the file list and size.
4. Bump `version` in `package.json` (patch until 1.0), add the entry to `CHANGELOG.md` and commit.
5. Tag `vX.Y.Z` and push the tag. `.github/workflows/release.yml` checks that the tag matches `package.json`, runs lint, type-check and the full tests on HL7's data, publishes to npm with provenance and creates the GitHub release with the tarball. The examples workflow starts on the same tag.

npm publishing uses [trusted publishing](https://docs.npmjs.com/trusted-publishers): there is no npm token in the repository. One-time setup on npmjs.com, package `health-types` → Settings → Trusted Publisher: GitHub Actions, owner `dmhalejr`, repository `health-types`, workflow `release.yml`. Publishing by hand (`npm publish` with your own login) still works as a fallback.

## Reporting a problem

Say which release and which type, show the data or the code that is rejected or accepted wrongly, and, if you can, the rule in HL7's definitions that you expect instead. A failing official example is the most useful report.
