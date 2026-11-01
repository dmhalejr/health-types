import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

type Definition = {
  properties?: Record<string, unknown>;
  required?: string[];
};

const schema = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'r4-mini.schema.json'), 'utf-8'),
) as { definitions: Record<string, Definition> };

const refsOf = (node: unknown, found = new Set<string>()): Set<string> => {
  if (Array.isArray(node)) {
    node.forEach((child: unknown) => refsOf(child, found));
  } else if (node && typeof node === 'object') {
    Object.entries(node).forEach(([key, value]: [string, unknown]) => {
      if (key === '$ref' && typeof value === 'string') {
        found.add(value.split('/').pop() as string);
      } else {
        refsOf(value, found);
      }
    });
  }

  return found;
};

describe('r4-mini fixture', () => {
  const { definitions } = schema;

  it('resolves every $ref within itself', () => {
    const missing = [...refsOf(definitions)].filter(
      (name: string) => !(name in definitions),
    );

    expect(missing).toEqual([]);
  });

  it('contains the Reference <-> Identifier cycle', () => {
    expect(refsOf(definitions.Reference).has('Identifier')).toBe(true);
    expect(refsOf(definitions.Identifier).has('Reference')).toBe(true);
  });

  it('has required properties beyond resourceType', () => {
    expect(definitions.Practitioner.required).toEqual(['resourceType']);
    expect(definitions.Practitioner_Qualification.required).toEqual(['code']);
  });
});
