import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';

const collectTsFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry: string) => {
    const path = join(dir, entry);

    if (statSync(path).isDirectory()) {
      return collectTsFiles(path);
    }

    return path.endsWith('.ts') ? [path] : [];
  });

/**
 * Type-checks every `.ts` and `.d.ts` file under `dir` (strict mode, no emit,
 * no ambient types) and returns the diagnostics as readable strings. An empty
 * array means the generated output compiles.
 *
 * `skipLibCheck` stays off on purpose: with it on, TypeScript does not look
 * inside `.d.ts` files at all, and the published package consists of them.
 */
export const typecheckDir = (dir: string): string[] => {
  const program = ts.createProgram(collectTsFiles(dir), {
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2019,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    types: [],
    skipLibCheck: false,
  });

  return ts.getPreEmitDiagnostics(program).map((diagnostic: ts.Diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      '\n',
    );

    if (!diagnostic.file || diagnostic.start === undefined) {
      return message;
    }

    const { line } = diagnostic.file.getLineAndCharacterOfPosition(
      diagnostic.start,
    );

    return `${diagnostic.file.fileName}:${line + 1} ${message}`;
  });
};
