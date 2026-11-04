import { z } from 'zod';

export const evidenceSchema = z.object({
  file: z.string(), line: z.number().int().positive().nullable(), excerpt: z.string().nullable(),
});
export const planningReportSchema = z.object({
  ticketSummary: z.string(),
  goal: z.string(),
  readiness: z.enum(['ready', 'needs_clarification', 'blocked']),
  scope: z.object({ inScope: z.array(z.string()), outOfScope: z.array(z.string()) }),
  observations: z.array(z.object({ finding: z.string(), evidence: z.array(evidenceSchema) })),
  assumptions: z.array(z.string()),
  openQuestions: z.array(z.object({ question: z.string(), whyItMatters: z.string(), blocking: z.boolean() })),
  dependencies: z.array(z.object({ item: z.string(), kind: z.enum(['code', 'team', 'product', 'external', 'unknown']), evidence: z.array(evidenceSchema) })),
  risks: z.array(z.object({ description: z.string(), severity: z.enum(['low', 'medium', 'high']), mitigation: z.string(), evidence: z.array(evidenceSchema) })),
  implementationPlan: z.array(z.object({ step: z.number().int().positive(), title: z.string(), rationale: z.string(), proposedFiles: z.array(z.string()), dependsOnSteps: z.array(z.number().int().positive()), acceptanceChecks: z.array(z.string()) })),
  validationPlan: z.array(z.string()),
  limitations: z.array(z.string()),
});
export type PlanningReport = z.infer<typeof planningReportSchema>;
