import { lstatSync } from 'node:fs';
import { LIMITS, PlannerError } from '../config.js';
import { indexRepository } from './git-index.js';
import { allowedName, assertSafePath, linesOf, readSafeText } from './safe-reader.js';

function bounded(value: number, maximum: number): number {
  if (!Number.isInteger(value) || value < 1) throw new PlannerError('Limit must be a positive integer');
  return Math.min(value, maximum);
}
const sizeOf = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

export class Repository {
  readonly root: string;
  readonly files: string[];
  readonly limitations = new Set<string>();
  private bytesRead = 0;
  private calls = 0;
  private readonly snapshots = new Map<string, string>();
  private readonly exposed = new Map<string, Map<number, string>>();

  constructor(path: string) {
    const index = indexRepository(path);
    this.root = index.root;
    this.files = index.trackedFiles.filter(file => {
      if (!allowedName(file)) return false;
      try { return lstatSync(assertSafePath(this.root, file)).size <= LIMITS.fileBytes; }
      catch { return false; }
    });
    if (this.files.length < index.trackedFiles.length) this.limitations.add('Some tracked files were excluded by path, type, size or availability checks.');
  }

  private beginCall(): void {
    if (++this.calls > LIMITS.toolCalls) throw new PlannerError('Tool-call budget exhausted');
  }

  private load(file: string): string {
    if (!this.files.includes(file)) throw new PlannerError('File is not in the allowed tracked-file index');
    // Reserve the maximum read before opening: failed reads also consume budget.
    if (this.bytesRead + LIMITS.fileBytes > LIMITS.totalReadBytes) throw new PlannerError('Repository read budget exhausted');
    this.bytesRead += LIMITS.fileBytes;
    const result = readSafeText(this.root, file);
    this.bytesRead -= LIMITS.fileBytes - result.bytes;
    const prior = this.snapshots.get(file);
    if (prior !== undefined && prior !== result.text) throw new PlannerError('Repository changed during investigation; rerun on a stable working tree');
    this.snapshots.set(file, result.text);
    return result.text;
  }

  private record(file: string, line: number, text: string): void {
    const lines = this.exposed.get(file) ?? new Map<number, string>();
    if (!lines.get(line)?.includes(text)) lines.set(line, text);
    this.exposed.set(file, lines);
  }

  listFiles(pattern = '', limit = LIMITS.listEntries as number) {
    this.beginCall();
    if (pattern.length > LIMITS.queryCharacters) throw new PlannerError('Pattern is too long');
    const matches = this.files.filter(file => file.toLowerCase().includes(pattern.toLowerCase()));
    const result = { files: matches.slice(0, bounded(limit, LIMITS.listEntries)), totalMatches: matches.length, truncated: false };
    while (sizeOf(result) > LIMITS.toolBytes) result.files.pop();
    result.truncated = result.files.length < matches.length;
    return result;
  }

  readFile(file: string, startLine = 1, endLine = startLine + LIMITS.readLines - 1) {
    this.beginCall();
    bounded(startLine, Number.MAX_SAFE_INTEGER);
    bounded(endLine, Number.MAX_SAFE_INTEGER);
    if (endLine < startLine) throw new PlannerError('endLine must be at least startLine');
    const lines = linesOf(this.load(file));
    if (startLine > lines.length) throw new PlannerError('Requested line is outside the file');
    const last = Math.min(endLine, startLine + LIMITS.readLines - 1, lines.length);
    const result = { file, startLine, endLine: startLine - 1, numberedContent: '', truncated: false };
    for (let line = startLine; line <= last; line++) {
      const content = lines[line - 1]!;
      const candidate = { ...result, endLine: line, numberedContent: result.numberedContent + `${line}: ${content}\n`, truncated: true };
      if (sizeOf(candidate) > LIMITS.toolBytes) break;
      Object.assign(result, candidate);
      this.record(file, line, content);
    }
    result.truncated = result.endLine < Math.min(endLine, lines.length) || result.endLine < lines.length;
    if (result.endLine < startLine) throw new PlannerError('Line exceeds tool response size limit');
    if (result.truncated) this.limitations.add('Read windows were truncated; unreturned lines were not inspected.');
    return result;
  }

  searchCode(query: string, limit = LIMITS.searchResults as number) {
    this.beginCall();
    if (query.trim().length < 2 || query.length > LIMITS.queryCharacters) throw new PlannerError('Query must contain 2–120 characters');
    const maximum = bounded(limit, LIMITS.searchResults);
    const result = { matches: [] as { file: string; line: number; snippet: string }[], examinedFiles: 0, skippedFiles: 0, truncated: false };
    const initialBytes = this.bytesRead;
    scan: for (const file of this.files) {
      if (result.examinedFiles >= LIMITS.searchFiles || this.bytesRead - initialBytes + LIMITS.fileBytes > LIMITS.searchBytes) { result.truncated = true; break; }
      result.examinedFiles++;
      let text: string;
      try { text = this.load(file); }
      catch (error) {
        if (error instanceof PlannerError && /budget|changed during/.test(error.message)) throw error;
        result.skippedFiles++;
        continue;
      }
      const lines = linesOf(text);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const matchAt = line.toLowerCase().indexOf(query.toLowerCase());
        if (matchAt < 0) continue;
        // Keep a bounded, literal excerpt around the match, even on minified lines.
        const snippet = line.slice(Math.max(0, matchAt - 100), matchAt + 400);
        const match = { file, line: i + 1, snippet };
        if (result.matches.length >= maximum || sizeOf({ ...result, matches: [...result.matches, match] }) > LIMITS.toolBytes - 32) { result.truncated = true; break scan; }
        result.matches.push(match);
        this.record(file, i + 1, snippet);
      }
    }
    if (result.truncated || result.skippedFiles) this.limitations.add('Search coverage was limited by result/read budgets or blocked files; absence of matches does not prove absence of functionality.');
    return result;
  }

  verifyEvidence(file: string, line: number | null, excerpt: string | null, verified: Set<string>): void {
    const seen = this.exposed.get(file);
    if (!seen?.size) throw new PlannerError('Evidence references content not returned by repository tools');
    if (!verified.has(file)) { this.load(file); verified.add(file); }
    if (line !== null && !seen.has(line)) throw new PlannerError('Evidence line was not inspected');
    if (excerpt !== null) {
      if (!excerpt.trim()) throw new PlannerError('Evidence excerpt must not be blank');
      const candidates = line === null ? [...seen.values()] : [seen.get(line)!];
      if (!candidates.some(content => content.includes(excerpt))) throw new PlannerError('Evidence excerpt does not match inspected content');
    }
  }

  get inspectedFiles(): number { return this.exposed.size; }
}
