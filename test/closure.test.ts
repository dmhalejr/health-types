import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { emitDefinition } from '../tools/generator/emit';
import {
  cleanGeneratedDir,
  closureOf,
  generate,
  generateTypes,
  replaceGeneratedDir,
  suggestNames,
} from '../tools/generator';
import { Definitions } from '../tools/generator/model';
import { makeTempDir, removeTempDir } from './helpers/tempDir';
import { typecheckDir } from './helpers/typecheck';

const definitions: Definitions = {
  string: { type: 'string' },
  Element: { properties: { id: { $ref: '#/definitions/string' } } },
  Period: { properties: { start: { $ref: '#/definitions/string' } } },
  Reference: {
    properties: { identifier: { $ref: '#/definitions/Identifier' } },
  },
  Identifier: {
    properties: {
      period: { $ref: '#/definitions/Period' },
      assigner: { $ref: '#/definitions/Reference' },
    },
  },
  Patient: {
    properties: {
      resourceType: { const: 'Patient' },
      managingOrganization: { $ref: '#/definitions/Reference' },
      contained: {
        type: 'array',
        items: { $ref: '#/definitions/ResourceList' },
      },
    },
    required: ['resourceType'],
  },
  Observation: {
    properties: {
      resourceType: { const: 'Observation' },
      effective: { $ref: '#/definitions/Period' },
    },
    required: ['resourceType'],
  },
  Unrelated: { properties: { x: { $ref: '#/definitions/string' } } },
  ResourceList: {
    oneOf: [
      { $ref: '#/definitions/Patient' },
      { $ref: '#/definitions/Observation' },
    ],
  },
};

describe('closureOf', () => {
  it('returns the roots and everything they import, sorted, following cycles once', () => {
    // Element comes with any type that has a primitive: its `_name` fields are Elements.
    expect(closureOf(['Reference'], definitions)).toEqual([
      'Element',
      'Identifier',
      'Period',
      'Reference',
    ]);
  });

  it('does not follow the members of a union such as ResourceList', () => {
    const patient = closureOf(['Patient'], definitions);

    expect(patient).toEqual([
      'Element',
      'Identifier',
      'Patient',
      'Period',
      'Reference',
      'ResourceList',
    ]);
    expect(patient).not.toContain('Observation');
  });

  it('merges several roots', () => {
    expect(closureOf(['Observation', 'Unrelated'], definitions)).toEqual([
      'Element',
      'Observation',
      'Period',
      'Unrelated',
    ]);
  });

  it('rejects an unknown name with a suggestion', () => {
    expect(() => closureOf(['Pateint'], definitions)).toThrow(
      'Unknown definition "Pateint" (did you mean Patient?)',
    );
    expect(() => closureOf(['Nothing'], definitions)).toThrow(
      'Unknown definition "Nothing"',
    );
  });

  it('does not accept a primitive as a root', () => {
    expect(() => closureOf(['string'], definitions)).toThrow(
      'Unknown definition "string"',
    );
  });
});

describe('suggestNames', () => {
  const known = ['Patient', 'Practitioner', 'PatientLink', 'Observation'];

  it('matches another letter case, and up to two edits', () => {
    expect(suggestNames('patient', known)).toEqual(['Patient']);
    expect(suggestNames('Pateint', known)).toEqual(['Patient']);
    expect(suggestNames('Obsrvation', known)).toEqual(['Observation']);
  });

  it('suggests nothing for a name that is far from all of them', () => {
    expect(suggestNames('Zebra', known)).toEqual([]);
  });

  it('suggests at most three, sorted', () => {
    expect(suggestNames('Pat', ['Pat1', 'Pat2', 'Pat3', 'Pat4'])).toEqual([
      'Pat1',
      'Pat2',
      'Pat3',
    ]);
  });
});

