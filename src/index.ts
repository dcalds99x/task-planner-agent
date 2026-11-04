#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { configPath, localEndpoint, PlannerError, readConfig, resolveProfile, saveProfile, validBaseURL, type PlannerProfile } from './config.js';
import { readTicket } from './ticket.js';
import { Repository } from './repository/repository.js';
import type { PlanningReport } from './schemas/planning-report.js';

function repositoryRoot(path: string): string {
  try { return execFileSync('git', ['-C', resolve(path), 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim(); }
  catch { throw new PlannerError('No Git project found here. Run inside a Git repository or pass --repo <path>.'); }
}

function renderReport(report: PlanningReport): string {
  const lines = [`# ${report.goal}`, '', `**Status:** ${report.readiness}`, '', report.ticketSummary, ''];
  if (report.scope.inScope.length) lines.push('## Dentro do escopo', ...report.scope.inScope.map(item => `- ${item}`), '');
  if (report.scope.outOfScope.length) lines.push('## Fora do escopo', ...report.scope.outOfScope.map(item => `- ${item}`), '');
  if (report.observations.length) lines.push('## O que encontrei', ...report.observations.map(item => `- ${item.finding} ${item.evidence.map(e => `(${e.file}${e.line ? `:${e.line}` : ''})`).join(', ')}`), '');
  if (report.openQuestions.length) lines.push('## Perguntas em aberto', ...report.openQuestions.map(item => `- ${item.blocking ? '[Bloqueante] ' : ''}${item.question} — ${item.whyItMatters}`), '');
  if (report.risks.length) lines.push('## Riscos', ...report.risks.map(item => `- **${item.severity}:** ${item.description} Mitigação: ${item.mitigation}`), '');
  lines.push('## Plano de implementação', ...report.implementationPlan.map(step => `${step.step}. **${step.title}** — ${step.rationale}\n   Arquivos: ${step.proposedFiles.join(', ') || 'a definir'}\n   Aceite: ${step.acceptanceChecks.join('; ')}`), '', '## Validação', ...report.validationPlan.map(item => `- ${item}`));
  if (report.limitations.length) lines.push('', '## Limitações', ...report.limitations.map(item => `- ${item}`));
  return lines.join('\n');
}

async function setup(): Promise<void> {
  if (!stdin.isTTY || !stdout.isTTY) throw new PlannerError('Run "plan setup" in an interactive terminal.');
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const name = (await prompt.question('Nome do perfil [default]: ')).trim() || 'default';
    const providerAnswer = (await prompt.question('Provedor: 1) OpenAI  2) endpoint compatível [1]: ')).trim();
    const provider = providerAnswer === '2' ? 'compatible' : providerAnswer === '' || providerAnswer === '1' ? 'openai' : undefined;
    if (!provider) throw new PlannerError('Choose 1 (OpenAI) or 2 (compatible endpoint).');
    const model = (await prompt.question('ID do modelo: ')).trim();
    const apiKeyEnv = (await prompt.question(`Variável de ambiente da chave [${provider === 'openai' ? 'OPENAI_API_KEY' : 'MODEL_API_KEY'}]: `)).trim() || (provider === 'openai' ? 'OPENAI_API_KEY' : 'MODEL_API_KEY');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv)) throw new PlannerError('Invalid environment variable name.');
    let baseURL: string | undefined;
    if (provider === 'compatible') {
      baseURL = (await prompt.question('URL base compatível (ex.: http://localhost:11434/v1): ')).trim();
      if (!validBaseURL(baseURL)) throw new PlannerError('Use HTTPS or localhost HTTP without embedded credentials, query or fragment.');
    }
    if (!model) throw new PlannerError('Model ID cannot be empty.');
    const profile: PlannerProfile = { provider, model, apiKeyEnv, ...(baseURL ? { baseURL } : {}) };
    saveProfile(name, profile);
    console.log(`Perfil "${name}" salvo em ${configPath()}. A chave não foi armazenada; configure $env:${apiKeyEnv} no terminal.`);
  } finally { prompt.close(); }
}

