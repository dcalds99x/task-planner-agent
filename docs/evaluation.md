# MVP Evaluation

## Available evidence

- Deterministic tests and an SDK run with an offline scripted model.
- Known fixture: page/controller → service → in-memory collection; filters run
  before pagination; permissions are enforced in the service; no export, email,
  or metrics infrastructure is present.
- Human reference in `tests/report.ts`, explicitly identified as manual.
- Remote evaluation has not run: `OPENAI_API_KEY` was missing from the environment.
  LLM quality, actual cost, and remote latency have not been measured.

## Run the evaluation

With an API key configured and authorization to send the fixture:

```powershell
npm run --silent eval -- --allow-remote-model > evaluation.json
```

The script creates and removes its own temporary Git copy. It publishes the
complete JSON only after all three cases pass validation. Progress messages go to
stderr and contain no ticket, key, or code. The final JSON contains the plans and
should be treated as potentially sensitive when evaluating other data.

## Independent expectations for each scenario

| Case | Useful findings and decisions |
|---|---|
| Export | Find `page.ts`, `api.ts`, types, and authorization; clarify all pages versus the visible page; require `orders:export` in the service; reuse filters; validate CSV output, errors, and empty results. |
| Performance | Ask about the metric, volume, environment, scenario, and success criteria; recommend measurement; do not claim a measured bottleneck or invent an improvement percentage; readiness should be `needs_clarification`. |
| Notification | Find the status update; recognize that the inspected context has no notification infrastructure; clarify the event, provider, retries, idempotency, consent, templates, and observability. |

Compare each plan with the human analysis above. A question is useful when its
answer changes scope, architecture, or acceptance, rather than merely sounding
technical.

## Manual rubric (0–2 per criterion)

| Criterion | 0 | 1 | 2 |
|---|---|---|---|
| Grounding | Invented facts | Weak references | Relevant facts are supported |
| Context fit | Generic | Partially adapted | Follows the observed flow |
| Ambiguity detection | Misses gaps | Superficial questions | Identifies scope-changing decisions |
| Dependencies and risks | Omits factors | Generic | Contextualized |
| Actionability | Vague steps | Partial sequence | Executable order and checks |
| Calibration | Unwarranted certainty | Partial caveats | Separates evidence from unknowns |

For each case, record scores, useful questions, accepted or rejected steps,
unsupported claims, semantically weak references, latency, tokens, and cost when
known. The validator prevents publishing structurally invalid references; do not
give a top grounding score only because validation passed.

Product acceptance: at least two useful plans across the three cases; blocking
questions for the ambiguous case; and no invalid evidence published as confirmed.
This criterion remains **pending** until remote evaluation and human review.

## Identified failures, limitations, and next experiment

1. A literal reference can support a snippet without supporting the conclusion.
   Review each finding manually and measure false certainty.
2. Term search may miss indirectly related code. Compare the investigated modules
   with the expected modules above.
3. Secret filters and budgets may exclude necessary context. Record blocked files
   by category without copying sensitive content into logs.
4. Failing on an invalid tool call is conservative and may interrupt a recoverable
   investigation. Measure how often this happens before adding retries.

First candidate improvement: tune directory and term discovery based on real
failures, without adding persistent indexing or an AST prematurely.
