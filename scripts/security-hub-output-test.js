// Final release gate: audit the exact generated Cloudflare output before merge.
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const site = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'security-hub-output-test.json');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'dark-web-safety.json'), 'utf8'));
const allowedOnions = new Set((data.officialOnions || []).map(item => item.onion));
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok:Boolean(ok), detail });
const exists = rel => fs.existsSync(path.join(site, rel));
const read = rel => exists(rel) ? fs.readFileSync(path.join(site, rel), 'utf8') : '';

for (const rel of [
  'security-privacy.html','security-privacy','security-privacy.js',
  'dark-web-safety.html','dark-web-safety','dark-web-safety.js',
  'data/security-privacy-tools.json','data/dark-web-safety.json',
  'index.html','search-index.json','sitemap.xml','llms.txt'
]) add(`deployable ${rel}`, exists(rel), exists(rel) ? 'present' : 'missing');

const security = read('security-privacy.html');
const dark = read('dark-web-safety.html');
const home = read('index.html');
const search = read('search-index.json');
add('security page marker', security.includes('SECURITY, PRIVACY & OSINT SAFETY.'), `${security.length} bytes`);
add('dark web page marker', dark.includes('DARK WEB SAFETY & LAWFUL ONION RESOURCES.'), `${dark.length} bytes`);
add('homepage security link', home.includes('Open Security & Anonymity Hub'));
add('homepage dark web link', home.includes('Open Dark Web Safety Guide'));
add('search contains security page', search.includes('security-privacy.html') || search.includes('security-privacy'));
add('search contains dark web page', search.includes('dark-web-safety.html') || search.includes('dark-web-safety'));
add('sitemap contains both routes', read('sitemap.xml').includes('/security-privacy.html') && read('sitemap.xml').includes('/dark-web-safety.html'));
add('llms contains both routes', read('llms.txt').includes('security-privacy.html') && read('llms.txt').includes('dark-web-safety.html'));

const foundOnions = [...new Set(dark.match(/[a-z2-7]{56}\.onion/g) || [])];
const onionLinks = [...dark.matchAll(/href=["']http:\/\/([a-z2-7]{56}\.onion)[^"']*["']/g)].map(match => match[1]);
add('only allowlisted onions rendered', foundOnions.every(value => allowedOnions.has(value)), foundOnions.filter(value => !allowedOnions.has(value)).join(', '));
add('only allowlisted onions clickable', onionLinks.length === allowedOnions.size && onionLinks.every(value => allowedOnions.has(value)), `${onionLinks.length}/${allowedOnions.size} clickable allowlisted onions`);
add('no onion addresses in danger data', (data.dangerCategories || []).every(item => !/(\.onion|https?:\/\/)/i.test(JSON.stringify(item))));
add('criminal boundary visible', /No illicit-market addresses|does not provide links, mirrors, invitations/i.test(dark));

const report = { ok:checks.every(check => check.ok), generatedAt:new Date().toISOString(), files:checks.filter(check => check.name.startsWith('deployable')).length, officialOnions:allowedOnions.size, checks };
fs.mkdirSync(path.dirname(reportPath), { recursive:true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
if (!report.ok) {
  checks.filter(check => !check.ok).forEach(check => console.error(`FAILED: ${check.name}${check.detail ? ` — ${check.detail}` : ''}`));
  process.exit(1);
}
console.log(`Security hub deployable output passed: ${checks.length} checks and ${allowedOnions.size} allowlisted onion services.`);
