import { existsSync, readdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractDefinitions } from '../tools/retriever/archive';
import { definitionsUrl, FHIR_VERSIONS } from '../tools/retriever/constants';
import { FetchLike, retrieveFHIRSchemas } from '../tools/retriever/fetcher';
import { makeTempDir, removeTempDir } from './helpers/tempDir';

const text = (value: string): Uint8Array => strToU8(value);

const KEPT = {
  'profiles-resources.json': text('{"resources":true}'),
  'profiles-types.json': text('{"types":true}'),
  'valuesets.json': text('{"valuesets":true}'),
};

/** `prefix` is '' for R5-style archives and 'definitions.json/' for R4B-style. */
const buildZip = (
  prefix = '',
  schema: Record<string, Uint8Array> = {
    'fhir.schema.json': text('{"definitions":{}}'),
  },
): Uint8Array =>
  zipSync({
    ...Object.fromEntries(
      Object.entries(KEPT).map(([name, bytes]) => [`${prefix}${name}`, bytes]),
    ),
    [`${prefix}conceptmaps.json`]: text('{"ignored":true}'),
    [`${prefix}fhir.schema.json.zip`]: zipSync(schema),
  });

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

describe('definitionsUrl', () => {
  it.each(FHIR_VERSIONS)('points at hl7.org for %s', (version: string) => {
    expect(definitionsUrl(version as (typeof FHIR_VERSIONS)[number])).toBe(
      `https://hl7.org/fhir/${version}/definitions.json.zip`,
    );
  });
});

describe('extractDefinitions', () => {
  it.each(['', 'definitions.json/'])(
    'finds the files whether the layout prefix is "%s" or not',
    (prefix: string) => {
      const { files, schemaFiles } = extractDefinitions(buildZip(prefix));

      expect(Object.keys(files).sort()).toEqual(Object.keys(KEPT).sort());
      expect(Object.keys(schemaFiles)).toEqual(['fhir.schema.json']);
    },
  );

  it('keeps every per-resource file for STU3-style schema archives', () => {
    const { schemaFiles } = extractDefinitions(
      buildZip('', {
        'Patient.schema.json': text('{}'),
        'Account.schema.json': text('{}'),
      }),
    );

    expect(Object.keys(schemaFiles).sort()).toEqual([
      'Account.schema.json',
      'Patient.schema.json',
    ]);
  });

  it('does not pick up files that are not on the kept list', () => {
    expect(Object.keys(extractDefinitions(buildZip()).files)).not.toContain(
      'conceptmaps.json',
    );
  });

  it('fails when the schema archive is missing', () => {
    expect(() =>
      extractDefinitions(zipSync({ 'valuesets.json': text('{}') })),
    ).toThrow('Archive does not contain fhir.schema.json.zip');
  });

  it('names the kept files that are missing', () => {
    const zip = zipSync({
      'profiles-resources.json': text('{}'),
      'fhir.schema.json.zip': zipSync({ 'fhir.schema.json': text('{}') }),
    });

    expect(() => extractDefinitions(zip)).toThrow(
      'Archive is missing: profiles-types.json, valuesets.json',
    );
  });

  it('refuses entries that would escape the target directory', () => {
    expect(() =>
      extractDefinitions(buildZip('', { '../evil.json': text('{}') })),
    ).toThrow('Refusing unsafe path in archive: "../evil.json"');
  });

  it('refuses Windows-style and absolute paths too', () => {
    ['..\\evil.json', '/etc/evil.json'].forEach((path: string) =>
      expect(() =>
        extractDefinitions(buildZip('', { [path]: text('{}') })),
      ).toThrow('Refusing unsafe path in archive'),
    );
  });

  it('rejects an empty schema archive', () => {
    expect(() => extractDefinitions(buildZip('', {}))).toThrow(
      'fhir.schema.json.zip is empty',
    );
  });
});

