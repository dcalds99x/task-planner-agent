import { readFileSync } from 'node:fs';
import { Agent, Runner, setTracingDisabled, type Model } from '@openai/agents';
import { LIMITS, PlannerError, requireRemoteAuthorization } from './config.js';
import type { Repository } from './repository/repository.js';
import { hasKnownSecret } from './repository/safe-reader.js';
import { planningReportSchema } from './schemas/planning-report.js';
import { createTools } from './tools/index.js';
import { validateReport } from './validation/evidence.js';

export interface UsageMetrics { requests: number; inputTokens: number; outputTokens: number; totalTokens: number }

export function createPlannerAgent(repository: Repository, model: string | Model | undefined = process.env.OPENAI_MODEL?.trim()) {
  const skillUrl = new URL('../skills/technical-task-planning/SKILL.md', import.meta.url);
  // Source and compiled entry points share the same explicit, project-owned skill.
  const skill = readFileSync(import.meta.url.includes('/dist/src/') ? new URL('../../skills/technical-task-planning/SKILL.md', import.meta.url) : skillUrl, 'utf8');
  return new Agent({
    name: 'Task Planner Agent',
    ...(model ? { model } : {}),
    instructions: skill,
    tools: createTools(repository),
    outputType: planningReportSchema,
    modelSettings: { store: false, parallelToolCalls: false, maxTokens: 12_000 },
  });
}

export async function runTaskPlanner(ticket: string, repository: Repository, allowRemoteModel: boolean, signal?: AbortSignal, onUsage?: (usage: UsageMetrics) => void) {
  requireRemoteAuthorization(allowRemoteModel);
  if (hasKnownSecret(ticket)) throw new PlannerError('Ticket blocked by secret-content screening');
  setTracingDisabled(true);
  const agent = createPlannerAgent(repository);
  const runner = new Runner({ tracingDisabled: true });
  const overview = repository.listFiles('', 50);
  const abort = AbortSignal.timeout(LIMITS.timeoutMs);
  try {
    const result = await runner.run(agent, JSON.stringify({ ticket, repositoryOverview: overview }), {
      maxTurns: LIMITS.turns,
      signal: signal ? AbortSignal.any([signal, abort]) : abort,
    });
    const report = validateReport(result.finalOutput, repository);
    const { requests, inputTokens, outputTokens, totalTokens } = result.state.usage;
    onUsage?.({ requests, inputTokens, outputTokens, totalTokens });
    return report;
  } catch (error) {
    if (error instanceof PlannerError) throw error;
    // SDK errors can contain request data; do not print provider payloads or tool inputs.
    throw new PlannerError('Agent run failed or exceeded limits. Check credentials, model availability and network; no report was published.');
  }
}
