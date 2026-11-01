import { afterEach, describe, expect, it } from 'vitest';
import { makeTempDir, removeTempDir } from './helpers/tempDir';
import { typecheckDir } from './helpers/typecheck';

describe('typecheckDir', () => {
  const dirs: string[] = [];
  const setup = (files: Record<string, string>): string => {
    const dir = makeTempDir(files);
    dirs.push(dir);

    return dir;
  };

  afterEach(() => dirs.splice(0).forEach(removeTempDir));

  it('returns no diagnostics for valid files, including type-only import cycles', () => {
    const dir = setup({
      'A.ts': "import type { B } from './B';\nexport interface A { b?: B }\n",
      'B.ts': "import type { A } from './A';\nexport interface B { a?: A }\n",
    });

    expect(typecheckDir(dir)).toEqual([]);
  });

  it('reports a diagnostic for a broken file', () => {
    const dir = setup({
      'Broken.ts': 'export interface Broken { id: Missing }\n',
    });

    const diagnostics = typecheckDir(dir);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toContain('Broken.ts:1');
    expect(diagnostics[0]).toContain('Missing');
  });

  it('checks .d.ts files too: skipLibCheck would hide an error in one', () => {
    const dir = setup({
      'Broken.d.ts': 'export interface Broken { id: Missing }\n',
    });
    const diagnostics = typecheckDir(dir);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toContain('Broken.d.ts:1');
  });

  it('descends into subdirectories', () => {
    const dir = setup({ 'R4/Bad.ts': 'export const x: number = "nope";\n' });

    expect(typecheckDir(dir)).toHaveLength(1);
  });
});
