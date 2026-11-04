import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Repository } from '../src/repository/repository.js';
import { validateReport } from '../src/validation/evidence.js';
import { fixture } from './helpers.js';
import { referenceReport } from './report.js';

test('accepts exact evidence returned by tools and adds honest coverage limitations', t => {
  const f = fixture(); t.after(f.cleanup);
  const repo = new Repository(f.root);
  repo.readFile('src/orders/api.ts');
  const report = validateReport(referenceReport(), repo);
  assert.match(report.limitations.join(' '), /does not prove/);
  assert.equal(report.readiness, 'needs_clarification');
});

test('rejects invented, unseen, changed and unsupported evidence', t => {
  const f = fixture(); t.after(f.cleanup);
  const repo = new Repository(f.root);
  assert.throws(() => validateReport(referenceReport(), repo), /investigate/);
  repo.readFile('src/orders/api.ts', 10, 10);
  for (const evidence of [
    { file: 'src/missing.ts', line: 1, excerpt: null },
    { file: 'src/orders/api.ts', line: 999, excerpt: null },
    { file: 'src/orders/api.ts', line: 1, excerpt: null },
    { file: 'src/orders/api.ts', line: 10, excerpt: 'invented text' },
    { file: 'src/orders/api.ts', line: null, excerpt: 'export function listOrders' },
  ]) {
    const report = referenceReport(); report.observations[0]!.evidence = [evidence];
    assert.throws(() => validateReport(report, repo), /Evidence/);
  }
  f.write('src/orders/api.ts', 'changed', false);
  assert.throws(() => validateReport(referenceReport(), repo), /changed/);
});

test('rejects observations without evidence, conflicting readiness, malformed schema and dependency cycles', t => {
  const f = fixture(); t.after(f.cleanup);
  const repo = new Repository(f.root); repo.readFile('src/orders/api.ts');
  const missing = referenceReport(); missing.observations[0]!.evidence = [];
  assert.throws(() => validateReport(missing, repo), /missing evidence/);
  const ready = referenceReport(); ready.readiness = 'ready';
  assert.throws(() => validateReport(ready, repo), /blocking/);
  const cycle = referenceReport(); cycle.implementationPlan[0]!.dependsOnSteps = [2];
  assert.throws(() => validateReport(cycle, repo), /sequential/);
  const escape = referenceReport(); escape.implementationPlan[0]!.proposedFiles = ['../outside.ts'];
  assert.throws(() => validateReport(escape, repo), /unsafe/);
  assert.throws(() => validateReport({}, repo), /schema/);
});

test('search evidence permits exact returned snippets but rejects unseen text on same line', t => {
  const f = fixture(); t.after(f.cleanup);
  f.write('src/long.ts', 'needle ' + 'x'.repeat(1000) + 'unseen-tail');
  const repo = new Repository(f.root);
  repo.searchCode('needle');
  repo.verifyEvidence('src/long.ts', 1, 'needle', new Set());
  assert.throws(() => repo.verifyEvidence('src/long.ts', 1, 'unseen-tail', new Set()), /excerpt/);
});
