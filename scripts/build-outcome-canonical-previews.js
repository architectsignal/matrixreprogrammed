const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputDir = path.join(root, 'downloads', 'canonical-outcome-preview');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}
function clean(value, fallback = '') {
  return String(value ?? fallback).replace(/\s+/g, ' ').trim();
}
function first(...values) {
  for (const value of values) if (clean(value)) return clean(value);
  return '';
}
function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
}
function unique(values) {
  return [...new Set(list(values).map(value => clean(value)).filter(Boolean))];
}
function iso(value, fallback) {
  const date = new Date(value || fallback || 0);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}
function id(value, fallback) {
  const result = first(value, fallback)
    .replace(/[^A-Za-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
  return result.length >= 3 ? result : `outcome-${fallback}`;
}
function confidence(value) {
  const key = clean(value).toLowerCase().replace(/[\s-]+/g, '_');
  return ({ high: 'high', medium_high: 'medium_high', medium: 'medium', low: 'low', method: 'low' })[key] || 'low';
}
function missionOutcome(value) {
  const hay = clean(value).toLowerCase();
  if (/contradict|weakens|disproves/.test(hay)) return 'contradictory_evidence';
  if (/convergence|interoperab|centraliz|mandatory|coordination/.test(hay)) return 'indirect_support';
  if (/power|authority|control|contract|money|ownership|custody|surveillance|institution|influence|withheld|redaction/.test(hay)) return 'contextual_connection';
  return 'insufficient_evidence';
}
function convergence(value, sourceIds) {
  const hay = clean(value).toLowerCase();
  const definitions = [
    ['political_governance', ['governance', 'treaty', 'global policy', 'supranational']],
    ['monetary_control', ['currency', 'payment', 'central bank', 'gold', 'reserve', 'settlement']],
    ['digital_identity', ['digital identity', 'identity wallet', 'credential']],
    ['surveillance_and_data', ['surveillance', 'data sharing', 'cloud', 'monitoring']],
    ['emergency_power', ['emergency', 'pandemic power']],
    ['information_and_narrative', ['media', 'narrative', 'redaction', 'withheld', 'disclosure']],
    ['corporate_institutional_convergence', ['public-private', 'vendor', 'foundation', 'corporate', 'infrastructure']],
    ['security_architecture', ['security', 'defense', 'military', 'intelligence', 'contractor']],
    ['religious_or_ethical_convergence', ['religion', 'interfaith', 'global ethics']],
    ['legal_and_regulatory_convergence', ['regulation', 'law', 'court', 'standards', 'compliance']]
  ];
  return definitions.flatMap(([vector, terms]) => {
    const matches = terms.filter(term => hay.includes(term));
    if (!matches.length) return [];
    return [{
      vector,
      score: /convergence|centraliz|mandatory|interoperab|coordination/.test(hay) ? 2 : 1,
      rationale: `The scenario references ${matches.slice(0, 3).join(', ')}. This creates a testable convergence route, not proof of unified command or intent.`,
      evidenceBasis: sourceIds,
      confidence: 'very_low',
      coordinationStatus: 'not_shown'
    }];
  });
}
function access(policy) {
  const tiers = policy.tiers || {};
  return {
    minimumTier: 'public',
    publicFields: list(tiers.public?.defaultFields),
    registeredFields: list(tiers.registered?.defaultFields),
    supporterFields: list(tiers.supporter_3?.defaultFields),
    intelligenceFields: list(tiers.intelligence_6?.defaultFields),
    researchProFields: list(tiers.research_pro_9?.defaultFields),
    emailVisibility: ['registered', 'supporter_3', 'intelligence_6', 'research_pro_9'],
    dashboardVisibility: ['registered', 'supporter_3', 'intelligence_6', 'research_pro_9'],
    downloadPermissions: [
      { format: 'html', minimumTier: 'public' },
      { format: 'pdf', minimumTier: 'supporter_3' },
      { format: 'json', minimumTier: 'research_pro_9' }
    ],
    embargoUntil: null
  };
}
function entities(values, sourceIds) {
  return unique(values).map(name => ({
    id: id(name, 'entity'),
    name,
    entityType: 'other',
    role: 'Named research target or implementation route in the scenario',
    sourceIds,
    associationBoundary: 'Inclusion identifies a research route only. It does not establish wrongdoing, control or coordinated intent.'
  }));
}
function mapBriefing(item, index, data, policy) {
  const recordId = id(item.id, `outcome-${index + 1}`);
  const sourceId = `${recordId}-source`;
  const sourceIds = [sourceId];
  const boundary = first(data.boundary, 'Outcome briefings are evidence-graded scenario analyses generated from repository feeds.');
  const records = unique(item.records);
  const watch = unique(item.watch);
  const institutions = unique(item.institutions);
  const combined = `${item.situation || ''} ${item.meaning || ''} ${item.likely || ''}`;
  const vectors = convergence(combined, sourceIds);
  const scenarioConfidence = confidence(item.confidence);

  return {
    schemaVersion: '1.0.0',
    id: recordId,
    recordType: 'scenario',
    title: first(item.headline, item.title, `Outcome briefing ${index + 1}`),
    summary: first(item.situation, item.meaning),
    slug: null,
    status: 'review',
    trigger: {
      description: `The Outcome Briefings engine generated or refreshed the ${first(item.section, 'current')} scenario lane.`,
      detectedAt: iso(data.updated),
      eventDate: iso(data.updated).slice(0, 10),
      changeType: 'new_record'
    },
    sources: [{
      id: sourceId,
      title: first(item.headline, 'Outcome Briefings scenario'),
      sourceType: 'other',
      url: 'https://matrixreprogrammed.com/data/outcome-briefings.json',
      publisher: 'Matrix Reprogrammed Outcome Briefings engine',
      publishedAt: iso(data.updated),
      retrievedAt: iso(data.updated),
      authority: 'lead_only',
      status: 'live',
      hash: null,
      archivePath: 'data/outcome-briefings.json',
      notes: boundary
    }],
    recordStatus: ['analysis'],
    establishedFacts: [{
      statement: `The internal Outcome Briefings engine generated this scenario statement: ${first(item.situation, item.headline)}`,
      sourceIds,
      boundary: 'This establishes what the internal scenario output states. It does not independently establish the external scenario as fact.',
      factStatus: 'documented'
    }],
    entities: entities(institutions, sourceIds),
    moneyAndAuthority: [],
    mechanismOfPower: {
      description: first(item.meaning, 'The proposed mechanism must be established from the named records and institutions.'),
      authorityHolder: institutions.length ? institutions : ['Authority holder must be established from primary records'],
      implementationRoute: records.length ? records : ['Implementation route must be established from primary records'],
      affectedGroups: [],
      evidenceBasis: sourceIds,
      limitation: boundary
    },
    solidConclusion: {
      text: first(item.meaning, 'The scenario identifies a research route that requires primary records before a wider conclusion is made.'),
      scope: 'scenario-analysis synthesis',
      confidence: scenarioConfidence,
      sourceIds,
      boundary
    },
    missionAssessment: {
      outcome: missionOutcome(combined),
      missionRelevance: first(item.meaning, 'The scenario is relevant only where a documented authority, money, access, data or implementation route can be established.'),
      eliteControlRelevance: 'The scenario is relevant only where named institutions can be tied to documented authority, infrastructure, funding, ownership, data, access or implementation. It does not establish secret command.',
      convergenceVectors: vectors,
      overallConfidence: 'low',
      boundary: 'This is structured scenario analysis. It does not prove coordinated elite control, a predetermined global programme or unified intent.'
    },
    speculativeConclusion: {
      label: 'speculative',
      text: first(item.likely, 'The projected outcome remains conditional on future records and implementation signals.'),
      conditions: watch.length ? watch : ['The named records and implementation signals appear.'],
      falsifiers: [
        'The named records do not appear or contradict the projected direction.',
        'The pattern remains voluntary, decentralised, reversible and subject to effective appeal and competition.'
      ],
      confidence: scenarioConfidence === 'medium_high' ? 'medium' : 'low',
      boundary: 'This is a separately labelled projection. It is not an established fact and must be upgraded or downgraded when records change.'
    },
    counterAnalysis: {
      alternativeExplanations: ['The pattern may arise from ordinary institutional coordination, operational efficiency, legal harmonisation, public demand or market incentives rather than a hidden plan.'],
      contradictoryEvidence: [],
      assessment: `The scenario remains conditional on the named records and watch indicators: ${watch.join('; ') || 'not yet specified'}.`
    },
    missingEvidence: (records.length ? records : ['Primary records supporting the proposed mechanism']).map((record, recordIndex) => ({
      record,
      whyItMatters: 'This record is required to test the proposed mechanism, distinguish documented coordination from inference and change the confidence level.',
      effectIfFound: recordIndex === 0 ? 'confirm' : 'narrow',
      requestRoute: null
    })),
    watchNext: (watch.length ? watch : ['New primary record affecting the scenario']).map(indicator => ({
      indicator,
      reason: 'The indicator may confirm, narrow, contradict or falsify the scenario.',
      upgradeCondition: 'A dated primary record confirms the proposed authority, money, access, data or implementation route.',
      downgradeCondition: 'A contradictory record appears, the projected event does not occur or the system remains voluntary, decentralised and appealable.',
      reviewDate: null
    })),
    evidence: {
      grade: 'ungraded',
      confidence: scenarioConfidence,
      claimClass: 'scenario_analysis',
      corroborationCount: records.length,
      associationBoundary: 'Named people, institutions and systems are research routes. Inclusion does not establish wrongdoing, control or coordination.'
    },
    access: access(policy),
    freshness: {
      createdAt: iso(data.updated),
      updatedAt: iso(data.updated),
      lastReviewedAt: iso(data.updated),
      reviewStatus: 'current',
      supersedes: null,
      supersededBy: null
    },
    delivery: {
      includeInDailyDrop: false,
      includeInWeeklyReport: true,
      includeInNewsletter: true,
      includeInSearch: true,
      includeInEntityCards: false,
      includeInConvergenceTracker: vectors.length > 0
    },
    legacy: {
      sourceFile: 'data/outcome-briefings.json',
      sourcePath: `briefings[${index}]`,
      legacyId: item.id || null,
      aliasesApplied: ['headline', 'situation', 'meaning', 'likely', 'institutions', 'records', 'watch'],
      migrationStatus: 'mapped'
    }
  };
}

const policy = readJson('data/access-tier-policy.json');
const data = readJson('data/outcome-briefings.json');
if (policy.paymentStatus !== 'deferred') throw new Error('Payment must remain deferred.');
if (policy.enforcementMode !== 'report-only') throw new Error('Tier enforcement must remain report-only.');

const records = list(data.briefings).map((item, index) => mapBriefing(item, index, data, policy));
const output = {
  ok: true,
  mode: 'preview-only',
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  paymentStatus: policy.paymentStatus,
  enforcementMode: policy.enforcementMode,
  sourceFile: 'data/outcome-briefings.json',
  sourceGeneratedAt: data.updated || null,
  recordCount: records.length,
  boundary: 'These are preview-only scenario projections. They do not replace the Outcome Briefings generator or publish scenario language as established fact.',
  records
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'outcome-briefings.canonical-preview.json'), JSON.stringify(output, null, 2));
console.log(`CANONICAL OUTCOME PREVIEW: ${records.length} scenario records.`);
console.log(`Output: ${path.relative(root, outputDir)}`);
