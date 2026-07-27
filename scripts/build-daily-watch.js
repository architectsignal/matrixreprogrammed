'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const at = value => path.join(root, value);
const exists = value => fs.existsSync(at(value));
const readJson = (value, fallback = {}) => {
  try { return JSON.parse(fs.readFileSync(at(value), 'utf8')); } catch { return fallback; }
};
const clean = (value, max = 1800) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[character]);
const array = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values.filter(Boolean))];
const asTime = value => { const stamp = Date.parse(value || ''); return Number.isFinite(stamp) ? stamp : 0; };
const recent = value => asTime(value) && Date.now() - asTime(value) <= 8 * 86400000;
const words = value => clean(value, 1200).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(token => token.length > 3);
const countMatches = (haystack, needles) => needles.reduce((total, needle) => total + (haystack.includes(needle) ? 1 : 0), 0);

function flattenObjects(value, source, output = [], depth = 0) {
  if (depth > 8 || output.length > 50000 || value == null) return output;
  if (Array.isArray(value)) {
    for (const item of value) flattenObjects(item, source, output, depth + 1);
    return output;
  }
  if (typeof value !== 'object') return output;
  output.push({ source, value });
  for (const child of Object.values(value)) if (child && typeof child === 'object') flattenObjects(child, source, output, depth + 1);
  return output;
}

function first(object, keys, max = 500) {
  for (const key of keys) {
    if (typeof object?.[key] === 'string' && clean(object[key], max)) return clean(object[key], max);
  }
  return '';
}

const standard = readJson('data/mission-orchestration-standard.json', {});
const synthesis = require('./build-speculative-intelligence-synthesis.js');
const daily = readJson('data/daily-investigation-conclusions.json', { strongestFindings: [] });
const drops = readJson('data/latest-public-drops.json', { drops: [] });
const events = readJson('data/record-events.json', { events: [] });
const entities = readJson('data/entity-registry.json', {});
const familyLayer = readJson('data/behind-the-curtain-family-access.json', { families: [] });
const familyLinks = readJson('data/power-family-intelligence-layer.json', { familyPersonLinks: [] });

const freshRows = [
  ...array(daily.strongestFindings).map(value => ({ source: 'data/daily-investigation-conclusions.json', value })),
  ...array(drops.drops).filter(item => !item.published || recent(item.published)).map(value => ({ source: 'data/latest-public-drops.json', value })),
  ...array(events.events).filter(item => !item.date && !item.published || recent(item.date || item.published || item.updated)).map(value => ({ source: 'data/record-events.json', value }))
];
const freshText = freshRows.map(row => clean(Object.values(row.value || {}).filter(value => typeof value === 'string').join(' '), 3500)).join(' ').toLowerCase();

const entityTypes = new Map();
for (const { value } of flattenObjects(entities, 'data/entity-registry.json')) {
  const name = first(value, ['name','label','entityName','personName','organizationName','companyName','institutionName'], 180);
  const type = first(value, ['entityType','schema','type','kind','category'], 100);
  if (!name || !type) continue;
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (key) entityTypes.set(key, type);
}

const institutionWords = /\b(?:inc|corp|corporation|company|group|holdings|bank|fund|foundation|trust|university|institute|agency|department|ministry|government|commission|authority|council|parliament|court|office|organisation|organization|committee|association|network|platform|exchange|partners|management|administration|union|nations|police|military|intelligence|media|news|laboratories|systems|technologies)\b/i;
const personNameShape = /^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){1,5}$/;
function actorType(actor) {
  const key = clean(actor.name, 180).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const registryType = entityTypes.get(key) || '';
  if (/person/i.test(registryType)) return 'person';
  if (/organization|company|agency|institution|foundation|trust|government|court|contractor/i.test(registryType)) return 'institution';
  if (personNameShape.test(actor.name || '') && !institutionWords.test(actor.name || '')) return 'person';
  return 'institution';
}

function actorFreshMatches(actor) {
  const name = clean(actor.name, 180).toLowerCase();
  if (!name) return 0;
  const exact = freshText.includes(name) ? 1 : 0;
  const tokenHits = countMatches(freshText, words(name));
  return exact * 4 + tokenHits;
}

