const fs = require('fs');
const path = require('path');

const root = process.cwd();
const manifestPath = path.join(root, 'data', 'document-extraction-index.json');
const publicPath = path.join(root, 'data', 'document-library.json');
const pagePath = path.join(root, 'document-library.html');
const reportPath = path.join(root, 'downloads', 'document-identifier-quality-test.json');

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function checkIdentifier(item) {
  const type = String(item?.type || '');
  const value = String(item?.value || '').trim();
  if (!type || value.length < 4 || value.length > 80) return false;
  if (/^(?:for|doc|document|no|number|notice|order|case|file|phmsa|unknown|none)$/i.test(value)) return false;
  if (type === 'doi') return /^10\.\d{4,9}\/[\w.()/:;-]+$/i.test(value);
  if (!/\d/.test(value)) return false;
  if (type === 'case-or-docket' || type === 'release') return /^[A-Z0-9][A-Z0-9._:/-]{3,79}$/i.test(value);
  if (type === 'report') return /^(?:GAO|OIG|DOJ|SEC|FTC|CFTC|FBI|CIA|DOD|HHS|EPA|NASA|FINRA|FR)(?:\s+DOC\.?)?[-\s][A-Z0-9][A-Z0-9._/-]{2,60}$/i.test(value);
  if (type === 'federal-register') return /^\d{4}-\d{4,}$/i.test(value);
  if (type === 'sec-accession') return /^\d{10}-\d{2}-\d{6}$/i.test(value);
  return false;
}

const manifest = readJson(manifestPath, { documents: [] });
const publicData = readJson(publicPath, { documents: [] });
const page = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, 'utf8') : '';
const checks = [];
function check(name, ok, detail = '') { checks.push({ name, ok: Boolean(ok), detail: ok ? '' : detail }); }

check('identifier schema upgraded', manifest.identifierSchemaVersion === 2, `schema ${manifest.identifierSchemaVersion}`);
check('manifest documents available', Array.isArray(manifest.documents), 'manifest documents missing');
check('public documents available', Array.isArray(publicData.documents), 'public documents missing');
check('public and private document counts match', publicData.documents.length === manifest.documents.length, `${publicData.documents.length} public vs ${manifest.documents.length} manifest`);

for (const document of manifest.documents || []) {
  const identifiers = Array.isArray(document.identifiers) ? document.identifiers : [];
  const invalid = identifiers.filter(item => !checkIdentifier(item));
  const duplicateKeys = identifiers.map(item => `${item.type}|${String(item.value).toLowerCase()}`);
  check(`identifiers valid: ${document.id}`, invalid.length === 0, JSON.stringify(invalid));
  check(`identifiers deduplicated: ${document.id}`, new Set(duplicateKeys).size === duplicateKeys.length, JSON.stringify(duplicateKeys));
  const publicDocument = (publicData.documents || []).find(item => item.id === document.id);
  check(`public identifiers mirror manifest: ${document.id}`, JSON.stringify(publicDocument?.identifiers || []) === JSON.stringify(identifiers), JSON.stringify({ public: publicDocument?.identifiers, manifest: identifiers }));
}

check('weak fragments absent from public JSON', !/"value"\s*:\s*"(?:for|FR Doc|PHMSA)"/i.test(JSON.stringify(publicData)), 'weak identifier fragment remains in public feed');
check('weak fragments absent from public page', !/(?:case-or-docket|report):\s*(?:for|FR Doc|PHMSA)</i.test(page), 'weak identifier fragment remains in public page');
check('unreviewed evidence boundary preserved', /unreviewed source record/i.test(String(publicData.evidenceBoundary || '')), String(publicData.evidenceBoundary || ''));

const failures = checks.filter(item => !item.ok);
const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), checks, failures };
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, checks: checks.length, failures: failures.length }, null, 2));
if (failures.length) process.exit(1);
