'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const at = value => path.join(root, value);
const readJson = (value, fallback = {}) => { try { return JSON.parse(fs.readFileSync(at(value), 'utf8')); } catch { return fallback; } };
const writeJson = (value, content) => { fs.mkdirSync(path.dirname(at(value)), { recursive: true }); fs.writeFileSync(at(value), JSON.stringify(content, null, 2)); };
const clean = (value, max = 1800) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const array = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values.filter(Boolean))];
const normalise = value => clean(value, 240).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const asTime = value => { const stamp = Date.parse(value || ''); return Number.isFinite(stamp) ? stamp : 0; };
const recent = value => asTime(value) > 0 && Date.now() - asTime(value) <= 8 * 86400000;
const words = value => normalise(value).split(/\s+/).filter(token => token.length > 3);
const first = (object, keys, max = 700) => { for (const key of keys) if (typeof object?.[key] === 'string' && clean(object[key], max)) return clean(object[key], max); return ''; };

const standard = readJson('data/mission-orchestration-standard.json', {});
const synthesis = require('./build-speculative-intelligence-synthesis.js');
const daily = readJson('data/daily-investigation-conclusions.json', { strongestFindings: [] });
const drops = readJson('data/latest-public-drops.json', { drops: [] });
const events = readJson('data/record-events.json', { events: [] });
const registry = readJson('data/entity-registry.json', { entities: [] });
const graph = readJson('data/evidence-weighted-relationship-graph.json', { nodes: [] });
const familyLayer = readJson('data/behind-the-curtain-family-access.json', { families: [] });
const familyLinks = readJson('data/power-family-intelligence-layer.json', { familyPersonLinks: [] });
const incumbentState = readJson('data/daily-watch-incumbents.json', { slots: {} });

const freshRows = [
  ...array(daily.strongestFindings).map(value => ({ source: 'data/daily-investigation-conclusions.json', value })),
  ...array(drops.drops).filter(item => !item.published || recent(item.published)).map(value => ({ source: 'data/latest-public-drops.json', value })),
  ...array(events.events).filter(item => (!item.date && !item.published) || recent(item.date || item.published || item.updated)).map(value => ({ source: 'data/record-events.json', value }))
];
const leadingPathways = array(synthesis?.inferenceLayer?.pathways).slice(0, 3);
const actorMap = new Map(array(synthesis?.inferenceLayer?.actorMap).map(actor => [normalise(actor.name), actor]).filter(([name]) => name));
const graphMap = new Map(array(graph.nodes).map(node => [normalise(node.name), node]).filter(([name]) => name));
const entityMap = new Map(array(registry.entities).map(entity => [normalise(entity.name), entity]).filter(([name]) => name));

const personTypes = new Set(['person']);
const institutionTypes = new Set(['organization','company','governmentagency','contractor','foundation','trust']);
const personProfileRoute = /(?:^|\/)(?:people|person|billionaire-briefs|power-players|dossiers)\//i;
const institutionProfileRoute = /(?:^|\/)(?:institution-briefs|contractor-briefs|big-three|companies|foundations|agencies|organizations)\//i;
const genericOrDocumentTitle = /^(?:the\s+)?(?:first|second|third|final|new|latest|current)\s+(?:phase|release|batch|set|wave)\b|\b(?:files?|library|dataset|document|report|briefing|release|disclosure|archive|index|timeline|dossier|finding|complaint|judgment|notice|case files?)\b/i;
const personShape = /^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){1,5}$/;

function graphClass(node) {
  const text = `${node?.type || ''} ${node?.layer || ''}`.toLowerCase();
  const route = clean(node?.route, 900);
  if (/person|profile|billionaire/.test(text) || personProfileRoute.test(route)) return 'person';
  if (/institution|organisation|organization|company|corporat|agency|government|foundation|trust|contractor|bank|asset manager/.test(text) || institutionProfileRoute.test(route)) return 'institution';
  return '';
}

function entityClass(name) {
  const key = normalise(name);
  const entity = entityMap.get(key);
  const type = normalise(entity?.type).replace(/ /g, '');
  if (personTypes.has(type)) return 'person';
  if (institutionTypes.has(type)) return 'institution';
  return graphClass(graphMap.get(key));
}

