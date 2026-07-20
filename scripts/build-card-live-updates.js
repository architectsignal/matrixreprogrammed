const fs = require('fs');
const path = require('path');

const root = process.cwd();
const now = new Date().toISOString();

function read(file, fallback = '') {
  try { return fs.readFileSync(path.join(root, file), 'utf8'); } catch { return fallback; }
}
function readJson(file, fallback = {}) {
  try { return JSON.parse(read(file)); } catch { return fallback; }
}
function write(file, value) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, value);
}
function clean(value = '') {
  return String(value).replace(/<[^>]+>/g, ' ').replace(/&(?:#039|quot|amp|lt|gt);/g, ' ').replace(/\s+/g, ' ').trim();
}
function normalize(value = '') {
  return clean(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function recordDate(item = {}) {
  return item.published || item.date || item.observedAt || item.fetchedAt || item.updated || item.createdAt || '';
}
function arraysFrom(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return ['items', 'events', 'records', 'findings', 'briefings', 'observations'].flatMap(key => Array.isArray(value[key]) ? value[key] : []);
}
function recordFrom(item = {}, origin = 'machine') {
  return {
    title: clean(item.title || item.headline || item.name || item.subject || 'Untitled record'),
    summary: clean(item.summary || item.description || item.meaning || item.whatChanged || item.notes || ''),
    url: item.url || item.sourceUrl || item.route || '',
    published: recordDate(item),
    sourceLabel: clean(item.sourceLabel || item.source || item.publisher || item.agency || origin),
    sourceTier: item.sourceTier || item.evidenceGrade || item.recordGrade || item.status || 'ungraded',
    origin
  };
}

const live = readJson('data/live-intel.json', { updated: null, items: [] });
const recordEvents = readJson('data/record-events.json', {});
const observations = readJson('data/entity-observations.json', {});
const entityBriefs = readJson('data/entity-daily-briefs.json', {});
const searchIndex = readJson('search-index.json', []);

const records = [
  ...arraysFrom(live.items || []).map(item => recordFrom(item, 'Live Intel')),
  ...arraysFrom(recordEvents).map(item => recordFrom(item, 'Record Event')),
  ...arraysFrom(observations).map(item => recordFrom(item, 'Entity Observation')),
  ...arraysFrom(entityBriefs).map(item => recordFrom(item, 'Entity Brief'))
].filter(item => item.title && item.title !== 'Untitled record');

const generic = new Set(['the','and','for','with','from','into','about','matrix','reprogrammed','card','profile','brief','dossier','tracker','watch','intelligence','entity','person','main','player','official','public','record','latest','current','daily','html']);
function identityTokens(title = '', route = '') {
  const titleCore = String(title).split(/\||—|–| - /)[0];
  const routeCore = String(route).replace(/\.html(?:\?.*)?$/i, '').split('/').pop() || '';
  const source = normalize(titleCore).length >= 3 ? normalize(titleCore) : normalize(routeCore);
  return [...new Set(source.split(' ').filter(token => token.length >= 3 && !generic.has(token)))].slice(0, 8);
}
function isCardRoute(row = {}) {
  const route = String(row.url || '').toLowerCase();
  const meta = normalize([row.category, row.sourceType, row.layer, row.description].join(' '));
  return route.endsWith('.html') && (
    /(^|\/)(main-players|entity-briefs|billionaire-briefs|institution-briefs|contractor-briefs|entity-exposure|entity-timelines|cards?|card-decks?|people|profiles)(\/|$)/i.test(route) ||
    /card|profile|main player|entity brief|billionaire|institution|contractor|person dossier|people tracker/.test(meta) ||
    /andrew tate/i.test(String(row.title || ''))
  );
}
function fileTitle(route, fallback) {
  if (!route || route.includes('?') || route.includes('#')) return fallback;
  const html = read(route);
  if (!html) return fallback;
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return clean((h1 && h1[1]) || (title && title[1]) || fallback);
}

const candidateMap = new Map();
for (const row of Array.isArray(searchIndex) ? searchIndex : []) {
  if (!row || !isCardRoute(row)) continue;
  const route = String(row.url || '').split('#')[0].split('?')[0].replace(/^\//, '');
  if (!route || !route.endsWith('.html')) continue;
  const title = fileTitle(route, clean(row.title || route));
  candidateMap.set(route, { route, title, category: clean(row.category || 'Tracked card'), sourceType: row.sourceType || 'card-route' });
}

// Guarantee named examples and any card-like page missed by the search index are still discovered.
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
  const html = read(entry.name);
  if (!/Andrew\s+Tate/i.test(html) && !/data-(?:person|entity|card)|class=["'][^"']*\bcard-profile\b/i.test(html)) continue;
  const title = fileTitle(entry.name, entry.name.replace(/\.html$/, '').replace(/-/g, ' '));
  candidateMap.set(entry.name, { route: entry.name, title, category: /Andrew\s+Tate/i.test(html) ? 'Tracked person card' : 'Tracked card', sourceType: 'html-card-discovery' });
}

function matches(candidate, record) {
  const titleNorm = normalize(candidate.title);
  const hay = normalize([record.title, record.summary, record.sourceLabel, record.url].join(' '));
  if (!hay) return false;
  const compactTitle = titleNorm.split(' ').filter(token => !generic.has(token)).join(' ');
  if (compactTitle.length >= 7 && hay.includes(compactTitle)) return true;
  const tokens = identityTokens(candidate.title, candidate.route);
  if (tokens.length >= 2) return tokens.every(token => new RegExp(`\\b${token}\\b`).test(hay));
  if (tokens.length === 1 && tokens[0].length >= 5) return new RegExp(`\\b${tokens[0]}\\b`).test(hay);
  return false;
}

const cards = [...candidateMap.values()].map(candidate => {
  const matched = records.filter(record => matches(candidate, record))
    .sort((a, b) => Date.parse(b.published || 0) - Date.parse(a.published || 0))
    .slice(0, 8);
  return {
    route: candidate.route,
    title: candidate.title,
    category: candidate.category,
    checkedAt: now,
    sourceWindowUpdated: live.updated || null,
    status: matched.length ? 'current-records-matched' : 'no-new-verified-record-in-current-window',
    currentRecordCount: matched.length,
    latestRecordAt: matched.map(record => record.published).filter(Boolean).sort().reverse()[0] || null,
    evidenceBoundary: 'A matched source updates the card research trail; it does not convert association, reporting, allegation, charge or mention into proven wrongdoing.',
    updates: matched
  };
}).sort((a, b) => a.title.localeCompare(b.title));

const byRoute = Object.fromEntries(cards.map(card => [card.route.replace(/^\//, ''), card]));
const andrewTateRoutes = cards.filter(card => /andrew\s+tate/i.test(card.title) || /andrew-tate/i.test(card.route)).map(card => card.route);
const report = {
  schemaVersion: 1,
  updated: now,
  sourceWindowUpdated: live.updated || null,
  title: 'Card Live Intelligence Updates',
  cardCount: cards.length,
  currentRecordCardCount: cards.filter(card => card.currentRecordCount > 0).length,
  quietCardCount: cards.filter(card => card.currentRecordCount === 0).length,
  andrewTateRoutes,
  policy: 'Every tracked card is checked against current Live Intel, record events, entity observations and entity briefs. Cards with no new verified record say so explicitly instead of displaying a synthetic update.',
  cards,
  byRoute
};
write('data/card-live-updates.json', `${JSON.stringify(report, null, 2)}\n`);

const md = ['# Card Live Intelligence Updates', '', `Generated: ${now}`, `Live Intel source window: ${live.updated || 'unavailable'}`, `Tracked cards: ${cards.length}`, `Cards with current matched records: ${report.currentRecordCardCount}`, `Cards with no new verified record: ${report.quietCardCount}`, `Andrew Tate routes: ${andrewTateRoutes.join(', ') || 'not discovered'}`, '', report.policy, ''];
for (const card of cards) {
  md.push(`## ${card.title}`, `- Route: ${card.route}`, `- Status: ${card.status}`, `- Current matched records: ${card.currentRecordCount}`, `- Latest record: ${card.latestRecordAt || 'none in current window'}`);
  for (const update of card.updates.slice(0, 3)) md.push(`- ${update.published || 'undated'} — ${update.title} — ${update.url || update.sourceLabel}`);
  md.push('');
}
write('downloads/card-live-updates.md', `${md.join('\n')}\n`);

const machine = {
  updated: now,
  liveIntelUpdated: live.updated || null,
  liveIntelStatus: live.status || 'unknown',
  liveIntelItemCount: Array.isArray(live.items) ? live.items.length : 0,
  cardFeedUpdated: now,
  trackedCards: cards.length,
  currentRecordCards: report.currentRecordCardCount,
  quietCards: report.quietCardCount,
  andrewTateTracked: andrewTateRoutes.length > 0,
  status: cards.length && live.updated ? 'machine-dependants-generated' : 'machine-dependants-incomplete'
};
write('data/live-machine-status.json', `${JSON.stringify(machine, null, 2)}\n`);
write('downloads/live-machine-status.md', `# Live Machine Status\n\nGenerated: ${now}\n\n- Live Intel updated: ${machine.liveIntelUpdated || 'unavailable'}\n- Live Intel items: ${machine.liveIntelItemCount}\n- Tracked cards: ${machine.trackedCards}\n- Cards with current records: ${machine.currentRecordCards}\n- Cards with no new verified record: ${machine.quietCards}\n- Andrew Tate tracked: ${machine.andrewTateTracked}\n- Status: ${machine.status}\n`);

console.log(`Card intelligence feed generated for ${cards.length} card(s); ${report.currentRecordCardCount} have current matched records; Andrew Tate routes: ${andrewTateRoutes.length}.`);
