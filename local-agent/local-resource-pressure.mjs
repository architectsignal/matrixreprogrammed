import os from 'node:os';

const BYTES_PER_MB = 1024 * 1024;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function bounded(value, fallback, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, finite(value, fallback)));
}

export function evaluateLocalResourcePressure({
  totalMemoryBytes = os.totalmem(),
  freeMemoryBytes = os.freemem(),
  minimumFreeMemoryMb = 4096,
  minimumFreeMemoryPercent = 25,
  benchmarkReserveMb = 1024,
  clock = () => new Date()
} = {}) {
  const totalMb = Math.max(1, finite(totalMemoryBytes) / BYTES_PER_MB);
  const freeMb = Math.max(0, finite(freeMemoryBytes) / BYTES_PER_MB);
  const freePercent = 100 * freeMb / totalMb;
  const absoluteFloorMb = bounded(minimumFreeMemoryMb, 4096, 256, 1024 * 1024);
  const percentageFloor = bounded(minimumFreeMemoryPercent, 25, 5, 90);
  const requiredFreeMb = Math.min(totalMb, Math.max(absoluteFloorMb, totalMb * percentageFloor / 100));
  const canAcceptLocalJobs = freeMb >= requiredFreeMb;
  const benchmarkFloorMb = Math.min(totalMb, requiredFreeMb + bounded(benchmarkReserveMb, 1024, 0, 64 * 1024));
  const canRunBenchmarks = canAcceptLocalJobs
    && freeMb >= benchmarkFloorMb
    && freePercent >= Math.min(95, percentageFloor + 5);
  const reasons = [];
  if (freeMb < absoluteFloorMb) reasons.push('free-memory-below-absolute-floor');
  if (freePercent < percentageFloor) reasons.push('free-memory-below-percentage-floor');
  if (canAcceptLocalJobs && !canRunBenchmarks) reasons.push('benchmark-reserve-not-available');
  return {
    schema_version: 1,
    assessed_at: clock().toISOString(),
    level: canAcceptLocalJobs ? (canRunBenchmarks ? 'low' : 'medium') : 'high',
    reasons,
    can_accept_local_jobs: canAcceptLocalJobs,
    can_run_benchmarks: canRunBenchmarks,
    external_compute_preferred: !canAcceptLocalJobs,
    total_memory_mb: Math.round(totalMb),
    free_memory_mb: Math.round(freeMb),
    free_memory_percent: Number(freePercent.toFixed(1)),
    thresholds: {
      minimum_free_memory_mb: Math.round(absoluteFloorMb),
      minimum_free_memory_percent: percentageFloor,
      required_free_memory_mb: Math.round(requiredFreeMb),
      benchmark_free_memory_mb: Math.round(benchmarkFloorMb)
    }
  };
}

export function leasePressureEnvelope(pressure = {}) {
  return {
    level: ['low', 'medium', 'high'].includes(pressure.level) ? pressure.level : 'high',
    can_accept_local_jobs: pressure.can_accept_local_jobs === true,
    can_run_benchmarks: pressure.can_run_benchmarks === true,
    external_compute_preferred: pressure.external_compute_preferred === true,
    free_memory_mb: Math.max(0, Math.round(finite(pressure.free_memory_mb))),
    free_memory_percent: Math.max(0, Math.min(100, finite(pressure.free_memory_percent))),
    assessed_at: String(pressure.assessed_at || '').slice(0, 40)
  };
}