function validResolvedName(name, expectedClass) {
  const label = clean(name, 220);
  if (!label || /^no qualifying/i.test(label) || genericOrDocumentTitle.test(label)) return false;
  if (expectedClass === 'person' && !personShape.test(label)) return false;
  return entityClass(label) === expectedClass;
}

function rowText(row) {
  const value = row?.value || {};
  return clean(Object.values(value).filter(item => ['string','number'].includes(typeof item)).join(' '), 7000).toLowerCase();
}

function matchingFreshRows(name) {
  const needle = clean(name, 220).toLowerCase();
  if (!needle) return [];
  return freshRows.filter(row => rowText(row).includes(needle));
}

function rowRoutes(rows) {
  return unique(rows.flatMap(row => [
    first(row.value, ['itemUrl','sourceUrl','url','route','evidenceRoute','sourceRoute'], 900),
    row.source
  ])).slice(0, 12);
}

function laneNames(candidate) {
  const text = `${candidate.name} ${candidate.actor?.documentedRole || ''} ${candidate.actor?.roleGroup || ''} ${candidate.actor?.authority || ''} ${candidate.actor?.instrument || ''} ${candidate.actor?.whyItMatters || ''} ${array(candidate.node?.notes).join(' ')} ${array(candidate.entity?.roles).join(' ')}`.toLowerCase();
  const matched = leadingPathways.filter(pathway => words(`${pathway.title} ${pathway.meaning}`).some(token => text.includes(token))).map(pathway => pathway.title);
  const lanes = unique([clean(candidate.actor?.roleGroup, 180), ...matched]).filter(value => value && !/documented person or institution/i.test(value)).slice(0, 4);
  return lanes.length ? lanes : leadingPathways.slice(0, 2).map(pathway => pathway.title);
}

function evidenceDate(ref) {
  return ref.publicationDate || ref.retrievalDate || ref.date || ref.updated || '';
}

function candidateFrom(name) {
  const key = normalise(name);
  const entity = entityMap.get(key) || null;
  const node = graphMap.get(key) || null;
  const actor = actorMap.get(key) || null;
  const entityType = normalise(entity?.type).replace(/ /g, '');
  const resolvedClass = personTypes.has(entityType) ? 'person' : institutionTypes.has(entityType) ? 'institution' : graphClass(node);
  if (!resolvedClass || !validResolvedName(name, resolvedClass)) return null;
  const rows = matchingFreshRows(name);
  const refs = array(entity?.evidenceRefs);
  const freshRefs = refs.filter(ref => recent(evidenceDate(ref)));
  const directFresh = rows.length > 0 || freshRefs.length > 0;
  const reviewed = !/unreviewed/i.test(clean(entity?.reviewStatus, 180));
  const graphScore = Number(node?.score || 0);
  const actorSpecificity = Number(actor?.specificity || 0);
  const actorRecords = Math.min(20, Number(actor?.records || 0));
  const score = Math.round((directFresh ? 100 : 0) + Math.min(60, rows.length * 20 + freshRefs.length * 12) + Math.min(24, refs.length * 3) + graphScore / 5 + actorSpecificity + actorRecords + (reviewed ? 8 : 0));
  return { name: clean(name, 220), resolvedClass, entity, node, actor, rows, refs, freshRefs, directFresh, score };
}

const names = unique([
  ...array(registry.entities).map(entity => clean(entity.name, 220)),
  ...array(graph.nodes).map(node => clean(node.name, 220)),
  ...array(synthesis?.inferenceLayer?.actorMap).map(actor => clean(actor.name, 220))
]);
const candidates = names.map(candidateFrom).filter(Boolean);

function pick(resolvedClass) {
  return candidates.filter(candidate => candidate.resolvedClass === resolvedClass).sort((a, b) =>
    Number(b.directFresh) - Number(a.directFresh) || b.score - a.score || b.rows.length - a.rows.length || b.refs.length - a.refs.length || a.name.localeCompare(b.name)
  )[0] || null;
}

