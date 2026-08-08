import { SIGNALS, SOURCE_TYPE_QUALITY } from './definitions.js';
import { ScenarioProbabilityError } from './compiler.js';
import { clamp, cleanText } from './math.js';

export function normalizeSignals(inputSignals, profile) {
  if (inputSignals != null && (typeof inputSignals !== 'object' || Array.isArray(inputSignals))) {
    throw new ScenarioProbabilityError('invalid-signals', 'Signals must be an object keyed by signal id.');
  }
  const supplied = inputSignals || {};
  const known = new Set(SIGNALS.map(signal => signal.id));
  const warnings = [];
  const values = [];
  let suppliedCount = 0;

  for (const signal of SIGNALS) {
    const hasSupplied = Object.prototype.hasOwnProperty.call(supplied, signal.id);
    const value = hasSupplied ? Number(supplied[signal.id]) : profile.signals[signal.id];
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new ScenarioProbabilityError('invalid-signal-value', `Signal ${signal.id} must be a number from 0 to 1.`, { signal: signal.id });
    }
    if (hasSupplied) suppliedCount += 1;
    values.push({
      ...signal,
      value,
      provenance: hasSupplied ? 'user-supplied' : profile.configMode,
      logOddsContribution: (value - 0.5) * signal.weight * signal.direction
    });
  }
  for (const key of Object.keys(supplied)) {
    if (!known.has(key)) warnings.push(`Ignored unknown signal: ${key}`);
  }
  return { values, suppliedCount, warnings };
}

function recencyScore(observedAt, now) {
  if (!observedAt) return 0.58;
  const date = new Date(observedAt);
  if (Number.isNaN(date.getTime())) return 0.42;
  const ageYears = Math.max(0, (now.getTime() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return clamp(Math.exp(-ageYears / 5), 0.25, 1);
}

export function normalizeEvidence(items, now) {
  if (items == null) return { accepted: [], suppressed: [], warnings: [] };
  if (!Array.isArray(items)) throw new ScenarioProbabilityError('invalid-evidence', 'Evidence must be an array.');
  if (items.length > 24) throw new ScenarioProbabilityError('too-many-evidence-items', 'At most 24 evidence items are accepted per forecast.');

  const normalized = items.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new ScenarioProbabilityError('invalid-evidence-item', `Evidence item ${index + 1} is invalid.`);
    }
    const title = cleanText(item.title || item.claim || `Evidence item ${index + 1}`, 240);
    const direction = String(item.direction || 'supports').toLowerCase();
    if (!['supports', 'opposes'].includes(direction)) {
      throw new ScenarioProbabilityError('invalid-evidence-direction', 'Evidence direction must be supports or opposes.', { index });
    }
    const sourceType = String(item.sourceType || item.source_type || 'unknown').toLowerCase();
    const sourceDefault = SOURCE_TYPE_QUALITY[sourceType] ?? SOURCE_TYPE_QUALITY.unknown;
    const reliability = clamp(item.reliability ?? sourceDefault, 0, 1);
    const directness = clamp(item.directness ?? sourceDefault, 0, 1);
    const relevance = clamp(item.relevance ?? 0.70, 0, 1);
    const strength = clamp(item.strength ?? 0.60, 0, 1);
    const recency = recencyScore(item.observedAt || item.observed_at, now);
    const quality = clamp((0.32 * reliability) + (0.25 * directness) + (0.25 * relevance) + (0.18 * recency), 0, 1);
    const sign = direction === 'supports' ? 1 : -1;
    const independenceKey = cleanText(item.independenceKey || item.independence_key || title, 160).toLowerCase();
    return {
      index,
      title,
      direction,
      sourceType,
      quality,
      strength,
      recency,
      independenceKey,
      logLikelihood: sign * (0.16 + (1.55 * strength)) * quality
    };
  });

  const strongestByGroup = new Map();
  for (const item of normalized) {
    const current = strongestByGroup.get(item.independenceKey);
    if (!current || Math.abs(item.logLikelihood) > Math.abs(current.logLikelihood)) strongestByGroup.set(item.independenceKey, item);
  }
  const accepted = [...strongestByGroup.values()].sort((left, right) => left.index - right.index);
  const acceptedIndexes = new Set(accepted.map(item => item.index));
  const suppressed = normalized.filter(item => !acceptedIndexes.has(item.index));
  return {
    accepted,
    suppressed,
    warnings: suppressed.length
      ? [`Suppressed ${suppressed.length} dependent evidence item${suppressed.length === 1 ? '' : 's'} from duplicate independence groups.`]
      : []
  };
}