describe('retrieveFHIRSchemas', () => {
  const dirs: string[] = [];
  const tempDataDir = (): string => {
    const dir = makeTempDir({});
    dirs.push(dir);

    return dir;
  };

  afterEach(() => dirs.splice(0).forEach(removeTempDir));

  it('stores the schema and kept files for each requested version', async () => {
    const dataDir = tempDataDir();
    const fetchImpl = vi.fn((url: string) =>
      respond(buildZip(url.includes('R4B') ? 'definitions.json/' : '')),
    );

    const results = await retrieveFHIRSchemas({
      versions: ['R4B', 'R5'],
      dataDir,
      fetchImpl,
    });

    expect(results.map((result) => result.skipped)).toEqual([false, false]);
    expect(fetchImpl.mock.calls.map(([url]) => url).sort()).toEqual([
      definitionsUrl('R4B'),
      definitionsUrl('R5'),
    ]);

    ['R4B', 'R5'].forEach((version: string) => {
      expect(
        readFileSync(join(dataDir, version, 'valuesets.json'), 'utf-8'),
      ).toBe('{"valuesets":true}');
      expect(
        existsSync(
          join(dataDir, version, 'fhir.schema.json', 'fhir.schema.json'),
        ),
      ).toBe(true);
    });
  });

  it('skips a version that is already present, and downloads again with force', async () => {
    const dataDir = tempDataDir();
    const fetchImpl = vi.fn(() => respond(buildZip()));

    await retrieveFHIRSchemas({ versions: ['R4'], dataDir, fetchImpl });
    const second = await retrieveFHIRSchemas({
      versions: ['R4'],
      dataDir,
      fetchImpl,
    });

    expect(second[0].skipped).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const forced = await retrieveFHIRSchemas({
      versions: ['R4'],
      dataDir,
      fetchImpl,
      force: true,
    });

    expect(forced[0].skipped).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('downloads again when a previous run left the version incomplete', async () => {
    const dataDir = tempDataDir();
    const fetchImpl = vi.fn(() => respond(buildZip()));

    await retrieveFHIRSchemas({ versions: ['R4'], dataDir, fetchImpl });
    rmSync(join(dataDir, 'R4', 'valuesets.json'));
    await retrieveFHIRSchemas({ versions: ['R4'], dataDir, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(existsSync(join(dataDir, 'R4', 'valuesets.json'))).toBe(true);
  });

  it('reports the URL and status of a failed download and leaves nothing behind', async () => {
    const dataDir = tempDataDir();
    const fetchImpl: FetchLike = () =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

    await expect(
      retrieveFHIRSchemas({ versions: ['R5'], dataDir, fetchImpl }),
    ).rejects.toThrow(
      `Failed to download ${definitionsUrl('R5')}: HTTP 404 Not Found`,
    );
    expect(readdirSync(dataDir)).toEqual([]);
  });

  it('reports the URL when the network is unreachable', async () => {
    const fetchImpl: FetchLike = () => Promise.reject(new Error('ENOTFOUND'));

    await expect(
      retrieveFHIRSchemas({
        versions: ['R4'],
        dataDir: tempDataDir(),
        fetchImpl,
      }),
    ).rejects.toThrow(`Could not reach ${definitionsUrl('R4')}: ENOTFOUND`);
  });

  it('leaves no partial directory when the archive is malformed', async () => {
    const dataDir = tempDataDir();
    const fetchImpl = () => respond(zipSync({ 'valuesets.json': text('{}') }));

    await expect(
      retrieveFHIRSchemas({ versions: ['R4'], dataDir, fetchImpl }),
    ).rejects.toThrow('Archive does not contain fhir.schema.json.zip');
    expect(readdirSync(dataDir)).toEqual([]);
  });

  it('reports progress through the log callback', async () => {
    const messages: string[] = [];

    await retrieveFHIRSchemas({
      versions: ['R4'],
      dataDir: tempDataDir(),
      fetchImpl: () => respond(buildZip()),
      log: (message: string) => messages.push(message),
    });

    expect(messages[0]).toContain(definitionsUrl('R4'));
    expect(messages[messages.length - 1]).toContain('stored in');
  });
});
