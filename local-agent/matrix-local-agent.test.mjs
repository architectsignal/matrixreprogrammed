import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.MATRIX_LOCAL_AGENT_SHARED_SECRET = 'test-secret-that-is-at-least-thirty-two-characters';
process.env.MATRIX_LOCAL_AGENT_HOST = '127.0.0.1';
process.env.MATRIX_LOCAL_MODEL_ENDPOINT = 'http://127.0.0.1:11434';

const { configuredModelAdmission, executeJob, readOpenAiText, resolveLocalModel, sha256, timingSafeEqual, validatedEvidenceSelection, verifySignature } = await import('./matrix-local-agent.mjs');

assert.equal(sha256('matrix'), crypto.createHash('sha256').update('matrix').digest('hex'));
assert.equal(timingSafeEqual('abc', 'abc'), true);
assert.equal(timingSafeEqual('abc', 'abd'), false);
assert.equal(timingSafeEqual('abc', 'abcd'), false);

const sixteenGbHardware = { total_memory_mb: 16 * 1024, gpus: [] };
assert.equal(configuredModelAdmission({ modelId: 'qwen3-14b', totalMemoryMb: sixteenGbHardware.total_memory_mb }).admitted, false);
assert.equal(configuredModelAdmission({ modelId: 'qwen/qwen3-4b', totalMemoryMb: sixteenGbHardware.total_memory_mb }).admitted, true);
await assert.rejects(
  resolveLocalModel({ payload: { model_id: 'qwen3-14b' } }, {
    configuredModel: { modelId: 'qwen3-14b', modelProtocol: 'openai', modelEndpoint: 'http://127.0.0.1:1234', modelParametersBillion: 14, modelEstimatedVramGb: 9 },
    hardware: sixteenGbHardware
  }),
  /memory-admission gate/
);
assert.equal((await resolveLocalModel({ payload: { model_id: 'qwen\/qwen3-4b' } }, {
  configuredModel: { modelId: 'qwen/qwen3-4b', modelProtocol: 'openai', modelEndpoint: 'http://127.0.0.1:1234', modelParametersBillion: 4, modelEstimatedVramGb: 2.5 },
  hardware: sixteenGbHardware
})).model_id, 'qwen/qwen3-4b');

const result = await executeJob({ job_type: 'deterministic.hash', payload: { value: 'matrix' } });
assert.equal(result.algorithm, 'sha256');
assert.equal(result.digest, sha256('matrix'));
assert.equal(result.bytes, 6);

const investigationContext = {
  investigation_id: 'investigation-local-openai-test',
  question: 'What does the official record establish?',
  evidence_boundary: 'The record establishes its stated publication metadata, not motive or causation.',
  evidence: [{
    evidence_id: 'official-record-1',
    title: 'Official test record',
    establishes: 'The official body published the test record.',
    evidence_boundary: 'Publication does not establish motive.',
    source_route: 'https://example.test/official-record',
    related_entities: ['Official Body']
  }],
  related_routes: []
};
const publicResult = {
  investigation_id: investigationContext.investigation_id,
  question: investigationContext.question,
  answer: 'The official body published the test record.',
  facts: [{ text: 'The official body published the test record.', evidence_ids: ['official-record-1'] }],
  allegations_or_disputed_claims: [],
  inferences: [],
  unknowns: [{ text: 'Motive remains unknown.', evidence_ids: [] }],
  evidence_ids: ['official-record-1'],
  source_routes: ['https://example.test/official-record'],
  confidence: 0.8,
  related_entities: ['Official Body'],
  related_investigations: [],
  evidence_boundary: investigationContext.evidence_boundary
};
let openAiCalled = false;
const localRuntime = {
  resources: [{
    resource_id: 'local-llm-openai-qwen3-14b',
    enabled: true,
    capability_types: ['llm'],
    metadata: { model_id: 'qwen3-14b', protocol: 'openai', endpoint: 'http://127.0.0.1:1234', parameters_billion: 14 }
  }]
};
const localInvestigation = await executeJob({
  job_type: 'llm.generate',
  data_class: 'public',
  payload: { model_id: 'qwen3-14b', max_tokens: 800, selected_resource_id: 'local-llm-openai-qwen3-14b', public_investigation: investigationContext }
}, {
  runtime: localRuntime,
  fetchImpl: async (url, options) => {
    openAiCalled = true;
    assert.equal(String(url), 'http://127.0.0.1:1234/v1/chat/completions');
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, 'qwen3-14b');
    assert.equal(payload.response_format.type, 'text');
    assert.equal(payload.stream, true);
    assert.ok(payload.messages[0].content.endsWith('/no_think'));
    return Response.json({ choices: [{ message: { content: JSON.stringify(publicResult) } }] });
  }
});
assert.equal(openAiCalled, true);
assert.equal(localInvestigation.model_protocol, 'openai');
assert.equal(localInvestigation.public_result.evidence_ids[0], 'official-record-1');
assert.equal(localInvestigation.validation_attempts, 1);
assert.equal(localInvestigation.completion_mode, 'direct-model-synthesis');