function printHelp(): void {
  console.log(`Task Planner Agent\n\nUso:\n  plan setup                                      Configurar provedor e modelo\n  plan doctor [--repo <pasta>]                    Diagnosticar ambiente e configuração\n  plan <ticket.md> [--repo <pasta>] [opções]      Gerar plano técnico\n\nOpções:\n  --profile <nome>        Usar perfil salvo\n  --model <id>            Substituir modelo para esta execução\n  --dry-run               Prévia offline: ticket e arquivos candidatos\n  --allow-remote-model    Autorizar envio do ticket e trechos ao provedor\n  --json                  Imprimir relatório JSON\n  --repo <pasta>          Projeto Git (padrão: projeto atual)\n  --ticket <arquivo>      Forma explícita equivalente ao argumento posicional\n  --help                  Mostrar ajuda\n\nCompatível com o CLI anterior: --inspect e --format json.`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === 'setup') { await setup(); return; }
  const command = argv[0] === 'doctor' ? 'doctor' : 'plan';
  const valuesArgv = command === 'doctor' ? argv.slice(1) : argv;
  let args;
  let positionals: string[];
  try {
    const parsed = parseArgs({ args: valuesArgv, options: { repo: { type: 'string' }, ticket: { type: 'string' }, format: { type: 'string', default: 'json' }, inspect: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, 'allow-remote-model': { type: 'boolean' }, profile: { type: 'string' }, model: { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean' } }, strict: true, allowPositionals: true });
    args = parsed.values;
    positionals = parsed.positionals;
  } catch { throw new PlannerError('Invalid arguments. Use "plan --help" for usage.'); }
  if (args.help) { printHelp(); return; }
  if (command === 'doctor') {
    const config = readConfig();
    const selected = resolveProfile(typeof args.profile === 'string' ? args.profile : undefined);
    const root = repositoryRoot(typeof args.repo === 'string' ? args.repo : process.cwd());
    const repository = new Repository(root);
    const profile = selected?.profile;
    const keyPresent = !!(profile && (process.env[profile.apiKeyEnv]?.trim() || localEndpoint(profile)));
    const result = { status: keyPresent && repository.files.length ? 'ready' : 'needs_attention', node: process.versions.node, git: 'available', repository: root, indexedFiles: repository.files.length, config: config ? 'valid' : 'not configured', profile: selected?.name ?? null, provider: profile?.provider ?? null, model: profile?.model || null, credential: profile ? (localEndpoint(profile) ? 'not required for local endpoint' : `${profile.apiKeyEnv}: ${keyPresent ? 'available' : 'missing'}`) : 'missing', nextStep: !selected ? 'Run plan setup' : !keyPresent ? `Set ${profile!.apiKeyEnv} in the terminal` : !repository.files.length ? 'Commit source files so Git can index them' : null };
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'ready') process.exitCode = 1;
    return;
  }
  if (!args.repo && !positionals.length && !args.ticket) { printHelp(); return; }
  if (args.format !== 'json') throw new PlannerError('Only --format json is supported');
  const ticketPath = typeof args.ticket === 'string' ? args.ticket : positionals[0];
  if (!ticketPath) throw new PlannerError('Provide a ticket path, e.g. plan ./ticket.md');
  const ticket = readTicket(resolve(ticketPath));
  const root = repositoryRoot(typeof args.repo === 'string' ? args.repo : process.cwd());
  const repository = new Repository(root);
  if (args.inspect || args['dry-run']) {
    const preview = { mode: args.inspect ? 'inspect' : 'offline-preview', ticketCharacters: ticket.length, repository: root, indexedFiles: repository.files.length, sampleFiles: repository.listFiles('', 30).files, limitations: [...repository.limitations], remoteCall: false };
    if (stdout.isTTY && !args.json) console.log(`Prévia offline\nProjeto: ${root}\nTicket: ${ticketPath} (${ticket.length} caracteres)\nArquivos candidatos: ${repository.files.length}\n\n${preview.sampleFiles.map(file => `- ${file}`).join('\n')}\n\nNenhum conteúdo do projeto foi enviado.`);
    else console.log(JSON.stringify(preview, null, 2));
    return;
  }
  const selected = resolveProfile(typeof args.profile === 'string' ? args.profile : undefined);
  let profile = selected?.profile;
  if (!profile && typeof args.model === 'string') profile = { provider: 'openai', model: args.model, apiKeyEnv: 'OPENAI_API_KEY' };
  if (!profile) throw new PlannerError('No model profile configured. Run "plan setup" or set OPENAI_API_KEY.');
  if (typeof args.model === 'string') profile = { ...profile, model: args.model };
  if (profile.provider === 'compatible' && !validBaseURL(profile.baseURL)) throw new PlannerError('The configured compatible provider needs a valid base URL.');
  const { runTaskPlanner } = await import('./agent.js');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    const report = await runTaskPlanner(ticket, repository, args['allow-remote-model'] === true, controller.signal, undefined, profile);
    const json = args.json === true || !stdout.isTTY;
    console.log(json ? JSON.stringify(report, null, 2) : renderReport(report));
  } finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); }
}

main().catch((error: unknown) => {
  console.error(error instanceof PlannerError ? error.message : 'Agent run failed or exceeded limits; no report was published.');
  process.exitCode = 1;
});
