const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const outDir = path.join(root, 'downloads', 'canonical-intelligence-preview');

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
function array(value) {
  return Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
}
function unique(values) {
  return [...new Set(array(values).map(value => clean(value)).filter(Boolean))];
}
function iso(value, fallback) {
  const date = new Date(value || fallback || 0);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}
function safeId(value, fallback) {
  const raw = first(value, fallback);
  const cleaned = raw.replace(/[^A-Za-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180);
  return cleaned.length >= 3 ? cleaned : `mr-${crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16)}`;
}
function grade(value) {
  const result = clean(value).toUpperCase();
  return ['A', 'B', 'C', 'D', 'E'].includes(result) ? result : 'ungraded';
}
function confidence(value) {
  const key = clean(value).toUpperCase();
  return ({ A: 'high', B: 'medium_high', C: 'medium', D: 'low', E: 'very_low' })[key] || 'low';
}
function sourceType(label, url) {
  const hay = `${label} ${url}`.toLowerCase();
  if (/court|judg|docket/.test(hay)) return 'court';
  if (/sec\.|securities and exchange|regulator|commission/.test(hay)) return 'regulator';
  if (/government|department|agency|\.gov\//.test(hay)) return 'government';
  if (/archive|declassified|foia/.test(hay)) return 'declassified_archive';
  if (/google news|rss|reuters|bbc|cnn|politico|new york times/.test(hay)) return 'credible_reporting';
  return 'other';
}
function authority(item) {
  const hay = `${item.authority || ''} ${item.sourceUrl || ''} ${item.itemUrl || ''}`.toLowerCase();
  if (/primary-official|\.gov\//.test(hay)) return 'primary';
  if (/official/.test(hay)) return 'official_secondary';
  return 'unknown';
}
function statuses(item) {
  const hay = `${item.status || ''} ${item.title || ''}`.toLowerCase();
  const values = [];
  if (/final judgment|judgment/.test(hay)) values.push('final_judgment');
  if (/conviction|convicted/.test(hay)) values.push('conviction');
  if (/guilty plea/.test(hay)) values.push('guilty_plea');
  if (/sentence/.test(hay)) values.push('sentence');
  if (/audit/.test(hay)) values.push('audit_finding');
  if (/charge|indictment|allegation/.test(hay)) values.push('charge_or_indictment');
  if (/declassified|foia|archive/.test(hay)) values.push('declassified_record');
  return unique(values.length ? values : ['unknown']);
}
function factStatus(item) {
  const hay = `${item.status || ''} ${item.authority || ''}`.toLowerCase();
  if (/established-wrongdoing|final judgment|conviction|guilty plea/.test(hay)) return 'established';
  if (/primary|official|regulator|court/.test(hay)) return 'officially_reported';
  if (/allegation|lead|unverified/.test(hay)) return 'unresolved';
  return 'documented';
}
function claimClass(item) {
  const hay = clean(item.status).toLowerCase();
  if (/established-wrongdoing|official-enforcement|audit-finding/.test(hay)) return 'official_finding';
  if (/charge|allegation|unverified|lead/.test(hay)) return 'disputed_claim';
  return 'supported_inference';
}
function missionOutcome(value) {
  const hay = clean(value).toLowerCase();
  if (/contradict|weakens|disproves/.test(hay)) return 'contradictory_evidence';
  if (/convergence|interoperab|centraliz|programmable|coordination/.test(hay)) return 'indirect_support';
  if (/power|authority|control|contract|money|ownership|surveillance|institution|influence|redaction/.test(hay)) return 'contextual_connection';
  return 'insufficient_evidence';
}
function access(policy) {
  const tiers = policy.tiers || {};
  return {
    minimumTier: 'public',
    publicFields: array(tiers.public?.defaultFields),
    registeredFields: array(tiers.registered?.defaultFields),
    supporterFields: array(tiers.supporter_3?.defaultFields),
    intelligenceFields: array(tiers.intelligence_6?.defaultFields),
    researchProFields: array(tiers.research_pro_9?.defaultFields),
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
function mapFinding(item, index, sourceMeta, policy) {
  const boundary = first(item.evidenceBoundary, 'The finding applies only to the conduct, parties and outcome described by the cited record.');
  const sourceUrl = first(item.itemUrl, item.sourceUrl);
  const sourceLabel = first(item.sourceLabel, 'Primary source route');
  const sourceId = safeId(item.sourceId, `${sourceMeta.id}-source-${index + 1}`);
  const sourceIds = [sourceId];
  const next = unique(item.nextRecords);
  const evidenceGrade = grade(item.evidenceGrade);
  const evidenceConfidence = confidence(item.evidenceGrade);
  const conclusion = first(item.conclusion, item.summary, 'The source requires review before a broader conclusion is made.');
  const implication = first(item.implication, 'This record may alter an accountability, money, institutional or legal-power map if later records establish a concrete route.');
  const mechanism = first(item.mechanism, 'Trace the authority, money, access, implementation and remedy route shown by the primary record.');
  const eventTime = first(item.published, item.firstSeen, sourceMeta.generatedAt);
  const updatedTime = first(item.lastSeen, item.published, sourceMeta.generatedAt);

  return {
    schemaVersion: '1.0.0',
    id: safeId(item.id, `${sourceMeta.id}-${index + 1}`),
    recordType: sourceMeta.recordType,
    title: first(item.title, `Investigation finding ${index + 1}`),
    summary: first(item.summary, conclusion),
    status: 'published',
    trigger: {
      description: `The ${sourceMeta.label} pipeline selected this record because of its authority, legal status, severity, recency or disclosure significance.`,
      detectedAt: iso(item.firstSeen, sourceMeta.generatedAt),
      eventDate: iso(eventTime).slice(0, 10),
      changeType: 'new_record'
    },
    sources: [{
      id: sourceId,
      title: first(item.title, sourceLabel),
      sourceType: sourceType(sourceLabel, sourceUrl),
      url: sourceUrl,
      publisher: sourceLabel,
      publishedAt: item.published ? iso(item.published) : null,
      retrievedAt: iso(sourceMeta.generatedAt, updatedTime),
      authority: authority(item),
      status: 'live',
      hash: null,
      archivePath: null,
      notes: boundary
    }],
    recordStatus: statuses(item),
    establishedFacts: [{
      statement: conclusion,
      sourceIds,
      boundary,
      factStatus: factStatus(item)
    }],
    entities: [],
    moneyAndAuthority: [],
    mechanismOfPower: {
      description: mechanism,
      authorityHolder: unique([item.sourceLabel, item.laneTitle]).length ? unique([item.sourceLabel, item.laneTitle]) : ['Authority holder not yet established'],
      implementationRoute: next.length ? next.slice(0, 3) : ['Open and analyse the primary record'],
      affectedGroups: [],
      evidenceBasis: sourceIds,
      limitation: boundary
    },
    solidConclusion: {
      text: conclusion,
      scope: first(item.status, 'record-specific finding'),
      confidence: evidenceConfidence,
      sourceIds,
      boundary
    },
    missionAssessment: {
      outcome: missionOutcome(implication),
      missionRelevance: implication,
      eliteControlRelevance: 'A wider elite-control interpretation requires records showing office, ownership, contract, payment, mandate, voting power, data control or policy influence beyond this individual record.',
      convergenceVectors: [],
      overallConfidence: evidenceConfidence === 'high' ? 'medium' : 'low',
      boundary: 'The record may alter a power map, but it does not by itself prove elite coordination, a hidden command structure or a one-world programme.'
    },
    speculativeConclusion: {
      label: 'speculative',
      text: 'A broader control-structure connection would become more plausible only if later records show repeated cross-institutional authority, funding, implementation or protection. The present record does not establish that.',
      conditions: next.length ? next : ['Additional primary records establish a repeated authority, money or implementation route.'],
      falsifiers: [
        'Later judgments, appeals, dismissals or corrected records materially narrow the finding.',
        'No repeatable authority, money or implementation route is found beyond the cited record.'
      ],
      confidence: 'very_low',
      boundary: 'This is a separately labelled speculative interpretation. It is not an established fact, finding of guilt or proof of coordinated elite control.'
    },
    counterAnalysis: {
      alternativeExplanations: [first(item.counterpoint, 'The record may concern isolated conduct or ordinary enforcement rather than a wider control structure.')],
      contradictoryEvidence: [],
      assessment: boundary
    },
    missingEvidence: (next.length ? next : ['Primary record and any later appeal, correction, implementation or remedy record']).map((record, recordIndex) => ({
      record,
      whyItMatters: 'This record is needed to confirm, narrow or contradict the current conclusion and its mission relevance.',
      effectIfFound: recordIndex === 0 ? 'upgrade' : 'narrow',
      requestRoute: null
    })),
    watchNext: (next.length ? next : ['Later official filing, judgment, appeal, correction or implementation record']).map(indicator => ({
      indicator,
      reason: 'The indicator could change the evidence grade, mechanism, scope or mission assessment.',
      upgradeCondition: 'A dated primary or official record confirms a concrete authority, money, access or implementation mechanism.',
      downgradeCondition: 'A correction, dismissal, appeal or contradictory primary record materially narrows the route.',
      reviewDate: null
    })),
    evidence: {
      grade: evidenceGrade,
      confidence: evidenceConfidence,
      claimClass: claimClass(item),
      corroborationCount: Math.max(1, Number(item.occurrences || 1)),
      associationBoundary: boundary
    },
    access: access(policy),
    freshness: {
      createdAt: iso(item.firstSeen, eventTime),
      updatedAt: iso(updatedTime),
      lastReviewedAt: iso(sourceMeta.generatedAt, updatedTime),
      reviewStatus: 'current',
      supersedes: null,
      supersededBy: null
    },
    delivery: {
      includeInDailyDrop: sourceMeta.recordType === 'daily_drop',
      includeInWeeklyReport: true,
      includeInNewsletter: true,
      includeInSearch: true,
      includeInEntityCards: true,
      includeInConvergenceTracker: true
    },
    legacy: {
      sourceFile: sourceMeta.path,
      sourcePath: `strongestFindings[${index}]`,
      legacyId: item.id || null,
      aliasesApplied: ['conclusion', 'mechanism', 'implication', 'nextRecords', 'evidenceBoundary'],
      migrationStatus: 'mapped'
    }
  };
}

const policy = readJson('data/access-tier-policy.json');
if (policy.paymentStatus !== 'deferred') throw new Error('Payment must remain deferred.');
if (policy.enforcementMode !== 'report-only') throw new Error('Tier enforcement must remain report-only.');

const sources = [
  { id: 'daily-investigation', label: 'daily investigation', path: 'data/daily-investigation-conclusions.json', recordType: 'daily_drop' },
  { id: 'weekly-investigation', label: 'weekly investigation', path: 'data/weekly-investigation-conclusions.json', recordType: 'weekly_report' }
];

fs.mkdirSync(outDir, { recursive: true });
const index = {
  ok: true,
  mode: 'preview-only',
  generatedAt: new Date().toISOString(),
  paymentStatus: policy.paymentStatus,
  enforcementMode: policy.enforcementMode,
  boundary: 'These files are deterministic compatibility previews. They do not replace, rewrite, publish or entitle any current source record.',
  sources: []
};

for (const source of sources) {
  const data = readJson(source.path);
  const records = array(data.strongestFindings).map((item, itemIndex) => mapFinding(item, itemIndex, { ...source, generatedAt: data.generatedAt }, policy));
  const output = {
    ok: true,
    mode: 'preview-only',
    schemaVersion: '1.0.0',
    generatedAt: index.generatedAt,
    sourceFile: source.path,
    sourceGeneratedAt: data.generatedAt || null,
    recordCount: records.length,
    records
  };
  const outputFile = `${source.id}.canonical-preview.json`;
  fs.writeFileSync(path.join(outDir, outputFile), JSON.stringify(output, null, 2));
  index.sources.push({ id: source.id, sourceFile: source.path, outputFile, recordCount: records.length });
}

index.totalRecords = index.sources.reduce((sum, item) => sum + item.recordCount, 0);
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2));
console.log(`CANONICAL INVESTIGATION PREVIEW: ${index.totalRecords} records across ${index.sources.length} protected legacy sources.`);
console.log(`Output: ${path.relative(root, outDir)}`);
