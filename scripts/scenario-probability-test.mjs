import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const files = [
  'src/scenario-probability-engine.js',
  'src/worker-scenario-probability.js',
  'src/probability-machine/definitions.js',
  'src/probability-machine/math.js',
  'src/probability-machine/compiler.js',
  'src/probability-machine/evidence.js'
];
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-probability-'));
fs.mkdirSync(path.join(temporary, 'probability-machine'), { recursive: true });
fs.writeFileSync(path.join(temporary, 'package.json'), JSON.stringify({ type: 'module' }));
for (const file of files) {
  const target = file.replace(/^src\//, '');
  fs.writeFileSync(path.join(temporary, target), fs.readFileSync(path.join(root, file), 'utf8'));
}

const engine = await import(`${pathToFileURL(path.join(temporary, 'scenario-probability-engine.js')).href}?v=${Date.now()}`);
const workerModule = await import(`${pathToFileURL(path.join(temporary, 'worker-scenario-probability.js')).href}?v=${Date.now()}`);
const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'scenario-registry.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'probability-machine.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'probability-machine.js'), 'utf8');
const productionWrapper = fs.readFileSync(path.join(root, 'src', 'worker-production-autonomy.js'), 'utf8');
const fixedNow = '2026-08-08T12:00:00.000Z';

const baseInput = { question: 'Will France become a surveillance state by 2035?', now: fixedNow };
const first = engine.forecastScenario(baseInput);
const second = engine.forecastScenario(baseInput);
assert.equal(first.forecastRunId, second.forecastRunId, 'same inputs must produce the same run id');
assert.equal(first.probability.central, second.probability.central, 'same inputs must produce the same probability');
assert.equal(first.scenario.jurisdiction, 'France');
assert.equal(first.scenario.horizonYear, 2035);
assert.equal(first.modelMode, 'public-generic-seed');
assert.ok(first.probability.central > 2 && first.probability.central < 98);
assert.ok(first.probability.lower < first.probability.central);
assert.ok(first.probability.upper > first.probability.central);
assert.ok(first.confidence.score <= 32, 'generic seed-only forecast must remain low confidence');
assert.match(first.boundary, /no language model selects it/i);
assert.match(first.warnings.join(' '), /generic and low-confidence/i);

const supporting = engine.forecastScenario({
  ...baseInput,
  evidence: [{
    title: 'Binding nationwide biometric identity law enacted',
    direction: 'supports',
    sourceType: 'legislation',
    strength: 0.95,
    reliability: 0.98,
    directness: 0.98,
    relevance: 0.98,
    observedAt: fixedNow,
    independenceKey: 'law-1'
  }]
});
assert.ok(supporting.probability.central > first.probability.central, 'supporting evidence must raise the estimate');

const opposing = engine.forecastScenario({
  ...baseInput,
  evidence: [{
    title: 'Constitutional court prohibits persistent biometric tracking',
    direction: 'opposes',
    sourceType: 'court',
    strength: 0.95,
    reliability: 0.98,
    directness: 0.98,
    relevance: 0.98,
    observedAt: fixedNow,
    independenceKey: 'court-1'
  }]
});
assert.ok(opposing.probability.central < first.probability.central, 'opposing evidence must lower the estimate');

const duplicate = engine.forecastScenario({
  ...baseInput,
  evidence: [
    { title: 'Wire copy one', direction: 'supports', sourceType: 'media', independenceKey: 'same-wire', strength: 0.7 },
    { title: 'Wire copy two', direction: 'supports', sourceType: 'media', independenceKey: 'same-wire', strength: 0.7 }
  ]
});
assert.equal(duplicate.inputs.acceptedEvidenceCount, 1);
assert.equal(duplicate.inputs.suppressedDependentEvidenceCount, 1);

const privateConfig = {
  calibrationStrength: 0.9,
  profiles: {
    france: {
      tenYearPrior: 0.55,
      profileQuality: 0.88,
      trend: 0.4,
      signals: {
        identity_infrastructure: 0.8,
        observation_infrastructure: 0.8,
        data_integration: 0.8,
        legal_capability: 0.8,
        algorithmic_enforcement: 0.75,
        financial_traceability: 0.7,
        institutional_counterweights: 0.3
      },
      secretNote: 'must-never-leak'
    }
  }
};
const privateForecast = engine.forecastScenario(baseInput, privateConfig);
assert.equal(privateForecast.modelMode, 'private-runtime');
assert.ok(privateForecast.probability.central > first.probability.central);
assert.doesNotMatch(JSON.stringify(privateForecast), /must-never-leak/);

assert.throws(
  () => engine.forecastScenario({ question: 'Will aliens disclose themselves by 2035?', now: fixedNow }),
  error => error.code === 'unsupported-scenario-family'
);
assert.throws(
  () => engine.forecastScenario({ question: 'Surveillance state in France by 2025?', now: fixedNow }),
  error => error.code === 'invalid-horizon'
);

assert.equal(registry.scenarios[0].resolutionRule.minimumConditions, 6);
assert.equal(registry.scenarios[0].conditions.length, 9);
assert.match(html, /id="probability-form"/);
assert.match(html, /probability-machine\.js/);
assert.doesNotMatch(html, /<script>(?!\s*<\/script>)/i, 'page should not contain an inline executable script');
assert.match(client, /\/api\/public\/probability\/forecast/);
assert.match(productionWrapper, /worker-scenario-probability\.js/);
assert.match(productionWrapper, /isScenarioProbabilityRoute\(path\)/);
assert.match(productionWrapper, /cloudflare-worker-scenario-probability/);

const worker = workerModule.default;
const healthResponse = await worker.fetch(new Request('https://matrixreprogrammed.com/api/public/probability/health'), {});
assert.equal(healthResponse.status, 200);
const healthPayload = await healthResponse.json();
assert.equal(healthPayload.ok, true);
assert.equal(healthPayload.externalModelUsed, false);
assert.equal(healthPayload.modelMode, 'public-generic-seed');
assert.equal(healthResponse.headers.get('x-matrix-origin'), 'cloudflare-worker-scenario-probability');

const forecastResponse = await worker.fetch(new Request('https://matrixreprogrammed.com/api/public/probability/forecast', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(baseInput)
}), {});
assert.equal(forecastResponse.status, 200);
const forecastPayload = await forecastResponse.json();
assert.equal(forecastPayload.ok, true);
assert.equal(forecastPayload.scenario.jurisdiction, 'France');

const unsupportedResponse = await worker.fetch(new Request('https://matrixreprogrammed.com/api/public/probability/forecast', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ question: 'Will aliens disclose themselves by 2035?', now: fixedNow })
}), {});
assert.equal(unsupportedResponse.status, 422);

const privateWorkerResponse = await worker.fetch(new Request('https://matrixreprogrammed.com/api/public/probability/forecast', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(baseInput)
}), { PROBABILITY_MODEL_CONFIG_JSON: JSON.stringify(privateConfig) });
const privateWorkerPayload = await privateWorkerResponse.json();
assert.equal(privateWorkerPayload.modelMode, 'private-runtime');
assert.doesNotMatch(JSON.stringify(privateWorkerPayload), /must-never-leak/);

console.log(JSON.stringify({
  ok: true,
  engineVersion: first.engineVersion,
  baseProbability: first.probability.central,
  supportingProbability: supporting.probability.central,
  opposingProbability: opposing.probability.central,
  confidence: first.confidence.score,
  assertions: 34
}, null, 2));
