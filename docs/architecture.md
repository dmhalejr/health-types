# How the generator works

The package is produced from four files that HL7 publishes for each FHIR release (`https://hl7.org/fhir/<release>/definitions.json.zip`):

| File | Holds | Used for |
|---|---|---|
| `fhir.schema.json` | JSON Schema of every resource and datatype | The shape of each type: property names, types, nesting |
| `profiles-resources.json`, `profiles-types.json` | The structure definition of every resource and datatype, with each element's cardinality, types and binding | Which fields are required, which properties exist, which fields are coded |
| `valuesets.json` | Value sets and code systems | The allowed codes of a coded field |

The schema alone is looser than the specification in several ways (see [schema-notes.md](schema-notes.md)), so the generator starts from the schema and corrects it with the specification's own data.

## Pipeline

```
download           tools/retriever          zip -> data/<release>/{fhir.schema.json/, profiles-*.json, valuesets.json}
   |
load               generator/load.ts        schema definitions, per release
   |
model              generator/model.ts       one DefinitionModel per definition (see below)
   |   inherit.ts   flattens STU3's allOf inheritance
   |   spec-index.ts + bindings.ts + cardinality.ts + alignment.ts   derive facts from the specification
   |
emit               generator/emit.ts        DefinitionModel -> TypeScript text
   |
write              generator/index.ts       one file per type, in a staging folder, then swapped in
```

`prepare()` in `generator/index.ts` runs the derivation steps for one release and returns the schema definitions plus the three derived inputs (`bindings`, `required`, `alignment`). `generate()` is `prepare()` followed by the writing step; tests switch one input off at a time through `prepare()`.

## The model

`generator/types.ts` defines what the emitter reads, independent of release or schema dialect:

```
DefinitionModel   { name, description?, properties: PropertyModel[], unionOf?: string[] }
PropertyModel     { name, description?, required, type: TypeModel }
TypeModel         primitive | literal (a union of string literals) | array | object | ref
```

`model.ts` turns a schema definition into a `DefinitionModel`:

1. Flatten inheritance (`inherit.ts`): STU3 writes a type as `allOf: [base, own]`; the base chain is copied into the type, a derived definition replacing a repeated name in place.
2. Convert each property: `$ref` to a primitive definition becomes `string`, `number` or `boolean`; `$ref` to another definition becomes a `ref` (an `import type` later); an `enum` or `const` becomes a literal union; arrays and inline objects are converted recursively. Anything it does not understand throws with the path, never `any`.
3. Add the `_name` primitive extensions the schema leaves out (`withMissingPrimitiveExtensions`).
4. Apply the alignment, then the code bindings and the required set, which are keyed by `Definition.property`.
5. Keep the single-constant `resourceType` discriminator first.

## Facts derived from the specification

All three work on the same two problems: reading structure definitions, and finding which generated property an element path such as `ClaimResponse.addItem.detail.productOrService` stands for.

- **`spec-index.ts`** reads the structure definitions and resolves a path **by walking the generated types** from the root definition, property by property. Names cannot be built from paths: HL7 numbers colliding backbone types (`ClaimResponse_Detail1`, `TestScript_Rule3`).
- **`valuesets.ts` and `bindings.ts`** find every element of type `code` with a `required` binding and list its codes: explicit concepts, whole code systems that are complete in the same file (not-selectable grouping codes left out), nested value sets with union, intersection and exclusion. Filters, external code systems and lists beyond 400 codes stay `string`. A schema `enum` always wins over a derived list.
- **`cardinality.ts`** collects the elements with a minimum of 1, other than choice elements and slices. A property is required when the schema or this set says so.
- **`alignment.ts`** lists, for every definition, the property names its structure definition gives it (choice elements expanded per type, `*` meaning any). Properties that are not listed are dropped, and four STU3 keys named after a profile are renamed. A `_name` follows its primitive.

An element path that does not resolve fails the build rather than being skipped.

## Emitting

`emit.ts` is a pure function from a `DefinitionModel` to text: `import type` lines (sorted, no self-import), the JSDoc, then an `interface`, a `type` union (`ResourceList`) or `Record<string, never>` for a definition with no properties. A union that does not fit in 80 columns is written one member per line; that is layout only, and a test checks it with the TypeScript printer.

## Writing, subsets and the package

- `generateTypes` writes `<Name>.ts` or `<Name>.d.ts`. With `only`, it writes those types and what they import (`closureOf`), but does not follow the members of a union, and lists only the written types in `ResourceList`, so a subset compiles on its own.
- `replaceGeneratedDir` writes into a staging folder next to the target and swaps it in on success, and refuses a target that holds anything but `.ts` files.
- `tools/build-types.ts` builds all four releases as `.d.ts`, type-checks each with `skipLibCheck` off (TypeScript otherwise does not look inside declaration files) and fails if `generated/` holds anything but the four release folders. The `prepack` script runs it.

## Release gate

`tools/check-examples.ts` downloads HL7's example resources for a release and type-checks each as an object literal against the generated types, in batches. It sorts every rejection by cause; only causes that point at the generator (an unknown property, a code outside a union, a missing `_name`) fail the run.
