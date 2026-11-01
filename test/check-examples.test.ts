import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { classify, GENERATOR_CATEGORIES } from '../tools/check-examples';
import { FetchLike } from '../tools/retriever/fetcher';
import {
  examplesUrl,
  extractExamples,
  retrieveExamples,
} from '../tools/retriever/examples';
import { makeTempDir, removeTempDir } from './helpers/tempDir';

describe('classify', () => {
  it.each([
    [
      2353,
      "Object literal may only specify known properties, and '\"_event\"' does not exist in type 'Timing'.",
      'primitive-extension',
      'Timing._event',
    ],
    [
      2353,
      "Object literal may only specify known properties, and '_birthDate' does not exist in type 'Patient | undefined'.",
      'primitive-extension',
      'Patient._birthDate',
    ],
    [
      2353,
      "Type '{ foo: string; }' is not assignable to type 'Patient'. | Object literal may only specify known properties, and 'foo' does not exist in type 'Patient'.",
      'excess-property',
      'Patient.foo',
    ],
    [
      2741,
      "Property 'linkId' is missing in type '{ text: string; }' but required in type 'Questionnaire_Item'.",
      'missing-required',
      'Questionnaire_Item.linkId',
    ],
    [
      2322,
      'Type \'"x"\' is not assignable to type \'"a" | "b"\'.',
      'not-assignable',
      'x -> "a" | "b"',
    ],
    [
      2322,
      "Type 'null' is not assignable to type 'string'.",
      'null-placeholder',
      'null -> string',
    ],
    [
      2590,
      'Expression produces a union type that is too complex to represent.',
      'too-complex',
      'union type too complex',
    ],
    [9999, 'something unexpected', 'other', 'something unexpected'],
  ])(
    'code %i: %s',
    (code: number, message: string, category: string, detail: string) => {
      expect(classify(code, message)).toEqual({ category, detail });
    },
  );

  it("treats only missing fields and compiler limits as not the generator's fault", () => {
    expect(GENERATOR_CATEGORIES).toEqual([
      'primitive-extension',
      'excess-property',
      'not-assignable',
      'other',
    ]);
    expect(GENERATOR_CATEGORIES).not.toContain('missing-required');
    expect(GENERATOR_CATEGORIES).not.toContain('too-complex');
    expect(GENERATOR_CATEGORIES).not.toContain('null-placeholder');
  });
});

describe('official examples download', () => {
  const text = (value: string): Uint8Array => strToU8(value);
  const dirs: string[] = [];
  const tempDataDir = (): string => {
    const dir = makeTempDir({});
    dirs.push(dir);

    return dir;
  };
  const respond = (bytes: Uint8Array): ReturnType<FetchLike> =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: () =>
        Promise.resolve(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer,
        ),
    });

  afterEach(() => dirs.splice(0).forEach(removeTempDir));

  it('extracts only the .json files of the folder that holds the examples', () => {
    const files = extractExamples(
      zipSync({
        'patient-example.json': text('{"resourceType":"Patient"}'),
        'readme.txt': text('no'),
        'nested/other.json': text('{}'),
      }),
    );

    expect(Object.keys(files)).toEqual(['patient-example.json']);
  });

  it('finds the examples under a folder, as in the R4B archive, and ignores macOS metadata', () => {
    const files = extractExamples(
      zipSync({
        'examples-json/a.json': text('{"resourceType":"Patient"}'),
        'examples-json/b.json': text('{"resourceType":"Account"}'),
        '__MACOSX/examples-json/._a.json': text('junk'),
        '__MACOSX/._b.json': text('junk'),
        'readme.json': text('{}'),
      }),
    );

    expect(Object.keys(files).sort()).toEqual(['a.json', 'b.json']);
  });

  it('fails on an archive without examples', () => {
    expect(() =>
      extractExamples(zipSync({ 'readme.txt': text('no') })),
    ).toThrow('Archive contains no .json examples');
  });

  it('stores the examples, then skips them next time, and downloads again with force', async () => {
    const dataDir = tempDataDir();
    const fetchImpl = vi.fn(() =>
      respond(zipSync({ 'a.json': text('{"resourceType":"Patient"}') })),
    );

    const first = await retrieveExamples({ version: 'R4', dataDir, fetchImpl });
    const second = await retrieveExamples({
      version: 'R4',
      dataDir,
      fetchImpl,
    });
    const forced = await retrieveExamples({
      version: 'R4',
      dataDir,
      fetchImpl,
      force: true,
    });

    expect([first.skipped, second.skipped, forced.skipped]).toEqual([
      false,
      true,
      false,
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledWith(examplesUrl('R4'));
    expect(readFileSync(join(first.directory, 'a.json'), 'utf-8')).toBe(
      '{"resourceType":"Patient"}',
    );
  });

  it('leaves nothing behind when the download fails', async () => {
    const dataDir = tempDataDir();
    const fetchImpl: FetchLike = () =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

    await expect(
      retrieveExamples({ version: 'R5', dataDir, fetchImpl }),
    ).rejects.toThrow(
      `Failed to download ${examplesUrl('R5')}: HTTP 404 Not Found`,
    );
    expect(existsSync(join(dataDir, 'R5', 'examples'))).toBe(false);
    expect(
      existsSync(join(dataDir, 'R5')) ? readdirSync(join(dataDir, 'R5')) : [],
    ).toEqual([]);
  });
});
