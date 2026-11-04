import { tool } from '@openai/agents';
import { z } from 'zod';
import { LIMITS } from '../config.js';
import type { Repository } from '../repository/repository.js';

export function createTools(repository: Repository) {
  return [
    tool({
      name: 'list_files',
      description: 'List allowed Git-tracked relative paths using an optional literal substring filter. Paths alone are not content evidence.',
      parameters: z.object({ pattern: z.string().max(LIMITS.queryCharacters).nullable(), limit: z.number().int().min(1).max(LIMITS.listEntries) }),
      errorFunction: null,
      execute: ({ pattern, limit }) => repository.listFiles(pattern ?? '', limit),
    }),
    tool({
      name: 'search_code',
      description: 'Search allowed text for a case-insensitive literal query. Returns true line numbers and exact bounded excerpts. Truncated/skipped searches do not prove absence.',
      parameters: z.object({ query: z.string().min(2).max(LIMITS.queryCharacters), limit: z.number().int().min(1).max(LIMITS.searchResults) }),
      errorFunction: null,
      execute: ({ query, limit }) => repository.searchCode(query, limit),
    }),
    tool({
      name: 'read_file',
      description: 'Read a bounded window of an allowed tracked UTF-8 file. Use returned one-based line numbers and exact single-line excerpts as evidence.',
      parameters: z.object({ path: z.string(), startLine: z.number().int().positive(), endLine: z.number().int().positive() }),
      errorFunction: null,
      execute: ({ path, startLine, endLine }) => repository.readFile(path, startLine, endLine),
    }),
  ];
}