describe('generateTypes with `only`', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach(removeTempDir));
  const outDir = (): string => {
    const dir = makeTempDir({});
    dirs.push(dir);

    return dir;
  };

  it('writes the closure only, and lists only the generated types in the union', () => {
    const out = outDir();
    const written = generateTypes(definitions, out, { only: ['Patient'] });

    expect(written).toEqual([
      'Element',
      'Identifier',
      'Patient',
      'Period',
      'Reference',
      'ResourceList',
    ]);
    expect(readdirSync(out).sort()).toEqual(
      written.map((name) => `${name}.ts`),
    );
    expect(readFileSync(join(out, 'ResourceList.ts'), 'utf-8')).toBe(
      "import type { Patient } from './Patient';\n\nexport type ResourceList =\n  | Patient;\n",
    );
  });

  it('produces files that compile on their own', () => {
    const out = outDir();

    generateTypes(definitions, out, { only: ['Patient', 'Observation'] });

    expect(typecheckDir(out)).toEqual([]);
    expect(readFileSync(join(out, 'ResourceList.ts'), 'utf-8')).toContain(
      '| Observation',
    );
  });

  it('writes a union with no generated member as never', () => {
    const out = outDir();

    generateTypes(definitions, out, { only: ['ResourceList'] });

    expect(readFileSync(join(out, 'ResourceList.ts'), 'utf-8')).toBe(
      'export type ResourceList = never;\n',
    );
    expect(typecheckDir(out)).toEqual([]);
  });

  it('writes .d.ts files when asked, and they compile', () => {
    const out = outDir();
    const written = generateTypes(definitions, out, {
      only: ['Patient'],
      extension: '.d.ts',
    });

    expect(readdirSync(out).sort()).toEqual(
      written.map((name) => `${name}.d.ts`),
    );
    expect(typecheckDir(out)).toEqual([]);
  });

  it('writes everything, with the full union, without `only`', () => {
    const out = outDir();

    generateTypes(definitions, out);

    expect(readdirSync(out)).toContain('Unrelated.ts');
    expect(readFileSync(join(out, 'ResourceList.ts'), 'utf-8')).toContain(
      '| Observation',
    );
  });

  it('emits an empty union as never', () => {
    expect(emitDefinition({ name: 'U', properties: [], unionOf: [] })).toBe(
      'export type U = never;\n',
    );
  });
});

describe('cleanGeneratedDir', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach(removeTempDir));
  const tmp = (files: Record<string, string>): string => {
    const dir = makeTempDir(files);
    dirs.push(dir);

    return dir;
  };

  it('removes a directory of .ts files', () => {
    const dir = tmp({ 'A.ts': 'a', 'B.ts': 'b' });

    cleanGeneratedDir(dir);

    expect(existsSync(dir)).toBe(false);
  });

  it('does nothing when the directory does not exist', () => {
    const dir = join(tmp({}), 'missing');

    expect(() => cleanGeneratedDir(dir)).not.toThrow();
  });

  it('refuses a directory that holds anything else, and removes nothing', () => {
    const dir = tmp({ 'A.ts': 'a', 'notes.txt': 'keep me' });

    expect(() => cleanGeneratedDir(dir)).toThrow(
      /Refusing to clean .*notes\.txt/,
    );
    expect(readdirSync(dir).sort()).toEqual(['A.ts', 'notes.txt']);
  });

  it('refuses a directory with a subdirectory', () => {
    const dir = tmp({ 'A.ts': 'a' });

    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'sub', 'x.ts'), 'x');

    expect(() => cleanGeneratedDir(dir)).toThrow(/Refusing to clean/);
  });
});

describe('generate with an empty resource list', () => {
  it('fails before reading data or touching any directory', () => {
    expect(() =>
      generate({ version: 'R4', resources: [], out: 'nowhere', clean: true }),
    ).toThrow('No resources given');
  });
});

describe('replaceGeneratedDir', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach(removeTempDir));
  const tmp = (files: Record<string, string> = {}): string => {
    const dir = makeTempDir(files);
    dirs.push(dir);

    return dir;
  };

  it('replaces the directory with what was written', () => {
    const parent = tmp({ 'R4/Old.ts': 'old' });
    const target = join(parent, 'R4');

    const result = replaceGeneratedDir(target, (staging) => {
      mkdirSync(staging);
      writeFileSync(join(staging, 'New.ts'), 'new');

      return 'done';
    });

    expect(result).toBe('done');
    expect(readdirSync(target)).toEqual(['New.ts']);
    expect(readdirSync(parent)).toEqual(['R4']);
  });

  it('works when the directory does not exist yet', () => {
    const target = join(tmp(), 'deeper', 'R4');

    replaceGeneratedDir(target, (staging) => writeFileSync(join(staging), 'x'));
    expect(existsSync(target)).toBe(true);
  });

  it('leaves the old directory untouched, and no staging behind, when writing fails', () => {
    const parent = tmp({ 'R4/Old.ts': 'old' });

    expect(() =>
      replaceGeneratedDir(join(parent, 'R4'), (staging) => {
        mkdirSync(staging);
        writeFileSync(join(staging, 'Half.ts'), 'half');
        throw new Error('disk full');
      }),
    ).toThrow('disk full');

    expect(readdirSync(parent)).toEqual(['R4']);
    expect(readFileSync(join(parent, 'R4', 'Old.ts'), 'utf-8')).toBe('old');
  });

  it('leaves a directory with foreign files untouched, and no staging behind', () => {
    const parent = tmp({ 'R4/A.ts': 'a', 'R4/notes.txt': 'mine' });

    expect(() =>
      replaceGeneratedDir(join(parent, 'R4'), (staging) => mkdirSync(staging)),
    ).toThrow(/Refusing to clean/);

    expect(readdirSync(parent)).toEqual(['R4']);
    expect(readdirSync(join(parent, 'R4')).sort()).toEqual([
      'A.ts',
      'notes.txt',
    ]);
  });
});
