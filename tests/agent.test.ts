import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Runner, Usage, type Model, type ModelRequest, type ModelResponse } from '@openai/agents';
import { createPlannerAgent } from '../src/agent.js';
import { Repository } from '../src/repository/repository.js';
import { validateReport } from '../src/validation/evidence.js';
import { fixture } from './helpers.js';
import { referenceReport } from './report.js';

test('real SDK loop executes repository tools and validates structured output with an offline scripted model', async t => {
  const f = fixture(); t.after(f.cleanup);
  const repo = new Repository(f.root);
  let calls = 0;
  const model: Model = {
    async getResponse(request: ModelRequest): Promise<ModelResponse> {
      assert.equal(request.modelSettings.store, false);
      assert.equal(request.tracing, false);
      calls++;
      if (calls === 1) return { usage: new Usage(), output: [{ type: 'function_call', callId: 'read-orders', name: 'read_file', arguments: JSON.stringify({ path: 'src/orders/api.ts', startLine: 1, endLine: 24 }) }] };
      assert.match(JSON.stringify(request.input), /orders:read/);
      return { usage: new Usage(), output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(referenceReport()) }] }] };
    },
    async *getStreamedResponse() { throw new Error('Streaming is not used'); },
  };
  const runner = new Runner({ tracingDisabled: true });
  const result = await runner.run(createPlannerAgent(repo, model), 'Export orders', { maxTurns: 3 });
  const report = validateReport(result.finalOutput, repo);
  assert.equal(calls, 2);
  assert.equal(repo.inspectedFiles, 1);
  assert.equal(report.observations[0]?.evidence[0]?.line, 10);
});
