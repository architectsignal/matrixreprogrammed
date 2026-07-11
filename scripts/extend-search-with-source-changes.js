const fs = require('fs');
const path = require('path');

const root = process.cwd();
const indexPath = path.join(root, 'search-index.json');
const changesPath = path.join(root, 'data', 'investigation-source-changes.json');
const searchPagePath = path.join(root, 'search.html');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function clean(value = '') {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function terms(value = '') {
  return [...new Set(clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(word => word.length > 2))].slice(0, 60);
}
function upsert(map, item) {
  const prior = map.get(item.url) || {};
  map.set(item.url, {
    ...prior,
    ...item,
    keywords: [...new Set([...(prior.keywords || []), ...(item.keywords || [])])],
    priority: Math.max(Number(prior.priority || 0), Number(item.priority || 0))
  });
}

let index = readJson(indexPath, []);
if (!Array.isArray(index)) index = [];
const map = new Map(index.filter(item => item && item.url).map(item => [item.url, item]));
const feed = readJson(changesPath, { changes: [] });

upsert(map, {
  url: 'source-changes.html',
  title: 'Investigation Source Change Record',
  category: 'Evidence Preservation',
  layer: 'disclosure-black-files',
  description: 'Public evidence-bounded summaries of monitored source additions, removals, wording changes, outages, restorations, retrieval dates and preserved hashes.',
  keywords: ['source changes','change detection','removed record','restored record','source outage','content hash','evidence preservation','archived version','retrieval date','missing record','redaction log'],
  priority: 108,
  sourceType: 'primary-source-change-ledger',
  evidenceGrade: 'B-C',
  status: 'source-change-observation'
});
upsert(map, {
  url: 'data/investigation-source-changes.json',
  title: 'Investigation Source Changes JSON',
  category: 'Machine Data',
  layer: 'disclosure-black-files',
  description: 'Machine-readable source change events with evidence grade, status, hashes, additions, removals, limitations, alternatives and next records.',
  keywords: ['json','source change feed','hash','additions','removals','restored','unavailable','evidence grade'],
  priority: 101,
  sourceType: 'json-feed'
});

for (const event of (feed.changes || []).slice(0, 250)) {
  if (!event || !event.id) continue;
  const added = (event.addedRecords || []).map(item => `${item.title} ${item.url}`).join(' ');
  const removed = (event.removedRecords || []).map(item => `${item.title} ${item.url}`).join(' ');
  const description = clean(`${event.whatIsEstablished || ''} ${event.whatIsNotEstablished || ''} ${event.mechanism || ''} ${event.implication || ''} ${event.alternativeExplanation || ''}`);
  upsert(map, {
    url: `source-changes.html#change-${encodeURIComponent(event.id)}`,
    title: event.title || 'Source change observation',
    category: `Source Change · Grade ${event.evidenceGrade || 'C'}`,
    layer: event.lane || 'disclosure-black-files',
    description: description.slice(0, 700),
    keywords: terms(`${event.title} ${event.source} ${event.changeType} ${added} ${removed} ${description}`),
    priority: event.changeType === 'records-removed' || event.changeType === 'unavailable' ? 104 : 99,
    sourceType: 'source-change-observation',
    evidenceGrade: event.evidenceGrade || 'C',
    status: event.factualStatus || 'source-change-observation',
    date: event.detectedAt || '',
    entity: event.source || '',
    sourceUrl: event.sourceUrl || ''
  });
}

const finalIndex = [...map.values()].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || String(a.title || '').localeCompare(String(b.title || '')));
fs.writeFileSync(indexPath, JSON.stringify(finalIndex, null, 2));

if (fs.existsSync(searchPagePath)) {
  let html = fs.readFileSync(searchPagePath, 'utf8');
  if (!html.includes('data-q="source changes removed restored hash"')) {
    const button = '<button class="btn alt" data-q="source changes removed restored hash">Source Changes</button>';
    const marker = '<button class="btn alt" data-q="daily investigation conclusions wrongdoing">Daily Conclusions</button>';
    html = html.includes(marker) ? html.replace(marker, `${marker}${button}`) : html.replace('</div></section><section class="section wrap split">', `${button}</div></section><section class="section wrap split">`);
  }
  fs.writeFileSync(searchPagePath, html);
}

console.log(`Source change search extension complete: ${finalIndex.length} routes and ${(feed.changes || []).length} preserved change events indexed.`);