const actorCandidates = array(synthesis?.inferenceLayer?.actorMap).map(actor => {
  const freshMatches = actorFreshMatches(actor);
  const score = Number(actor.specificity || 0) + Math.min(20, Number(actor.records || 0)) + freshMatches * 18;
  return { ...actor, entityClass: actorType(actor), freshMatches, watchScore: score };
}).filter(actor => clean(actor.name, 180) && clean(actor.sourceRoute, 700));

function pickActor(entityClass) {
  const candidates = actorCandidates.filter(actor => actor.entityClass === entityClass).sort((a, b) => b.watchScore - a.watchScore || b.freshMatches - a.freshMatches);
  return candidates[0] || actorCandidates.sort((a, b) => b.watchScore - a.watchScore)[0] || null;
}

const leadingPathways = array(synthesis?.inferenceLayer?.pathways).slice(0, 3);
const leadingLaneText = `${leadingPathways.map(item => `${item.title} ${item.meaning}`).join(' ')} ${array(synthesis?.evidenceLayer?.criticalClocks).slice(0,3).map(item => `${item.title} ${item.signals || ''} ${item.readerQuestion || ''}`).join(' ')}`.toLowerCase();
const familyLinkLookup = new Map(array(familyLinks.familyPersonLinks).map(link => [link.familyId, link]));
const familyCandidates = array(familyLayer.families).map(family => {
  const familyName = clean(family.name, 180).toLowerCase();
  const direct = freshText.includes(familyName) ? 1 : 0;
  const link = familyLinkLookup.get(family.id);
  const linkedPersonText = link ? String(link.personId || '').replace(/-/g, ' ') : '';
  const linkedPerson = linkedPersonText && freshText.includes(linkedPersonText) ? 1 : 0;
  const familyText = `${array(family.structuresReached).join(' ')} ${array(family.documentedAccess).join(' ')} ${family.type || ''}`.toLowerCase();
  const overlapTokens = unique(words(leadingLaneText)).slice(0, 80);
  const overlap = countMatches(familyText, overlapTokens);
  const score = direct * 120 + linkedPerson * 80 + overlap * 8 + Number(family.accessScore || 0) / 5;
  return { ...family, directFreshMatch: Boolean(direct || linkedPerson), laneOverlap: overlap, watchScore: score, linkedPersonId: link?.personId || '' };
}).sort((a, b) => b.watchScore - a.watchScore);

const person = pickActor('person');
const institution = pickActor('institution');
const family = familyCandidates[0] || null;

function laneNames(actor) {
  const names = unique([
    clean(actor?.roleGroup, 160),
    ...leadingPathways.filter(pathway => {
      const actorText = `${actor?.name || ''} ${actor?.documentedRole || ''} ${actor?.authority || ''} ${actor?.instrument || ''} ${actor?.whyItMatters || ''}`.toLowerCase();
      return words(`${pathway.title} ${pathway.meaning}`).some(token => actorText.includes(token));
    }).map(pathway => pathway.title)
  ]).filter(value => !/documented person or institution/i.test(value));
  return names.length ? names.slice(0, 4) : leadingPathways.slice(0, 2).map(item => item.title);
}

function matchingFreshRoutes(name) {
  const needle = clean(name, 180).toLowerCase();
  return freshRows.filter(row => clean(Object.values(row.value || {}).join(' '), 5000).toLowerCase().includes(needle)).flatMap(row => [
    first(row.value, ['itemUrl','sourceUrl','url','route','evidenceRoute','sourceRoute'], 800),
    row.source
  ]).filter(Boolean).slice(0, 8);
}

