require('./ux-polish-pressure-test.js');
require('./scaffold-copy-pressure-test.js');
require('./live-intel-pressure-test.js');
require('./ten-out-of-ten-pressure-test.js');

const fs = require('fs');
const path = require('path');
const root = process.cwd();
const problems = [];
function exists(file){return fs.existsSync(path.join(root,file));}
function read(file){return fs.readFileSync(path.join(root,file),'utf8');}
function fail(msg){problems.push(msg);}
function requireFile(file){if(!exists(file)) fail(`missing required file: ${file}`);}
function requireIncludes(file,text,label=text){if(!exists(file)) return; if(!read(file).includes(text)) fail(`${file}: missing ${label}`);}

for(const file of [
  'data/epstein-evidence-watch.json',
  'data/epstein-email-signals.json',
  'data/epstein-people-index.json',
  'scripts/enhance-epstein-watch.js',
  'epstein-files.html',
  'downloads/epstein-source-watch.json',
  'downloads/epstein-evidence-watch.md',
  'downloads/epstein-email-signals.json',
  'downloads/epstein-email-signals.md',
  'downloads/epstein-people-index.json',
  'downloads/epstein-people-index.md',
  'package.json',
  'netlify.toml'
]) requireFile(file);

if(exists('data/epstein-evidence-watch.json')){
  const data = JSON.parse(read('data/epstein-evidence-watch.json'));
  if(!Array.isArray(data.watchSources) || data.watchSources.length < 6) fail('data/epstein-evidence-watch.json expected at least 6 source lanes');
  if(!Array.isArray(data.bulletins) || data.bulletins.length < 3) fail('data/epstein-evidence-watch.json expected at least 3 bulletins');
  for(const route of ['optin','offer','book','store','video','trust','evidence']) if(!data.moneyRoutes || !data.moneyRoutes[route]) fail(`moneyRoutes missing ${route}`);
}
if(exists('data/epstein-email-signals.json')){
  const signals = JSON.parse(read('data/epstein-email-signals.json'));
  if(!Array.isArray(signals.primaryResearchRoutes) || signals.primaryResearchRoutes.length < 5) fail('data/epstein-email-signals.json expected at least 5 actual-file research routes');
  if(!Array.isArray(signals.signals) || signals.signals.length < 8) fail('data/epstein-email-signals.json expected at least 8 email/network signals');
}
if(exists('data/epstein-people-index.json')){
  const people = JSON.parse(read('data/epstein-people-index.json'));
  if(!Array.isArray(people.evidenceClasses) || people.evidenceClasses.length < 8) fail('data/epstein-people-index.json expected evidence class legend');
  if(!Array.isArray(people.people) || people.people.length < 10) fail('data/epstein-people-index.json expected at least 10 people/entity cards');
}

requireIncludes('epstein-files.html','epstein-watch-enhanced','enhanced watch section');
requireIncludes('epstein-files.html','Source Watch / Freedom Intelligence Engine','source-watch heading');
requireIncludes('epstein-files.html','Source Watch JSON','source watch download link');
requireIncludes('epstein-files.html','Markdown Brief','markdown download link');
requireIncludes('epstein-files.html','Rumble Channels','video route');
requireIncludes('epstein-files.html','Books / Store','book/store route');
requireIncludes('epstein-files.html','EPSTEIN WATCH STATUS','status terminal');
requireIncludes('epstein-files.html','epstein-email-signals','email signals section');
requireIncludes('epstein-files.html','Most Telling Epstein Emails / Network Signals','email/network heading');
requireIncludes('epstein-files.html','Network Signal Cards','network signal cards');
requireIncludes('epstein-files.html','epstein-people-tracker','people tracker section');
requireIncludes('epstein-files.html','People / Entity Tracker','people/entity heading');
requireIncludes('epstein-files.html','Evidence Class Legend','evidence class legend');
requireIncludes('epstein-files.html','What the record shows','record support labels');
requireIncludes('epstein-files.html','Network Function Cards','network function cards');
requireIncludes('downloads/epstein-source-watch.json','watchSources','source watch JSON data');
requireIncludes('downloads/epstein-evidence-watch.md','# Epstein Evidence Watch','markdown title');
requireIncludes('downloads/epstein-evidence-watch.md','## Source Lanes','markdown source lanes');
requireIncludes('downloads/epstein-email-signals.md','# Epstein Email Signal Map','email markdown title');
requireIncludes('downloads/epstein-people-index.md','# Epstein People / Entity Tracker','people markdown title');
requireIncludes('package.json','enhance-epstein-watch.js','npm build enhancer');
requireIncludes('netlify.toml','enhance-epstein-watch.js','Netlify build enhancer');

if(problems.length){
  console.error('\nEPSTEIN WATCH PRESSURE TEST FAILED\n');
  for(const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('EPSTEIN WATCH PRESSURE TEST PASSED');
console.log('Checked UX mission navigation, scaffold-copy scan, Live Intel depth, 10/10 usefulness, evidence-watch data, email signals, people tracker, source lanes, bulletins, downloads, enhanced hub section, video/book routes, package wiring, and Netlify wiring.');