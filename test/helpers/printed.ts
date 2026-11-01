import ts from 'typescript';

/**
 * Parses TypeScript and prints it back with the compiler's own printer, which
 * ignores how a union was laid out. Equal results mean equal syntax trees.
 */
export const printed = (source: string): string => {
  const file = ts.createSourceFile(
    'file.ts',
    source,
    ts.ScriptTarget.ES2019,
    true,
  );

  return ts.createPrinter().printFile(file);
};
