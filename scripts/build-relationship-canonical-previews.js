const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputDir = path.join(root, 'downloads', 'canonical-relationship-preview');

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
  return result.length >= 3 ? result : `relationship-${fallback}`;
}
function humanise(value) {
  return clean(value)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}
function confidence(value) {
  const key = clean(value).toLowerCase().replace(/[\s-]+/g, '_');
  return ({ high: 'high', medium_high: 'medium_high', medium: 'medium', low: 'low', review: 'very_low', unverified: 'very_low' })[key] || 'very_low';
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
      { format: 'csv', minimumTier: 'research_pro_9' },
      { format: 'json', minimumTier: 'research_pro_9' }
    ],
    embargoUntil: null
  };
}
function entityType(node, fallbackId) {
  const hay = `${node?.type || ''} ${node?.layer || ''} ${fallbackId || ''}`.toLowerCase();
  if (/person|profile|billionaire/.test(hay)) return 'person';
  if (/company|asset manager|contractor|platform/.test(hay)) return 'company';
  if (/government|department|ministry|commission/.test(hay)) return 'government';
  if (/agency/.test(hay)) return 'agency';
  if (/court|v\.|matter of/.test(hay)) return 'court';
  if (/bank|monetary fund|federal reserve/.test(hay)) return 'bank';
  if (/foundation/.test(hay)) return 'foundation';
  if (/religious|order|church|freemasonry|jesuit|malta/.test(hay)) return 'religious_body';
  if (/institution|forum|nato|united nations|world health/.test(hay)) return 'international_body';
  return 'other';
}
function mapEdge(edge, index, data, policy, nodes) {
  const fromNode = nodes.get(edge.from) || null;
  const toNode = nodes.get(edge.to) || null;
  const fromName = first(fromNode?.name, humanise(edge.from));
  const toName = first(toNode?.name, humanise(edge.to));
  const edgeType = first(edge.type, 'relationship hint');
  const recordId = safeId(`relationship-${edge.from}-${edge.to}-${edgeType}`, `relationship-${index + 1}`);
  const sourceId = `${recordId}-source`;
  const sourceIds = [sourceId];
  const boundary = first(data.boundary, 'This graph ranks public route strength. It does not convert association into a claim.');
  const reviewConfidence = confidence(edge.confidence);
  const route = first(fromNode?.route, toNode?.route, 'evidence-graph.html');
  const statement = `The current internal graph encodes a ${edgeType} from ${fromName} to ${toName} with model weight ${Number(edge.weight || 0)} and confidence label ${first(edge.confidence, 'review')}.`;

  return {
    schemaVersion: '1.0.0',
    id: recordId,
    recordType: 'relationship_update',
    title: `${fromName} → ${toName}: ${edgeType}`,
    summary: statement,
    slug: null,
    status: 'review',
    trigger: {
      description: 'The evidence-weighted relationship graph generated or refreshed an internal route hint.',
      detectedAt: iso(data.updated),
      eventDate: iso(data.updated).slice(0, 10),
      changeType: 'new_record'
    },
    sources: [{
      id: sourceId,
      title: 'Evidence Weighted Relationship Graph',
      sourceType: 'other',
      url: `https://matrixreprogrammed.com/${route.replace(/^\/+/, '')}`,
      publisher: 'Matrix Reprogrammed relationship model',
      publishedAt: iso(data.updated),
      retrievedAt: iso(data.updated),
      authority: 'lead_only',
      status: 'live',
      hash: null,
      archivePath: 'data/evidence-weighted-relationship-graph.json',
      notes: boundary
    }],
    recordStatus: ['analysis'],
    establishedFacts: [{
      statement,
      sourceIds,
      boundary: 'This establishes only what the internal graph currently encodes. It does not establish that the external relationship exists, is causal or is improper.',
      factStatus: 'documented'
    }],
    entities: [
      {
        id: safeId(edge.from, `from-${index + 1}`),
        name: fromName,
        entityType: entityType(fromNode, edge.from),
        role: 'Origin of an internal graph hint',
        sourceIds,
        associationBoundary: 'Appearance in the graph is not evidence of guilt, command, conspiracy, wrongdoing or causal influence.'
      },
      {
        id: safeId(edge.to, `to-${index + 1}`),
        name: toName,
        entityType: entityType(toNode, edge.to),
        role: 'Destination topic or entity of an internal graph hint',
        sourceIds,
        associationBoundary: 'Appearance in the graph is not evidence of guilt, command, conspiracy, wrongdoing or causal influence.'
      }
    ],
    moneyAndAuthority: [],
    mechanismOfPower: {
      description: 'No external mechanism is established by this edge. A mechanism would require primary records showing office, ownership, payment, contract, mandate, voting power, data control, access or implementation.',
      authorityHolder: ['Authority holder is not established by the graph edge'],
      implementationRoute: [route],
      affectedGroups: [],
      evidenceBasis: sourceIds,
      limitation: boundary
    },
    solidConclusion: {
      text: `The graph currently treats ${fromName} → ${toName} as a ${edgeType} requiring evidence review.`,
      scope: 'internal relationship-model hint only',
      confidence: reviewConfidence,
      sourceIds,
      boundary
    },
    missionAssessment: {
      outcome: 'insufficient_evidence',
      missionRelevance: 'The hint may identify a useful route for testing money, authority, access, institutional overlap or implementation, but it is not yet a mission conclusion.',
      eliteControlRelevance: 'Elite-control relevance remains unestablished until primary records show a concrete power mechanism. Association, shared themes, attendance or historical proximity alone are insufficient.',
      convergenceVectors: [],
      overallConfidence: 'very_low',
      boundary: 'This edge does not prove elite coordination, conspiracy, wrongdoing, unified command or movement toward a one-world system.'
    },
    speculativeConclusion: {
      label: 'speculative',
      text: 'The hinted route could become relevant if public records establish a repeatable authority, money, access, ownership or implementation connection between the named entity and topic. No such conclusion is made by this preview.',
      conditions: [
        'A dated primary record directly supports the relationship.',
        'The record identifies a concrete power, money, access, ownership or implementation mechanism.'
      ],
      falsifiers: [
        'No direct primary record can be found.',
        'The apparent overlap is thematic, historical, incidental or contradicted by the underlying records.'
      ],
      confidence: 'very_low',
      boundary: 'This is a separately labelled conditional interpretation, not an external relationship finding.'
    },
    counterAnalysis: {
      alternativeExplanations: [
        'The edge may reflect tagging, editorial grouping, shared vocabulary or a research prompt rather than a real-world relationship.',
        'Any overlap may be historical, incidental, public, ordinary or non-causal.'
      ],
      contradictoryEvidence: [],
      assessment: 'The graph edge remains a hypothesis-generating route until direct records and counter-records are reviewed.'
    },
    missingEvidence: [{
      record: `Primary record directly supporting ${fromName} → ${toName}`,
      whyItMatters: 'A direct source is required before the graph hint can be upgraded into a documented association or supported inference.',
      effectIfFound: 'upgrade',
      requestRoute: route
    }],
    watchNext: [{
      indicator: `Direct filing, contract, official record, disclosed membership, payment, appointment or implementation record linking ${fromName} and ${toName}`,
      reason: 'A direct record could confirm, narrow or contradict the graph hint.',
      upgradeCondition: 'A dated primary record establishes the exact relationship and its limited scope.',
      downgradeCondition: 'No direct record exists, the source contradicts the edge or the overlap is merely thematic or incidental.',
      reviewDate: null
    }],
    evidence: {
      grade: 'ungraded',
      confidence: reviewConfidence,
      claimClass: 'supported_inference',
      corroborationCount: 0,
      associationBoundary: 'Association is not guilt. This edge is an internal research hint and must not be presented as proof of wrongdoing, control or coordination.'
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
      includeInWeeklyReport: false,
      includeInNewsletter: false,
      includeInSearch: true,
      includeInEntityCards: false,
      includeInConvergenceTracker: false
    },
    legacy: {
      sourceFile: 'data/evidence-weighted-relationship-graph.json',
      sourcePath: `edges[${index}]`,
      legacyId: null,
      aliasesApplied: ['from', 'to', 'type', 'weight', 'confidence'],
      migrationStatus: 'mapped'
    }
  };
}

