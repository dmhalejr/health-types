import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { FHIR_VERSIONS } from '../tools/retriever/constants';

const root = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

interface Step {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}
interface Job {
  'timeout-minutes'?: number;
  strategy?: { matrix: Record<string, unknown[]> };
  steps: Step[];
}
interface Workflow {
  name: string;
  on: Record<string, { branches?: string[]; tags?: string[] } | null>;
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
}

const load = (file: string): { text: string; workflow: Workflow } => {
  const text = readFileSync(join(root, '.github', 'workflows', file), 'utf-8');

  return { text, workflow: parse(text) as Workflow };
};

const ci = load('ci.yml');
const examples = load('examples.yml');
const steps = (workflow: Workflow): Step[] =>
  Object.values(workflow.jobs).flatMap((job) => job.steps);
const commands = (workflow: Workflow): string[] =>
  steps(workflow).flatMap((step) => (step.run ? [step.run] : []));
const minimumNode = Number(
  />=\s*(\d+)/.exec(manifest.devEngines.runtime.version)?.[1],
);

describe('CI workflow', () => {
  it('runs on pushes to master and on every pull request', () => {
    expect(ci.workflow.on.push?.branches).toEqual(['master']);
    expect(Object.keys(ci.workflow.on)).toContain('pull_request');
  });

  it('tests on Node 22 and 24, both new enough for the project', () => {
    Object.values(ci.workflow.jobs).forEach((job) => {
      const versions = job.strategy?.matrix.node as number[];

      expect(versions).toEqual([22, 24]);
      versions.forEach((major: number) =>
        expect(major).toBeGreaterThanOrEqual(minimumNode),
      );
    });
  });

  it('checks lint, types and tests, and runs the integration suite on HL7 data', () => {
    expect(commands(ci.workflow)).toEqual(
      expect.arrayContaining([
        'npm run lint:check',
        'npm run type-check',
        'npm test',
        'npm run fetch -- --version all',
        'npm pack --dry-run',
      ]),
    );
  });

  it('downloads the data before the integration tests that need it', () => {
    const run = commands({
      ...ci.workflow,
      jobs: { integration: ci.workflow.jobs.integration },
    });

    expect(run.indexOf('npm run fetch -- --version all')).toBeGreaterThan(
      run.indexOf('npm ci'),
    );
    expect(run.indexOf('npm test')).toBeGreaterThan(
      run.indexOf('npm run fetch -- --version all'),
    );
  });

  it('lints without rewriting files and without tolerating warnings', () => {
    expect(manifest.scripts['lint:check']).toContain('--max-warnings 0');
    expect(manifest.scripts['lint:check']).not.toContain('--fix');
    expect(commands(ci.workflow)).not.toContain('npm run lint');
  });
});

describe('Official examples workflow', () => {
  it('is started by hand or by a version tag, not on every push', () => {
    expect(Object.keys(examples.workflow.on).sort()).toEqual([
      'push',
      'workflow_dispatch',
    ]);
    expect(examples.workflow.on.push?.tags).toEqual(['v*']);
    expect(examples.workflow.on.push?.branches).toBeUndefined();
  });

  it('checks every supported release', () => {
    const matrix = examples.workflow.jobs.examples.strategy?.matrix.version;

    expect(matrix).toEqual([...FHIR_VERSIONS]);
    expect(commands(examples.workflow)).toEqual(
      expect.arrayContaining([
        'npm run fetch -- --version ${{ matrix.version }}',
        'npm run check:examples -- --version ${{ matrix.version }}',
      ]),
    );
  });
});

describe.each([
  ['ci.yml', ci],
  ['examples.yml', examples],
])('%s', (_name, { text, workflow }) => {
  it('only runs npm scripts that exist', () => {
    commands(workflow)
      .flatMap((command) => /^npm run (\S+)/.exec(command)?.[1] ?? [])
      .forEach((script: string) =>
        expect(manifest.scripts, script).toHaveProperty(script),
      );
  });

  it('installs from the lockfile', () => {
    const run = commands(workflow);

    expect(run).toContain('npm ci');
    expect(run.filter((command) => command.startsWith('npm install'))).toEqual(
      [],
    );
  });

  it('has read-only permissions and a timeout on every job', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    Object.entries(workflow.jobs).forEach(([name, job]) =>
      expect(job['timeout-minutes'], name).toBeGreaterThan(0),
    );
  });

  it('pins every action to a major version of an official action', () => {
    steps(workflow)
      .flatMap((step) => step.uses ?? [])
      .forEach((action: string) =>
        expect(action).toMatch(/^actions\/[\w-]+@v\d+$/),
      );
  });

  it('uses no secrets and none of the risky triggers', () => {
    expect(text).not.toMatch(/secrets\./);
    expect(text).not.toMatch(/pull_request_target|workflow_run/);
  });

  it('sets up Node with the npm cache', () => {
    const setup = steps(workflow).filter((step) =>
      step.uses?.startsWith('actions/setup-node'),
    );

    expect(setup.length).toBeGreaterThan(0);
    setup.forEach((step) => expect(step.with?.cache).toBe('npm'));
  });
});
