import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lstatSync, mkdirSync, rmdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Repository } from '../src/repository/repository.js';
import { LIMITS } from '../src/config.js';
import { readTicket } from '../src/ticket.js';
import { fixture } from './helpers.js';

test('indexes tracked files only, sorted, and reads current working-tree lines', t => {
  const f = fixture(); t.after(f.cleanup);
  f.write('untracked.ts', 'hidden', false);
  f.write('src/current.ts', 'first\r\nsecond\r\n');
  f.write('src/current.ts', 'changed\r\nsecond\r\n', false);
  const repo = new Repository(f.root);
  assert.ok(!repo.files.includes('untracked.ts'));
  assert.deepEqual(repo.files, [...repo.files].sort());
  assert.equal(repo.readFile('src/current.ts', 2, 2).numberedContent, '2: second\n');
  assert.equal(repo.readFile('src/current.ts', 1, 1).numberedContent, '1: changed\n');
  assert.throws(() => new Repository(join(f.root, 'src')), /root/);
  assert.throws(() => new Repository(join(f.root, 'missing')), /root/);
});

test('rejects traversal, absolute, untracked, secret paths, artifacts and binaries', t => {
  const f = fixture(); t.after(f.cleanup);
  for (const file of ['.env', '.env.local', '.npmrc', 'credentials.json', 'private-key.txt', 'node_modules/foo.ts', 'dist/foo.ts', '.hidden/data.ts', 'key.pem']) f.write(file, 'sensitive');
  f.write('src/binary.ts', Buffer.from([0, 1, 2]));
  f.write('src/token.ts', 'const token = "sk-' + 'a'.repeat(30) + '";');
  const repo = new Repository(f.root);
  for (const file of ['../outside.ts', '/etc/passwd', 'C:/outside.ts', 'src/../README.md', 'src\\orders\\api.ts', '.env', '.env.local', '.npmrc', 'credentials.json', 'private-key.txt', 'node_modules/foo.ts', 'dist/foo.ts', '.hidden/data.ts', 'key.pem', 'src/binary.ts', 'src/token.ts']) assert.throws(() => repo.readFile(file));
  const search = repo.searchCode('sensitive');
  assert.deepEqual(search.matches, []);
  assert.ok(search.skippedFiles >= 2);
});

test('rejects symlink files and intermediate directories, including replacements after indexing', t => {
  const f = fixture(); t.after(f.cleanup);
  f.write('alias/data.ts', 'safe');
  const repo = new Repository(f.root);
  unlinkSync(join(f.root, 'alias/data.ts'));
  try { symlinkSync(join(f.root, 'src/orders/api.ts'), join(f.root, 'alias/data.ts'), 'file'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
    // Windows without symlink privileges: directory junction still tests intermediate links.
    f.write('alias/data.ts', 'safe', false);
  }
  if (lstatSync(join(f.root, 'alias/data.ts')).isSymbolicLink()) assert.throws(() => repo.readFile('alias/data.ts'), /Symlinks/);
  mkdirSync(join(f.root, 'linked'));
  f.write('linked/api.ts', 'safe');
  const second = new Repository(f.root);
  const external = fixture(); t.after(external.cleanup);
  unlinkSync(join(f.root, 'linked/api.ts'));
  rmdirSync(join(f.root, 'linked'));
  symlinkSync(join(external.root, 'src/orders'), join(f.root, 'linked'), 'junction');
  assert.throws(() => second.readFile('linked/api.ts'), /Symlinks/);
});

test('bounds lines, output bytes, search count, file size and repeated tool calls', t => {
  const f = fixture(); t.after(f.cleanup);
  f.write('src/many.ts', Array.from({ length: 400 }, (_, i) => `const match${i} = ${i};`).join('\n'));
  f.write('src/large.ts', 'x'.repeat(LIMITS.fileBytes + 1));
  f.write('src/long.ts', 'x'.repeat(30_000));
  const repo = new Repository(f.root);
  assert.ok(!repo.files.includes('src/large.ts'));
  assert.throws(() => repo.readFile('src/long.ts'), /response size/);
  const read = repo.readFile('src/many.ts', 1, 300);
  assert.equal(read.endLine, LIMITS.readLines);
  assert.equal(read.truncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(read)) <= LIMITS.toolBytes);
  const search = repo.searchCode('match', 999);
  assert.equal(search.matches.length, LIMITS.searchResults);
  assert.equal(search.truncated, true);
  assert.equal(search.matches[0]?.line, 1);
  assert.throws(() => repo.readFile('src/many.ts', 0, 1));
  assert.throws(() => repo.readFile('src/many.ts', 500, 501));
  assert.throws(() => repo.searchCode('x'));
  assert.throws(() => repo.listFiles('', 0));
  for (let i = 0; i < LIMITS.toolCalls; i++) { try { repo.listFiles(); } catch { break; } }
  assert.throws(() => repo.listFiles(), /budget/);
});

test('enforces cumulative byte budget and search-byte coverage', t => {
  const f = fixture(); t.after(f.cleanup);
  for (let i = 0; i < 15; i++) f.write(`src/chunk${i}.ts`, 'needle data\n'.repeat(8_000));
  const repo = new Repository(f.root);
  const result = repo.searchCode('absent');
  assert.equal(result.truncated, true);
  assert.ok(result.examinedFiles < repo.files.length);
  assert.throws(() => { for (let i = 0; i < 60; i++) repo.readFile('src/chunk0.ts', 1, 1); }, /budget/);
  const second = new Repository(f.root);
  assert.throws(() => { for (let i = 0; i < 60; i++) second.searchCode('needle', 1); }, /budget/);
});

test('ticket accepts UTF-8 and rejects empty, oversized, binary, invalid UTF-8 and missing input', t => {
  const f = fixture(); t.after(f.cleanup);
  f.write('ticket.md', '  Export orders — action  ', false);
  assert.equal(readTicket(join(f.root, 'ticket.md')), 'Export orders — action');
  for (const content of ['', ' '.repeat(10), 'x'.repeat(LIMITS.ticketBytes + 1), Buffer.from([0xff]), '\0bad']) {
    f.write('ticket.md', content, false);
    assert.throws(() => readTicket(join(f.root, 'ticket.md')), /Ticket/);
  }
  assert.throws(() => readTicket(join(f.root, 'none')), /Ticket/);
  assert.throws(() => readTicket(f.root), /Ticket/);
});
