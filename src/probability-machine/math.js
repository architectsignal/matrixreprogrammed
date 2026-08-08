export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value)));
}

export function round(value, digits = 0) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

export function logistic(value) {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

export function logit(probability) {
  const bounded = clamp(probability, 0.0001, 0.9999);
  return Math.log(bounded / (1 - bounded));
}

export function cleanText(value, maximum = 600) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableObject(value[key]);
      return result;
    }, {});
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(stableObject(value));
}

export function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value || '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function weightedMean(values, accessor, weightAccessor) {
  let weightedTotal = 0;
  let totalWeight = 0;
  for (const value of values) {
    const weight = weightAccessor(value);
    weightedTotal += accessor(value) * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedTotal / totalWeight : 0;
}

export function weightedStdDev(values, weights) {
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  if (!values.length || totalWeight <= 0) return 0;
  const mean = values.reduce((sum, value, index) => sum + (value * weights[index]), 0) / totalWeight;
  const variance = values.reduce((sum, value, index) => sum + (weights[index] * ((value - mean) ** 2)), 0) / totalWeight;
  return Math.sqrt(Math.max(0, variance));
}
