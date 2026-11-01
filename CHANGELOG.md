# Changelog

Versions follow [semantic versioning](https://semver.org/); until 1.0 every release bumps the patch number (see [CONTRIBUTING](CONTRIBUTING.md#versions-and-releases)).

## Unreleased

Publishing to npm and the GitHub release now happen from `.github/workflows/release.yml` when a version tag is pushed.

## 0.1.1 (2026-11-01)

First release on npm (`npm install --save-dev health-types`). The contents are the same as 0.1.0; only the package metadata changed.

## 0.1.0 (2026-11-01)

First release.

- Type declarations for HL7 FHIR STU3 (490 types), R4 (660), R4B (679) and R5 (836), one file per type, imported as `health-types/<VERSION>/<Type>`.
- Required fields from the schema and from the specification's minimum cardinality; union types for required code bindings with at most 400 codes; property sets aligned with the specification's structure definitions; `_name` primitive extensions.
- HL7's official examples type-check against the types: STU3 89.5%, R4 93.1%, R4B 99.2%, R5 99.9%. No rejection is caused by the generator.
- Distributed as a GitHub release tarball; not yet published to npm.
