import { isAbsolute } from 'node:path';
import { PlannerError } from '../config.js';
import type { Repository } from '../repository/repository.js';
import { planningReportSchema, type PlanningReport } from '../schemas/planning-report.js';

export function validateReport(input: unknown, repository: Repository): PlanningReport {
  const parsed = planningReportSchema.safeParse(input);
  if (!parsed.success) throw new PlannerError('Model report does not satisfy the planning-report schema');
  const report = parsed.data;
  if (!repository.inspectedFiles) throw new PlannerError('Agent did not investigate repository content');
  const verified = new Set<string>();
  for (const observation of report.observations) {
    if (!observation.evidence.length) throw new PlannerError('Observation is missing evidence');
  }
  for (const item of [...report.observations, ...report.dependencies, ...report.risks]) {
    for (const evidence of item.evidence) repository.verifyEvidence(evidence.file, evidence.line, evidence.excerpt, verified);
  }
  if (report.readiness === 'ready' && report.openQuestions.some(question => question.blocking)) throw new PlannerError('Ready report contains blocking questions');
  const priorSteps = new Set<number>();
  for (const step of report.implementationPlan) {
    if (priorSteps.has(step.step) || step.dependsOnSteps.some(id => !priorSteps.has(id)) || step.step !== priorSteps.size + 1) throw new PlannerError('Implementation steps must be sequential with only earlier dependencies');
    if (!step.acceptanceChecks.length) throw new PlannerError('Implementation step has no acceptance checks');
    if (step.proposedFiles.some(file => isAbsolute(file) || /[\\:\x00-\x1f]/u.test(file) || file.split('/').some(part => !part || part === '..' || part === '.'))) throw new PlannerError('Proposed file path is unsafe');
    priorSteps.add(step.step);
  }
  if (!report.implementationPlan.length || !report.validationPlan.length) throw new PlannerError('Report must contain implementation and validation plans');
  report.limitations.push(...repository.limitations,
    'File references and literal excerpts were checked against inspected working-tree content. This does not prove that each interpretation is correct. No project tests or commands were executed by the planner.');
  if (!report.observations.length) report.limitations.push('No evidence-backed observations were produced.');
  report.limitations = [...new Set(report.limitations)];
  return report;
}
