const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const failures = [];
const checks = [];
function check(name, ok, detail = '') { checks.push({ name, ok: Boolean(ok), detail: ok ? detail : detail || 'failed' }); if (!ok) failures.push({ name, detail }); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function readJson(file, fallback) { try { return JSON.parse(read(file)); } catch { return fallback; } }
function arr(value) { return Array.isArray(value) ? value : value == null || value === '' ? [] : [value]; }
function words(query) { const stop = new Set('the and for with what where when why how does into from that this show about latest update updates are all site page pages tell me'.split(' ')); return String(query || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(word => word.length > 1 && !stop.has(word)); }
function listText(value) { return arr(value).map(item => typeof item === 'object' ? Object.values(item).join(' ') : String(item)).join(' '); }
function hay(item) { return [item.title,item.category,item.layer,item.description,listText(item.keywords),listText(item.aliases),listText(item.identifiers),listText(item.exactTerms),item.sourceType,item.resultKind,item.sourceAuthority,item.evidenceGrade,item.factualStatus,item.statusClass,item.reviewStatus,item.jurisdiction,item.entityType,item.entity].join(' ').toLowerCase(); }
function gradeBoost(value) { return { A:30, B:20, C:7, D:-15 }[String(value || '').toUpperCase()] || 0; }
function statusBoost(value) { return { established:26, enforcement:18, allegation:3, 'source-change':7, 'source-record':6, context:0, unverified:-18 }[String(value || '').toLowerCase()] || 0; }
function score(item, tokens, query) {
  const title = String(item.title || '').toLowerCase();
  const phrase = String(query || '').trim().toLowerCase();
  const exact = [...arr(item.exactTerms), ...arr(item.aliases), ...arr(item.identifiers)].map(value => String(typeof value === 'object' ? Object.values(value).join(' ') : value).toLowerCase());
  const text = hay(item);
  let value = Number(item.priority || 0) / 5 + gradeBoost(item.evidenceGrade) + statusBoost(item.statusClass) + (item.primarySource ? 20 : 0);
  if (phrase) {
    if (title === phrase) value += 180; else if (title.startsWith(phrase)) value += 100; else if (title.includes(phrase)) value += 65;
    if (exact.some(term => term === phrase)) value += 150; else if (exact.some(term => term.includes(phrase))) value += 75;
    if (text.includes(phrase)) value += 35;
  }
  let matched = 0;
  for (const token of tokens) {
    let hit = false;
    if (title.includes(token)) { value += 30; hit = true; }
    if (exact.some(term => term.includes(token))) { value += 24; hit = true; }
    if (listText(item.keywords).toLowerCase().includes(token)) { value += 16; hit = true; }
    if (String(item.description || '').toLowerCase().includes(token)) { value += 7; hit = true; }
    if (String(item.entity || '').toLowerCase().includes(token) || String(item.entityType || '').toLowerCase().includes(token)) { value += 18; hit = true; }
    if (String(item.factualStatus || '').toLowerCase().includes(token) || String(item.statusClass || '').toLowerCase().includes(token)) { value += 16; hit = true; }
    if (hit) matched++;
  }
  value += (matched / Math.max(tokens.length, 1)) * 48;
  if (item.primarySource && tokens.some(token => ['official','court','government','regulator','sec','doj','judgment','conviction','enforcement','audit'].includes(token))) value += 42;
  if (tokens.some(token => ['conviction','guilty','judgment','proven','established','order'].includes(token)) && item.statusClass === 'established') value += 42;
  const missingIntent = tokens.some(token => ['missing','removed','redaction','redacted','restored','hash','withheld'].includes(token));
  if (missingIntent && item.statusClass === 'source-change') value += 150;
  if (missingIntent && item.sourceType === 'source-change') value += 70;
  if (missingIntent && item.resultKind === 'relationship' && item.statusClass !== 'source-change') value -= 28;
  return value;
}
function ranked(index, query, filter = {}) {
  const tokens = words(query);
  return index.filter(item => {
    if (filter.grade && item.evidenceGrade !== filter.grade) return false;
    if (filter.type && item.sourceType !== filter.type) return false;
    if (filter.status && item.statusClass !== filter.status) return false;
    if (filter.jurisdiction && item.jurisdiction !== filter.jurisdiction) return false;
    if (filter.entity && item.entityType !== filter.entity) return false;
    return true;
  }).map(item => ({ ...item, _score: score(item, tokens, query) }))
    .filter(item => !query || item._score > Number(item.priority || 0) / 5 + 2)
    .sort((a, b) => b._score - a._score || Number(b.primarySource) - Number(a.primarySource) || String(a.title).localeCompare(String(b.title)));
}

const index = readJson('search-index.json', []);
const facets = readJson('data/search-facets.json', {});
const html = fs.existsSync(path.join(root, 'search.html')) ? read('search.html') : '';
const js = fs.existsSync(path.join(root, 'search.js')) ? read('search.js') : '';
check('search index is an array', Array.isArray(index), typeof index);
check('search index contains Phase 1-3 depth', index.length >= 1000, `${index.length} results`);
const urls = index.map(item => item?.url).filter(Boolean);
check('search URLs are unique', new Set(urls).size === urls.length, `${urls.length - new Set(urls).size} duplicates`);
check('Search V3 metadata present', index.filter(item => item.searchVersion === 3).length === index.length, `${index.filter(item => item.searchVersion === 3).length}/${index.length}`);
for (const field of ['sourceType','resultKind','statusClass','primarySource']) check(`normalised field ${field}`, index.every(item => item[field] !== undefined && item[field] !== null), field);
check('graded evidence present', index.some(item => /^[ABCD]$/.test(String(item.evidenceGrade || ''))), 'no graded entries');
check('primary official records present', index.some(item => item.primarySource === true), 'no primary records');
check('documents searchable', index.some(item => item.sourceType === 'document-extraction'), 'document entries missing');
check('entities searchable', index.some(item => item.sourceType === 'structured-entity'), 'entity entries missing');
check('relationships searchable', index.some(item => item.sourceType === 'structured-relationship'), 'relationship entries missing');
check('source changes searchable', index.some(item => item.statusClass === 'source-change'), 'source-change entries missing');
check('government agencies filterable', index.some(item => item.entityType === 'GovernmentAgency'), 'GovernmentAgency entries missing');
check('United States jurisdiction filterable', index.some(item => item.jurisdiction === 'United States'), 'United States entries missing');
check('Grade D never classified established', !index.some(item => item.evidenceGrade === 'D' && item.statusClass === 'established'), 'Grade D established result found');

const queries = [
  ['corruption bribery fraud', /investigation|finding|enforcement|corruption/],
  ['Epstein DOJ disclosures', /epstein|doj|investigation-source/],
  ['WikiLeaks cables', /wikileaks|evidence-vault|investigation-source/],
  ['government contracts', /contract|usaspending|procurement|contractor/],
  ['SEC enforcement', /sec|enforcement|litigation/],
  ['public corruption conviction', /conviction|investigation|court|corruption/],
  ['inspector-general misconduct', /inspector|oversight|audit|misconduct/],
  ['company ownership contract agency', /entity-registry|relationship-registry|company|contract/],
  ['missing record redaction log', /source-changes|missing|redaction|removed|source-change/]
];
for (const [query, expected] of queries) {
  const results = ranked(index, query).slice(0, 20);
  const text = results.map(item => `${item.url} ${item.title} ${item.sourceType} ${item.statusClass}`).join(' ').toLowerCase();
  check(`query ${query}`, results.length > 0 && expected.test(text), results.slice(0, 5).map(item => item.url).join(', '));
}
const sec = ranked(index, 'SEC enforcement').slice(0, 20);
const firstPrimary = sec.findIndex(item => item.primarySource);
const firstGeneral = sec.findIndex(item => ['route','investigation-route','mission-route'].includes(item.sourceType));
check('exact primary SEC record outranks general commentary', firstPrimary >= 0 && (firstGeneral < 0 || firstPrimary < firstGeneral), sec.slice(0, 8).map(item => `${item.primarySource?'P':'S'}:${item.url}`).join(', '));
const missingResults = ranked(index, 'missing record redaction log').slice(0, 10);
check('dedicated source-change result ranks for missing-record intent', missingResults.some(item => item.statusClass === 'source-change'), missingResults.map(item => `${item.statusClass}:${item.url}`).join(', '));
check('Grade B filter returns results', ranked(index, '', { grade:'B' }).length > 0, 'zero Grade B');
check('document filter returns results', ranked(index, '', { type:'document-extraction' }).length > 0, 'zero documents');
check('source-change filter returns results', ranked(index, '', { status:'source-change' }).length > 0, 'zero source changes');
check('agency filter returns results', ranked(index, '', { entity:'GovernmentAgency' }).length > 0, 'zero agencies');
check('jurisdiction filter returns results', ranked(index, '', { jurisdiction:'United States' }).length > 0, 'zero US records');

for (const marker of ['id="search-v3-filters"','id="search-grade"','id="search-source-type"','id="search-status"','id="search-jurisdiction"','id="search-entity-type"','id="search-from"','id="search-to"','id="search-sort"','id="search-clear"']) check(`search page ${marker}`, html.includes(marker), 'missing');
for (const marker of ['SEARCH V3','SEARCH V2 compatibility','investigationQueryPrefill','const fallbackIndex=','/search-index.json',"cache:'no-store'",'HTML returned instead of JSON','init(fallbackIndex)','primarySource','statusClass','jurisdiction','entityType','URLSearchParams','missingIntent']) check(`search runtime ${marker}`, js.includes(marker), 'missing');
const syntax = spawnSync(process.execPath, ['--check', path.join(root, 'search.js')], { cwd: root, encoding:'utf8', stdio:'pipe' });
check('search runtime syntax', syntax.status === 0, syntax.stderr || syntax.stdout || 'invalid');
check('facets version', facets.searchVersion === 3, String(facets.searchVersion));
check('facet total matches index', facets.totalResults === index.length, `${facets.totalResults} vs ${index.length}`);
for (const key of ['evidenceGrade','sourceType','statusClass','jurisdiction','entityType','resultKind']) check(`facet ${key}`, Array.isArray(facets.filters?.[key]) && facets.filters[key].length > 0, 'empty');

const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), summary: { checks: checks.length, failures: failures.length, results: index.length, primarySources: index.filter(item => item.primarySource).length, relationships: index.filter(item => item.sourceType === 'structured-relationship').length }, checks, failures };
fs.mkdirSync(path.join(root, 'downloads'), { recursive:true });
fs.writeFileSync(path.join(root, 'downloads', 'search-v3-quality-test.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
if (failures.length) {
  failures.slice(0, 50).forEach(item => console.error(`FAILED: ${item.name}: ${item.detail}`));
  process.exit(1);
}
