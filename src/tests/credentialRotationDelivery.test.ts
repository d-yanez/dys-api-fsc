import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Compiled location is <repo>/dist/tests/, so two levels up is the repo root.
const REPO_ROOT = resolve(__dirname, '..', '..');
const HELPER = join(REPO_ROOT, 'scripts', 'gcp', 'rotate-inbound-key.sh');
const CLOUDBUILD = join(REPO_ROOT, 'cloudbuild.yaml');
const README = join(REPO_ROOT, 'README.md');
const ROTATION_DOC = join(REPO_ROOT, 'docs', 'CREDENTIAL-ROTATION.md');

const OLD_REF = 'projects/dys-erp-prd/secrets/dys-api-fsc-inbound-api-key-old/versions/7';
const NEW_REF = 'projects/dys-erp-prd/secrets/dys-api-fsc-inbound-api-key-new/versions/1';
// Shaped like real key material: it must never be accepted, echoed, or forwarded.
const RAW_KEY_VALUE = 'sk-live-9f8e7d6c5b4a39281706f5e4d3c2b1a0';
const REF_PATTERN = /^projects\/[a-z]([a-z0-9-]*[a-z0-9])?\/secrets\/[A-Za-z0-9_-]+\/versions\/[1-9][0-9]*$/;

const scratchRoot = mkdtempSync(join(tmpdir(), 'fsc-rotation-delivery-'));
const gcloudRecordPath = join(scratchRoot, 'gcloud-argv.txt');
const gcloudBinPath = join(scratchRoot, 'gcloud');

writeFileSync(
  gcloudBinPath,
  ['#!/bin/sh', 'printf \'%s\\n\' "$@" > "$GCLOUD_RECORD"', 'exit "${GCLOUD_EXIT_CODE:-0}"', ''].join('\n'),
  'utf8'
);
chmodSync(gcloudBinPath, 0o755);

test.after(() => {
  rmSync(scratchRoot, { recursive: true, force: true });
});

interface HelperRun {
  status: number | null;
  stdout: string;
  stderr: string;
  argv: string[] | null;
}

function runHelper(args: string[], extraEnv: Record<string, string> = {}): HelperRun {
  if (existsSync(gcloudRecordPath)) {
    unlinkSync(gcloudRecordPath);
  }

  const result = spawnSync('bash', [HELPER, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GCLOUD_BIN: gcloudBinPath,
      GCLOUD_RECORD: gcloudRecordPath,
      ...extraEnv
    }
  });

  const argv = existsSync(gcloudRecordPath)
    ? readFileSync(gcloudRecordPath, 'utf8').split('\n').filter((line) => line.length > 0)
    : null;

  return {
    status: result.status,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
    argv
  };
}

function updateSecretsValue(argv: string[]): string {
  const index = argv.indexOf('--update-secrets');
  assert.notEqual(index, -1, 'expected an --update-secrets flag in argv');
  return argv[index + 1];
}

function baseArgs(phase: string): string[] {
  return [phase, '--service', 'dys-api-fsc', '--region', 'us-central1'];
}

test('rotate puts the outgoing key in API_KEY and the incoming key in API_KEY_SECONDARY', () => {
  const run = runHelper([
    ...baseArgs('rotate'),
    '--primary-ref', OLD_REF,
    '--secondary-ref', NEW_REF
  ]);

  assert.equal(run.status, 0);
  assert.ok(run.argv, 'expected gcloud to be invoked');
  assert.equal(updateSecretsValue(run.argv), `API_KEY=${OLD_REF},API_KEY_SECONDARY=${NEW_REF}`);
  assert.equal(run.argv.includes('--remove-secrets'), false);
});

test('promote swaps both slots in a single atomic update', () => {
  const run = runHelper([
    ...baseArgs('promote'),
    '--primary-ref', NEW_REF,
    '--secondary-ref', OLD_REF
  ]);

  assert.equal(run.status, 0);
  assert.ok(run.argv, 'expected gcloud to be invoked');
  assert.equal(updateSecretsValue(run.argv), `API_KEY=${NEW_REF},API_KEY_SECONDARY=${OLD_REF}`);
  assert.equal(run.argv.filter((arg) => arg === '--update-secrets').length, 1);
  assert.equal(run.argv.includes('--remove-secrets'), false);
});

test('retire updates API_KEY and removes API_KEY_SECONDARY by bare name', () => {
  const run = runHelper([...baseArgs('retire'), '--primary-ref', NEW_REF]);

  assert.equal(run.status, 0);
  assert.ok(run.argv, 'expected gcloud to be invoked');
  assert.equal(updateSecretsValue(run.argv), `API_KEY=${NEW_REF}`);

  const removalIndex = run.argv.indexOf('--remove-secrets');
  assert.notEqual(removalIndex, -1, 'expected an --remove-secrets flag in argv');
  const removed = run.argv[removalIndex + 1];
  assert.equal(removed, 'API_KEY_SECONDARY');
  assert.equal(removed.includes('='), false, 'removals must not carry a value');
  assert.equal(removed.includes('projects/'), false, 'removals must not carry a reference');
});