function actorSlot(actor, type) {
  if (!actor) return {
    type,
    name: `No qualifying ${type} identified`,
    selectionBasis: 'No source-linked candidate passed the daily selection threshold.',
    whatWasFound: 'The current build did not contain enough specific source-linked evidence to elevate a named entity.',
    whyItMatters: 'An empty watch is more trustworthy than a forced accusation or generic placeholder.',
    investigativeLanes: leadingPathways.slice(0, 2).map(item => item.title),
    howItFits: 'The mission requires precise actors, mechanisms and evidence routes before a person or institution is highlighted.',
    effectOnLane: 'insufficient-evidence',
    whatItPointsToward: 'A missing-record priority rather than a substantive conclusion.',
    alternativeExplanation: 'The relevant records may not yet be ingested, resolved or fresh enough for today’s watch.',
    whatItDoesNotProve: 'It does not prove that no relevant actor exists.',
    evidenceStrength: 'E0 — insufficient current evidence',
    confidence: 'low',
    sourceRoutes: ['investigation-source-ledger.html'],
    nextQuestions: ['Which current primary record names a specific actor?', 'Which authority, contract, filing or relationship establishes the mechanism?']
  };
  const direct = actor.freshMatches > 0;
  const action = clean(actor.action || actor.documentedRole, 360);
  const authority = clean(actor.authority, 260);
  const instrument = clean(actor.instrument, 320);
  const mechanism = clean(actor.whyItMatters || actor.summaries?.[0], 900);
  const lanes = laneNames(actor);
  return {
    type,
    name: actor.name,
    selectionBasis: direct ? 'Directly elevated by current source-linked evidence and repeated structured records.' : 'Highest current structured relevance to today’s leading evidence lanes; no direct allegation is inferred.',
    whatWasFound: `${action || 'A documented role or action is present in the linked records.'}${authority ? ` The relevant authority or institution is ${authority}.` : ''}${instrument ? ` The named instrument or record is ${instrument}.` : ''}`,
    whyItMatters: mechanism || `The record places ${actor.name} inside a documented authority, ownership, transaction, regulatory or implementation chain that can be tested against primary sources.`,
    investigativeLanes: lanes,
    howItFits: `This entity fits the mission because the documented role can reveal who possesses authority, manages infrastructure, controls capital, sets standards, operates access systems or acts as a gatekeeper. The relevant mechanism must be verified through the linked record rather than inferred from prominence alone.`,
    effectOnLane: direct ? 'moderately-strengthens' : 'adds-context',
    whatItPointsToward: `Closer examination of how ${lanes.join(', ').toLowerCase()} is implemented through identifiable people, institutions, laws, contracts, ownership rights or access decisions.`,
    alternativeExplanation: 'The action may be ordinary, lawful and limited to the stated professional or institutional role, with effective oversight and no wider coordination.',
    whatItDoesNotProve: 'Selection does not prove wrongdoing, secret intent, shared motive, participation in another person’s crimes or control of an entire system.',
    evidenceStrength: direct ? 'E3–E4 — current source-linked reporting and/or primary public records' : 'E2–E4 — documented structural relevance requiring direct review',
    confidence: direct ? 'moderate-to-high' : 'moderate',
    sourceRoutes: unique([actor.sourceRoute, ...array(actor.sources), ...matchingFreshRoutes(actor.name)]).slice(0, 10),
    nextQuestions: [
      `What exact legal, financial, ownership, appointment or operational authority does ${actor.name} possess?`,
      'Which dated primary record establishes the current action?',
      'What oversight, competing authority, opt-out or appeal limits the power?',
      'What new evidence would strengthen, narrow or falsify the lane connection?'
    ]
  };
}

