import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createFixture } from './fixture.js';
import { requireRemoteAuthorization, PlannerError } from '../src/config.js';
import { Repository } from '../src/repository/repository.js';
import type { PlanningReport } from '../src/schemas/planning-report.js';
import type { UsageMetrics } from '../src/agent.js';

const cases = [
  { ticket: 'export-orders', review: 'Filters, orders:export authorization, pagination scope, CSV escaping and formula injection.' },
  { ticket: 'orders-performance', review: 'Needs clarification about metrics, environment, volume and success criteria; measurement before optimization.' },
  { ticket: 'order-notification', review: 'External email dependency, event ownership, idempotency, retries, templates and consent.' },
];

async function main() {
  const { values } = parseArgs({ options: { 'allow-remote-model': { type: 'boolean' } }, strict: true });
  requireRemoteAuthorization(values['allow-remote-model'] === true);
  const { runTaskPlanner } = await import('../src/agent.js');
  const fixture = createFixture();
  try {
    const results: { ticket: string; elapsedMs: number; inspectedFiles: number; usage: UsageMetrics | null; manualReview: string; report: PlanningReport }[] = [];
    for (const item of cases) {
      const ticket = readFileSync(new URL(`../examples/${item.ticket}.md`, import.meta.url), 'utf8');
      const repository = new Repository(fixture.root);
      const started = performance.now();
      let usage: UsageMetrics | null = null;
      const report = await runTaskPlanner(ticket, repository, true, undefined, metrics => { usage = metrics; });
      results.push({ ticket: item.ticket, elapsedMs: Math.round(performance.now() - started), inspectedFiles: repository.inspectedFiles, usage, manualReview: item.review, report });
      console.error(`Completed fixture case: ${item.ticket}`);
    }
    console.log(JSON.stringify({ mode: 'live-evaluation', model: process.env.OPENAI_MODEL ?? 'SDK default', results, note: 'References passed deterministic validation. Semantic quality requires manual scoring using docs/evaluation.md; no automatic quality score is claimed.' }, null, 2));
  } finally { fixture.cleanup(); }
}

main().catch((error: unknown) => {
  console.error(error instanceof PlannerError ? error.message : 'Evaluation failed; no complete evaluation was published.');
  process.exitCode = 1;
});
