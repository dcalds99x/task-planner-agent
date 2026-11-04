import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { LIMITS, PlannerError } from '../config.js';

const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.txt', '.css', '.scss', '.html', '.yaml', '.yml', '.sql', '.prisma', '.graphql', '.gql', '.py', '.go', '.rs', '.java', '.rb', '.php', '.vue', '.svelte']);
const blockedDirectories = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'vendor', '.next', '.cache', 'reports']);

export function allowedName(file: string): boolean {
  if (!file || isAbsolute(file) || /[\\:\x00-\x1f\x7f]/u.test(file)) return false;
  const parts = file.split('/');
  if (parts.some(part => !part || part === '..' || part === '.' || part.startsWith('.') || blockedDirectories.has(part.toLowerCase()))) return false;
  const name = parts.at(-1)!.toLowerCase();
  if (/secret|credential|private[._-]?key|^id_(rsa|ed25519|ecdsa)|^\.env|\.min\.|\.map$|lock\.json$|lock\.yaml$/i.test(name)) return false;
  return extensions.has(extname(name));
}

export function hasKnownSecret(content: string): boolean {
  return /-----BEGIN (?:[A-Z ]*PRIVATE KEY|CERTIFICATE)-----|\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}|\bAKIA[0-9A-Z]{16}\b|\b(?:api[_-]?key|access[_-]?token|password|client[_-]?secret)\s*["']?\s*[:=]\s*["'][^"'\r\n]{8,}["']/i.test(content);
}

export function assertSafePath(root: string, file: string): string {
  if (!allowedName(file)) throw new PlannerError('File path or type is not allowed');
  const target = resolve(root, file);
  const rel = relative(root, target);
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) throw new PlannerError('Path escapes repository');
  let current = root;
  for (const part of file.split('/')) {
    current = resolve(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new PlannerError('Symlinks are not allowed');
  }
  if (realpathSync(target) !== target) throw new PlannerError('Noncanonical file path is not allowed');
  if (!lstatSync(target).isFile()) throw new PlannerError('Only regular files are allowed');
  return target;
}

export function readSafeText(root: string, file: string): { text: string; bytes: number } {
  let fd: number | undefined;
  try {
    const target = assertSafePath(root, file);
    fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > LIMITS.fileBytes) throw new PlannerError('File exceeds size limit or is not regular');
    const data = Buffer.alloc(LIMITS.fileBytes + 1);
    const bytes = readSync(fd, data, 0, data.length, 0);
    if (bytes > LIMITS.fileBytes) throw new PlannerError('File exceeds size limit');
    assertSafePath(root, file);
    const after = lstatSync(target);
    if (before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new PlannerError('File changed while reading');
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(0, bytes)); }
    catch { throw new PlannerError('File is not UTF-8 text'); }
    if (/[\x00-\x08\x0e-\x1f]/u.test(text)) throw new PlannerError('Binary content is blocked');
    if (hasKnownSecret(text)) throw new PlannerError('File blocked by secret-content screening');
    return { text, bytes };
  } catch (error) {
    if (error instanceof PlannerError) throw error;
    throw new PlannerError('File is unavailable or unsafe');
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function linesOf(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines.length > 1 && lines.at(-1) === '') lines.pop();
  return lines;
}