function noCandidate(type) {
  return {
    type,
    name: `No qualifying ${type} identified`,
    selectionBasis: 'No registry-resolved, source-linked entity passed the current evidence threshold.',
    whatWasFound: 'The current build did not contain enough authoritative entity resolution and source-linked evidence to elevate a named entity.',
    whyItMatters: 'An empty position is more trustworthy than promoting a document title, generic label or unresolved name.',
    investigativeLanes: leadingPathways.slice(0, 2).map(item => item.title),
    howItFits: 'The mission requires a verified entity identity, a documented mechanism and inspectable source routes before a card is published.',
    effectOnLane: 'insufficient-evidence',
    whatItPointsToward: 'A missing-record and entity-resolution priority rather than a substantive accusation.',
    alternativeExplanation: 'Relevant records may not yet be ingested, resolved or current enough for promotion.',
    whatItDoesNotProve: 'It does not prove that no relevant person or institution exists.',
    evidenceStrength: 'E0 — insufficient resolved evidence',
    confidence: 'low',
    sourceRoutes: ['investigation-source-ledger.html'],
    nextQuestions: ['Which primary record names a specific resolved entity?', 'Which legal authority, contract, filing, ownership right or relationship establishes the mechanism?']
  };
}

function slotFrom(candidate, type) {
  if (!candidate) return noCandidate(type);
  const actor = candidate.actor || {};
  const lanes = laneNames(candidate);
  const action = clean(actor.action || actor.documentedRole || array(candidate.entity?.roles).join(', ') || candidate.node?.type, 420);
  const authority = clean(actor.authority, 280);
  const instrument = clean(actor.instrument, 340);
  const directCount = candidate.rows.length + candidate.freshRefs.length;
  const routes = unique([
    clean(candidate.node?.route, 900),
    clean(actor.sourceRoute, 900),
    ...array(actor.sources),
    ...rowRoutes(candidate.rows),
    ...candidate.refs.map(ref => clean(ref.sourceUrl, 900))
  ]).filter(Boolean).slice(0, 16);
  const actorMeaning = clean(actor.whyItMatters || actor.summaries?.[0], 950);
  return {
    type,
    name: candidate.name,
    entityResolution: {
      status: 'authoritatively-resolved',
      registryId: candidate.entity?.id || '',
      registryType: candidate.entity?.type || '',
      graphId: candidate.node?.id || '',
      graphType: candidate.node?.type || '',
      reviewStatus: candidate.entity?.reviewStatus || '',
      directFreshRecords: directCount
    },
    selectionBasis: candidate.directFresh
      ? `Directly elevated by current source-linked evidence resolving to this ${type}: ${directCount} fresh record${directCount === 1 ? '' : 's'} plus ${candidate.refs.length} retained evidence reference${candidate.refs.length === 1 ? '' : 's'}.`
      : 'Highest registry-resolved structural relevance to the leading evidence lanes. No fresh accusation is inferred, and this position changes only when stronger source-linked evidence clears the promotion threshold.',
    whatWasFound: `${action || 'A documented role or institutional position is present in the linked records.'}${authority ? ` Relevant authority: ${authority}.` : ''}${instrument ? ` Named instrument or record: ${instrument}.` : ''}`,
    whyItMatters: actorMeaning || `The evidence places ${candidate.name} inside a documented authority, ownership, finance, policy, infrastructure or access chain that can be tested against primary records.`,
    investigativeLanes: lanes,
    howItFits: `This ${type} fits the mission because the resolved records can show who possesses authority, manages capital or infrastructure, sets standards, controls access, receives contracts or acts as a gatekeeper. The mechanism must be demonstrated by the cited records, not inferred from prominence.`,
    effectOnLane: candidate.directFresh ? 'moderately-strengthens' : 'adds-context',
    whatItPointsToward: `Closer examination of how ${lanes.join(', ').toLowerCase()} operates through identifiable people, institutions, laws, contracts, ownership rights, appointments and access decisions.`,
    alternativeExplanation: 'The documented activity may be ordinary, lawful and limited to the stated role, with effective oversight, competition and no wider coordination.',
    whatItDoesNotProve: 'Selection does not prove wrongdoing, secret intent, shared motive, participation in another person’s crimes or control of an entire system.',
    evidenceStrength: candidate.directFresh ? 'E3–E4 — resolved current reporting and/or primary public records' : 'E2–E4 — resolved structural public records requiring direct review',
    confidence: candidate.directFresh && (candidate.entity || candidate.node) ? 'moderate-to-high' : 'moderate',
    sourceRoutes: routes.length ? routes : ['investigation-source-ledger.html'],
    nextQuestions: [
      `What exact legal, financial, ownership, appointment or operational authority does ${candidate.name} possess?`,
      'Which dated primary record establishes the current action?',
      'What oversight, competing authority, opt-out or appeal limits the power?',
      'What new evidence would strengthen, narrow, replace or falsify this position?'
    ]
  };
}

