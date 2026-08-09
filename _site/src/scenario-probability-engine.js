import {
  DEFAULT_MODEL_WEIGHTS,
  ENGINE_VERSION,
  GENERIC_PUBLIC_PROFILE,
  JURISDICTIONS,
  MAX_PROBABILITY,
  MIN_PROBABILITY,
  SIGNALS,
  SURVEILLANCE_THRESHOLD
} from './probability-machine/definitions.js';
import { compileScenario, normalizeNow, ScenarioProbabilityError } from './probability-machine/compiler.js';
import { normalizeEvidence, normalizeSignals } from './probability-machine/evidence.js';
import {
  clamp,
  fnv1a,
  logistic,
  logit,
  round,
  stableStringify,
  weightedMean,
  weightedStdDev
} from './probability-machine/math.js';

function jurisdictionLabel(key) {
  return JURISDICTIONS.find(item => item.key === key)?.label || 'Global / unspecified';
}

function normalizeRuntimeProfile(key, runtimeConfig = {}) {
  const privateProfiles = runtimeConfig.profiles && typeof runtimeConfig.profiles === 'object'
    ? runtimeConfig.profiles
    : {};
  const override = privateProfiles[key] && typeof privateProfiles[key] === 'object'
    ? privateProfiles[key]
    : {};
  const overrideSignals = override.signals && typeof override.signals === 'object' ? override.signals : {};
  const signals = {};
  for (const signal of SIGNALS) {
    signals[signal.id] = clamp(overrideSignals[signal.id] ?? GENERIC_PUBLIC_PROFILE.signals[signal.id], 0, 1);
  }
  const privateMode = Object.keys(override).length > 0;
  return {
    key,
    label: jurisdictionLabel(key),
    tenYearPrior: clamp(override.tenYearPrior ?? GENERIC_PUBLIC_PROFILE.tenYearPrior, 0.03, 0.92),
    profileQuality: clamp(override.profileQuality ?? GENERIC_PUBLIC_PROFILE.profileQuality, 0.05, 0.98),
    trend: clamp(override.trend ?? GENERIC_PUBLIC_PROFILE.trend, -1, 1),
    signals,
    configMode: privateMode ? 'private-runtime' : 'public-generic-seed'
  };
}

function normalizeModelWeights(runtimeConfig = {}) {
  const supplied = runtimeConfig.modelWeights && typeof runtimeConfig.modelWeights === 'object'
    ? runtimeConfig.modelWeights
    : {};
  const raw = {};
  let total = 0;
  for (const [name, defaultWeight] of Object.entries(DEFAULT_MODEL_WEIGHTS)) {
    const value = clamp(supplied[name] ?? defaultWeight, 0, 1);
    raw[name] = value;
    total += value;
  }
  if (total <= 0) return { ...DEFAULT_MODEL_WEIGHTS };
  return Object.fromEntries(Object.entries(raw).map(([name, value]) => [name, value / total]));
}

function horizonAdjustedPrior(tenYearPrior, years) {
  const probability = 1 - ((1 - tenYearPrior) ** (years / 10));
  return clamp(probability, MIN_PROBABILITY, MAX_PROBABILITY);
}

function scoreBand(probability) {
  if (probability < 0.20) return 'LOW';
  if (probability < 0.40) return 'ELEVATED';
  if (probability < 0.60) return 'CONTESTED';
  if (probability < 0.75) return 'HIGH';
  return 'VERY HIGH';
}

function confidenceBand(confidence) {
  if (confidence < 35) return 'LOW';
  if (confidence < 65) return 'MODERATE';
  return 'HIGH';
}

function impactPoints(finalLogit, contribution) {
  return round((logistic(finalLogit) - logistic(finalLogit - contribution)) * 100, 1);
}

function makeForecastId(payload) {
  return `MPE-${fnv1a(stableStringify(payload))}`;
}

export { compileScenario, ScenarioProbabilityError };