function familySlot(item) {
  if (!item) return {
    type: 'family', name: 'No qualifying family identified', selectionBasis: 'No family record was available.', whatWasFound: 'No family-access dataset was available in this build.', whyItMatters: 'The system must not invent family influence.', investigativeLanes: [], howItFits: 'No conclusion.', effectOnLane: 'insufficient-evidence', whatItPointsToward: 'Missing records.', alternativeExplanation: 'Data may be unavailable.', whatItDoesNotProve: 'Nothing about any family.', evidenceStrength: 'E0', confidence: 'low', sourceRoutes: ['behind-the-curtain-capstone.html'], nextQuestions: ['Restore the family-access dataset.']
  };
  const direct = item.directFreshMatch;
  const structures = array(item.structuresReached).slice(0, 7);
  const access = array(item.documentedAccess).slice(0, 3);
  return {
    type: 'family',
    name: item.name,
    selectionBasis: direct ? 'A family name or linked operator appears in current evidence and the family has documented authority or access relevant to today’s lanes.' : 'Structural watch: today’s leading evidence lanes overlap with this family’s documented authority, voting control, capital access or institutional reach. This is not a new allegation.',
    whatWasFound: direct ? `Current evidence intersects with ${item.name}; the standing family-access record documents ${structures.join(', ')}.` : `No new wrongdoing finding is asserted. The family was elevated because today’s leading lanes overlap with documented access across ${structures.join(', ')}.`,
    whyItMatters: access.join(' ') || `${item.name} has a documented access score of ${item.accessScore}/100 based on the published family-access methodology.`,
    investigativeLanes: unique([...leadingPathways.slice(0, 3).map(item => item.title), 'Power-family succession and institutional access']).slice(0, 4),
    howItFits: 'The family lane asks whether legal succession, voting pools, foundations, holding companies, trustee powers, appointments or repeated gatekeeping preserve institutional access across generations. The mechanism—not the surname—is the evidence.',
    effectOnLane: direct ? 'moderately-strengthens' : 'adds-context',
    whatItPointsToward: `A focused review of ${structures.slice(0,4).join(', ').toLowerCase()} and whether documented control rights or appointments connect the family to today’s policy, capital or infrastructure developments.`,
    alternativeExplanation: clean(item.strongestCounterargument, 800) || 'Documented access may be constrained by law, boards, regulators, markets, professional management and competing institutions.',
    whatItDoesNotProve: clean(item.unsupportedClaim, 800) || 'Family membership, wealth or access does not prove wrongdoing, secret coordination or control of unrelated institutions.',
    evidenceStrength: direct ? 'E3–E5 — current evidence plus established public-record family-access data' : 'E4–E5 structural public records; no direct new allegation',
    confidence: clean(item.confidence, 80) || 'moderate',
    sourceRoutes: unique(['behind-the-curtain-capstone.html', 'behind-the-curtain-access.html', 'data/behind-the-curtain-family-access.json', ...array(item.sourceIds).map(id => `behind-the-curtain-capstone.html#${id}`)]).slice(0, 10),
    nextQuestions: [
      `Which current decision, transaction or appointment directly involves ${item.name}?`,
      'Who holds final voting, trustee or appointment authority?',
      'Which structures are independently managed or legally constrained?',
      'What evidence would lower the family-access assessment?'
    ]
  };
}

const watch = {
  ok: true,
  schemaVersion: '1.0.0',
  updated: new Date().toISOString(),
  date: new Date().toISOString().slice(0, 10),
  title: 'Daily Mission Watch',
  purpose: 'Identify one person, one institution and one family whose source-linked role deserves focused review today, then explain how the evidence fits the site mission.',
  leadingEvidenceConclusion: clean(synthesis?.evidenceLayer?.conclusion, 1800),
  leadingLanes: leadingPathways.map(item => ({ title: item.title, meaning: item.meaning, signalCount: item.signalCount })),
  person: actorSlot(person, 'person'),
  institution: actorSlot(institution, 'institution'),
  family: familySlot(family),
  boundary: standard?.dailyWatch?.boundary || 'Selection means the entity deserves focused source review today. It is not a guilt ranking or accusation.',
  reviewRule: 'Sensitive criminal or child-safeguarding claims require exact legal status, primary-source provenance and human editorial review before public accusation.'
};