const personCandidate = pick('person');
const institutionCandidate = pick('institution');
const leadingLaneText = `${leadingPathways.map(item => `${item.title} ${item.meaning}`).join(' ')} ${array(synthesis?.evidenceLayer?.criticalClocks).map(item => `${item.title} ${item.signals || ''}`).join(' ')}`.toLowerCase();
const familyLinkLookup = new Map(array(familyLinks.familyPersonLinks).map(link => [link.familyId, link]));
const familyCandidates = array(familyLayer.families).map(family => {
  const familyName = clean(family.name, 220);
  const link = familyLinkLookup.get(family.id);
  const linkedPerson = String(link?.personId || '').replace(/-/g, ' ');
  const direct = freshRows.some(row => { const text = rowText(row); return text.includes(familyName.toLowerCase()) || (linkedPerson && text.includes(linkedPerson)); });
  const familyText = `${array(family.structuresReached).join(' ')} ${array(family.documentedAccess).join(' ')} ${family.type || ''}`.toLowerCase();
  const overlap = unique(words(leadingLaneText)).slice(0, 80).filter(token => familyText.includes(token)).length;
  return { ...family, directFreshMatch: direct, laneOverlap: overlap, watchScore: (direct ? 120 : 0) + overlap * 8 + Number(family.accessScore || 0) / 5 };
}).sort((a, b) => b.watchScore - a.watchScore);

function familySlot(item) {
  if (!item) return noCandidate('family');
  const structures = array(item.structuresReached).slice(0, 7);
  const access = array(item.documentedAccess).slice(0, 3);
  return {
    type: 'family',
    name: item.name,
    entityResolution: { status: 'resolved-family-access-record', familyId: item.id || '', directFreshRecords: item.directFreshMatch ? 1 : 0 },
    selectionBasis: item.directFreshMatch
      ? 'A family name or linked operator appears in current evidence through source-linked records, and the family has documented authority or access relevant to the leading lanes.'
      : 'Structural watch: leading evidence lanes overlap with documented authority, voting control, capital access or institutional reach. This is not a new allegation.',
    whatWasFound: item.directFreshMatch ? `Current evidence intersects with ${item.name}; the standing family-access record documents ${structures.join(', ')}.` : `No new wrongdoing finding is asserted. The family is elevated because the leading lanes overlap with documented access across ${structures.join(', ')}.`,
    whyItMatters: access.join(' ') || `${item.name} has a documented access score of ${item.accessScore}/100 under the published family-access methodology.`,
    investigativeLanes: unique([...leadingPathways.map(pathway => pathway.title), 'Power-family succession and institutional access']).slice(0, 4),
    howItFits: 'The family lane tests whether legal succession, voting pools, foundations, holding companies, trustee powers, appointments or repeated gatekeeping preserve institutional access across generations. The mechanism—not the surname—is the evidence.',
    effectOnLane: item.directFreshMatch ? 'moderately-strengthens' : 'adds-context',
    whatItPointsToward: `A focused review of ${structures.slice(0, 4).join(', ').toLowerCase()} and whether documented control rights or appointments connect the family to current policy, capital or infrastructure developments.`,
    alternativeExplanation: clean(item.strongestCounterargument, 900) || 'Documented access may be constrained by law, boards, regulators, markets, professional management and competing institutions.',
    whatItDoesNotProve: clean(item.unsupportedClaim, 900) || 'Family membership, wealth or access does not prove wrongdoing, secret coordination or control of unrelated institutions.',
    evidenceStrength: item.directFreshMatch ? 'E3–E5 — current evidence plus established public-record family-access data' : 'E4–E5 — structural public records; no direct new allegation',
    confidence: clean(item.confidence, 100) || 'moderate',
    sourceRoutes: unique(['behind-the-curtain-capstone.html','behind-the-curtain-access.html',...array(item.sourceIds).map(id => `behind-the-curtain-capstone.html#${id}`)]).slice(0, 12),
    nextQuestions: [`Which current decision, transaction or appointment directly involves ${item.name}?`, 'Who holds final voting, trustee or appointment authority?', 'Which structures are independently managed or legally constrained?', 'What evidence would lower or replace the family-access assessment?']
  };
}

