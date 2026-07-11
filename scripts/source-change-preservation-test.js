const fs = require('fs');
const path = require('path');

const root = process.cwd();
const failures = [];
const checks = [];
function check(name, condition, detail = '') {
  checks.push({name, ok: Boolean(condition), detail});
  if (!condition) failures.push({name, detail});
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { return null; }
}

const registry = readJson('data/investigation-source-registry.json');
const index = readJson('data/source-snapshot-index.json');
const ledger = readJson('data/source-change-ledger.json');
const publicData = readJson('data/source-change-public.json');
const page = fs.existsSync(path.join(root, 'source-changes.html')) ? fs.readFileSync(path.join(root, 'source-changes.html'), 'utf8') : '';
const search = readJson('search-index.json') || [];

check('registry loaded', Array.isArray(registry?.sources) && registry.sources.length > 0);
check('snapshot index generated', index && typeof index.sources === 'object');
check('all checked sources retain provenance', Object.values(index?.sources || {}).every(s => s.sourceId && s.url && s.lastAttempt));
check('change ledger generated', Array.isArray(ledger?.changes));
check('public change feed generated', Array.isArray(publicData?.changes));
check('public feed has evidence boundary', /not.*proof|not automatic|does not establish/i.test(publicData?.evidenceBoundary || ''));
check('public change page generated', page.includes('SOURCE CHANGE LEDGER'));
check('public page states evidence boundary', /not proof of wrongdoing|not automatic evidence/i.test(page));
check('public route indexed', search.some(item => item?.url === 'source-changes.html'));
check('public JSON indexed', search.some(item => item?.url === 'data/source-change-public.json'));
check('change records are indexed', (publicData?.changes || []).length === 0 || search.some(item => item?.sourceType === 'source-change'));
check('technical error strings excluded from public feed', !(publicData?.changes || []).some(item => Object.prototype.hasOwnProperty.call(item, 'error') || Object.prototype.hasOwnProperty.call(item, 'lastErrorCategory')));
check('hashes are SHA-256 when present', (publicData?.changes || []).every(item => !item.currentHash || /^[a-f0-9]{64}$/.test(item.currentHash)));

const report = {ok: failures.length === 0, generatedAt: new Date().toISOString(), checks, failures};
fs.mkdirSync(path.join(root, 'downloads'), {recursive: true});
fs.writeFileSync(path.join(root, 'downloads/source-change-preservation-test.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
