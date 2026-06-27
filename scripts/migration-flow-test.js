const fs = require('fs');
const path = require('path');
const root = process.cwd();
const issues = [];
const file = name => path.join(root, name);
const exists = name => fs.existsSync(file(name));
const read = name => fs.readFileSync(file(name), 'utf8');
function needFile(name) { if (!exists(name)) issues.push(`missing ${name}`); }
function needText(name, text) { if (exists(name) && !read(name).includes(text)) issues.push(`${name} missing ${text}`); }
function forbidText(name, text) { if (exists(name) && read(name).includes(text)) issues.push(`${name} still contains deprecated ${text}`); }

needFile('data/migration-flow-panel.json');
needFile('migration-flow.html');
needFile('news.html');
needText('migration-flow.html', 'MIGRATION FLOW PANEL.');
needText('migration-flow.html', 'MIGRATION FLOW STATUS');
needText('migration-flow.html', 'Encounters do not equal people');
needText('migration-flow.html', 'Official sexual-offence totals exist');
needText('migration-flow.html', 'United States');
needText('migration-flow.html', 'European Union / UK');
needText('migration-flow.html', 'Mediterranean / Africa');
needText('migration-flow.html', 'Global Movement');
needText('migration-flow.html', 'Sexual Offence Statistics / Migrant-Status Split By Country');
needText('migration-flow.html', 'OFFICIAL SEXUAL-OFFENCE STATS AVAILABLE');
needText('migration-flow.html', 'NATIONALITY SPLIT PARTIAL');
needText('migration-flow.html', 'IMMIGRATION-STATUS SPLIT NOT CLEAN');
needText('migration-flow.html', 'SUSPECT DATA ONLY — NOT CONVICTION');
needText('migration-flow.html', '256,302 sexual violence offences');
needText('migration-flow.html', '98,190 rape offences');
needText('migration-flow.html', 'data/migration-flow-panel.json');
needText('migration-flow.html', 'evidence-vault.html');
needText('migration-flow.html', 'live-intel.html');
needText('migration-flow.html', 'atlas-layers.html');
forbidText('migration-flow.html', 'EST. SOURCE-SPLIT');

const data = exists('data/migration-flow-panel.json') ? JSON.parse(read('data/migration-flow-panel.json')) : {};
if (!Array.isArray(data.flowPanels) || data.flowPanels.length !== 4) issues.push('flowPanels must contain 4 regions');
if (!data.sexualAssaultCountryLane || !Array.isArray(data.sexualAssaultCountryLane.countries) || data.sexualAssaultCountryLane.countries.length !== 10) issues.push('sexual-assault country lane must contain 10 countries');
if (!data.sexualAssaultCountryLane || !String(data.sexualAssaultCountryLane.euHeadline || '').includes('256,302')) issues.push('sexual-assault lane missing EU 2024 sexual-violence marker');
if (!Array.isArray(data.sexualAssaultCountryLane && data.sexualAssaultCountryLane.statusLegend) || data.sexualAssaultCountryLane.statusLegend.length < 6) issues.push('sexual-assault lane needs source split legend');
for (const region of ['United States','European Union / UK','Mediterranean / Africa','Global Movement']) {
  if (!data.flowPanels || !data.flowPanels.some(p => p.region === region)) issues.push(`missing region ${region}`);
}
for (const figure of ['237.5K FY2025 SW border marker', '178K EU detections', '41,472 UK small boats', '800+ dead/missing', '117M–123.2M displaced marker']) {
  needText('news.html', figure);
}
needText('news.html', '256,302 sexual violence offences');
needText('news.html', '98,190 rape offences');
needText('news.html', '10 countries mapped');
needText('news.html', 'Open full migration/source-split panel');
forbidText('news.html', 'EST. SOURCE-SPLIT');
for (const country of ['United Kingdom','France','Germany','Sweden','Italy','Spain','Netherlands','Belgium','Austria','United States']) {
  const entry = data.sexualAssaultCountryLane && data.sexualAssaultCountryLane.countries && data.sexualAssaultCountryLane.countries.find(c => c.country === country);
  if (!entry) issues.push(`missing country ${country}`);
  if (entry && entry.publicFigure !== 'OFFICIAL SEXUAL-OFFENCE STATS AVAILABLE') issues.push(`${country} must show official sexual-offence stats available`);
  if (entry && !entry.sourceSplitStatus) issues.push(`${country} missing sourceSplitStatus`);
  if (entry && (!Array.isArray(entry.availableSplits) || entry.availableSplits.length < 3)) issues.push(`${country} missing available split list`);
  if (entry && (!Array.isArray(entry.missingSplits) || entry.missingSplits.length < 3)) issues.push(`${country} missing missing split list`);
  if (entry && !entry.sourceUrl) issues.push(`${country} missing sourceUrl`);
  if (entry && !entry.evidenceWarning) issues.push(`${country} missing evidenceWarning`);
  needText('news.html', country);
}
if (issues.length) {
  console.error('MIGRATION FLOW TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log('MIGRATION FLOW TEST PASSED');
console.log('Checked migration flow categories, news-page migration figures, official sexual-offence availability, EU 2024 marker, country source split statuses, missing/available split lists, evidence warnings, and deprecated placeholder removal.');
