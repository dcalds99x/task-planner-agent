import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export const LIMITS = {
  ticketBytes: 20 * 1024, fileBytes: 100 * 1024, totalReadBytes: 4 * 1024 * 1024,
  searchBytes: 1024 * 1024, searchFiles: 500, toolBytes: 20 * 1024, listEntries: 100,
  searchResults: 30, readLines: 160, queryCharacters: 120, toolCalls: 80, turns: 12, timeoutMs: 180_000,
} as const;

export class PlannerError extends Error {}

export interface PlannerProfile {
  provider: 'openai' | 'compatible';
  model: string;
  apiKeyEnv: string;
  baseURL?: string;
}
interface PlannerConfig { version: 1; defaultProfile: string; profiles: Record<string, PlannerProfile> }

export const configPath = () => process.env.PLANNER_CONFIG?.trim() || join(homedir(), '.task-planner', 'config.json');

export function readConfig(): PlannerConfig | undefined {
  const path = configPath();
  if (!existsSync(path)) return undefined;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as PlannerConfig;
    if (value.version !== 1 || !value.profiles || typeof value.profiles !== 'object' || typeof value.defaultProfile !== 'string') throw new Error();
    for (const profile of Object.values(value.profiles)) {
      if (!['openai', 'compatible'].includes(profile.provider) || !profile.model || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(profile.apiKeyEnv)) throw new Error();
      if (profile.provider === 'compatible' && !validBaseURL(profile.baseURL)) throw new Error();
    }
    return value;
  } catch { throw new PlannerError(`Invalid planner configuration at ${path}`); }
}

export function validBaseURL(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

export function localEndpoint(profile: PlannerProfile): boolean {
  if (profile.provider !== 'compatible' || !profile.baseURL) return false;
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(profile.baseURL).hostname); }
  catch { return false; }
}

export function saveProfile(name: string, profile: PlannerProfile): void {
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(name)) throw new PlannerError('Profile name may contain letters, numbers, hyphens and underscores (up to 40 characters)');
  const current = readConfig() ?? { version: 1 as const, defaultProfile: name, profiles: {} };
  current.profiles[name] = profile;
  current.defaultProfile = name;
  const path = configPath();
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(current, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

export function resolveProfile(name?: string): { name: string; profile: PlannerProfile } | undefined {
  const config = readConfig();
  if (config) {
    const profileName = name ?? config.defaultProfile;
    const profile = config.profiles[profileName];
    if (!profile) throw new PlannerError(`Unknown profile "${profileName}"; run plan setup`);
    return { name: profileName, profile: { ...profile, model: profile.provider === 'openai' ? process.env.OPENAI_MODEL?.trim() || profile.model : profile.model } };
  }
  if (name) throw new PlannerError(`Unknown profile "${name}"; run plan setup`);
  const keyEnv = 'OPENAI_API_KEY';
  return { name: 'environment', profile: { provider: 'openai', model: process.env.OPENAI_MODEL?.trim() || '', apiKeyEnv: keyEnv } };
}

export function requireRemoteAuthorization(allowed: boolean, keyEnv = 'OPENAI_API_KEY', credentialOptional = false): void {
  if (!allowed) throw new PlannerError('Remote model use requires --allow-remote-model');
  if (!credentialOptional && !process.env[keyEnv]?.trim()) throw new PlannerError(`${keyEnv} is required; run plan setup for configuration`);
}