test('retire rejects a secondary reference so removals stay name-only', () => {
  const run = runHelper([
    ...baseArgs('retire'),
    '--primary-ref', NEW_REF,
    '--secondary-ref', OLD_REF
  ]);

  assert.notEqual(run.status, 0);
  assert.equal(run.argv, null, 'gcloud must not be invoked for an invalid retire');
  assert.match(run.stderr, /retire/);
});

test('rollback keeps both slots populated and never removes a slot', () => {
  const run = runHelper([
    ...baseArgs('rollback'),
    '--primary-ref', OLD_REF,
    '--secondary-ref', NEW_REF
  ]);

  assert.equal(run.status, 0);
  assert.ok(run.argv, 'expected gcloud to be invoked');
  assert.equal(updateSecretsValue(run.argv), `API_KEY=${OLD_REF},API_KEY_SECONDARY=${NEW_REF}`);
  assert.equal(run.argv.includes('--remove-secrets'), false);
});

test('every phase passes only Secret Manager references through argv', () => {
  const phases: Array<[string, string[]]> = [
    ['rotate', [...baseArgs('rotate'), '--primary-ref', OLD_REF, '--secondary-ref', NEW_REF]],
    ['promote', [...baseArgs('promote'), '--primary-ref', NEW_REF, '--secondary-ref', OLD_REF]],
    ['rollback', [...baseArgs('rollback'), '--primary-ref', OLD_REF, '--secondary-ref', NEW_REF]],
    ['retire', [...baseArgs('retire'), '--primary-ref', NEW_REF]]
  ];

  for (const [phase, args] of phases) {
    const run = runHelper(args);
    assert.equal(run.status, 0, `${phase} should succeed`);
    assert.ok(run.argv, `${phase} should invoke gcloud`);

    for (const token of run.argv) {
      assert.notEqual(token, RAW_KEY_VALUE, `${phase} must never forward a key value`);
    }

    for (const assignment of updateSecretsValue(run.argv).split(',')) {
      const [slot, ref] = assignment.split('=');
      assert.match(slot, /^API_KEY(_SECONDARY)?$/, `${phase} slot name`);
      assert.match(ref, REF_PATTERN, `${phase} must forward a Secret Manager reference only`);
    }
  }
});

test('helper enforces the Secret Manager reference boundary', () => {
  const accepted = [
    OLD_REF,
    NEW_REF,
    'projects/abc/secrets/s/versions/1',
    'projects/a1-b2/secrets/s_1-v/versions/42'
  ];
  const rejected = [
    'projects/my-project-/secrets/s/versions/1',
    'projects/-abc/secrets/s/versions/1',
    'projects/abc/secrets/s/versions/0',
    'projects/abc/secrets/s/versions/01',
    'projects/abc/secrets/s/versions/-1',
    'projects/abc/secrets/s/versions/1/extra',
    'projects/abc/secrets/s'
  ];

  for (const ref of accepted) {
    const run = runHelper([...baseArgs('rotate'), '--primary-ref', ref, '--secondary-ref', ref]);

    assert.equal(run.status, 0, `expected ${ref} to be accepted`);
    assert.ok(run.argv, 'expected gcloud to be invoked');
    assert.equal(updateSecretsValue(run.argv), `API_KEY=${ref},API_KEY_SECONDARY=${ref}`);
  }

  for (const ref of rejected) {
    const run = runHelper([...baseArgs('rotate'), '--primary-ref', ref, '--secondary-ref', NEW_REF]);

    assert.notEqual(run.status, 0, `expected ${ref} to be rejected`);
    assert.equal(run.argv, null, 'gcloud must not be invoked for an invalid reference');
    assert.equal(run.stdout.includes(ref), false, 'stdout must not echo the rejected reference');
    assert.equal(run.stderr.includes(ref), false, 'stderr must not echo the rejected reference');
  }

  // Version 0 is rejected in the secondary slot too, not only in the primary one.
  const zeroVersionSecondary = runHelper([
    ...baseArgs('rotate'),
    '--primary-ref', OLD_REF,
    '--secondary-ref', 'projects/abc/secrets/s/versions/0'
  ]);
  assert.notEqual(zeroVersionSecondary.status, 0);
  assert.equal(zeroVersionSecondary.argv, null);
});

