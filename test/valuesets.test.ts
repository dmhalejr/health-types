import { describe, expect, it } from 'vitest';
import {
  createValueSetResolver,
  MAX_UNION_SIZE,
} from '../tools/generator/valuesets';

const codeSystem = (url: string, concept: unknown[], content = 'complete') => ({
  resourceType: 'CodeSystem',
  url,
  content,
  concept,
});

const valueSet = (url: string, compose: unknown) => ({
  resourceType: 'ValueSet',
  url,
  compose,
});

const resources = [
  codeSystem('http://x/status', [
    { code: 'active' },
    { code: 'inactive' },
    { code: 'draft' },
  ]),
  codeSystem('http://x/tree', [
    {
      code: 'group',
      property: [{ code: 'notSelectable', valueBoolean: true }],
      concept: [{ code: 'a' }, { code: 'b', concept: [{ code: 'b1' }] }],
    },
    { code: 'c' },
  ]),
  codeSystem('http://x/partial', [{ code: 'p' }], 'fragment'),
  codeSystem('http://x/types', [
    {
      code: 'Resource',
      property: [{ code: 'abstract-type', valueBoolean: true }],
    },
    { code: 'Patient' },
  ]),
  valueSet('http://x/vs/types', { include: [{ system: 'http://x/types' }] }),
  valueSet('http://x/vs/whole', { include: [{ system: 'http://x/status' }] }),
  valueSet('http://x/vs/versioned', {
    include: [{ system: 'http://x/status|1.0.0' }],
  }),
  valueSet('http://x/vs/explicit', {
    include: [
      {
        system: 'http://x/status',
        concept: [{ code: 'draft' }, { code: 'active' }],
      },
    ],
  }),
  valueSet('http://x/vs/tree', { include: [{ system: 'http://x/tree' }] }),
  valueSet('http://x/vs/union', {
    include: [
      { valueSet: ['http://x/vs/explicit'] },
      { system: 'http://x/tree', concept: [{ code: 'c' }] },
    ],
  }),
  valueSet('http://x/vs/intersection', {
    include: [
      { system: 'http://x/status', valueSet: ['http://x/vs/explicit'] },
    ],
  }),
  valueSet('http://x/vs/excluded', {
    include: [{ system: 'http://x/status' }],
    exclude: [{ system: 'http://x/status', concept: [{ code: 'draft' }] }],
  }),
  valueSet('http://x/vs/filter', {
    include: [
      {
        system: 'http://x/status',
        filter: [{ property: 'concept', op: 'is-a', value: 'active' }],
      },
    ],
  }),
  valueSet('http://x/vs/external', {
    include: [{ system: 'http://elsewhere/codes' }],
  }),
  valueSet('http://x/vs/partial', {
    include: [{ system: 'http://x/partial' }],
  }),
  valueSet('http://x/vs/dangling', {
    include: [{ valueSet: ['http://x/vs/missing'] }],
  }),
  valueSet('http://x/vs/loop-a', {
    include: [{ valueSet: ['http://x/vs/loop-b'] }],
  }),
  valueSet('http://x/vs/loop-b', {
    include: [{ valueSet: ['http://x/vs/loop-a'] }],
  }),
  valueSet('http://x/vs/empty-result', {
    include: [{ system: 'http://x/status', concept: [{ code: 'draft' }] }],
    exclude: [{ system: 'http://x/status', concept: [{ code: 'draft' }] }],
  }),
  { resourceType: 'ValueSet', url: 'http://x/vs/no-compose' },
];

const resolve = createValueSetResolver(resources);

describe('value set resolver', () => {
  it('lists a whole complete code system in the order it is written', () => {
    expect(resolve('http://x/vs/whole')).toEqual({
      codes: ['active', 'inactive', 'draft'],
    });
  });

  it('ignores a version suffix on the value set and on the system', () => {
    expect(resolve('http://x/vs/whole|4.0.1')).toEqual(
      resolve('http://x/vs/whole'),
    );
    expect(resolve('http://x/vs/versioned')).toEqual(
      resolve('http://x/vs/whole'),
    );
  });

  it('keeps explicit concept lists as written', () => {
    expect(resolve('http://x/vs/explicit')).toEqual({
      codes: ['draft', 'active'],
    });
  });

  it('flattens a hierarchy depth first and leaves out not-selectable groups but keeps their children', () => {
    expect(resolve('http://x/vs/tree')).toEqual({
      codes: ['a', 'b', 'b1', 'c'],
    });
  });

  it('keeps abstract-type codes such as Resource: only notSelectable groups are left out', () => {
    expect(resolve('http://x/vs/types')).toEqual({
      codes: ['Resource', 'Patient'],
    });
  });

  it('unions includes and other value sets, without duplicates', () => {
    expect(resolve('http://x/vs/union')).toEqual({
      codes: ['draft', 'active', 'c'],
    });
  });

  it('intersects a system with a value set inside one include', () => {
    expect(resolve('http://x/vs/intersection')).toEqual({
      codes: ['active', 'draft'],
    });
  });

  it('subtracts excludes', () => {
    expect(resolve('http://x/vs/excluded')).toEqual({
      codes: ['active', 'inactive'],
    });
  });

  it.each([
    ['http://x/vs/filter', 'filter'],
    ['http://x/vs/external', 'code system not in file: http://elsewhere/codes'],
    ['http://x/vs/partial', 'code system is fragment: http://x/partial'],
    ['http://x/vs/dangling', 'value set not in file: http://x/vs/missing'],
    ['http://x/vs/loop-a', 'value set includes itself: http://x/vs/loop-a'],
    ['http://x/vs/no-compose', 'no compose.include'],
    ['http://x/vs/empty-result', 'no codes'],
    ['http://x/vs/unknown', 'value set not in file: http://x/vs/unknown'],
  ])('gives a reason, not a guess, for %s', (url: string, reason: string) => {
    expect(resolve(url)).toEqual({ reason });
  });

  it('gives up on a list longer than the cap', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ code: `c${i}` }));
    const small = createValueSetResolver(
      [
        codeSystem('http://x/many', many),
        valueSet('http://x/vs/many', {
          include: [{ system: 'http://x/many' }],
        }),
      ],
      4,
    );

    expect(small('http://x/vs/many')).toEqual({
      reason: '5 codes, more than 4',
    });
  });

  it('uses a cap of 400 by default', () => {
    expect(MAX_UNION_SIZE).toBe(400);
  });
});
