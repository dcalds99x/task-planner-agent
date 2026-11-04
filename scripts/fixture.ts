import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'task-planner-fixture-'));
  try {
    cpSync(fileURLToPath(new URL('../tests/fixtures/sample-repo', import.meta.url)), root, { recursive: true });
    for (const args of [['init', '--quiet'], ['add', '--all']]) {
      execFileSync('git', ['-C', root, ...args], { stdio: 'pipe', windowsHide: true, timeout: 10_000 });
    }
    return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
