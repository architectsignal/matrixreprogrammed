'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const at = value => path.join(root, value);
const exists = value => fs.existsSync(at(value));
const readJson = (value, fallback = {}) => { try { return JSON.parse(fs.readFileSync(at(value), 'utf8')); } catch { return fallback; } };
const writeJson = (value, content) => { fs.mkdirSync(path.dirname(at(value)), { recursive: true }); fs.writeFileSync(at(value), JSON.stringify(content, null, 2)); };
const clean = (value, max = 1800) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const array = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values.filter(Boolean))];
const validHttp = value => { try { const url = new URL(String(value || '')); return ['http:','https:'].includes(url.protocol); } catch { return false; } };
const normalise = value => clean(value, 220).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const stamp = value => { const parsed = Date.parse(value || ''); return Number.isFinite(parsed) ? parsed : 0; };
const now = new Date().toISOString();

const watch = readJson('data/daily-watch.json', {});
if (!watch.ok || !watch.person || !watch.institution || !watch.family) throw new Error('Base daily watch is missing. Run build-daily-watch.js first.');
const state = readJson('data/daily-watch-incumbents.json', { slots: {} });
const ledger = readJson('data/investigation-ledger.json', { findings: [] });
const graph = readJson('data/evidence-weighted-relationship-graph.json', { nodes: [], edges: [] });
const entityRegistry = readJson('data/entity-registry.json', {});
const familyLayer = readJson('data/behind-the-curtain-family-access.json', { families: [] });
const familyLinks = readJson('data/power-family-intelligence-layer.json', { familyPersonLinks: [] });
const PROMOTION_MARGIN = Number(process.env.DAILY_WATCH_PROMOTION_MARGIN || 14);
const familySourceMap = new Map(array(familyLayer.sources).map(source => [source.id, source.url]).filter(([id, url]) => id && url));

function effectScore(value) {
  return ({
    'strongly-strengthens': 28,
    'moderately-strengthens': 22,
    'slightly-strengthens': 14,
    'adds-context': 8,
    'new-investigative-lead': 18,
    'mixed-or-complicating': 5,
    'slightly-weakens': -6,
    'moderately-weakens': -14,
    'strongly-contradicts': -24,
    'insufficient-evidence': -20
  })[clean(value, 100)] || 0;
}
function evidenceScore(value) {
  const text = clean(value, 300).toUpperCase();
  if (/E6/.test(text)) return 42;
  if (/E5/.test(text)) return 34;
  if (/E4/.test(text)) return 27;
  if (/E3/.test(text)) return 19;
  if (/E2/.test(text)) return 11;
  if (/E1/.test(text)) return 4;
  return 0;
}
function confidenceScore(value) {
  const text = clean(value, 100).toLowerCase();
  if (/very high/.test(text)) return 18;
  if (/high/.test(text)) return 14;
  if (/moderate-to-high|moderate to high/.test(text)) return 11;
  if (/moderate/.test(text)) return 8;
  if (/low-to-moderate|low to moderate/.test(text)) return 4;
  if (/low/.test(text)) return 1;
  return 0;
}
function rankScore(item) {
  const direct = /directly elevated|current evidence intersects|appears in current evidence/i.test(clean(item?.selectionBasis, 900)) ? 18 : 0;
  const sources = Math.min(18, array(item?.sourceRoutes).length * 3);
  const lanes = Math.min(10, array(item?.investigativeLanes).length * 2);
  const specificity = Math.min(12, Math.floor((clean(item?.whatWasFound, 1400).length + clean(item?.howItFits, 1400).length) / 160));
  return Math.max(0, Math.round(40 + effectScore(item?.effectOnLane) + evidenceScore(item?.evidenceStrength) + confidenceScore(item?.confidence) + direct + sources + lanes + specificity));
}
function directFreshEvidence(item) {
  return /directly elevated|current evidence intersects|appears in current evidence/i.test(clean(item?.selectionBasis, 900));
}
function sameEntity(a, b) {
  return normalise(a?.name) && normalise(a?.name) === normalise(b?.name);
}

