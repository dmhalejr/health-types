import { describe, expect, it } from 'vitest';
import { deriveCodeBindings } from '../tools/generator/bindings';
import {
  loadSpec,
  readStructureDefinitions,
  resolveElement,
} from '../tools/generator/spec-index';
import { PropertyModel } from '../tools/generator/types';

const string: PropertyModel['type'] = { kind: 'primitive', name: 'string' };
const prop = (
  name: string,
  type: PropertyModel['type'] = string,
): PropertyModel => ({
  name,
  required: false,
  type,
});

/** A tiny schema: Claim.item.detail and Claim.addItem.detail are different types. */
const models: Record<string, PropertyModel[]> = {
  Thing: [
    prop('status'),
    prop('kind'),
    prop('tags', { kind: 'array', item: string }),
    prop('part', { kind: 'array', item: { kind: 'ref', name: 'Thing_Part' } }),
    prop('extra', {
      kind: 'array',
      item: { kind: 'ref', name: 'Thing_Extra1' },
    }),
  ],
  Thing_Part: [prop('use')],
  Thing_Extra1: [
    prop('use'),
    prop('deep', { kind: 'ref', name: 'Thing_Deep' }),
  ],
  Thing_Deep: [prop('mode')],
};
const propertiesOf = (name: string): PropertyModel[] => models[name] ?? [];

const element = (path: string, extra: Record<string, unknown> = {}) => ({
  path,
  min: 0,
  max: '1',
  type: [{ code: 'code' }],
  binding: { strength: 'required', valueSet: 'http://x/vs' },
  ...extra,
});

const bundle = (
  name: string,
  elements: unknown[],
  kind = 'resource',
  abstract = false,
) => ({
  entry: [
    {
      resource: {
        resourceType: 'StructureDefinition',
        name,
        kind,
        abstract,
        snapshot: { element: elements },
      },
    },
  ],
});

const terminology = [
  {
    resourceType: 'CodeSystem',
    url: 'http://x/cs',
    content: 'complete',
    concept: [{ code: 'a' }, { code: 'b' }],
  },
  {
    resourceType: 'ValueSet',
    url: 'http://x/vs',
    compose: { include: [{ system: 'http://x/cs' }] },
  },
];

const derive = (
  elements: unknown[],
  name = 'Thing',
  hasDefinition = (n: string) => n in models,
) =>
  deriveCodeBindings(
    readStructureDefinitions(bundle(name, elements) as never),
    terminology,
    propertiesOf,
    hasDefinition,
  );

describe('loadSpec', () => {
  it('says which file is missing', () => {
    expect(() => loadSpec('no-such-dir', 'R4')).toThrow(
      /Could not read no-such-dir[/\\]R4[/\\]profiles-resources\.json/,
    );
  });
});

describe('resolveElement', () => {
  it('finds a top-level property', () => {
    expect(resolveElement('Thing.status', propertiesOf)?.definition).toBe(
      'Thing',
    );
  });

  it('walks through arrays of backbone types', () => {
    expect(resolveElement('Thing.part.use', propertiesOf)?.definition).toBe(
      'Thing_Part',
    );
  });

  it('follows the schema into a digit-suffixed type instead of guessing a name', () => {
    expect(resolveElement('Thing.extra.deep.mode', propertiesOf)).toMatchObject(
      {
        definition: 'Thing_Deep',
        property: { name: 'mode' },
      },
    );
    expect(resolveElement('Thing.extra.use', propertiesOf)?.definition).toBe(
      'Thing_Extra1',
    );
  });

  it.each(['Nope.status', 'Thing.nope', 'Thing.part.nope', 'Thing.status.use'])(
    'returns undefined for %s',
    (path: string) =>
      expect(resolveElement(path, propertiesOf)).toBeUndefined(),
  );
});

describe('deriveCodeBindings', () => {
  it('binds a required `code` element to its resolved codes', () => {
    expect(derive([element('Thing.status')]).bindings).toEqual([
      {
        definition: 'Thing',
        property: 'status',
        valueSet: 'http://x/vs',
        codes: ['a', 'b'],
      },
    ]);
  });

  it('maps nested and suffixed elements to the right generated type', () => {
    const { bindings } = derive([
      element('Thing.part.use'),
      element('Thing.extra.use'),
      element('Thing.extra.deep.mode'),
    ]);

    expect(bindings.map((b) => `${b.definition}.${b.property}`)).toEqual([
      'Thing_Part.use',
      'Thing_Extra1.use',
      'Thing_Deep.mode',
    ]);
  });

  it('accepts array elements', () => {
    expect(derive([element('Thing.tags', { max: '*' })]).bindings).toHaveLength(
      1,
    );
  });

  it.each([
    [
      'extensible binding',
      { binding: { strength: 'extensible', valueSet: 'http://x/vs' } },
    ],
    [
      'preferred binding',
      { binding: { strength: 'preferred', valueSet: 'http://x/vs' } },
    ],
    ['no binding', { binding: undefined }],
    ['a non-code type', { type: [{ code: 'string' }] }],
    ['a Coding', { type: [{ code: 'Coding' }] }],
    ['a choice of types', { type: [{ code: 'code' }, { code: 'string' }] }],
    ['a slice', { sliceName: 'special' }],
  ])('ignores %s', (_label: string, extra: Record<string, unknown>) => {
    const result = derive([element('Thing.status', extra)]);

    expect(result.bindings).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('reads the STU3 binding forms (valueSetReference and valueSetUri)', () => {
    const viaReference = element('Thing.status', {
      binding: {
        strength: 'required',
        valueSetReference: { reference: 'http://x/vs' },
      },
    });
    const viaUri = element('Thing.kind', {
      binding: { strength: 'required', valueSetUri: 'http://x/vs' },
    });

    expect(
      derive([viaReference, viaUri]).bindings.map((b) => b.property),
    ).toEqual(['status', 'kind']);
  });

  it('records a reason when the codes cannot be listed', () => {
    const result = derive([
      element('Thing.status', {
        binding: { strength: 'required', valueSet: 'http://x/unknown' },
      }),
      element('Thing.kind', { binding: { strength: 'required' } }),
    ]);

    expect(result.bindings).toEqual([]);
    expect(result.skipped).toEqual([
      {
        path: 'Thing.status',
        reason: 'value set not in file: http://x/unknown',
      },
      { path: 'Thing.kind', reason: 'binding names no value set' },
    ]);
  });

  it('reports a path that does not resolve instead of dropping it', () => {
    expect(derive([element('Thing.vanished')]).unresolved).toEqual([
      'Thing.vanished',
    ]);
  });

  it('skips StructureDefinitions that have no generated definition', () => {
    expect(derive([element('Mystery.status')], 'Mystery').bindings).toEqual([]);
  });

  it('skips primitive-type StructureDefinitions', () => {
    const result = deriveCodeBindings(
      readStructureDefinitions(
        bundle('Thing', [element('Thing.status')], 'primitive-type') as never,
      ),
      terminology,
      propertiesOf,
      () => true,
    );

    expect(result.bindings).toEqual([]);
  });
});
