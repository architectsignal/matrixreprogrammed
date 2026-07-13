const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputDir = path.join(root, 'downloads', 'canonical-daily-brain-preview');

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
function safeId(value, fallback) {
  const result = first(value, fallback)
    .replace(/[^A-Za-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
  return result.length >= 3 ? result : `daily-brain-${fallback}`;
}
function missionOutcome(value) {
  const hay = clean(value).toLowerCase();
  if (/contradict|weakens|disproves/.test(hay)) return 'contradictory_evidence';
  if (/convergence|interoperab|centraliz|mandatory|coordination/.test(hay)) return 'indirect_support';
  if (/power|authority|control|contract|money|ownership|custody|surveillance|institution|influence|withheld|redaction/.test(hay)) return 'contextual_connection';
  return 'insufficient_evidence';
}
function vectors(value, sourceIds) {
  const hay = clean(value).toLowerCase();
  const definitions = [
    ['political_governance', ['governance', 'global policy', 'institutional coordination']],
    ['monetary_control', ['currency', 'payment', 'central bank', 'gold', 'reserve']],
    ['digital_identity', ['digital identity', 'identity wallet', 'credential']],
    ['surveillance_and_data', ['surveillance', 'data sharing', 'cloud', 'monitoring']],
    ['emergency_power', ['emergency', 'pandemic power']],
    ['information_and_narrative', ['media', 'narrative', 'redaction', 'withheld', 'disclosure']],
    ['corporate_institutional_convergence', ['public-private', 'vendor', 'foundation', 'infrastructure dependency']],
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
      rationale: `The synthesis references ${matches.slice(0, 3).join(', ')}. This is a testable research route, not proof of coordinated command or intent.`,
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
function topSignalRecords(data) {
  return list(data.topSignals).slice(0, 5).map(signal => first(signal.title, signal.why));
}
function mapBriefing(item, index, data, policy) {
  const recordId = safeId(`daily-brain-${item.section || index + 1}`, `daily-brain-${index + 1}`);
  const sourceId = `${recordId}-source`;
  const sourceIds = [sourceId];
  const boundary = first(data.boundary, 'The Daily Brain is an evidence-graded synthesis and must be checked against its underlying feeds and primary records.');
  const combined = `${item.meaning || ''} ${item.likely || ''}`;
  const convergenceVectors = vectors(combined, sourceIds);
  const signalRecords = topSignalRecords(data);

  return {
    schemaVersion: '1.0.0',
    id: recordId,
    recordType: 'brief',
    title: first(item.headline, `${item.section || 'Daily Brain'} briefing`),
    summary: first(item.meaning, item.headline),
    slug: null,
    status: 'review',
    trigger: {
      description: `The Daily Brain engine selected the ${first(item.section, 'current')} synthesis lane for review.`,
      detectedAt: iso(data.updated),
      eventDate: iso(data.updated).slice(0, 10),
      changeType: 'new_record'
    },
    sources: [{
      id: sourceId,
      title: first(item.headline, 'Daily Brain synthesis'),
      sourceType: 'other',
      url: 'https://matrixreprogrammed.com/data/daily-brain-brief.json',
      publisher: 'Matrix Reprogrammed Daily Brain engine',
      publishedAt: iso(data.updated),
      retrievedAt: iso(data.updated),
      authority: 'lead_only',
      status: 'live',
      hash: null,
      archivePath: 'data/daily-brain-brief.json',
      notes: boundary
    }],
    recordStatus: ['analysis'],
    establishedFacts: [{
      statement: `The internal Daily Brain engine generated this synthesis: ${first(item.meaning, item.headline)}`,
      sourceIds,
      boundary: 'This establishes the content of the internal synthesis only. The external claims and projected direction require review against underlying records.',
      factStatus: 'documented'
    }],
    entities: [],
    moneyAndAuthority: [],
    mechanismOfPower: {
      description: first(item.meaning, 'The synthesis identifies a research route that must be traced through authority, money, access, data and implementation records.'),
      authorityHolder: [first(item.section, 'Authority holder must be established from primary records')],
      implementationRoute: signalRecords.length ? signalRecords : ['Underlying source feeds and primary records'],
      affectedGroups: [],
      evidenceBasis: sourceIds,
      limitation: boundary
    },
    solidConclusion: {
      text: first(item.meaning, 'The synthesis identifies a route for evidence review rather than a completed external finding.'),
      scope: 'daily internal synthesis',
      confidence: 'low',
      sourceIds,
      boundary
    },
    missionAssessment: {
      outcome: missionOutcome(combined),
      missionRelevance: first(item.meaning, 'Mission relevance depends on confirming a documented route of authority, money, access, information control or implementation.'),
      eliteControlRelevance: 'The synthesis becomes relevant to elite-control analysis only when underlying records establish office, ownership, contracts, mandates, voting power, data control or policy implementation. It does not prove secret command.',
      convergenceVectors,
      overallConfidence: 'low',
      boundary: 'This is an internal synthesis, not proof of coordinated elite control, unified intent or a predetermined one-world programme.'
    },
    speculativeConclusion: {
      label: 'speculative',
      text: first(item.likely, 'The projected direction remains conditional on future records and implementation signals.'),
      conditions: [first(item.likely, 'The projected development appears in dated primary records.')],
      falsifiers: [
        'Underlying records contradict the synthesis or fail to show a repeatable mechanism.',
        'The projected development does not occur or remains voluntary, decentralised and reversible.'
      ],
      confidence: 'low',
      boundary: 'This is a separately labelled projection. It is not an established fact and must be upgraded, narrowed or withdrawn when records change.'
    },
    counterAnalysis: {
      alternativeExplanations: ['The observed pattern may result from ordinary policy, market, administrative, legal or reporting processes rather than a coordinated control project.'],
      contradictoryEvidence: unique(data.biggestProbabilityMovement?.counterSignals),
      assessment: 'The synthesis cannot eliminate ordinary explanations until its underlying signals are verified and counter-records are reviewed.'
    },
    missingEvidence: (signalRecords.length ? signalRecords : ['Underlying primary records and counter-records']).map((record, recordIndex) => ({
      record,
      whyItMatters: 'The underlying record is required to verify the synthesis, identify the actual mechanism and test alternative explanations.',
      effectIfFound: recordIndex === 0 ? 'confirm' : 'contextualise',
      requestRoute: null
    })),
    watchNext: [{
      indicator: first(item.likely, 'New primary record affecting this Daily Brain lane'),
      reason: 'The indicator may confirm, narrow, contradict or falsify the synthesis.',
      upgradeCondition: 'A dated primary record confirms the proposed authority, money, access, data or implementation route.',
      downgradeCondition: 'A correction, contradictory record or absent projected development materially weakens the synthesis.',
      reviewDate: null
    }],
    evidence: {
      grade: 'ungraded',
      confidence: 'low',
      claimClass: 'scenario_analysis',
      corroborationCount: Number(data.summary?.signalCount || 0),
      associationBoundary: 'Named lanes, institutions and signals are research routes. Inclusion does not establish wrongdoing, control or coordination.'
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
      includeInDailyDrop: true,
      includeInWeeklyReport: true,
      includeInNewsletter: true,
      includeInSearch: true,
      includeInEntityCards: false,
      includeInConvergenceTracker: convergenceVectors.length > 0
    },
    legacy: {
      sourceFile: 'data/daily-brain-brief.json',
      sourcePath: `sectionBriefings[${index}]`,
      legacyId: null,
      aliasesApplied: ['section', 'headline', 'meaning', 'likely', 'topSignals', 'counterSignals'],
      migrationStatus: 'mapped'
    }
  };
}

const policy = readJson('data/access-tier-policy.json');
const data = readJson('data/daily-brain-brief.json');
if (policy.paymentStatus !== 'deferred') throw new Error('Payment must remain deferred.');
if (policy.enforcementMode !== 'report-only') throw new Error('Tier enforcement must remain report-only.');

const records = list(data.sectionBriefings).map((item, index) => mapBriefing(item, index, data, policy));
const output = {
  ok: true,
  mode: 'preview-only',
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  paymentStatus: policy.paymentStatus,
  enforcementMode: policy.enforcementMode,
  sourceFile: 'data/daily-brain-brief.json',
  sourceGeneratedAt: data.updated || null,
  recordCount: records.length,
  boundary: 'These are preview-only Daily Brain projections. They do not replace the current generator or promote internal synthesis into established external fact.',
  records
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'daily-brain.canonical-preview.json'), JSON.stringify(output, null, 2));
console.log(`CANONICAL DAILY BRAIN PREVIEW: ${records.length} synthesis records.`);
console.log(`Output: ${path.relative(root, outputDir)}`);
