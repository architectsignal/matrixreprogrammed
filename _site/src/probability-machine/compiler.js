import { JURISDICTIONS, SURVEILLANCE_THRESHOLD } from './definitions.js';
import { cleanText } from './math.js';

export class ScenarioProbabilityError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ScenarioProbabilityError';
    this.code = code;
    this.details = details;
  }
}

export function normalizeNow(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) throw new ScenarioProbabilityError('invalid-now', 'The forecast time is invalid.');
  return date;
}

function detectFamily(question) {
  return /\bsurveillance state\b|\bmass surveillance\b|\bpopulation surveillance\b|\bbiometric surveillance\b|\bdigital police state\b/i.test(question)
    ? 'surveillance_state'
    : '';
}

function detectJurisdiction(question) {
  const found = JURISDICTIONS.find(item => item.pattern.test(question));
  return found
    ? { key: found.key, label: found.label, explicit: true }
    : { key: 'global', label: 'Global / unspecified', explicit: false };
}

function detectHorizon(question, currentYear) {
  const match = question.match(/\b(20[2-9]\d|21\d{2})\b/);
  return match ? { year: Number(match[1]), explicit: true } : { year: currentYear + 10, explicit: false };
}

export function compileScenario(question, options = {}) {
  const text = cleanText(question, 600);
  if (text.length < 8) throw new ScenarioProbabilityError('question-too-short', 'Enter a measurable scenario question.');
  const now = normalizeNow(options.now);
  const currentYear = now.getUTCFullYear();
  const family = detectFamily(text);
  if (!family) {
    throw new ScenarioProbabilityError(
      'unsupported-scenario-family',
      'This release currently supports surveillance-state scenarios only.',
      { supportedFamilies: ['surveillance_state'] }
    );
  }
  const jurisdiction = detectJurisdiction(text);
  const horizon = detectHorizon(text, currentYear);
  if (horizon.year <= currentYear) {
    throw new ScenarioProbabilityError('invalid-horizon', `The horizon must be later than ${currentYear}.`, { horizon: horizon.year });
  }
  if (horizon.year > currentYear + 50) {
    throw new ScenarioProbabilityError('horizon-too-distant', 'The release supports horizons up to 50 years.', { horizon: horizon.year });
  }
  const thresholdCount = 6;
  return {
    family,
    originalQuestion: text,
    jurisdictionKey: jurisdiction.key,
    jurisdiction: jurisdiction.label,
    jurisdictionExplicit: jurisdiction.explicit,
    horizonYear: horizon.year,
    horizonExplicit: horizon.explicit,
    currentYear,
    yearsToHorizon: horizon.year - currentYear,
    thresholdCount,
    thresholdTotal: SURVEILLANCE_THRESHOLD.length,
    proposition: `By 31 December ${horizon.year}, will ${jurisdiction.label} meet at least ${thresholdCount} of the ${SURVEILLANCE_THRESHOLD.length} Matrix Surveillance-State Threshold conditions for 12 consecutive months?`,
    assumptions: [
      jurisdiction.explicit ? 'Jurisdiction was parsed from the question.' : 'No jurisdiction was supplied; a global generic seed is used.',
      horizon.explicit ? 'Forecast horizon was parsed from the question.' : `No horizon was supplied; a ${horizon.year - currentYear}-year horizon is assumed.`,
      'Threshold crossing requires persistent capability and practical use, not merely a pilot, proposal or isolated incident.'
    ],
    threshold: SURVEILLANCE_THRESHOLD.map(item => ({ id: item.id, label: item.label }))
  };
}
