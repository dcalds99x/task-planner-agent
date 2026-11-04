import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
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
