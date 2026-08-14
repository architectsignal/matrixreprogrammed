import assert from 'node:assert/strict';
import { evaluateLocalResourcePressure, leasePressureEnvelope } from './local-resource-pressure.mjs';

const gib = value => value * 1024 ** 3;
const clock = () => new Date('2026-08-14T12:00:00.000Z');

const constrained = evaluateLocalResourcePressure({
  totalMemoryBytes: gib(16), freeMemoryBytes: gib(2), clock
});
assert.equal(constrained.level, 'high');
assert.equal(constrained.can_accept_local_jobs, false);
assert.equal(constrained.can_run_benchmarks, false);
assert.equal(constrained.external_compute_preferred, true);
assert.ok(constrained.reasons.includes('free-memory-below-absolute-floor'));

const available = evaluateLocalResourcePressure({
  totalMemoryBytes: gib(16), freeMemoryBytes: gib(7), clock
});
assert.equal(available.level, 'low');
assert.equal(available.can_accept_local_jobs, true);
assert.equal(available.can_run_benchmarks, true);
assert.equal(available.external_compute_preferred, false);

const benchmarkDeferred = evaluateLocalResourcePressure({
  totalMemoryBytes: gib(16), freeMemoryBytes: gib(4.5), clock
});
assert.equal(benchmarkDeferred.level, 'medium');
assert.equal(benchmarkDeferred.can_accept_local_jobs, true);
assert.equal(benchmarkDeferred.can_run_benchmarks, false);

const envelope = leasePressureEnvelope({ ...available, secret: 'must-not-survive' });
assert.equal(envelope.can_accept_local_jobs, true);
assert.equal('secret' in envelope, false);
assert.deepEqual(Object.keys(envelope).sort(), [
  'assessed_at', 'can_accept_local_jobs', 'can_run_benchmarks', 'external_compute_preferred',
  'free_memory_mb', 'free_memory_percent', 'level'
].sort());

console.log('Local resource-pressure tests passed: constrained hosts defer work, healthy hosts accept jobs, benchmarks require reserve memory and lease telemetry is allowlisted.');
