const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const changed = [];
const checks = [];

const replacements = new Map([
  ['https://www.bis.org/topic/cbdc.htm', 'https://www.bis.org/about/bisih/topics/cbdc.htm'],
  ['https://search.worldbank.org/api/v2/projects', 'https://projects.worldbank.org/en/projects-operations/project-search'],
  ['https://efile.fara.gov/ords/fara/f?p=1381:1', 'https://efile.fara.gov/ords/fara/f?p=1235:10'],
  ['https://efile.fara.gov/ords/fara/f?p=1381%3A1', 'https://efile.fara.gov/ords/fara/f?p=1235%3A10'],
  ['https://cde.ucr.cjis.gov/', 'https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/home'],
  ['https://www.bmi.gv.at/508/Statistiken/', 'https://www.bmi.gv.at/magazin/2026_05_06/01_kriminalstatistik_2025.html']
]);

function display(file) { return path.relative(root, file).replace(/\\/g, '/'); }
function writeIfChanged(file, before, after) {
  if (after === before) return;
  fs.writeFileSync(file, after);
  changed.push(display(file));
}
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.wrangler'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out); else out.push(full);
  }
  return out;
}
function textFile(file) {
  return /\.(?:html?|js|mjs|json|md|txt|csv|xml|yml|yaml)$/i.test(file) || !path.extname(file);
}

for (const base of [root, site]) {
  if (!fs.existsSync(base)) continue;
  for (const file of walk(base)) {
    if (!textFile(file) || file.includes(`${path.sep}.git${path.sep}`) || file.includes(`${path.sep}node_modules${path.sep}`)) continue;
    let before;
    try { before = fs.readFileSync(file, 'utf8'); } catch { continue; }
    let after = before;
    for (const [from, to] of replacements) after = after.split(from).join(to);
    writeIfChanged(file, before, after);
  }
}

const auditFile = path.join(root, 'scripts', 'deep-production-site-audit-v2.js');
if (!fs.existsSync(auditFile)) throw new Error('deep-production-site-audit-v2.js is missing');
let audit = fs.readFileSync(auditFile, 'utf8');
const originalAudit = audit;

const oldPageRule = "else if (!/text\\/html/i.test(response.type) || !/<html\\b/i.test(response.text)) { hard.push(`live page ${route}: expected an HTML document, received ${response.type || 'unknown content type'}`); evidence.liveFailures.push(item); }";
const newPageRule = "else if (!/<html\\b/i.test(response.text) || (response.type && !/text\\/html/i.test(response.type))) { hard.push(`live page ${route}: expected an HTML document, received ${response.type || 'unknown content type'}`); evidence.liveFailures.push(item); }";
if (audit.includes(oldPageRule)) audit = audit.replace(oldPageRule, newPageRule);

const routeAnchor = "function liveRouteForFile(file) {\n  const relative = rel(file);\n  if (relative === 'index.html' || relative === 'index') return '/';\n  return `/${relative}`;\n}";
const protectedHelper = `${routeAnchor}\nfunction protectedAssetExpected(route) {\n  try {\n    const policy = JSON.parse(fs.readFileSync(path.join(root, 'data', 'access-route-policy.json'), 'utf8'));\n    if ((policy.exactRules || []).some(rule => rule.route === route)) return true;\n    return (policy.patternRules || []).some(rule => new RegExp(rule.pattern).test(route));\n  } catch { return false; }\n}`;
if (!audit.includes('function protectedAssetExpected(route)')) {
  if (!audit.includes(routeAnchor)) throw new Error('Live route helper insertion anchor not found');
  audit = audit.replace(routeAnchor, protectedHelper);
}

const oldAssetRule = "if (response.status < 200 || response.status >= 400) { const item = { url, status: response.status, error: response.error || null }; hard.push(`live internal target ${url}: HTTP ${response.status || response.error}`); evidence.liveFailures.push(item); }";
const newAssetRule = "const route = new URL(url).pathname; const protectedDeniedAsDesigned = response.status === 401 && protectedAssetExpected(route); if (!protectedDeniedAsDesigned && (response.status < 200 || response.status >= 400)) { const item = { url, status: response.status, error: response.error || null }; hard.push(`live internal target ${url}: HTTP ${response.status || response.error}`); evidence.liveFailures.push(item); }";
if (audit.includes(oldAssetRule)) audit = audit.replace(oldAssetRule, newAssetRule);

const oldDonationContract = "await contract('voluntary support disabled boundary', '/api/paypal/support/create-order', { statuses: [503], json: true, check: data => data?.ok === false && data?.enabled === false }, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount: '10.00', context: 'deep-audit' }) });";
const newDonationContracts = "await contract('voluntary support configuration boundary', '/api/paypal/donation/config', { statuses: [200], origin: 'cloudflare-worker-paypal-subscriptions', json: true, check: data => data?.ok === true && data?.enabled === false && data?.liveChargingEnabled === false });\n  await contract('voluntary support order authentication boundary', '/api/paypal/donation/order', { statuses: [401], origin: 'cloudflare-worker-paypal-subscriptions', json: true, check: data => data?.ok === false && data?.authenticated === false }, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount: '10.00', productKey: 'deep-audit' }) });";
if (audit.includes(oldDonationContract)) audit = audit.replace(oldDonationContract, newDonationContracts);

audit = audit.replace("'/api/email/admin/send-test'", "'/api/email/admin/test-transactional'");
writeIfChanged(auditFile, originalAudit, audit);

const forbidden = [...replacements.keys()];
for (const base of [root, site]) {
  if (!fs.existsSync(base)) continue;
  for (const file of walk(base)) {
    if (!textFile(file)) continue;
    let source;
    try { source = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const stale of forbidden) if (source.includes(stale)) checks.push({ file: display(file), stale, ok: false });
  }
}
for (const marker of [
  "(response.type && !/text\\/html/i.test(response.type))",
  'function protectedAssetExpected(route)',
  '/api/paypal/donation/config',
  '/api/paypal/donation/order',
  '/api/email/admin/test-transactional'
]) checks.push({ file: 'scripts/deep-production-site-audit-v2.js', marker, ok: audit.includes(marker) });

const ok = checks.every(item => item.ok !== false);
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'final-live-audit-and-external-links.json'), `${JSON.stringify({
  ok,
  generatedAt: new Date().toISOString(),
  changed: [...new Set(changed)],
  replacements: Object.fromEntries(replacements),
  checks,
  boundary: 'Valid extensionless HTML is accepted by body plus optional content type; protected downloads may fail closed with HTTP 401; live API contracts test the deployed PayPal donation and transactional-email routes; stale public references are replaced with current official routes.'
}, null, 2)}\n`);
if (!ok) throw new Error(`Final live audit/link repair failed: ${JSON.stringify(checks.filter(item => item.ok === false))}`);
console.log(`Final live audit rules and official links repaired (${[...new Set(changed)].length} file(s) changed).`);
