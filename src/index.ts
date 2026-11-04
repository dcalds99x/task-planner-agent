import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { PlannerError, requireRemoteAuthorization } from './config.js';
import { readTicket } from './ticket.js';
import { Repository } from './repository/repository.js';

async function main(): Promise<void> {
  let args;
  try {
    args = parseArgs({ options: { repo: { type: 'string' }, ticket: { type: 'string' }, format: { type: 'string', default: 'json' }, inspect: { type: 'boolean' }, 'allow-remote-model': { type: 'boolean' }, help: { type: 'boolean' } }, strict: true, allowPositionals: false }).values;
  } catch { throw new PlannerError('Invalid arguments. Use --help for usage.'); }
  if (args.help) {
    console.log('Task Planner Agent\nUsage: npm run dev -- --repo <git-root> --ticket <file> [--format json] [--inspect | --allow-remote-model]\n--inspect: offline index only. Remote runs require OPENAI_API_KEY; OPENAI_MODEL is optional.');
    return;
  }
  if (!args.repo || !args.ticket) throw new PlannerError('--repo and --ticket are required');
  if (args.format !== 'json') throw new PlannerError('Only --format json is supported');
  const ticket = readTicket(resolve(args.ticket));
  const repository = new Repository(resolve(args.repo));
  if (args.inspect) {
    console.log(JSON.stringify({ mode: 'inspect', ticketCharacters: ticket.length, indexedFiles: repository.files.length, sampleFiles: repository.listFiles('', 10).files, limitations: [...repository.limitations] }, null, 2));
    return;
  }
  requireRemoteAuthorization(args['allow-remote-model'] === true);
  // The offline path never imports the SDK or creates a provider client.
  const { runTaskPlanner } = await import('./agent.js');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    const report = await runTaskPlanner(ticket, repository, true, controller.signal);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof PlannerError ? error.message : 'Task Planner Agent failed; no report was published.');
  process.exitCode = 1;
});