const watch = {
  ok: true,
  schemaVersion: '2.0.0',
  updated: new Date().toISOString(),
  date: new Date().toISOString().slice(0, 10),
  title: 'Daily Intelligence Hit List',
  purpose: 'Maintain one resolved person, one resolved institution and one documented family research priority, changing a position only when materially stronger source-linked evidence clears the promotion threshold.',
  leadingEvidenceConclusion: clean(synthesis?.evidenceLayer?.conclusion, 1800),
  leadingLanes: leadingPathways.map(item => ({ title: item.title, meaning: item.meaning, signalCount: item.signalCount })),
  person: slotFrom(personCandidate, 'person'),
  institution: slotFrom(institutionCandidate, 'institution'),
  family: familySlot(familyCandidates[0] || null),
  boundary: standard?.dailyWatch?.boundary || 'Selection means the entity deserves focused source review. It is not a guilt ranking, accusation or declaration of hidden control.',
  reviewRule: 'Sensitive criminal or child-safeguarding claims require exact legal status, primary-source provenance and human editorial review before public accusation.'
};

incumbentState.slots = incumbentState.slots && typeof incumbentState.slots === 'object' ? incumbentState.slots : {};
const invalidated = [];
for (const slot of ['person','institution']) {
  const incumbentName = incumbentState.slots?.[slot]?.item?.name;
  if (incumbentName && !validResolvedName(incumbentName, slot)) { delete incumbentState.slots[slot]; invalidated.push({ slot, name: incumbentName, reason: 'incumbent did not resolve to the required authoritative entity class' }); }
}
const familyNames = new Set(array(familyLayer.families).map(item => normalise(item.name)));
const familyIncumbent = incumbentState.slots?.family?.item?.name;
if (familyIncumbent && !familyNames.has(normalise(familyIncumbent))) { delete incumbentState.slots.family; invalidated.push({ slot: 'family', name: familyIncumbent, reason: 'incumbent did not resolve to the family-access registry' }); }
incumbentState.updated = watch.updated;
incumbentState.entityResolutionVersion = '2.0.0';
writeJson('data/daily-watch-incumbents.json', incumbentState);
writeJson('data/daily-watch.json', watch);
writeJson('downloads/daily-watch-entity-resolution-report.json', {
  ok: validResolvedName(watch.person.name, 'person') && validResolvedName(watch.institution.name, 'institution') && familyNames.has(normalise(watch.family.name)),
  generatedAt: watch.updated,
  selected: { person: watch.person.name, institution: watch.institution.name, family: watch.family.name },
  candidateCounts: { person: candidates.filter(item => item.resolvedClass === 'person').length, institution: candidates.filter(item => item.resolvedClass === 'institution').length, family: familyCandidates.length },
  invalidatedIncumbents: invalidated,
  forbiddenExamples: ['document titles','release titles','case titles','archive labels','generic findings'],
  boundary: 'Entity resolution verifies identity class only. It does not establish wrongdoing or the truth of every linked claim.'
});
const markdown = ['# Daily Intelligence Hit List','',`Updated: ${watch.updated}`,'',watch.leadingEvidenceConclusion,'',`> ${watch.boundary}`,'',...['person','institution','family'].flatMap(slot => { const item = watch[slot]; return [`## ${slot[0].toUpperCase()+slot.slice(1)}: ${item.name}`,'',`**What was found:** ${item.whatWasFound}`,'',`**Why it matters:** ${item.whyItMatters}`,'',`**How it fits:** ${item.howItFits}`,'',`**What it points toward:** ${item.whatItPointsToward}`,'',`**Alternative explanation:** ${item.alternativeExplanation}`,'',`**What it does not prove:** ${item.whatItDoesNotProve}`,'',`**Evidence:** ${item.evidenceStrength} · **Confidence:** ${item.confidence}`,'']; })].join('\n');
fs.mkdirSync(at('downloads'), { recursive: true });
fs.writeFileSync(at('downloads/daily-watch.md'), markdown);
if (!validResolvedName(watch.person.name, 'person') || !validResolvedName(watch.institution.name, 'institution') || !familyNames.has(normalise(watch.family.name))) throw new Error('Daily hit list entity resolution failed closed.');
console.log(`Daily hit list resolved: person=${watch.person.name}; institution=${watch.institution.name}; family=${watch.family.name}; invalid incumbents removed=${invalidated.length}.`);
