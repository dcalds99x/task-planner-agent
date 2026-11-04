import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'task-planner-test-'));
  cpSync(fileURLToPath(new URL('./fixtures/sample-repo', import.meta.url)), root, { recursive: true });
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe', windowsHide: true });
  git('init', '--quiet');
  git('add', '--all');
  return {
    root, git,
    write(file: string, text: string | Buffer, track = true) {
      const path = join(root, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
      if (track) git('add', '--', file);
    },
    cleanup() { rmSync(root, { recursive: true, force: true }); },
  };
}