function promote(slot, challenger) {
  const incumbentRecord = state.slots?.[slot];
  const incumbent = incumbentRecord?.item;
  const challengerScore = rankScore(challenger);
  const incumbentScore = Number(incumbentRecord?.rankingScore || rankScore(incumbent));
  if (!incumbent?.name || /^no qualifying/i.test(incumbent.name)) {
    return {
      item: { ...challenger, rankingScore: challengerScore, rankingStatus: 'promoted-initial-leader', incumbentSince: now, lastPromotedAt: now },
      state: { item: challenger, rankingScore: challengerScore, incumbentSince: now, lastPromotedAt: now, lastDecision: 'initial-promotion' },
      decision: { changed: true, reason: 'No valid incumbent existed.', incumbentScore, challengerScore, marginRequired: PROMOTION_MARGIN }
    };
  }
  if (sameEntity(incumbent, challenger)) {
    return {
      item: { ...challenger, rankingScore: challengerScore, rankingStatus: 'retained-current-leader', incumbentSince: incumbentRecord.incumbentSince || now, lastPromotedAt: incumbentRecord.lastPromotedAt || now },
      state: { ...incumbentRecord, item: challenger, rankingScore: challengerScore, lastDecision: 'incumbent-retained-and-refreshed', lastReviewedAt: now },
      decision: { changed: false, reason: 'The same entity remains the current evidence leader.', incumbentScore, challengerScore, marginRequired: PROMOTION_MARGIN }
    };
  }
  const required = incumbentScore + PROMOTION_MARGIN;
  const qualifies = directFreshEvidence(challenger) && challengerScore >= required;
  if (qualifies) {
    return {
      item: { ...challenger, rankingScore: challengerScore, rankingStatus: 'challenger-promoted-on-stronger-evidence', incumbentSince: now, lastPromotedAt: now, replacedEntity: incumbent.name, promotionReason: `New source-linked evidence raised this entity to ${challengerScore}, above the prior leader’s ${incumbentScore} plus the ${PROMOTION_MARGIN}-point promotion margin.` },
      state: { item: challenger, rankingScore: challengerScore, incumbentSince: now, lastPromotedAt: now, replacedEntity: incumbent.name, lastDecision: 'challenger-promoted' },
      decision: { changed: true, reason: 'A direct-evidence challenger cleared the promotion threshold.', incumbent: incumbent.name, incumbentScore, challenger: challenger.name, challengerScore, required, marginRequired: PROMOTION_MARGIN }
    };
  }
  const retained = {
    ...incumbent,
    rankingScore: incumbentScore,
    rankingStatus: 'incumbent-held-position',
    incumbentSince: incumbentRecord.incumbentSince || now,
    lastPromotedAt: incumbentRecord.lastPromotedAt || now,
    challengerHeld: challenger.name,
    challengerScore,
    retentionReason: directFreshEvidence(challenger)
      ? `${challenger.name} reached ${challengerScore}, below the ${required} points required to replace the incumbent.`
      : `${challenger.name} did not carry enough direct fresh evidence to replace the incumbent.`
  };
  return {
    item: retained,
    state: { ...incumbentRecord, item: retained, rankingScore: incumbentScore, lastReviewedAt: now, challengerHeld: challenger.name, challengerScore, lastDecision: 'incumbent-retained-threshold-not-cleared' },
    decision: { changed: false, reason: retained.retentionReason, incumbent: incumbent.name, incumbentScore, challenger: challenger.name, challengerScore, required, marginRequired: PROMOTION_MARGIN }
  };
}

