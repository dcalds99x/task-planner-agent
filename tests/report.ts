import type { PlanningReport } from '../src/schemas/planning-report.js';

// Hand-authored reference, never presented as a model-generated evaluation.
export function referenceReport(): PlanningReport {
  return {
    ticketSummary: 'Export filtered orders to CSV',
    goal: 'Share results with authorization',
    readiness: 'needs_clarification',
    scope: { inScope: ['Filtered export with the orders:export permission'], outOfScope: ['Scheduled export'] },
    observations: [{ finding: 'The service requires read permission.', evidence: [{ file: 'src/orders/api.ts', line: 10, excerpt: "requirePermission(session, 'orders:read');" }] }],
    assumptions: ['The CSV should reuse the existing filters.'],
    openQuestions: [{ question: 'Should the export include all pages or only the current page?', whyItMatters: 'Determines the export volume and contract.', blocking: true }],
    dependencies: [{ item: 'Confirm the export scope', kind: 'product', evidence: [] }],
    risks: [{ description: 'Spreadsheet software may interpret cells as formulas.', severity: 'medium', mitigation: 'Define protection against CSV formula injection.', evidence: [] }],
    implementationPlan: [
      { step: 1, title: 'Define the contract and authorization', rationale: 'Volume and permissions constrain the solution.', proposedFiles: ['src/orders/api.ts'], dependsOnSteps: [], acceptanceChecks: ['Pagination scope is defined; the service requires orders:export.'] },
      { step: 2, title: 'Add the export action and CSV generation', rationale: 'Reuse filters and handle empty results and failures.', proposedFiles: ['src/orders/page.ts', 'src/orders/export.ts'], dependsOnSteps: [1], acceptanceChecks: ['Filters and permissions are respected; escaping, Unicode, and formulas are covered.'] },
    ],
    validationPlan: ['Test combined filters, denied authorization, all pages, empty results, and special CSV characters.'],
    limitations: ['Reference report was written manually for deterministic tests.'],
  };
}
