export const ENGINE_VERSION = 'matrix-probability-engine/0.1.0';
export const MIN_PROBABILITY = 0.02;
export const MAX_PROBABILITY = 0.98;

export const SURVEILLANCE_THRESHOLD = Object.freeze([
  { id: 'biometric_identity', label: 'Widespread biometric identification', weight: 1.05 },
  { id: 'population_facial_recognition', label: 'Population-scale facial recognition', weight: 1.10 },
  { id: 'universal_digital_identity', label: 'Mandatory or near-universal digital identity', weight: 1.15 },
  { id: 'communications_retention', label: 'Systematic communications metadata retention', weight: 1.00 },
  { id: 'cross_database_profiling', label: 'Automated cross-database citizen profiling', weight: 1.20 },
  { id: 'algorithmic_enforcement', label: 'Large-scale algorithmic policing or risk scoring', weight: 1.10 },
  { id: 'anonymous_payment_erosion', label: 'Material erosion of practical anonymous payment', weight: 0.85 },
  { id: 'movement_monitoring', label: 'Broad automated location or movement monitoring', weight: 1.05 },
  { id: 'legal_system_integration', label: 'Legal power to integrate at least five systems', weight: 1.25 }
].map(Object.freeze));

export const SIGNALS = Object.freeze([
  { id: 'identity_infrastructure', label: 'Identity infrastructure', weight: 1.15, direction: 1 },
  { id: 'observation_infrastructure', label: 'Observation infrastructure', weight: 1.10, direction: 1 },
  { id: 'data_integration', label: 'Cross-system data integration', weight: 1.25, direction: 1 },
  { id: 'legal_capability', label: 'Legal and administrative capability', weight: 1.20, direction: 1 },
  { id: 'algorithmic_enforcement', label: 'Algorithmic enforcement capacity', weight: 1.10, direction: 1 },
  { id: 'financial_traceability', label: 'Financial traceability pressure', weight: 0.85, direction: 1 },
  { id: 'institutional_counterweights', label: 'Courts, rights enforcement and practical redress', weight: 1.20, direction: -1 }
].map(Object.freeze));

export const JURISDICTIONS = Object.freeze([
  { key: 'france', label: 'France', pattern: /\bfrance\b|\bfrench\b/i },
  { key: 'united_kingdom', label: 'United Kingdom', pattern: /\bunited kingdom\b|\bthe uk\b|\bu\.?k\.?\b|\bbritain\b|\bbritish\b/i },
  { key: 'european_union', label: 'European Union', pattern: /\beuropean union\b|\bthe eu\b|\beu-wide\b|\beurope\b|\beuropean\b/i },
  { key: 'united_states', label: 'United States', pattern: /\bunited states\b|\bthe us\b|\bu\.?s\.?a?\.?\b|\bamerica\b|\bamerican\b/i },
  { key: 'canada', label: 'Canada', pattern: /\bcanada\b|\bcanadian\b/i },
  { key: 'australia', label: 'Australia', pattern: /\baustralia\b|\baustralian\b/i }
].map(Object.freeze));

export const GENERIC_PUBLIC_PROFILE = Object.freeze({
  tenYearPrior: 0.25,
  profileQuality: 0.12,
  trend: 0,
  signals: Object.freeze(Object.fromEntries(SIGNALS.map(signal => [signal.id, 0.5])))
});

export const SOURCE_TYPE_QUALITY = Object.freeze({
  legislation: 0.95,
  court: 0.92,
  regulator: 0.85,
  procurement: 0.82,
  official_report: 0.82,
  audited_dataset: 0.80,
  academic_research: 0.78,
  investigative_media: 0.68,
  civil_society: 0.60,
  media: 0.56,
  user_submission: 0.42,
  unknown: 0.45
});

export const DEFAULT_MODEL_WEIGHTS = Object.freeze({
  baseRate: 0.24,
  trajectory: 0.30,
  evidence: 0.20,
  counterweights: 0.14,
  interaction: 0.12
});
