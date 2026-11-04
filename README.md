# Task Planner Agent

A TypeScript CLI that investigates a local Git repository and turns a ticket into
a technical plan with evidence, assumptions, questions, dependencies, risks, and
validation criteria. It outputs JSON; the repository under analysis is read-only.

## Installation

Requires Node.js 22 or later (prefer a supported LTS release), npm, and Git on PATH.

```powershell
npm ci
npm run typecheck
npm test
npm run build
```

## Try it offline

Create a temporary copy of the fixture with its own Git index. The fixture source
is versioned in this project; the script avoids creating a nested `.git` directory.

```powershell
$fixture = (npm run --silent fixture | ConvertFrom-Json).repo
npm run --silent dev -- --repo "$fixture" --ticket ./examples/export-orders.md --inspect
```

`--inspect` validates the ticket, Git root, and allowed names, paths, and sizes
without importing the SDK or making model calls. Binary content and files with
secrets are blocked during reads and searches, so `indexedFiles` counts candidates,
not files whose contents have already been approved. The temporary fixture remains
available for later commands.

## Generate a plan

Set `OPENAI_API_KEY` in your terminal environment. Do not store the key in this
repository. `OPENAI_MODEL` is optional; if omitted, the installed SDK version's
default is used. This project does not load `.env` files automatically.

```powershell
npm run --silent dev -- --repo "$fixture" --ticket ./examples/export-orders.md --allow-remote-model
```

For a real project, set `--repo` to the **root** of the Git working tree and
`--ticket` to a UTF-8 file. Only tracked files are candidates; local changes to
those files are read even if they are uncommitted. A repository with no tracked
files provides no useful context.

Run the compiled version and redirect its output to JSON:

```powershell
node dist/src/index.js --repo "$fixture" --ticket ./examples/export-orders.md --allow-remote-model > plan.json
```

Use `npm run --silent` when redirecting stdout to avoid npm's header. Errors go
to stderr and exit with code 1 without publishing a partial report. `--format json`
is optional; other formats are rejected. `--help` displays usage. Ctrl+C cancels
a remote run.

## Architecture

```text
src/index.ts                    arguments, offline mode, and authorization
src/ticket.ts                   bounded UTF-8 reading
src/repository/git-index.ts     git ls-files without a shell
src/repository/safe-reader.ts   paths, symlinks, file types, secrets, and reading
src/repository/repository.ts    listing/search/windows, budgets, and viewed evidence
src/tools/index.ts              three Agents SDK function tools
src/agent.ts                    single agent, timeout, and structured output
src/schemas/planning-report.ts  Zod contract
src/validation/evidence.ts      limited factual validation and plan consistency
skills/technical-task-planning/ procedure explicitly loaded into the prompt
tests/                          tests and orders fixture
scripts/evaluate.ts             remote evaluation of three tickets
```

The SDK controls the loop; deterministic functions control filesystem access and
validation. Zod validates the structure. Evidence must refer to content returned
by tools: a listed but unread file cannot support a finding. Excerpts must be
literal substrings of a single line, with no whitespace normalization. The
validator rereads cited files and rejects changes made during the investigation.
Reports marked `ready` are rejected if they contain blocking questions or invalid
dependencies between steps.

A single agent, literal search, and progressive context keep the implementation
small and auditable. There is no model shell, ticket implementation, web interface,
external ticket integration, persistent RAG, or multi-agent workflow.

## Security and limits

`--allow-remote-model` declares that you are authorized to send the ticket and
selected excerpts to the provider. Use only code that complies with your
contractual and privacy policies. SDK tracing is disabled globally and in the
runner; calls use `store: false`. This does not guarantee zero provider retention:
your account policies still apply.

Absolute paths, traversal, symlinks/junctions, untracked files, hidden files,
dependencies, build outputs, and types outside the allowlist are blocked. The
reader also rejects binary content, invalid UTF-8, and recognized secret patterns.
Detection is conservative, may produce false positives, and does not detect every
secret. Tickets and repository content are untrusted data, never instructions to
expand permissions. Tool failures stop the run; they do not produce a complete plan.

Limits are centralized in `src/config.ts`:

| Resource | Limit |
|---|---:|
| Ticket | 20 KB |
| File | 100 KB |
| Cumulative reads | 4 MB per run |
| Search | 500 files / 1 MB per call |
| Listing / search results | 100 / 30 |
| Read window | 160 lines |
| Serialized tool response | 20 KB |
| Tool calls / model turns | 80 / 12 |
| Remote run | 180 seconds |

Failed reads also consume the budget. Validation rereads count toward the total
limit. Truncations and excluded files are recorded in the plan's limitations.

## Validation and evaluation

`npm test` covers path isolation, junctions/symlinks, secrets, binary content,
UTF-8, limits, offline CLI behavior, authorization, invented references, changed
content, plan consistency, and the real SDK loop with an **offline scripted model**.
That model verifies integration, not an LLM's reasoning ability.

```powershell
npm run --silent eval -- --allow-remote-model > evaluation.json
```

The command uses a temporary fixture, runs the export, performance, and
notification scenarios, validates evidence, and records latency, coverage, and
token counts when provided by the SDK. It requires an API key and makes billable
calls. Monetary cost is not estimated automatically. See [the rubric and status](docs/evaluation.md).

**Status:** implementation, typecheck, offline tests, and build have been validated.
Evaluation with a live LLM is pending: no API key was configured at handoff. There
is no quality score until the real plans receive human review.

## Known limitations

- Correct references do not prove that the model's interpretation is true. Human
  review is still required before implementing a plan.
- Literal search may miss indirect relationships, aliases, or code in excluded
  file types. No matches do not prove that functionality is absent.
- The working tree is not an immutable snapshot. Checks detect common changes but
  are not a sandbox against a hostile process modifying the filesystem concurrently.
  Use a stable, trusted copy of the project.
- Secret filtering may block legitimate configuration code and does not guarantee
  removal of all sensitive data.
- No quality or time savings have yet been demonstrated on real projects.

Next: run the three scenarios with credentials, review the rubric, and refine
discovery and prompts based on observed errors before expanding the scope.

Integration reference: [OpenAI Agents SDK — Agent definitions](https://developers.openai.com/api/docs/guides/agents/define-agents).
Signatures were also checked against the installed SDK types pinned by the lockfile.