const policy = readJson('data/access-tier-policy.json');
const data = readJson('data/evidence-weighted-relationship-graph.json');
if (policy.paymentStatus !== 'deferred') throw new Error('Payment must remain deferred.');
if (policy.enforcementMode !== 'report-only') throw new Error('Tier enforcement must remain report-only.');

const nodes = new Map(list(data.nodes).map(node => [node.id, node]));
const records = list(data.edges).map((edge, index) => mapEdge(edge, index, data, policy, nodes));
const output = {
  ok: true,
  mode: 'preview-only',
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  paymentStatus: policy.paymentStatus,
  enforcementMode: policy.enforcementMode,
  sourceFile: 'data/evidence-weighted-relationship-graph.json',
  sourceGeneratedAt: data.updated || null,
  sourceNodeCount: Number(data.nodeCount || data.nodes?.length || 0),
  sourceEdgeCount: Number(data.edgeCount || data.edges?.length || 0),
  recordCount: records.length,
  boundary: 'These are preview-only mappings of internal graph hints. They do not replace the graph or convert association into an external claim.',
  records
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'relationship-graph.canonical-preview.json'), JSON.stringify(output, null, 2));
console.log(`CANONICAL RELATIONSHIP PREVIEW: ${records.length} internal graph hints.`);
console.log(`Output: ${path.relative(root, outputDir)}`);
