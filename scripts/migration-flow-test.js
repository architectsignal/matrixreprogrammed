const fs = require('fs');
const path = require('path');
const root = process.cwd();
const issues = [];
const file = name => path.join(root, name);
const exists = name => fs.existsSync(file(name));
const read = name => fs.readFileSync(file(name), 'utf8');
function needFile(name) { if (!exists(name)) issues.push(`missing ${name}`); }
function needText(name, text) { if (exists(name) && !read(name).includes(text)) issues.push(`${name} missing ${text}`); }

needFile('data/migration-flow-panel.json');
needFile('migration-flow.html');
needText('migration-flow.html', 'MIGRATION FLOW PANEL.');
needText('migration-flow.html', 'MIGRATION FLOW STATUS');
needText('migration-flow.html', 'Encounters do not equal people');
needText('migration-flow.html', 'United States');
needText('migration-flow.html', 'European Union / UK');
needText('migration-flow.html', 'Mediterranean / Africa');
needText('migration-flow.html', 'Global Movement');
needText('migration-flow.html', 'Sexual Assault / Migrant-Status Data By Country');
needText('migration-flow.html', 'EST. SOURCE-SPLIT');
needText('migration-flow.html', 'data/migration-flow-panel.json');
needText('migration-flow.html', 'evidence-vault.html');
needText('migration-flow.html', 'live-intel.html');
needText('migration-flow.html', 'atlas-layers.html');

const data = exists('data/migration-flow-panel.json') ? JSON.parse(read('data/migration-flow-panel.json')) : {};
if (!Array.isArray(data.flowPanels) || data.flowPanels.length !== 4) issues.push('flowPanels must contain 4 regions');
if (!data.sexualAssaultCountryLane || !Array.isArray(data.sexualAssaultCountryLane.countries) || data.sexualAssaultCountryLane.countries.length !== 10) issues.push('sexual-assault country lane must contain 10 countries');
for (const region of ['United States','European Union / UK','Mediterranean / Africa','Global Movement']) {
  if (!data.flowPanels || !data.flowPanels.some(p => p.region === region)) issues.push(`missing region ${region}`);
}
for (const country of ['United Kingdom','France','Germany','Sweden','Italy','Spain','Netherlands','Belgium','Austria','United States']) {
  if (!data.sexualAssaultCountryLane || !data.sexualAssaultCountryLane.countries.some(c => c.country === country)) issues.push(`missing country ${country}`);
}
if (issues.length) {
  console.error('MIGRATION FLOW TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log('MIGRATION FLOW TEST PASSED');
