import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixture } from './helpers.js';

test('offline CLI produces JSON and refuses remote execution without authorization or key', t => {
  const f = fixture(); t.after(f.cleanup);
  f.write('ticket.md', 'Export orders', false);
  f.write('.env', 'blocked');
  const base = ['--import', 'tsx', 'src/index.ts', '--repo', f.root, '--ticket', join(f.root, 'ticket.md')];
  const invoke = (...args: string[]) => spawnSync(process.execPath, [...base, ...args], { encoding: 'utf8', env: { ...process.env, OPENAI_API_KEY: '', OPENAI_BASE_URL: 'http://127.0.0.1:1' }, timeout: 20_000, windowsHide: true });
  const inspect = invoke('--inspect');
  assert.equal(inspect.status, 0, inspect.stderr);
  assert.equal(JSON.parse(inspect.stdout).mode, 'inspect');
  assert.ok(!inspect.stdout.includes('.env'));
  assert.equal(inspect.stderr, '');
  const denied = invoke();
  assert.equal(denied.status, 1); assert.equal(denied.stdout, ''); assert.match(denied.stderr, /allow-remote-model/);
  const noKey = invoke('--allow-remote-model');
  assert.equal(noKey.status, 1); assert.equal(noKey.stdout, ''); assert.match(noKey.stderr, /API_KEY/);
  const format = invoke('--format', 'markdown');
  assert.equal(format.status, 1); assert.match(format.stderr, /Only/);
  const unknown = invoke('--unknown');
  assert.equal(unknown.status, 1); assert.match(unknown.stderr, /Invalid arguments/);
});

test('new CLI discovers the current repository and previews a positional ticket offline', t => {
  const f = fixture(); t.after(f.cleanup);
  f.write('ticket.md', 'Add export support', false);
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(join(process.cwd(), 'node_modules/tsx/dist/loader.mjs')).href, join(process.cwd(), 'src/index.ts'), '--dry-run', 'ticket.md'], {
    cwd: f.root, encoding: 'utf8', env: { ...process.env, OPENAI_API_KEY: '', PLANNER_CONFIG: join(f.root, 'missing-config.json') }, timeout: 20_000, windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  const preview = JSON.parse(result.stdout);
  assert.equal(preview.mode, 'offline-preview');
  assert.equal(preview.remoteCall, false);
  assert.equal(preview.ticketCharacters, 'Add export support'.length);
  assert.equal(resolve(preview.repository), resolve(f.root));
  assert.ok(preview.sampleFiles.includes('src/orders/api.ts'));
});
