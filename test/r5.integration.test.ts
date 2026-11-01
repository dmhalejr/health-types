import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { generate } from '../tools/generator';
import { schemaPath } from '../tools/generator/load';
import { describeFullVersion } from './helpers/fullVersion';
import { makeTempDir, removeTempDir } from './helpers/tempDir';

const dataDir = join(__dirname, '..', 'data');

describeFullVersion('R5', 700);

describe.skipIf(!existsSync(schemaPath(dataDir, 'R5')))('R5 Base', () => {
  it('is emitted as an empty-object alias, not an empty interface', () => {
    const out = makeTempDir({});

    try {
      generate({ version: 'R5', dataDir, out });

      expect(readFileSync(join(out, 'R5', 'Base.ts'), 'utf-8')).toContain(
        'export type Base = Record<string, never>;',
      );
    } finally {
      removeTempDir(out);
    }
  });
});