test('default build is environment/secret neutral and rotates nothing', () => {
  const cloudbuild = readFileSync(CLOUDBUILD, 'utf8');

  const headers = [...cloudbuild.matchAll(/^ {2}- id: "(.+)"$/gm)].map((match) => ({
    id: match[1],
    index: match.index ?? 0
  }));
  assert.ok(headers.length >= 4, 'expected build, push, deploy, and rotation steps');

  const steps = headers.map((header, position) => ({
    id: header.id,
    body: cloudbuild.slice(
      header.index,
      position + 1 < headers.length ? headers[position + 1].index : cloudbuild.length
    )
  }));

  const deploy = steps.find((step) => step.id === 'Deploy to Cloud Run');
  assert.ok(deploy, 'expected the deploy step');

  // Comments never execute, so flag scanning ignores them.
  const executable = (body: string): string =>
    body
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');

  assert.match(executable(deploy.body), /gcloud run deploy dys-api-fsc/);

  const secretFlags = [
    '--update-secrets',
    '--remove-secrets',
    '--set-secrets',
    '--set-env-vars',
    '--clear-secrets'
  ];

  for (const step of steps) {
    if (step.id === 'Credential rotation (optional)') {
      continue;
    }
    for (const flag of secretFlags) {
      assert.equal(
        executable(step.body).includes(flag),
        false,
        `step '${step.id}' must not reference ${flag}; only the optional rotation step may`
      );
    }
  }

  const rotation = steps.find((step) => step.id === 'Credential rotation (optional)');
  assert.ok(rotation, 'expected the optional rotation step');
  assert.match(executable(rotation.body), /scripts\/gcp\/rotate-inbound-key\.sh/);
  assert.match(executable(rotation.body), /\[ "\$\{_ROTATE_PHASE\}" = "none" \]/);
  assert.match(executable(rotation.body), /exit 0/);

  assert.match(cloudbuild, /_ROTATE_PHASE: "none"/);
});

test('helper fails closed on an unknown phase without invoking gcloud', () => {
  const run = runHelper(baseArgs('destroy'));

  assert.notEqual(run.status, 0);
  assert.equal(run.argv, null);
});

test('helper fails closed on a missing primary reference without invoking gcloud', () => {
  const run = runHelper(baseArgs('rotate'));

  assert.notEqual(run.status, 0);
  assert.equal(run.argv, null);
  assert.match(run.stderr, /--primary-ref/);
});

test('helper rejects a raw key value and never echoes it', () => {
  const run = runHelper([
    ...baseArgs('rotate'),
    '--primary-ref', RAW_KEY_VALUE,
    '--secondary-ref', NEW_REF
  ]);

  assert.notEqual(run.status, 0);
  assert.equal(run.argv, null, 'gcloud must not be invoked with a raw value');
  assert.equal(run.stderr.includes(RAW_KEY_VALUE), false, 'stderr must not echo the value');
  assert.equal(run.stdout.includes(RAW_KEY_VALUE), false, 'stdout must not echo the value');
});

test('helper propagates gcloud failures instead of reporting success', () => {
  const run = runHelper(
    [...baseArgs('rotate'), '--primary-ref', OLD_REF, '--secondary-ref', NEW_REF],
    { GCLOUD_EXIT_CODE: '5' }
  );

  assert.equal(run.status, 5);
  assert.ok(run.argv, 'expected gcloud to be invoked once');
});

test('docs describe the mandatory rotate -> promote -> retire order', () => {
  const expectations: Array<[string, string[]]> = [
    [README, ['1. `rotate`', '2. `promote`', '3. `retire`']],
    [ROTATION_DOC, ['### 1. `rotate`', '### 2. `promote`', '### 3. `retire`']]
  ];

  for (const [path, markers] of expectations) {
    const text = readFileSync(path, 'utf8');
    const positions = markers.map((marker) => text.indexOf(marker));

    for (let index = 0; index < markers.length; index += 1) {
      assert.notEqual(positions[index], -1, `${path} must document ${markers[index]}`);
    }
    assert.ok(positions[0] < positions[1], `${path} must document rotate before promote`);
    assert.ok(positions[1] < positions[2], `${path} must document promote before retire`);
  }

  const readme = readFileSync(README, 'utf8');
  assert.match(readme, /new key into `API_KEY`/, 'retirement must follow promotion of the new key');
});

test('rotation doc keeps rollback dual-slot and forbids values in delivery', () => {
  const doc = readFileSync(ROTATION_DOC, 'utf8');

  assert.match(doc, /never removes a slot/);
  assert.match(doc, /consumer usage of either key is zero/);
  assert.match(doc, /--update-secrets/);
  assert.match(doc, /--remove-secrets/);
  assert.match(doc, /never puts key material in argv, logs, or build artifacts/);
});