export function forecastScenario(input = {}, runtimeConfig = {}) {
  const now = normalizeNow(input.now);
  const compiled = compileScenario(input.question, { now });
  const profile = normalizeRuntimeProfile(compiled.jurisdictionKey, runtimeConfig);
  const signals = normalizeSignals(input.signals, profile);
  const evidence = normalizeEvidence(input.evidence, now);
  const modelWeights = normalizeModelWeights(runtimeConfig);
  const prior = horizonAdjustedPrior(profile.tenYearPrior, compiled.yearsToHorizon);
  const priorLogit = logit(prior);

  const positiveSignals = signals.values.filter(signal => signal.direction > 0);
  const counterSignals = signals.values.filter(signal => signal.direction < 0);
  const trajectoryContribution = weightedMean(
    positiveSignals,
    signal => signal.logOddsContribution,
    signal => signal.weight
  ) * 3;
  const counterweightContribution = weightedMean(
    counterSignals,
    signal => signal.logOddsContribution,
    signal => signal.weight
  ) * 2.5;
  const trend = clamp(input.trend ?? profile.trend, -1, 1);
  const trendContribution = trend * 0.9;
  const evidenceContribution = clamp(
    evidence.accepted.reduce((sum, item) => sum + item.logLikelihood, 0),
    -3.2,
    3.2
  );

  const components = {
    baseRate: prior,
    trajectory: logistic(priorLogit + trajectoryContribution + trendContribution),
    evidence: logistic(priorLogit + evidenceContribution),
    counterweights: logistic(priorLogit + counterweightContribution),
    interaction: logistic(
      priorLogit
      + (trajectoryContribution * 0.65)
      + (evidenceContribution * 0.55)
      + (counterweightContribution * 0.70)
      + (trendContribution * 0.45)
    )
  };

  const componentEntries = Object.entries(components);
  const componentWeights = componentEntries.map(([name]) => modelWeights[name]);
  const ensembleLogit = componentEntries.reduce(
    (sum, [name, probability]) => sum + (modelWeights[name] * logit(probability)),
    0
  );
  const shrinkage = clamp(runtimeConfig.calibrationStrength ?? 0.62, 0.25, 1);
  const calibratedLogit = (ensembleLogit * shrinkage) + (priorLogit * (1 - shrinkage));
  const centralProbability = clamp(logistic(calibratedLogit), MIN_PROBABILITY, MAX_PROBABILITY);
  const disagreement = weightedStdDev(componentEntries.map(([, probability]) => probability), componentWeights);

  const userSignalCoverage = signals.suppliedCount / SIGNALS.length;
  const evidenceQuality = evidence.accepted.length
    ? clamp(evidence.accepted.reduce((sum, item) => sum + item.quality, 0) / Math.max(4, evidence.accepted.length), 0, 1)
    : 0;
  const parseCoverage = ((compiled.jurisdictionExplicit ? 1 : 0.45) + (compiled.horizonExplicit ? 1 : 0.55)) / 2;
  const agreement = clamp(1 - (disagreement / 0.24), 0, 1);
  let confidence = 100 * (
    (0.22 * parseCoverage)
    + (0.24 * Math.max(profile.profileQuality, userSignalCoverage))
    + (0.30 * evidenceQuality)
    + (0.24 * agreement)
  );
  if (profile.configMode !== 'private-runtime' && !signals.suppliedCount && !evidence.accepted.length) {
    confidence = Math.min(confidence, 32);
  } else if (!signals.suppliedCount && !evidence.accepted.length) {
    confidence = Math.min(confidence, 48);
  }
  confidence = round(clamp(confidence, 10, 92));

  const uncertaintyWidth = clamp(0.35 - (confidence / 250) + (disagreement * 0.70), 0.08, 0.40);
  const lower = clamp(centralProbability - (uncertaintyWidth * (0.85 + (centralProbability * 0.25))), 0.01, 0.97);
  const upper = clamp(centralProbability + (uncertaintyWidth * (1.05 - (centralProbability * 0.20))), 0.03, 0.99);

  const contributionItems = [];
  for (const signal of signals.values) {
    const scaled = signal.direction > 0
      ? signal.logOddsContribution * 3 * modelWeights.trajectory * shrinkage
      : signal.logOddsContribution * 2.5 * modelWeights.counterweights * shrinkage;
    contributionItems.push({
      id: signal.id,
      label: signal.label,
      kind: 'signal',
      provenance: signal.provenance,
      contribution: scaled,
      impactPoints: impactPoints(calibratedLogit, scaled)
    });
  }
  for (const item of evidence.accepted) {
    const scaled = item.logLikelihood * modelWeights.evidence * shrinkage;
    contributionItems.push({
      id: `evidence-${item.index + 1}`,
      label: item.title,
      kind: 'evidence',
      provenance: item.sourceType,
      contribution: scaled,
      impactPoints: impactPoints(calibratedLogit, scaled)
    });
  }
  if (Math.abs(trendContribution) > 0.001) {
    const scaled = trendContribution * modelWeights.trajectory * shrinkage;
    contributionItems.push({
      id: 'trajectory-trend',
      label: trend >= 0 ? 'Current trajectory direction' : 'Current reversal direction',
      kind: 'trend',
      provenance: Object.prototype.hasOwnProperty.call(input, 'trend') ? 'user-supplied' : profile.configMode,
      contribution: scaled,
      impactPoints: impactPoints(calibratedLogit, scaled)
    });
  }

  const drivers = contributionItems
    .filter(item => item.contribution > 0.005)
    .sort((left, right) => right.contribution - left.contribution)
    .slice(0, 5)
    .map(({ contribution, ...item }) => item);
  const counterDrivers = contributionItems
    .filter(item => item.contribution < -0.005)
    .sort((left, right) => left.contribution - right.contribution)
    .slice(0, 5)
    .map(({ contribution, ...item }) => item);

  const warnings = [
    ...signals.warnings,
    ...evidence.warnings,
    ...(profile.configMode === 'public-generic-seed'
      ? ['No jurisdiction-specific calibrated profile is loaded. The public fallback is deliberately generic and low-confidence.']
      : []),
    ...(!compiled.jurisdictionExplicit ? ['The jurisdiction is assumed, which materially widens uncertainty.'] : []),
    ...(!compiled.horizonExplicit ? ['The horizon is assumed, which materially widens uncertainty.'] : [])
  ];

  const canonicalInput = {
    engineVersion: ENGINE_VERSION,
    family: compiled.family,
    jurisdictionKey: compiled.jurisdictionKey,
    horizonYear: compiled.horizonYear,
    signals: Object.fromEntries(signals.values.map(signal => [signal.id, signal.value])),
    evidence: evidence.accepted.map(item => ({
      title: item.title,
      direction: item.direction,
      sourceType: item.sourceType,
      quality: round(item.quality, 4),
      strength: round(item.strength, 4),
      independenceKey: item.independenceKey
    })),
    trend,
    configMode: profile.configMode,
    asOfDate: now.toISOString().slice(0, 10)
  };

  return {
    ok: true,
    engineVersion: ENGINE_VERSION,
    forecastRunId: makeForecastId(canonicalInput),
    generatedAt: now.toISOString(),
    modelMode: profile.configMode,
    calibrationStatus: profile.configMode === 'private-runtime'
      ? 'private-runtime-profile-loaded'
      : 'uncalibrated-generic-research-preview',
    scenario: { ...compiled, jurisdiction: profile.label },
    probability: {
      central: round(centralProbability * 100, 1),
      lower: round(lower * 100, 1),
      upper: round(upper * 100, 1),
      band: scoreBand(centralProbability),
      interpretation: 'Estimated chance of the defined threshold event within the stated horizon.'
    },
    confidence: {
      score: confidence,
      band: confidenceBand(confidence),
      interpretation: 'Support for the estimate, based on input coverage, evidence quality and model agreement.'
    },
    modelDisagreement: round(disagreement * 100, 1),
    components: componentEntries.map(([name, probability]) => ({
      name,
      probability: round(probability * 100, 1),
      weight: round(modelWeights[name], 3)
    })),
    drivers,
    counterDrivers,
    inputs: {
      signalCount: signals.values.length,
      userSuppliedSignalCount: signals.suppliedCount,
      acceptedEvidenceCount: evidence.accepted.length,
      suppressedDependentEvidenceCount: evidence.suppressed.length,
      profileQuality: round(profile.profileQuality * 100, 1)
    },
    missingEvidence: [
      'Resolved historical forecasts from the same scenario family and horizon.',
      'Independent jurisdiction-specific observations for all seven signal dimensions.',
      'Documented counterfactual cases where similar infrastructure did not produce threshold crossing.',
      'Outcome calibration data sufficient for reliability curves and Brier-score reporting.'
    ],
    falsificationConditions: [
      'Binding legal constraints materially reduce cross-system data integration or automated enforcement.',
      'Independent audits show practical opt-out, appeal and redress remain effective at population scale.',
      'Major enabling programmes are cancelled, defunded or held unlawful for a sustained period.',
      'The threshold definition is not met for 12 consecutive months by the horizon date.'
    ],
    warnings,
    boundary: 'This is a probabilistic research estimate, not proof of intent, guilt, coordination or inevitability. The percentage is generated by deterministic code; no language model selects it.'
  };
}

