import { openSync, closeSync, fstatSync, readSync } from 'node:fs';
import { LIMITS, PlannerError } from './config.js';

export function readTicket(path: string): string {
  let fd: number | undefined;
  try {
    fd = openSync(path, 'r');
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > LIMITS.ticketBytes) throw new Error();
    const buffer = Buffer.alloc(LIMITS.ticketBytes + 1);
    const count = readSync(fd, buffer, 0, buffer.length, 0);
    if (count > LIMITS.ticketBytes) throw new Error();
    const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, count)).trim();
    if (!content || content.includes('\0')) throw new Error();
    return content;
  } catch {
    throw new PlannerError('Ticket must be a readable, nonempty UTF-8 file of at most 20 KB');
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
