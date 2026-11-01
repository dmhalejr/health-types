import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { expect } from 'vitest';

/**
 * Compares `actual` with test/golden/<name>. Run with UPDATE_GOLDEN=1 to
 * rewrite the file, then review the diff by hand before committing.
 */
export const expectGolden = (name: string, actual: string): void => {
  const path = join(__dirname, '..', 'golden', name);

  if (process.env.UPDATE_GOLDEN) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, actual);
  }

  expect(actual).toBe(readFileSync(path, 'utf-8'));
};
