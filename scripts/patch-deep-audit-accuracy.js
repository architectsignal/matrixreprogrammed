const fs = require('fs');
const path = require('path');

const root = process.cwd();
const file = path.join(root, 'scripts', 'deep-production-site-audit.js');
const reportFile = path.join(root, 'downloads', 'deep-audit-accuracy-patch.json');
if (!fs.existsSync(file)) throw new Error('deep-production-site-audit.js is missing');

const before = fs.readFileSync(file, 'utf8');
let after = before;
let changed = false;
function replace(oldValue, newValue, label) {
  if (after.includes(newValue)) return;
  if (!after.includes(oldValue)) throw new Error(`Deep audit accuracy patch target missing: ${label}`);
  after = after.replace(oldValue, newValue);
  changed = true;
}

replace("  jsonFiles: 0,\n  internalReferences: 0,", "  jsonFiles: 0,\n  inlineScripts: 0,\n  internalReferences: 0,", 'inline script statistic');
replace("  'store.html': ['Choose your support amount', '€1 to €5,000', 'paypal-voluntary-support.js'],\n  'card-deck-store.html': ['Choose your support amount', '€1 to €5,000', 'paypal-voluntary-support.js'],", "  'store.html': ['Choose your donation amount', '€1 to €5,000', 'paypal-voluntary-support.js'],\n  'card-deck-store.html': ['Choose your donation amount', '€1 to €5,000', 'paypal-voluntary-support.js'],\n  'premium-reports.html': ['Choose your donation amount', '€1 to €5,000', 'paypal-voluntary-support.js'],", 'donation marker wording');
replace("  'member-login.html': ['member-login'],", "  'member-login.html': ['id=\"login-form\"', '/api/auth/request-link'],", 'member login contract markers');
replace("  if (/http:\/\//i.test(html.replace(/http:\/\/localhost[^\"'\\s<]*/gi, ''))) hard.push(`${name}: contains insecure http:// reference`);\n", '', 'over-broad HTTP scan');
replace("  const attrs = [...html.matchAll(/\\b(?:href|src|action|poster)\\s*=\\s*([\"'])([^\"']*)\\1/gi)];", "  const attrs = [...html.matchAll(/(?:^|\\s)(?:href|src|action|poster)\\s*=\\s*([\"'])([^\"']*)\\1/gi)];", 'attribute-only reference extraction');
replace("    if (isExternal(target)) { stats.externalReferences++; externalRefs.add(target); continue; }", "    if (isExternal(target)) {\n      stats.externalReferences++; externalRefs.add(target);\n      if (/^http:\/\//i.test(target) && !/\\.onion(?:[\\/:?#]|$)/i.test(target)) hard.push(`${name}: insecure external link ${target}`);\n      continue;\n    }", 'external HTTP boundary');
replace("    for (const match of html.matchAll(/\\b(?:href|src|action|poster)\\s*=\\s*([\"'])([^\"']+)\\1/gi)) {", "    for (const match of html.matchAll(/(?:^|\\s)(?:href|src|action|poster)\\s*=\\s*([\"'])([^\"']+)\\1/gi)) {", 'live attribute-only reference extraction');

const syntaxAnchor = `function resolveTargetFile(target, fromFile) {`;
const inlineFunction = `function syntaxCheckInlineScripts(html, name) {
  let index = 0;
  for (const match of String(html || '').matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi)) {
    const attrs = match[1] || '';
    const source = match[2] || '';
    if (/\\bsrc\\s*=/i.test(attrs)) continue;
    const type = (attrs.match(/\\btype\\s*=\\s*([\"'])([^\"']+)\\1/i) || [])[2] || '';
    if (type && !/(?:java|ecma)script|module/i.test(type)) continue;
    if (!source.trim()) continue;
    stats.inlineScripts++;
    index++;
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-inline-audit-'));
    const extension = /type\\s*=\\s*[\"']module[\"']/i.test(attrs) || /(^|\\n)\\s*(?:import|export)\\s/m.test(source) ? '.mjs' : '.js';
    const target = path.join(temp, \\`inline-\\${index}\\${extension}\\`);
    fs.writeFileSync(target, source);
    const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
    fs.rmSync(temp, { recursive: true, force: true });
    if (result.status !== 0) hard.push(\\`\\${name}: inline script \\${index} syntax error: \\${(result.stderr || result.stdout || '').trim().slice(0, 700)}\\`);
  }
}
`;
if (!after.includes('function syntaxCheckInlineScripts')) {
  if (!after.includes(syntaxAnchor)) throw new Error('Deep audit inline script insertion anchor missing');
  after = after.replace(syntaxAnchor, `${inlineFunction}${syntaxAnchor}`);
  changed = true;
}
replace("  const html = read(file);\n  const ids = htmlIds(html);", "  const html = read(file);\n  syntaxCheckInlineScripts(html, name);\n  const ids = htmlIds(html);", 'inline script invocation');

const forbiddenAnchor = `  for (const forbidden of ['object-object.html', '€29</', '€39</', 'Buy Placeholder', 'FOLLOW THE FILES']) {
    if (html.includes(forbidden)) hard.push(\`${'${name}'}: contains retired or malformed public marker ${'${forbidden}'}\`);
  }`;
const forbiddenReplacement = `${forbiddenAnchor}
  if (['store.html', 'card-deck-store.html', 'premium-reports.html'].includes(name) && /<div\\b[^>]*class=[\"'][^\"']*\\bprice\\b[^\"']*[\"'][^>]*>\\s*€\\s*\\d/i.test(html)) hard.push(\`${'${name}'}: fixed euro price remains on a voluntary-support page\`);`;
replace(forbiddenAnchor, forbiddenReplacement, 'fixed-price audit boundary');

for (const marker of [
  'inlineScripts: 0',
  'function syntaxCheckInlineScripts',
  "'premium-reports.html': ['Choose your donation amount'",
  "'member-login.html': ['id=\"login-form\"', '/api/auth/request-link']",
  '/\\.onion(?:[\\/:?#]|$)/i',
  'fixed euro price remains on a voluntary-support page'
]) if (!after.includes(marker)) throw new Error(`Deep audit accuracy patch missing marker: ${marker}`);

if (changed) fs.writeFileSync(file, after);
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, `${JSON.stringify({ ok: true, generatedAt: new Date().toISOString(), changed, target: 'scripts/deep-production-site-audit.js', improvements: ['attribute-only link detection', 'lawful onion HTTP exception', 'inline JavaScript syntax checks', 'current donation and login contracts', 'all fixed euro prices rejected on support pages'] }, null, 2)}\n`);
console.log(`Deep production audit accuracy ${changed ? 'patched' : 'already current'}.`);
