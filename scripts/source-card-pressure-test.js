const fs = require('fs');
const path = require('path');

const root = process.cwd();
const problems = [];
function exists(file){ return fs.existsSync(path.join(root, file)); }
function read(file){ return fs.readFileSync(path.join(root, file), 'utf8'); }
function json(file){ return JSON.parse(read(file)); }
function fail(msg){ problems.push(msg); }
function requireFile(file){ if(!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label=text){ if(!exists(file)) return; if(!read(file).includes(text)) fail(`${file}: missing ${label}`); }

for (const file of ['scripts/build-source-cards.js','source-cards.html','data/source-cards.json','downloads/source-cards.json','downloads/source-cards.md','epstein-files.html','evidence-vault.html','live-intel.html','black-file.html','sitemap.xml','llms.txt','search-index.json','package.json']) requireFile(file);
requireIncludes('scripts/build-source-cards.js','Claim strength must never exceed the source type','source-card rule');
requireIncludes('source-cards.html','SOURCE CARDS.','source-cards hero');
requireIncludes('source-cards.html','Evidence boundary','evidence boundary copy');
requireIncludes('source-cards.html','What the record supports','record support label');
requireIncludes('source-cards.html','What it does not prove','not-proven label');
requireIncludes('source-cards.html','Open Source','source button');
requireIncludes('source-cards.html','Evidence Route','evidence button');
for (const file of ['epstein-files.html','evidence-vault.html','live-intel.html','black-file.html']) {
  requireIncludes(file,'id="source-card-system"',`${file} source-card section`);
  requireIncludes(file,'Open Source Cards',`${file} source-card CTA`);
}
if (exists('data/source-cards.json')) {
  const data = json('data/source-cards.json');
  if (!Array.isArray(data.rules) || data.rules.length < 5) fail('source-cards data expected at least 5 rules');
  if (!Array.isArray(data.cards) || data.cards.length < 4) fail('source-cards data expected at least 4 cards');
  for (const card of data.cards || []) {
    for (const key of ['claim','sourceUrl','evidenceClass','recordSupports','notProven','evidenceBoundary','evidenceRoute','bookRoute']) {
      if (!card[key]) fail(`source card missing ${key}: ${card.claim || 'unknown'}`);
    }
    if (card.sourceUrl && !/^https?:\/\//.test(card.sourceUrl) && !card.sourceUrl.endsWith('.html')) fail(`source card sourceUrl must be URL or html route: ${card.claim}`);
  }
}
requireIncludes('downloads/source-cards.md','# Source Cards','markdown title');
requireIncludes('sitemap.xml','/source-cards.html','source-cards sitemap');
requireIncludes('llms.txt','/source-cards.html','source-cards llms');
if (exists('search-index.json') && !json('search-index.json').some(item => item.url === 'source-cards.html')) fail('search-index missing source-cards.html');
requireIncludes('package.json','build-source-cards.js','build-source-cards in package');
requireIncludes('package.json','source-card-pressure-test.js','source-card pressure test in package');
if (problems.length) {
  console.error('\nSOURCE CARD PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('SOURCE CARD PRESSURE TEST PASSED');
console.log('Checked source-card data, source-card page, downloads, page patches, sitemap, llms.txt, search index, and package wiring.');