const decisions = {};
const nextState = { schemaVersion: '1.0.0', updated: now, promotionMargin: PROMOTION_MARGIN, slots: {} };
for (const slot of ['person','institution','family']) {
  const result = promote(slot, watch[slot]);
  watch[slot] = result.item;
  nextState.slots[slot] = result.state;
  decisions[slot] = result.decision;
}
const selectedFamily = array(familyLayer.families).find(family => family.id === watch.family?.entityResolution?.familyId || normalise(family.name) === normalise(watch.family?.name));
watch.family.sourceRoutes = unique([
  ...array(watch.family.sourceRoutes).filter(route => !/behind-the-curtain-capstone\.html#[^\s]+/i.test(String(route))),
  ...array(selectedFamily?.sourceIds).map(id => familySourceMap.get(id)).filter(Boolean),
]);
nextState.slots.family.item = { ...nextState.slots.family.item, sourceRoutes: watch.family.sourceRoutes };
watch.rankingPolicy = {
  mode: 'stable-incumbent-evidence-promotion',
  promotionMargin: PROMOTION_MARGIN,
  rule: 'A card changes only when a different entity has direct new source-linked evidence and its ranking score reaches or exceeds the incumbent score plus the promotion margin. Ties, novelty and minor fluctuations never replace a card.',
  decisions
};
watch.updated = now;
writeJson('data/daily-watch-incumbents.json', nextState);

const nodes = array(graph.nodes);
const nodeById = new Map(nodes.map(node => [String(node.id), node]));
function matchingNode(name) {
  const target = normalise(name);
  return nodes.find(node => normalise(node.name) === target) || nodes.find(node => target && (normalise(node.name).includes(target) || target.includes(normalise(node.name))));
}
function findingText(item) {
  return clean([item.title,item.summary,item.whatWasFound,item.whyItMatters,item.howItFits,item.mechanism,item.implication,item.conclusion,item.laneTitle,item.lane].join(' '), 7000).toLowerCase();
}
function matchingFindings(name) {
  const target = normalise(name);
  const tokens = target.split(' ').filter(token => token.length > 3);
  return array(ledger.findings).filter(item => {
    const text = findingText(item);
    if (!target || !text) return false;
    if (text.includes(target)) return true;
    return tokens.length >= 2 && tokens.every(token => text.includes(token));
  }).sort((a,b) => Math.max(stamp(b.published),stamp(b.lastSeen),stamp(b.firstSeen)) - Math.max(stamp(a.published),stamp(a.lastSeen),stamp(a.firstSeen)));
}
function edgeMatches(edge, node, name) {
  const ids = unique([node?.id, normalise(name).replace(/ /g,'-')]);
  return ids.includes(String(edge.from)) || ids.includes(String(edge.to));
}
function relationshipRows(name) {
  const node = matchingNode(name);
  return array(graph.edges).filter(edge => edgeMatches(edge, node, name)).map(edge => {
    const otherId = String(edge.from) === String(node?.id) ? edge.to : edge.from;
    const other = nodeById.get(String(otherId));
    return {
      entity: other?.name || String(otherId).replace(/-/g,' '),
      route: clean(other?.route, 900),
      relationshipType: clean(edge.relationshipType || edge.type || edge.predicate, 220),
      evidenceGrade: clean(edge.evidenceGrade || edge.grade || edge.status || edge.confidence, 180),
      weight: Number(edge.weight || 0),
      boundary: clean(edge.evidenceBoundary || edge.boundary || graph.relationshipBoundary || graph.boundary, 900),
      sourceRoutes: unique([edge.sourceRoute,edge.evidenceRoute,edge.route,...array(edge.sourceRoutes)]).filter(Boolean)
    };
  }).sort((a,b) => b.weight - a.weight).slice(0, 18);
}
function classifyLegal(item) {
  const text = findingText(item);
  if (/acquit|dismiss|overturn|vacat|exonerat/.test(text)) return 'acquittal-dismissal-or-exoneration';
  if (/convict|guilty plea|final judgment|sentenc/.test(text)) return 'conviction-or-final-judgment';
  if (/charg|indict|criminal complaint|arrest/.test(text)) return 'charge-indictment-or-arrest';
  if (/civil complaint|civil suit|lawsuit|settlement/.test(text)) return 'civil-proceeding-or-settlement';
  if (/sanction|regulator|enforcement|fine|penalty/.test(text)) return 'regulatory-or-sanctions-action';
  if (/investigat|inquiry|probe/.test(text)) return 'official-investigation';
  return '';
}
function compactFinding(item) {
  return {
    id: item.id,
    title: clean(item.title, 420),
    date: clean(item.published || item.lastSeen || item.firstSeen, 100),
    lane: clean(item.laneTitle || item.lane, 220),
    status: clean(item.status, 160),
    legalCategory: classifyLegal(item),
    evidenceStrength: clean(item.evidenceStrength || item.evidenceGrade, 320),
    confidence: clean(item.confidence, 120),
    whyItMatters: clean(item.whyItMatters || item.implication || item.summary, 900),
    mechanism: clean(item.howItFits || item.mechanism, 1000),
    whatItDoesNotProve: clean(item.whatItDoesNotProve || item.evidenceBoundary, 900),
    sourceRoutes: unique([item.itemUrl,item.sourceUrl,...array(item.sourceRoutes)]).filter(validHttp).slice(0,8)
  };
}
function dossierFor(slot, item) {
  const matched = matchingFindings(item.name);
  const legal = matched.filter(record => classifyLegal(record)).slice(0, 16).map(compactFinding);
  const safeguarding = matched.filter(record => /epstein|child|minor|csam|sexual exploitation|trafficking|grooming/i.test(findingText(record))).slice(0, 16).map(compactFinding);
  const money = matched.filter(record => /contract|award|payment|fund|donation|ownership|share|trust|bank|asset|loan|grant|procurement|investment|holding|beneficial/i.test(findingText(record))).slice(0, 16).map(compactFinding);
  const authority = matched.filter(record => /appoint|board|director|trustee|authority|regulat|policy|government|minister|agency|control|access|gatekeep|standard/i.test(findingText(record))).slice(0, 16).map(compactFinding);
  const contradictions = matched.filter(record => /deny|denial|counter|contradict|rebut|correction|retract|acquit|dismiss|overturn|appeal|alternative explanation|what it does not prove/i.test(findingText(record))).slice(0, 14).map(compactFinding);
  const timeline = matched.slice(0, 24).map(compactFinding);
  const relationships = relationshipRows(item.name);
  const node = matchingNode(item.name);
  const familyRecord = slot === 'family' ? array(familyLayer.families).find(family => normalise(family.name) === normalise(item.name)) : null;
  const profileRoutes = unique([node?.route,...array(item.sourceRoutes).filter(route => /\.html(?:[?#].*)?$/i.test(String(route)))]).filter(Boolean);
  return {
    slot,
    name: item.name,
    generatedAt: now,
    ranking: {
      score: item.rankingScore,
      status: item.rankingStatus,
      incumbentSince: item.incumbentSince,
      lastPromotedAt: item.lastPromotedAt,
      replacedEntity: item.replacedEntity || '',
      challengerHeld: item.challengerHeld || '',
      challengerScore: item.challengerScore || null,
      promotionReason: item.promotionReason || item.retentionReason || ''
    },
    executiveAssessment: {
      whatWasFound: item.whatWasFound,
      whyItMatters: item.whyItMatters,
      howItFits: item.howItFits,
      effectOnLane: item.effectOnLane,
      whatItPointsToward: item.whatItPointsToward,
      alternativeExplanation: item.alternativeExplanation,
      whatItDoesNotProve: item.whatItDoesNotProve,
      evidenceStrength: item.evidenceStrength,
      confidence: item.confidence,
      investigativeLanes: item.investigativeLanes
    },
    profile: node ? { id: node.id, type: node.type, layer: node.layer, route: node.route, notes: array(node.notes), graphScore: node.score } : null,
    familyAccess: familyRecord ? {
      type: familyRecord.type,
      accessScore: familyRecord.accessScore,
      structuresReached: array(familyRecord.structuresReached),
      documentedAccess: array(familyRecord.documentedAccess),
      strongestCounterargument: familyRecord.strongestCounterargument,
      unsupportedClaim: familyRecord.unsupportedClaim,
      confidence: familyRecord.confidence
    } : null,
    legalAndWrongdoingRecord: legal,
    epsteinAndChildSafeguardingOverlaps: safeguarding,
    moneyOwnershipAndContracts: money,
    authorityAccessAndInstitutions: authority,
    documentedConnections: relationships,
    timeline,
    contradictionsAndCounterEvidence: contradictions,
    openQuestions: unique([...array(item.nextQuestions),...timeline.flatMap(record => array(record.nextQuestions))]).slice(0,16),
    sourceRoutes: unique([...profileRoutes,...array(item.sourceRoutes),...matched.flatMap(record => [record.itemUrl,record.sourceUrl,...array(record.sourceRoutes)])]).filter(Boolean).slice(0,40),
    totals: {
      matchedFindings: matched.length,
      legalRecords: legal.length,
      safeguardingOverlaps: safeguarding.length,
      moneyRecords: money.length,
      authorityRecords: authority.length,
      connections: relationships.length,
      contradictionRecords: contradictions.length
    },
    safeguardingBoundary: 'A documented overlap, contact, payment, friendship, event, flight, business relationship or shared institution does not by itself prove knowledge of or participation in another person’s crimes. Exact legal status and the conduct established by the cited record must remain visible.',
    dossierBoundary: 'This dossier combines source-linked records and structured relationships for investigation. It is not a verdict. Association is not guilt, access is not control, technical capability is not actual use, and allegations remain allegations unless a court or official finding establishes otherwise.'
  };
}

const dossiers = {
  ok: true,
  schemaVersion: '1.0.0',
  updated: now,
  rankingPolicy: watch.rankingPolicy,
  person: dossierFor('person', watch.person),
  institution: dossierFor('institution', watch.institution),
  family: dossierFor('family', watch.family),
  boundary: watch.boundary
};
watch.dossierRoute = 'data/daily-watch-dossiers.json';
watch.dossiers = {
  person: { route: 'daily-watch.html#person-dossier', totals: dossiers.person.totals },
  institution: { route: 'daily-watch.html#institution-dossier', totals: dossiers.institution.totals },
  family: { route: 'daily-watch.html#family-dossier', totals: dossiers.family.totals }
};
writeJson('data/daily-watch.json', watch);
writeJson('data/daily-watch-dossiers.json', dossiers);
writeJson('downloads/daily-watch-ranking-decision.json', { ok: true, generatedAt: now, promotionMargin: PROMOTION_MARGIN, decisions });
console.log(`Daily hit list stabilized: person=${watch.person.name}; institution=${watch.institution.name}; family=${watch.family.name}. ${PROMOTION_MARGIN}-point evidence promotion margin enforced.`);

module.exports = { watch, dossiers };
