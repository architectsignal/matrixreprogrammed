const fs = require('fs');
const path = require('path');

const root = process.cwd();
const indexPath = path.join(root, 'search-index.json');
const failures = [];
const checks = [];
function pass(name, detail = '') { checks.push({ name, ok: true, detail }); }
function fail(name, detail = '') { checks.push({ name, ok: false, detail }); failures.push(`${name}: ${detail}`); }
function tokens(query) {
  const stop = new Set('the and for with what where when why how does into from that this show about latest update updates are all site page pages tell me'.split(' '));
  return String(query || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(word => word.length > 1 && !stop.has(word));
}
function keywordText(item) { return Array.isArray(item.keywords) ? item.keywords.join(' ') : String(item.keywords || ''); }
function hay(item) { return [item.title, item.category, item.layer, item.description, keywordText(item), item.sourceType, item.status, item.evidenceGrade, item.entity].join(' ').toLowerCase(); }
function ranked(index, query) {
  const words = tokens(query);
  return index.map(item => {
    const text = hay(item);
    let score = Number(item.priority || 0) / 4;
    for (const word of words) {
      if (String(item.title || '').toLowerCase().includes(word)) score += 22;
      if (String(item.category || '').toLowerCase().includes(word)) score += 12;
      if (String(item.layer || '').toLowerCase().includes(word)) score += 10;
      if (keywordText(item).toLowerCase().includes(word)) score += 14;
      if (text.includes(word)) score += 4;
    }
    return { ...item, _score: score };
  }).filter(item => item._score > Number(item.priority || 0) / 4).sort((a, b) => b._score - a._score).slice(0, 20);
}

let index = [];
try { index = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch (error) { fail('search index JSON', error.message); }
if (Array.isArray(index)) pass('search index JSON', `${index.length} entries`); else { fail('search index type', 'not an array'); index = []; }

const tests = [
  ['corruption bribery fraud', /investigation|corruption|enforcement|evidence/],
  ['Epstein DOJ disclosures', /epstein|doj|investigation/],
  ['WikiLeaks cables', /wikileaks|evidence-vault|investigation-source/],
  ['government contracts', /contract|usaspending|investigation|private-contractor/],
  ['SEC enforcement', /sec|enforcement|investigation/],
  ['public corruption conviction', /investigation|conviction|corruption/],
  ['inspector-general misconduct', /inspector|oig|investigation|oversight/],
  ['company ownership contract agency', /company|ownership|contract|agency|investigation/],
  ['missing record redaction log', /missing|redaction|source-changes|investigation/],
  ['source changes removed restored hash', /source-changes/]
];
for (const [query, expected] of tests) {
  const results = ranked(index, query);
  const text = results.map(item => `${item.url} ${item.title} ${item.layer}`).join(' ');
  if (!results.length) fail(`query ${query}`, 'zero results');
  else if (!expected.test(text)) fail(`query ${query}`, `expected route absent: ${results.slice(0, 5).map(item => item.url).join(', ')}`);
  else pass(`query ${query}`, results.slice(0, 3).map(item => item.url).join(', '));
}
const route = index.find(item => item.url === 'source-changes.html');
if (route && route.sourceType === 'primary-source-change-ledger') pass('source change route metadata', `${route.evidenceGrade || 'grade boundary present'}`); else fail('source change route metadata', 'route or source type missing');
const publicFeedPath = path.join(root, 'data', 'investigation-source-changes.json');
if (fs.existsSync(publicFeedPath)) {
  const feed = JSON.parse(fs.readFileSync(publicFeedPath, 'utf8'));
  if (/does not by itself prove/i.test(feed.boundary || '')) pass('source change evidence boundary', 'present'); else fail('source change evidence boundary', 'missing');
} else fail('source change public feed', 'missing');

const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), checks, failures };
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'source-change-search-test.json'), JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(`SOURCE CHANGE SEARCH TEST FAILED: ${failures.length} failure(s)`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Source change search test passed: ${checks.length} checks and ${tests.length} real investigation queries.`);
