const fs = require('fs');
const path = require('path');

const root = process.cwd();
const indexPath = path.join(root, 'search-index.json');
const searchPagePath = path.join(root, 'search.html');
const searchJsPath = path.join(root, 'search.js');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { return fallback; }
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

let index = [];
try { index = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch { index = []; }
if (!Array.isArray(index)) index = [];
const map = new Map(index.filter(item => item && item.url).map(item => [item.url, item]));

const routes = [
  {
    url: 'investigation-machine.html', title: 'Intelligent Investigation Machine', category: 'Investigation Machine', layer: 'government-enforcement', priority: 110,
    description: 'Daily and weekly searches across government platforms, official enforcement, Epstein files, public contracts, financial filings, oversight, declassified archives, WikiLeaks and international anti-corruption sources.',
    keywords: ['investigation machine','corruption','wrongdoing','government records','Epstein files','WikiLeaks','public contracts','official enforcement','daily conclusions','weekly investigation']
  },
  {
    url: 'daily-investigation-conclusions.html', title: 'Daily Investigation Conclusions', category: 'Daily Intelligence', layer: 'government-enforcement', priority: 109,
    description: 'Daily evidence-bounded conclusions separating established wrongdoing, official enforcement, charges and allegations, audit findings, document releases and missing records.',
    keywords: ['daily conclusions','wrongdoing','corruption','conviction','charged','indicted','sanctions','audit','missing records','evidence boundary']
  },
  {
    url: 'weekly-investigation-report.html', title: 'Weekly Investigation Report', category: 'Weekly Intelligence', layer: 'government-enforcement', priority: 108,
    description: 'Weekly cross-source findings, patterns, money routes, institutional accountability, official outcomes, leak leads and the records required next.',
    keywords: ['weekly investigation','corruption patterns','power','money routes','official records','government','leaks','accountability']
  },
  {
    url: 'investigation-source-ledger.html', title: 'Investigation Source Ledger', category: 'Source Ledger', layer: 'disclosure-black-files', priority: 107,
    description: 'Every monitored source, last attempt, last success, content change, parsed items and failure status across government, regulator, archive and investigative platforms.',
    keywords: ['source ledger','government platforms','DOJ','SEC','USAspending','Federal Register','WikiLeaks','FBI Vault','CIA reading room','EPPO','SFO','HATVP']
  },
  {
    url: 'source-changes.html', title: 'Source Change Ledger', category: 'Evidence Preservation', layer: 'disclosure-black-files', priority: 108,
    description: 'Public evidence-preservation ledger for additions, removals, source failures, restorations, retrieval dates and SHA-256 content hashes.',
    keywords: ['source change','page changed','record removed','record restored','change detection','snapshot','sha256','hash','evidence preservation','missing record','redaction log']
  },
  {
    url: 'data/investigation-ledger.json', title: 'Investigation Evidence Ledger JSON', category: 'Machine Data', layer: 'government-enforcement', priority: 101,
    description: 'Machine-readable evidence findings with grade, status, source, mechanism, implication, boundary and next records.',
    keywords: ['json','investigation ledger','wrongdoing status','evidence grade','mechanism','next records']
  },
  {
    url: 'data/daily-investigation-conclusions.json', title: 'Daily Investigation Conclusions JSON', category: 'Machine Data', layer: 'government-enforcement', priority: 100,
    description: 'Machine-readable daily findings and conclusions.',
    keywords: ['daily investigation json','conclusions','official enforcement','charges','document leads']
  },
  {
    url: 'data/weekly-investigation-conclusions.json', title: 'Weekly Investigation Report JSON', category: 'Machine Data', layer: 'government-enforcement', priority: 99,
    description: 'Machine-readable weekly findings and cross-source patterns.',
    keywords: ['weekly investigation json','patterns','corruption','power routes']
  },
  {
    url: 'data/investigation-source-registry.json', title: 'Investigation Source Registry JSON', category: 'Machine Data', layer: 'disclosure-black-files', priority: 98,
    description: 'Government, regulator, court, oversight, archive, WikiLeaks and anti-corruption sources searched daily and weekly.',
    keywords: ['source registry','government sources','WikiLeaks','DOJ Epstein','SEC','USAspending','oversight']
  },
  {
    url: 'data/source-change-public.json', title: 'Public Source Change Data JSON', category: 'Machine Data', layer: 'disclosure-black-files', priority: 102,
    description: 'Machine-readable public source-change records with hashes, retrieval dates, additions, removals, restorations and evidence boundaries.',
    keywords: ['source change json','hashes','retrieval date','addition','removal','restored source','evidence preservation']
  }
];
routes.forEach(route => upsert(map, { ...route, sourceType: route.url.endsWith('.html') ? 'investigation-route' : 'json-feed' }));

const daily = readJson('data/daily-investigation-conclusions.json', { strongestFindings: [] });
const weekly = readJson('data/weekly-investigation-conclusions.json', { strongestFindings: [] });
const findings = [...(daily.strongestFindings || []), ...(weekly.strongestFindings || [])];
const seenFindings = new Set();
for (const finding of findings) {
  if (!finding || !finding.id || seenFindings.has(finding.id)) continue;
  seenFindings.add(finding.id);
  const url = `daily-investigation-conclusions.html?finding=${encodeURIComponent(finding.id)}`;
  const description = clean(`${finding.conclusion || ''} ${finding.mechanism || ''} ${finding.evidenceBoundary || ''}`);
  upsert(map, {
    url,
    title: finding.title || 'Investigation finding',
    category: `Investigation · Grade ${finding.evidenceGrade || 'C'}`,
    layer: finding.lane || 'government-enforcement',
    description: description.slice(0, 520),
    keywords: terms(`${finding.title} ${description} ${(finding.wrongdoingIndicators || []).join(' ')} ${finding.sourceLabel}`),
    priority: 95 + Number(finding.severity || 0),
    sourceType: 'investigation-finding'
  });
}

const registry = readJson('data/investigation-source-registry.json', { sources: [] });
for (const source of registry.sources || []) {
  upsert(map, {
    url: `investigation-source-ledger.html?source=${encodeURIComponent(source.id)}`,
    title: source.label,
    category: 'Investigation Source',
    layer: source.lane || 'disclosure-black-files',
    description: `Monitored ${source.frequency?.join(' and ') || 'regularly'} as ${source.authority || 'source'}: ${source.url}`,
    keywords: terms(`${source.label} ${source.id} ${source.lane} ${(source.keywords || []).join(' ')} ${source.url}`),
    priority: 90,
    sourceType: 'source-registry'
  });
}

const sourceChanges = readJson('data/source-change-public.json', {changes: []});
for (const change of sourceChanges.changes || []) {
  if (!change?.id) continue;
  const description = clean(`${change.established || ''} ${change.notEstablished || ''} ${(change.additions || []).join(' ')} ${(change.removals || []).join(' ')}`);
  upsert(map, {
    url: `source-changes.html?change=${encodeURIComponent(change.id)}`,
    title: `${change.sourceLabel || change.sourceId} — ${String(change.changeType || 'source change').replace(/-/g, ' ')}`,
    category: `Source Change · Grade ${change.evidenceGrade || 'B'}`,
    layer: change.lane || 'disclosure-black-files',
    description: description.slice(0, 700),
    keywords: terms(`${change.sourceLabel} ${change.sourceId} ${change.changeType} ${change.status} ${description} ${change.previousHash} ${change.currentHash}`),
    priority: change.changeType === 'source-unavailable' ? 106 : 103,
    sourceType: 'source-change'
  });
}

const finalIndex = [...map.values()].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || String(a.title || '').localeCompare(String(b.title || '')));
fs.writeFileSync(indexPath, JSON.stringify(finalIndex, null, 2));

