const fs = require('fs');
const path = require('path');
const root = process.cwd();
const dataPath = path.join(root, 'data', 'dark-web-safety.json');
const pagePath = path.join(root, 'dark-web-safety.html');
const reportPath = path.join(root, 'downloads', 'dark-web-safety-test.json');
const read = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const json = file => { try { return JSON.parse(read(file)); } catch { return null; } };
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok:Boolean(ok), detail });

const data = json(dataPath);
const page = read(pagePath);
const official = data?.officialOnions || [];
const allowedOnions = new Set(official.map(item => item.onion));
const foundOnions = [...new Set(page.match(/[a-z2-7]{56}\.onion/g) || [])];

add('registry parses', data && Array.isArray(data.steps) && Array.isArray(data.officialOnions) && Array.isArray(data.dangerCategories));
add('deep workflow coverage', (data?.steps || []).length >= 12, `${data?.steps?.length || 0} steps`);
add('defensive tool coverage', (data?.tools || []).length >= 7, `${data?.tools?.length || 0} tools`);
add('official onion coverage', official.length >= 4, `${official.length} services`);
add('all onions are v3 format', official.every(item => /^[a-z2-7]{56}\.onion$/.test(item.onion || '')), official.filter(item => !/^[a-z2-7]{56}\.onion$/.test(item.onion || '')).map(item => item.name).join(', '));
add('all onion verification sources are HTTPS', official.every(item => /^https:\/\//.test(item.officialSource || '')));
add('page contains only allowlisted onions', foundOnions.every(address => allowedOnions.has(address)), foundOnions.filter(address => !allowedOnions.has(address)).join(', '));
add('danger tracker is non-clickable', (data?.dangerCategories || []).every(item => !/(\.onion|https?:\/\/)/i.test(JSON.stringify(item))), 'danger records must contain no service addresses');
add('no illicit market links rendered', !/href=["'][^"']*(market|carding|ransomware|hitman|stolen-data)[^"']*["']/i.test(page));
add('hard criminal boundary present', /does not provide links, mirrors, invitations/i.test(page) && /No illicit-market addresses/i.test(page));
add('phishing defence present', /full 56-character address/i.test(page) && /Hidden Wiki/i.test(page));
add('identity separation present', /Separate the research identity/i.test(page) && /personal accounts/i.test(page));
add('hostile file controls present', /Treat every download as hostile/i.test(page) && /Dangerzone/i.test(page));
add('Tor defaults guidance present', /Do not add extensions/i.test(page) && /Safer or Safest/i.test(page));
add('VPN boundary present', /VPN is not required for Tor/i.test(page) && /no free VPN/i.test(page));
add('emergency response present', /IF SOMETHING GOES WRONG/i.test(page) && /illegal exploitation material/i.test(page));
add('public enforcement watch present', /ILLICIT-MARKET ENFORCEMENT WATCH/i.test(page) && (data?.enforcementCases || []).every(item => page.includes(item.name)));
add('interactive safety controls wired', page.includes('dark-risk-search') && page.includes('dark-web-safety.js'));

const home = read(path.join(root, 'index.html'));
const security = read(path.join(root, 'security-privacy.html'));
const sitemap = read(path.join(root, 'sitemap.xml'));
const llms = read(path.join(root, 'llms.txt'));
add('homepage route present', home.includes('dark-web-safety-home') && home.includes('Open Dark Web Safety Guide'));
add('main navigation route present', home.includes('href="dark-web-safety.html">Dark Web Safety</a>'));
add('security hub connected', security.includes('dark-web-security-route') && security.includes('dark-web-safety.html'));
add('sitemap route present', sitemap.includes('/dark-web-safety.html'));
add('llms route present', llms.includes('dark-web-safety.html'));

const report = { ok:checks.every(check => check.ok), generatedAt:new Date().toISOString(), officialOnions:official.length, foundOnions:foundOnions.length, dangerCategories:data?.dangerCategories?.length || 0, enforcementCases:data?.enforcementCases?.length || 0, checks };
fs.mkdirSync(path.dirname(reportPath), { recursive:true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
if (!report.ok) {
  checks.filter(check => !check.ok).forEach(check => console.error(`FAILED: ${check.name}${check.detail ? ` — ${check.detail}` : ''}`));
  process.exit(1);
}
console.log(`Dark web safety test passed: ${checks.length} checks, ${official.length} verified onions and ${data.dangerCategories.length} non-clickable danger categories.`);
