const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataPath = path.join(root, 'data', 'security-privacy-tools.json');
const pagePath = path.join(root, 'security-privacy.html');
const reportPath = path.join(root, 'downloads', 'security-privacy-hub-test.json');
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });
const read = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const json = file => { try { return JSON.parse(read(file)); } catch { return null; } };

const registry = json(dataPath);
add('registry parses', registry && Array.isArray(registry.categories) && Array.isArray(registry.systems));
const categories = registry?.categories || [];
const tools = categories.flatMap(category => (category.tools || []).map(tool => ({ ...tool, categoryId: category.id })));
const ids = tools.map(tool => tool.id);
const urls = tools.map(tool => tool.url);

add('deep category coverage', categories.length >= 12, `${categories.length} categories`);
add('complete system coverage', (registry?.systems || []).length >= 6, `${registry?.systems?.length || 0} systems`);
add('substantial curated registry', tools.length >= 60, `${tools.length} tools`);
add('unique tool identifiers', new Set(ids).size === ids.length, `${ids.length - new Set(ids).size} duplicates`);
add('unique primary URLs', new Set(urls).size >= Math.floor(urls.length * 0.9), `${new Set(urls).size}/${urls.length} unique`);
add('HTTPS-only external links', tools.every(tool => /^https:\/\//.test(tool.url || '')), tools.filter(tool => !/^https:\/\//.test(tool.url || '')).map(tool => tool.name).join(', '));
add('every tool has complete explanation', tools.every(tool => tool.name && tool.purpose && tool.why && tool.limits && tool.access && tool.openSource && Array.isArray(tool.platforms) && tool.platforms.length), `${tools.filter(tool => !(tool.name && tool.purpose && tool.why && tool.limits && tool.access && tool.openSource && Array.isArray(tool.platforms) && tool.platforms.length)).length} incomplete`);
add('all core access is free', tools.every(tool => /free|public|nonprofit/i.test(`${tool.access} ${tool.openSource}`)), tools.filter(tool => !/free|public|nonprofit/i.test(`${tool.access} ${tool.openSource}`)).map(tool => tool.name).join(', '));
add('no free VPN recommendation', !tools.some(tool => /vpn/i.test(tool.name || '') && /free/i.test(tool.access || '')), tools.filter(tool => /vpn/i.test(tool.name || '')).map(tool => tool.name).join(', '));

const systemReferences = (registry?.systems || []).flatMap(system => (system.toolIds || []).map(id => ({ system: system.id, id })));
add('system references resolve', systemReferences.every(ref => ids.includes(ref.id)), systemReferences.filter(ref => !ids.includes(ref.id)).map(ref => `${ref.system}:${ref.id}`).join(', '));

const controlledTools = ['nmap', 'wireshark', 'zaproxy', 'greenbone', 'amass', 'spiderfoot', 'theharvester', 'velociraptor'];
const controlledRecords = controlledTools.map(id => tools.find(tool => tool.id === id)).filter(Boolean);
add('dual-use tools carry authorisation limits', controlledRecords.length === controlledTools.length && controlledRecords.every(tool => /authori|permission|own|administer|scope|lawful purpose|restrict targets/i.test(`${tool.purpose} ${tool.limits}`)), controlledRecords.filter(tool => !/authori|permission|own|administer|scope|lawful purpose|restrict targets/i.test(`${tool.purpose} ${tool.limits}`)).map(tool => tool.name).join(', '));

const highRiskTools = ['tails', 'qubes', 'whonix', 'tor-browser', 'gnupg', 'kleopatra', 'virustotal', 'urlscan'];
add('high-risk tools state limitations', highRiskTools.every(id => {
  const tool = tools.find(item => item.id === id);
  return tool && tool.limits.length >= 80;
}), highRiskTools.filter(id => !tools.find(item => item.id === id) || tools.find(item => item.id === id).limits.length < 80).join(', '));

const page = read(pagePath);
add('public page generated', page.includes('SECURITY, PRIVACY & OSINT SAFETY.'));
add('threat-model framing present', /threat model/i.test(page) && /privacy is not one switch/i.test(page));
add('PGP online-generator warning present', /DO NOT USE ONLINE PGP KEY GENERATORS/i.test(page) && /Generate PGP keys locally/i.test(page));
add('VPN boundary present', /No free VPN is recommended/i.test(page));
add('Tor limits present', /Do not torrent/i.test(page) && /personal logins/i.test(page));
add('lawful OSINT boundary present', /No unauthorised access/i.test(page) && /stalking or harassment/i.test(page));
add('emergency help present', page.includes('Access Now Helpline') && page.includes('Digital First Aid'));
add('interactive filtering wired', page.includes('security-tool-search') && page.includes('security-privacy.js'));
add('all registry tools rendered', tools.every(tool => page.includes(`id="tool-${tool.id}"`)), `${tools.filter(tool => !page.includes(`id="tool-${tool.id}"`)).length} missing`);

const home = read(path.join(root, 'index.html'));
const research = read(path.join(root, 'research-tools.html'));
const sitemap = read(path.join(root, 'sitemap.xml'));
const llms = read(path.join(root, 'llms.txt'));
add('homepage has visible hub route', home.includes('security-privacy-home') && home.includes('Open Security & Anonymity Hub'));
add('main navigation contains hub', home.includes('href="security-privacy.html">Security & Privacy</a>'));
add('research tools route connected', research.includes('security-privacy-research') && research.includes('security-privacy.html'));
add('sitemap contains hub', sitemap.includes('/security-privacy.html'));
add('llms route contains hub', llms.includes('security-privacy.html'));

const report = {
  ok: checks.every(check => check.ok),
  generatedAt: new Date().toISOString(),
  categories: categories.length,
  systems: registry?.systems?.length || 0,
  tools: tools.length,
  checks
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
if (!report.ok) {
  checks.filter(check => !check.ok).forEach(check => console.error(`FAILED: ${check.name}${check.detail ? ` — ${check.detail}` : ''}`));
  process.exit(1);
}
console.log(`Security and privacy hub test passed: ${checks.length} checks across ${tools.length} vetted tools.`);
