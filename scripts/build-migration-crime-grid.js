const fs = require('fs');
const path = require('path');
const root = process.cwd();
function esc(s=''){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
const dataPath = path.join(root,'data','migrant-sexual-offence-country.json');
const pagePath = path.join(root,'news.html');
if (!fs.existsSync(dataPath) || !fs.existsSync(pagePath)) process.exit(0);
const data = JSON.parse(fs.readFileSync(dataPath,'utf8'));
let html = fs.readFileSync(pagePath,'utf8');
if (html.includes('id="migrant-sexual-offence-country"')) process.exit(0);
const countries = Array.isArray(data.countries) ? data.countries : [];
const cards = countries.map(c => `<article class="metric redline"><strong>${esc(c.figure || 'EST. SOURCE-SPLIT')}</strong><span><b>${esc(c.country)}</b><br>${esc(c.description || '')}<em>${esc(c.sourceLabel || '')} · ${esc(c.status || '')}</em></span></article>`).join('');
const section = `<section id="migrant-sexual-offence-country" class="section wrap"><h2>Sexual Assault / Migrant-Status Data By Country</h2><p class="lead">Country-by-country crime-data lane. Figures are estimate markers until an official country dataset gives a comparable number. Nationality, foreign-born status, asylum status, immigration status, suspect data, charge data, and conviction data are different categories.</p><div class="card redline"><h3>Evidence Rule</h3><p>Do not infer immigration status from nationality. Do not treat police suspects as convictions. Do not turn individual cases into group guilt. Unknown-status cases remain unknown.</p></div><div class="metric-grid">${cards}</div></section>`;
html = html.replace(/<div class="card redline"><h3>Migration Display Rule<\/h3>/, `${section}<div class="card redline"><h3>Migration Display Rule</h3>`);
fs.writeFileSync(pagePath, html);
console.log('Migration crime country grid enhanced');
