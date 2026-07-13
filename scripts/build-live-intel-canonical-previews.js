const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const outputDir = path.join(root, 'downloads', 'canonical-live-intel-preview');

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
  const raw = first(value, fallback);
  const result = raw.replace(/[^A-Za-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180);
  return result.length >= 3 ? result : `mr-${crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16)}`;
}
function sourceType(label, url) {
  const hay = `${label} ${url}`.toLowerCase();
  if (/court|docket|judg/.test(hay)) return 'court';
  if (/regulator|commission|sec\.gov/.test(hay)) return 'regulator';
  if (/\.gov\/|europa\.eu|who\.int|ecb\.europa/.test(hay)) return 'government';
  if (/archive|declassified|foia/.test(hay)) return 'declassified_archive';
  if (/google news|rss|politico|new york times|cnn|reuters|bbc|guardian|herald|recorded future|people\.com/.test(hay)) return 'credible_reporting';
  return 'other';
}
function authority(label, url, status) {
  const hay = `${label} ${url} ${status}`.toLowerCase();
  if (/\.gov\/|europa\.eu|who\.int|ecb\.europa|primary-official/.test(hay)) return 'primary';
  if (/official/.test(hay)) return 'official_secondary';
  if (/google news|rss|news|report/.test(hay)) return 'lead_only';
  return 'unknown';
}
function recordStatus(label, url, status) {
  const hay = `${label} ${url} ${status}`.toLowerCase();
  if (/declassified|foia|archive/.test(hay)) return ['declassified_record'];
  if (/\.gov\/|europa\.eu|who\.int|ecb\.europa/.test(hay)) return ['official_report'];
  return ['credible_reporting'];
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
function mapItem(item, index, data, policy) {
  const sourceLabel = first(item.sourceLabel, 'Public-source lead');
  const sourceUrl = item.url;
  const sourceAuthority = authority(sourceLabel, sourceUrl, item.status);
  const boundary = first(
    item.evidenceBoundary,
    'A fresh news, archive or public-source item is a lead, not a verdict. Open the source, classify the record and separate findings from claims, contacts and commentary.'
  );
  const sourceId = safeId(`${item.id || `live-${index + 1}`}-source`, sourceLabel);
  const sourceIds = [sourceId];
  const nextAction = first(item.nextAction, 'Open and preserve the underlying source before drawing a conclusion.');
  const lane = first(item.laneTitle, item.lane, 'Live Intel');
  const missionRelevance = first(
    item.whyItMatters,
    `This lead is relevant to the ${lane} research lane because it may identify a new record, institution, event or disclosure route.`
  );

  return {
    schemaVersion: '1.0.0',
    id: safeId(item.id, `live-intel-${index + 1}`),
    recordType: 'signal',
    title: first(item.title, `Live Intel lead ${index + 1}`),
    summary: first(item.summary, item.title),
    slug: null,
    status: 'published',
    trigger: {
      description: `A new or refreshed public-source lead entered the ${lane} lane.`,
      detectedAt: iso(item.fetchedAt, data.updated),
      eventDate: iso(item.published, item.fetchedAt || data.updated).slice(0, 10),
      changeType: 'new_record'
    },
    sources: [{
      id: sourceId,
      title: first(item.title, sourceLabel),
      sourceType: sourceType(sourceLabel, sourceUrl),
      url: sourceUrl,
      publisher: sourceLabel,
      publishedAt: item.published ? iso(item.published) : null,
      retrievedAt: iso(item.fetchedAt, data.updated),
      authority: sourceAuthority,
      status: 'live',
      hash: null,
      archivePath: null,
      notes: boundary
    }],
    recordStatus: recordStatus(sourceLabel, sourceUrl, item.status),
    establishedFacts: [{
      statement: `A dated public-source item with this title was collected in the Live Intel feed: ${first(item.title, 'Untitled lead')}`,
      sourceIds,
      boundary,
      factStatus: sourceAuthority === 'primary' ? 'officially_reported' : 'unresolved'
    }],
    entities: [],
    moneyAndAuthority: [],
    mechanismOfPower: {
      description: 'The item is routed into a source-review lane. Any power mechanism remains unestablished until the underlying record identifies authority, money, ownership, access, data control or implementation.',
      authorityHolder: [first(item.sourceLabel, 'Authority holder not yet established')],
      implementationRoute: [first(item.evidenceRoute, nextAction)],
      affectedGroups: [],
      evidenceBasis: sourceIds,
      limitation: boundary
    },
    solidConclusion: {
      text: 'This is a fresh lead requiring source review; it does not establish wrongdoing, causation, coordination or a wider control structure.',
      scope: first(item.evidenceLevel, 'public-source lead'),
      confidence: sourceAuthority === 'primary' ? 'low' : 'very_low',
      sourceIds,
      boundary
    },
    missionAssessment: {
      outcome: 'insufficient_evidence',
      missionRelevance,
      eliteControlRelevance: 'The lead becomes relevant to elite-control analysis only if a primary record confirms a concrete authority, money, ownership, access, data or implementation route.',
      convergenceVectors: [],
      overallConfidence: 'very_low',
      boundary: 'A headline, report or released fragment is a lead. It does not prove elite control, wrongdoing, coordinated command or a one-world programme.'
    },
    speculativeConclusion: {
      label: 'speculative',
      text: 'This lead could become mission-relevant if a primary record confirms the reported development and reveals a concrete authority, money, access or implementation route. At present that connection is unproven.',
      conditions: [nextAction],
      falsifiers: [
        'The source is corrected, withdrawn or contradicted.',
        'No primary record or concrete power mechanism can be established.'
      ],
      confidence: 'very_low',
      boundary: 'This is a separately labelled conditional interpretation, not an established conclusion or proof of coordinated elite control.'
    },
    counterAnalysis: {
      alternativeExplanations: ['The report may be incomplete, mistaken, ordinary reporting or unrelated to any wider control structure.'],
      contradictoryEvidence: [],
      assessment: boundary
    },
    missingEvidence: [{
      record: 'Primary or official record underlying this public-source lead',
      whyItMatters: 'The underlying record is required to classify the event, identify the responsible authority and test the reported claim.',
      effectIfFound: 'confirm',
      requestRoute: first(item.evidenceRoute, null)
    }],
    watchNext: [{
      indicator: nextAction,
      reason: 'A primary source, correction or contradictory record could change the status, evidence grade and mission assessment.',
      upgradeCondition: 'A dated primary or official record confirms the event and establishes a concrete authority, money, access or implementation route.',
      downgradeCondition: 'The report is corrected, withdrawn, contradicted or cannot be linked to a primary record.',
      reviewDate: null
    }],
    evidence: {
      grade: 'ungraded',
      confidence: sourceAuthority === 'primary' ? 'low' : 'very_low',
      claimClass: 'disputed_claim',
      corroborationCount: 1,
      associationBoundary: boundary
    },
    access: access(policy),
    freshness: {
      createdAt: iso(item.published, item.fetchedAt || data.updated),
      updatedAt: iso(item.fetchedAt, data.updated),
      lastReviewedAt: iso(data.updated, item.fetchedAt),
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
      includeInConvergenceTracker: false
    },
    legacy: {
      sourceFile: 'data/live-intel.json',
      sourcePath: `items[${index}]`,
      legacyId: item.id || null,
      aliasesApplied: ['summary', 'evidenceBoundary', 'whyItMatters', 'nextAction', 'evidenceRoute'],
      migrationStatus: 'mapped'
    }
  };
}

const policy = readJson('data/access-tier-policy.json');
const data = readJson('data/live-intel.json');
if (policy.paymentStatus !== 'deferred') throw new Error('Payment must remain deferred.');
if (policy.enforcementMode !== 'report-only') throw new Error('Tier enforcement must remain report-only.');

const records = list(data.items).map((item, index) => mapItem(item, index, data, policy));
const output = {
  ok: true,
  mode: 'preview-only',
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  paymentStatus: policy.paymentStatus,
  enforcementMode: policy.enforcementMode,
  sourceFile: 'data/live-intel.json',
  sourceGeneratedAt: data.updated || null,
  recordCount: records.length,
  boundary: 'These records are preview-only compatibility projections. Live Intel remains a lead feed and is not rewritten or upgraded into findings.',
  records
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'live-intel.canonical-preview.json'), JSON.stringify(output, null, 2));
console.log(`CANONICAL LIVE INTEL PREVIEW: ${records.length} lead records.`);
console.log(`Output: ${path.relative(root, outputDir)}`);
