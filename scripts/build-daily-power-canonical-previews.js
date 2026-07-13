const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputDir = path.join(root, 'downloads', 'canonical-daily-power-preview');

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
function iso(value, fallback) {
  const date = new Date(value || fallback || 0);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}
function safeId(value, fallback) {
  const result = first(value, fallback)
    .replace(/[^A-Za-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
  return result.length >= 3 ? result : `daily-power-${fallback}`;
}
function vectorFor(item, sourceIds) {
  const hay = `${item.title || ''} ${item.text || ''}`.toLowerCase();
  const definitions = [
    ['political_governance', ['one-world governance', 'global policy bodies', 'treaty systems']],
    ['monetary_control', ['one-world currency', 'cbdc', 'digital-money', 'payment rails', 'central-bank']],
    ['religious_or_ethical_convergence', ['one-world religion', 'interfaith', 'global ethics']],
    ['surveillance_and_data', ['surveillance', 'data control', 'tech platforms']],
    ['corporate_institutional_convergence', ['asset managers', 'public-private', 'foundations', 'elite networks']],
    ['legal_and_regulatory_convergence', ['standards bodies', 'regulation', 'policy influence']]
  ];
  return definitions.flatMap(([vector, terms]) => {
    const matches = terms.filter(term => hay.includes(term));
    if (!matches.length) return [];
    return [{
      vector,
      score: /one-world|convergence/.test(hay) ? 2 : 1,
      rationale: `The site-model output references ${matches.slice(0, 3).join(', ')}. This defines a research lens, not proof that a unified global system exists or is centrally commanded.`,
      evidenceBasis: sourceIds,
      confidence: 'very_low',
      coordinationStatus: 'not_shown'
    }];
  });
}
function missionOutcome(item) {
  const hay = `${item.title || ''} ${item.text || ''}`.toLowerCase();
  if (/one-world|convergence|centraliz|programmable/.test(hay)) return 'indirect_support';
  if (/power|control|capital|contractor|institution|elite|missing record/.test(hay)) return 'contextual_connection';
  return 'insufficient_evidence';
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
function mapConclusion(item, index, data, policy) {
  const recordId = safeId(`daily-power-${item.title || index + 1}`, `daily-power-${index + 1}`);
  const sourceId = `${recordId}-source`;
  const sourceIds = [sourceId];
  const route = first(item.route, 'power-structure-map.html');
  const boundary = 'This is a site-model ranking or mission lens. Rank position and wording do not establish real-world control, guilt, intent, coordination or causation.';
  const vectors = vectorFor(item, sourceIds);
  const isMissingRecord = /missing record/i.test(item.title || '');

  return {
    schemaVersion: '1.0.0',
    id: recordId,
    recordType: 'finding',
    title: first(item.title, `Daily Power conclusion ${index + 1}`),
    summary: first(item.text, 'Site-model output requiring record review.'),
    slug: null,
    status: 'review',
    trigger: {
      description: 'The Daily Power model generated or refreshed a ranked route or mission lens.',
      detectedAt: iso(data.updated),
      eventDate: iso(data.updated).slice(0, 10),
      changeType: 'new_record'
    },
    sources: [{
      id: sourceId,
      title: first(item.title, 'Daily Power model output'),
      sourceType: 'other',
      url: `https://matrixreprogrammed.com/${route.replace(/^\/+/, '')}`,
      publisher: 'Matrix Reprogrammed Daily Power model',
      publishedAt: iso(data.updated),
      retrievedAt: iso(data.updated),
      authority: 'lead_only',
      status: 'live',
      hash: null,
      archivePath: 'data/daily-power-conclusions.json',
      notes: boundary
    }],
    recordStatus: ['analysis'],
    establishedFacts: [{
      statement: `The current site model states: ${first(item.text, item.title)}`,
      sourceIds,
      boundary: 'This establishes the present model output only. It does not establish the external ranking or control claim as fact.',
      factStatus: 'documented'
    }],
    entities: [],
    moneyAndAuthority: [],
    mechanismOfPower: {
      description: 'The output directs attention to a linked research route. The actual power mechanism must be established from filings, contracts, legal authority, ownership, payments, mandates, voting power, data control or implementation records.',
      authorityHolder: ['Authority holder is not established by the ranking alone'],
      implementationRoute: [route],
      affectedGroups: [],
      evidenceBasis: sourceIds,
      limitation: boundary
    },
    solidConclusion: {
      text: first(item.text, 'The current site model identifies this route for further investigation.'),
      scope: isMissingRecord ? 'missing-record priority generated by the site model' : 'site-model ranking or mission lens',
      confidence: 'very_low',
      sourceIds,
      boundary
    },
    missionAssessment: {
      outcome: missionOutcome(item),
      missionRelevance: first(item.text, 'The output identifies a route for testing the site mission against public records.'),
      eliteControlRelevance: 'This output is relevant as a research route only. A control conclusion strengthens when records show money, office, ownership, contract, mandate, voting power, data control or policy influence.',
      convergenceVectors: vectors,
      overallConfidence: 'very_low',
      boundary: 'The model output does not prove elite coordination, a hidden command structure, one-world government, one-world currency or one-world religion.'
    },
    speculativeConclusion: {
      label: 'speculative',
      text: 'The ranked route may indicate where a wider control mechanism should be tested, but it may also reflect source volume, editorial coverage or model weighting rather than real-world control.',
      conditions: [
        'Primary records establish a repeatable authority, money, access, ownership or implementation route.',
        'The result persists under a transparent alternative ranking method.'
      ],
      falsifiers: [
        'Primary records fail to show the proposed authority, money or implementation route.',
        'A transparent alternative ranking method materially changes or reverses the result.'
      ],
      confidence: 'very_low',
      boundary: 'This is a separately labelled model interpretation. It is not proof of real-world command, guilt or coordination.'
    },
    counterAnalysis: {
      alternativeExplanations: ['The rank may be driven by data volume, route coverage, freshness, editorial priorities or model weighting rather than real-world influence.'],
      contradictoryEvidence: [],
      assessment: boundary
    },
    missingEvidence: [{
      record: isMissingRecord ? first(item.text, 'The missing primary record identified by the model') : 'Primary records supporting the linked power route',
      whyItMatters: 'The model output cannot become an external conclusion until the underlying authority, money, access or implementation record is verified.',
      effectIfFound: 'confirm',
      requestRoute: route
    }],
    watchNext: [{
      indicator: `New primary record or model update affecting ${route}`,
      reason: 'The record or model update may confirm, narrow, contradict or reorder the current result.',
      upgradeCondition: 'A dated primary record confirms a concrete authority, money, access, ownership or implementation mechanism.',
      downgradeCondition: 'The primary record is absent, contradictory or the result changes materially under a transparent alternative model.',
      reviewDate: null
    }],
    evidence: {
      grade: 'ungraded',
      confidence: 'very_low',
      claimClass: 'scenario_analysis',
      corroborationCount: 0,
      associationBoundary: boundary
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
      includeInConvergenceTracker: vectors.length > 0
    },
    legacy: {
      sourceFile: 'data/daily-power-conclusions.json',
      sourcePath: `conclusions[${index}]`,
      legacyId: null,
      aliasesApplied: ['title', 'text', 'route'],
      migrationStatus: 'mapped'
    }
  };
}

const policy = readJson('data/access-tier-policy.json');
const data = readJson('data/daily-power-conclusions.json');
if (policy.paymentStatus !== 'deferred') throw new Error('Payment must remain deferred.');
if (policy.enforcementMode !== 'report-only') throw new Error('Tier enforcement must remain report-only.');

const records = list(data.conclusions).map((item, index) => mapConclusion(item, index, data, policy));
const output = {
  ok: true,
  mode: 'preview-only',
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  paymentStatus: policy.paymentStatus,
  enforcementMode: policy.enforcementMode,
  sourceFile: 'data/daily-power-conclusions.json',
  sourceGeneratedAt: data.updated || null,
  recordCount: records.length,
  boundary: 'These are preview-only site-model projections. They do not replace Daily Power outputs or promote a ranking into an external factual conclusion.',
  records
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'daily-power.canonical-preview.json'), JSON.stringify(output, null, 2));
console.log(`CANONICAL DAILY POWER PREVIEW: ${records.length} model outputs.`);
console.log(`Output: ${path.relative(root, outputDir)}`);