let repairCalls = 0;
const repairedInvestigation = await executeJob({
  job_type: 'llm.generate',
  data_class: 'public',
  payload: { model_id: 'qwen3-14b', max_tokens: 800, selected_resource_id: 'local-llm-openai-qwen3-14b', public_investigation: investigationContext }
}, {
  runtime: localRuntime,
  fetchImpl: async () => {
    repairCalls += 1;
    if (repairCalls === 1) return Response.json({ choices: [{ message: { content: JSON.stringify({ ...publicResult, facts: [{ text: 'Uncited fact.', evidence_ids: [] }] }) } }] });
    return Response.json({ choices: [{ message: { content: 'official-record-1' } }] });
  }
});
assert.equal(repairCalls, 2);
assert.equal(repairedInvestigation.validation_attempts, 2);
assert.equal(repairedInvestigation.public_result.facts[0].evidence_ids[0], 'official-record-1');
assert.equal(repairedInvestigation.completion_mode, 'model-rerank-deterministic-synthesis');

let smallModelCalls = 0;
const smallModelInvestigation = await executeJob({
  job_type: 'llm.generate',
  data_class: 'public',
  payload: { model_id: 'qwen/qwen3-4b', selected_resource_id: 'small-model', public_investigation: investigationContext }
}, {
  runtime: { resources: [{ ...localRuntime.resources[0], resource_id: 'small-model', metadata: { ...localRuntime.resources[0].metadata, model_id: 'qwen/qwen3-4b', parameters_billion: 4 } }] },
  fetchImpl: async () => {
    smallModelCalls += 1;
    return Response.json({ choices: [{ message: { content: 'official-record-1' } }] });
  }
});
assert.equal(smallModelCalls, 1, 'small admitted models should perform bounded reranking instead of fragile full-dossier generation');
assert.equal(smallModelInvestigation.completion_mode, 'model-rerank-deterministic-synthesis');
assert.equal(smallModelInvestigation.public_result.evidence_ids[0], 'official-record-1');

const streamed = await readOpenAiText(new Response([
  'data: {"choices":[{"delta":{"content":"{\\"status\\":"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"\\"MATRIX_OK\\"}"}}]}\n\n',
  'data: [DONE]\n\n'
].join(''), { headers: { 'content-type': 'text/event-stream' } }));
assert.equal(streamed.output, '{"status":"MATRIX_OK"}');
assert.equal(validatedEvidenceSelection('official-record-1', investigationContext.evidence), 'official-record-1');
assert.throws(() => validatedEvidenceSelection('official-record-invented', investigationContext.evidence), /exactly one supplied/);

let rerankCalls = 0;
const rerankResult = await executeJob({
  job_type: 'llm.generate',
  data_class: 'public',
  payload: {
    model_id: 'qwen3-14b',
    selected_resource_id: 'local-llm-openai-qwen3-14b',
    public_investigation_operation: 'evidence-rerank',
    public_investigation: { ...investigationContext, evidence: [...investigationContext.evidence, { ...investigationContext.evidence[0], evidence_id: 'official-record-2', title: 'Second official record' }] }
  }
}, {
  runtime: localRuntime,
  fetchImpl: async () => {
    rerankCalls += 1;
    return Response.json({ choices: [{ message: { content: rerankCalls === 1 ? 'not-an-id' : 'official-record-2' } }] });
  }
});
assert.equal(rerankCalls, 2);
assert.equal(rerankResult.public_rerank.selected_evidence_id, 'official-record-2');
assert.equal(rerankResult.public_rerank.validation_attempts, 2);

await assert.rejects(
  executeJob({
    job_type: 'llm.generate', data_class: 'public',
    payload: { model_id: 'unsafe', public_investigation: investigationContext }
  }, { runtime: { resources: [{ resource_id: 'unsafe', enabled: true, capability_types: ['llm'], metadata: { model_id: 'unsafe', protocol: 'openai', endpoint: 'https://attacker.example' } }] } }),
  /loopback-only/
);

await assert.rejects(
  executeJob({ job_type: 'shell.execute', payload: { command: 'whoami' } }),
  /Unsupported job type/
);

const body = JSON.stringify({ job_type: 'deterministic.hash', payload: { value: 'signed' } });
const timestamp = String(Date.now());
const nonce = crypto.randomUUID();
const url = '/v1/jobs/execute';
const canonical = `POST\n${url}\n${timestamp}\n${nonce}\n${sha256(body)}`;
const signature = crypto.createHmac('sha256', process.env.MATRIX_LOCAL_AGENT_SHARED_SECRET).update(canonical).digest('hex');
const request = {
  method: 'POST',
  url,
  headers: {
    'x-matrix-timestamp': timestamp,
    'x-matrix-nonce': nonce,
    'x-matrix-signature': signature
  }
};
assert.deepEqual(verifySignature(request, body), { ok: true });
assert.match(verifySignature(request, body).error, /already been used/);

const tamperedRequest = {
  ...request,
  headers: { ...request.headers, 'x-matrix-nonce': crypto.randomUUID() }
};
assert.match(verifySignature(tamperedRequest, `${body} `).error, /invalid/);

console.log('Matrix local agent tests passed.');
