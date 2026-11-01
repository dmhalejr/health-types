import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

/** Creates a temp directory populated with `files` (relative path to content). */
export const makeTempDir = (files: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), 'health-types-test-'));

  Object.entries(files).forEach(([name, content]: [string, string]) => {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  });

  return dir;
};

export const removeTempDir = (dir: string): void =>
  rmSync(dir, { recursive: true, force: true });