export function probabilityMethodology() {
  return {
    engineVersion: ENGINE_VERSION,
    supportedFamilies: [{ id: 'surveillance_state', label: 'Surveillance State' }],
    thresholdRule: `At least 6 of ${SURVEILLANCE_THRESHOLD.length} conditions sustained for 12 consecutive months.`,
    threshold: SURVEILLANCE_THRESHOLD.map(item => ({ id: item.id, label: item.label })),
    signalDimensions: SIGNALS.map(item => ({ id: item.id, label: item.label, direction: item.direction })),
    method: [
      'Compile free text into a measurable jurisdiction, horizon and threshold proposition.',
      'Convert a horizon-adjusted base rate to log odds.',
      'Run independent base-rate, trajectory, evidence, counterweight and interaction components.',
      'Combine components in log-odds space and shrink uncalibrated output toward the base rate.',
      'Measure model disagreement and widen the uncertainty interval when coverage or agreement is weak.',
      'Publish drivers, counter-drivers, missing evidence, falsifiers, model version and deterministic run id.'
    ],
    calibrationMetrics: ['Brier score', 'log loss', 'reliability curve', 'sharpness', 'resolution rate'],
    boundary: 'A forecast percentage is not an evidence grade, a risk-clock pressure score or a statement of fact.'
  };
}

export const scenarioProbabilityEngineVersion = ENGINE_VERSION;
