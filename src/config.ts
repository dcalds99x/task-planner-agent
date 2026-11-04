export const LIMITS = {
  ticketBytes: 20 * 1024,
  fileBytes: 100 * 1024,
  totalReadBytes: 4 * 1024 * 1024,
  searchBytes: 1024 * 1024,
  searchFiles: 500,
  toolBytes: 20 * 1024,
  listEntries: 100,
  searchResults: 30,
  readLines: 160,
  queryCharacters: 120,
  toolCalls: 80,
  turns: 12,
  timeoutMs: 180_000,
} as const;

export class PlannerError extends Error {}

export function requireRemoteAuthorization(allowed: boolean): void {
  if (!allowed) throw new PlannerError('Remote model use requires --allow-remote-model');
  if (!process.env.OPENAI_API_KEY?.trim()) throw new PlannerError('OPENAI_API_KEY is required');
}