const cards = ['person','institution','family'].map(key => {
  const item = watch[key];
  const routes = array(item.sourceRoutes).map(route => `<li><a href="${esc(route)}">${esc(route)}</a></li>`).join('');
  const questions = array(item.nextQuestions).map(question => `<li>${esc(question)}</li>`).join('');
  return `<article class="daily-watch-card ${esc(key)}"><span class="label">${esc(key)} to watch today · ${esc(item.effectOnLane)}</span><h2>${esc(item.name)}</h2><p><strong>What was found:</strong> ${esc(item.whatWasFound)}</p><p><strong>Why today:</strong> ${esc(item.selectionBasis)}</p><p><strong>Why it matters:</strong> ${esc(item.whyItMatters)}</p><p><strong>How it fits the mission:</strong> ${esc(item.howItFits)}</p><p><strong>What it points toward:</strong> ${esc(item.whatItPointsToward)}</p><p><strong>Alternative explanation:</strong> ${esc(item.alternativeExplanation)}</p><p class="boundary"><strong>What it does not prove:</strong> ${esc(item.whatItDoesNotProve)}</p><div class="daily-watch-meta"><span>${esc(item.evidenceStrength)}</span><span>Confidence: ${esc(item.confidence)}</span></div><details><summary>Evidence routes</summary><ul>${routes}</ul></details><details><summary>What to investigate next</summary><ul>${questions}</ul></details></article>`;
}).join('');

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Daily Mission Watch | Matrix Reprogrammed</title><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="reader-experience.css"><style>.daily-watch-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:1rem}.daily-watch-card{border:1px solid rgba(216,181,106,.28);border-radius:18px;padding:1rem;background:rgba(0,0,0,.82)}.daily-watch-card.person{border-left:4px solid #d8b56a}.daily-watch-card.institution{border-left:4px solid #8aa5d8}.daily-watch-card.family{border-left:4px solid #a87171}.daily-watch-meta{display:flex;gap:.6rem;flex-wrap:wrap}.daily-watch-meta span{border:1px solid rgba(216,181,106,.25);border-radius:999px;padding:.3rem .55rem;font-size:.78rem}.boundary{color:#c7b98e}.daily-watch-card details{margin-top:.7rem;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:.6rem}.daily-watch-card summary{cursor:pointer;font-weight:800}</style></head><body><div class="page"><header class="wrap topbar"><a class="brand" href="index.html">MATRIX REPROGRAMMED</a><nav class="nav"><a href="daily-command-brief.html">Daily Brief</a><a href="live-intel.html">Live Intel</a><a href="timers.html">Clocks</a><a href="behind-the-curtain-capstone.html">Power Families</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Evidence-led watch · ${esc(watch.date)}</div><h1>PERSON. INSTITUTION. FAMILY.</h1><p class="lead">Three entities whose documented roles deserve focused source review today—and a plain-language explanation of why.</p><p><strong>Today’s evidence direction:</strong> ${esc(watch.leadingEvidenceConclusion)}</p><p class="boundary"><strong>Boundary:</strong> ${esc(watch.boundary)}</p></section><section class="section wrap"><div class="daily-watch-grid">${cards}</div></section></main><footer class="footer wrap"><p>Evidence first. Mechanism explained. Guilt never inferred from association.</p></footer></div></body></html>`;

fs.mkdirSync(at('data'), { recursive: true });
fs.mkdirSync(at('downloads'), { recursive: true });
fs.writeFileSync(at('data/daily-watch.json'), JSON.stringify(watch, null, 2));
fs.writeFileSync(at('daily-watch.html'), html);
const markdown = ['# Daily Mission Watch','',`Updated: ${watch.updated}`,'',watch.leadingEvidenceConclusion,'',`> ${watch.boundary}`,'',...['person','institution','family'].flatMap(key => { const item = watch[key]; return [`## ${key[0].toUpperCase()+key.slice(1)} to watch today: ${item.name}`,'',`**What was found:** ${item.whatWasFound}`,'',`**Why today:** ${item.selectionBasis}`,'',`**Why it matters:** ${item.whyItMatters}`,'',`**How it fits:** ${item.howItFits}`,'',`**What it points toward:** ${item.whatItPointsToward}`,'',`**Alternative explanation:** ${item.alternativeExplanation}`,'',`**What it does not prove:** ${item.whatItDoesNotProve}`,'',`**Evidence:** ${item.evidenceStrength} · **Confidence:** ${item.confidence}`,'',`**Next questions:** ${array(item.nextQuestions).join('; ')}`,'']; })].join('\n');
fs.writeFileSync(at('downloads/daily-watch.md'), markdown);
console.log(`Daily watch built: person=${watch.person.name}; institution=${watch.institution.name}; family=${watch.family.name}.`);
