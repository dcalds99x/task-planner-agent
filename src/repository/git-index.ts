import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { PlannerError } from '../config.js';

export interface RepoIndex { root: string; trackedFiles: string[] }

export function indexRepository(repoPath: string): RepoIndex {
  try {
    const root = realpathSync(repoPath);
    const options = { encoding: 'utf8' as const, timeout: 10_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'] };
    const top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], options).trim();
    if (realpathSync(top) !== root) throw new Error();
    const output = execFileSync('git', ['-C', root, 'ls-files', '--cached', '-z', '--'], options);
    return { root, trackedFiles: [...new Set(output.split('\0').filter(Boolean))].sort() };
  } catch {
    throw new PlannerError('Repository must be the root of a readable Git working tree (Git is required)');
  }
}