if (fs.existsSync(searchPagePath)) {
  let html = fs.readFileSync(searchPagePath, 'utf8');
  html = html.replace('Search by control layer, person, institution, record route, missing file, book, briefing, or outcome.', 'Search every investigation finding, government source, person, institution, contract, filing, court record, leak, source change, missing file, book, briefing, or outcome.');
  if (!html.includes('data-q="corruption bribery fraud official enforcement"')) {
    const buttons = '<button class="btn alt" data-q="corruption bribery fraud official enforcement">Corruption</button><button class="btn alt" data-q="WikiLeaks documents cables archive">WikiLeaks</button><button class="btn alt" data-q="government contracts USAspending procurement">Government Contracts</button><button class="btn alt" data-q="daily investigation conclusions wrongdoing">Daily Conclusions</button><button class="btn alt" data-q="missing record redaction log source change">Source Changes</button>';
    html = html.replace('</div></section><section class="section wrap split">', `${buttons}</div></section><section class="section wrap split">`);
  }
  fs.writeFileSync(searchPagePath, html);
}

if (fs.existsSync(searchJsPath)) {
  let js = fs.readFileSync(searchJsPath, 'utf8');
  if (!js.includes('investigationQueryPrefill')) {
    js = js.replace('function init(index){index=Array.isArray(index)?index:[];function run(){', 'function init(index){index=Array.isArray(index)?index:[];/* investigationQueryPrefill */try{const q=new URLSearchParams(location.search).get("q");if(q&&!input.value)input.value=q;}catch(_){}function run(){');
  }
  js = js.replace('"elite-networks":["elite","billionaire","foundation","institution","wef","blackrock","control","power"]', '"elite-networks":["elite","billionaire","foundation","institution","wef","blackrock","control","power","corruption","bribery","fraud","contract","procurement"]');
  js = js.replace('"disclosure-black-files":["epstein","disclosure","redaction","withheld","sealed","court","file","records"]', '"disclosure-black-files":["epstein","disclosure","redaction","withheld","sealed","court","file","records","wikileaks","leak","declassified","foia","source change","removed","restored","hash"]');
  fs.writeFileSync(searchJsPath, js);
}

console.log(`Investigation search extension complete: ${finalIndex.length} routes, ${seenFindings.size} live findings, ${(registry.sources || []).length} monitored sources and ${(sourceChanges.changes || []).length} preserved source changes indexed.`);
