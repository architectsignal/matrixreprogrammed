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
  'data/epstein-file-cockpit.json',
  'data/epstein-network-architecture.json',
  'scripts/enhance-epstein-watch.js',
  'epstein-files.html',
  'downloads/epstein-source-watch.json',
  'downloads/epstein-evidence-watch.md',
  'downloads/epstein-email-signals.json',
  'downloads/epstein-email-signals.md',
  'downloads/epstein-people-index.json',
  'downloads/epstein-people-index.md',
  'downloads/epstein-file-cockpit.json',
  'downloads/epstein-file-cockpit.md',
  'downloads/epstein-network-architecture.json',
  'downloads/epstein-network-architecture.md',
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
  if(!String(signals.boundary || '').includes('supported record item')) fail('data/epstein-email-signals.json expected evidence boundary language');
}
if(exists('data/epstein-people-index.json')){
  const people = JSON.parse(read('data/epstein-people-index.json'));
  if(!Array.isArray(people.evidenceClasses) || people.evidenceClasses.length < 8) fail('data/epstein-people-index.json expected evidence class legend');
  if(!Array.isArray(people.people) || people.people.length < 10) fail('data/epstein-people-index.json expected at least 10 people/entity cards');
  for(const item of people.people || []){
    for(const key of ['name','type','evidenceClass','recordShows','networkFunction','boundary']) if(!item[key]) fail(`people index item missing ${key}`);
    if(!Array.isArray(item.sourceButtons) || item.sourceButtons.length < 1) fail(`people index item missing source buttons: ${item.name || 'unknown'}`);
  }
}
if(exists('data/epstein-file-cockpit.json')){
  const cockpit = JSON.parse(read('data/epstein-file-cockpit.json'));
  if(!Array.isArray(cockpit.doors) || cockpit.doors.length < 10) fail('data/epstein-file-cockpit.json expected at least 10 actual file doors');
  if(!Array.isArray(cockpit.howToUse) || cockpit.howToUse.length < 5) fail('data/epstein-file-cockpit.json expected how-to-use rules');
  for(const door of cockpit.doors || []){
    for(const key of ['title','evidenceClass','url','use','bestFor']) if(!door[key]) fail(`file cockpit door missing ${key}`);
    if(!/^https?:\/\//.test(door.url)) fail(`file cockpit door must use absolute URL: ${door.title || 'unknown'}`);
  }
}
if(exists('data/epstein-network-architecture.json')){
  const network = JSON.parse(read('data/epstein-network-architecture.json'));
  if(!Array.isArray(network.functions) || network.functions.length < 8) fail('data/epstein-network-architecture.json expected at least 8 network functions');
  if(!Array.isArray(network.readerMethod) || network.readerMethod.length < 5) fail('data/epstein-network-architecture.json expected reader method rules');
  if(!network.speculationRule || !network.speculationRule.includes('labelled question')) fail('data/epstein-network-architecture.json expected labelled speculation rule');
  for(const item of network.functions || []){
    for(const key of ['title','evidenceClass','whatToTrack']) if(!item[key]) fail(`network architecture item missing ${key}`);
    if(!Array.isArray(item.redFlags) || item.redFlags.length < 3) fail(`network architecture item missing red flags: ${item.title || 'unknown'}`);
    if(!Array.isArray(item.recordsNeeded) || item.recordsNeeded.length < 3) fail(`network architecture item missing records needed: ${item.title || 'unknown'}`);
  }
}

requireIncludes('scripts/enhance-epstein-watch.js','networkMatrixFile','generator loads network matrix file');
requireIncludes('scripts/enhance-epstein-watch.js','networkJsonOut','generator writes network JSON');
requireIncludes('scripts/enhance-epstein-watch.js','networkMdOut','generator writes network markdown');
requireIncludes('scripts/enhance-epstein-watch.js','epstein-network-architecture','generator renders network section');
requireIncludes('scripts/enhance-epstein-watch.js','Speculation Quarantine','generator renders speculation quarantine');

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
requireIncludes('epstein-files.html','epstein-file-cockpit','actual files cockpit section');
requireIncludes('epstein-files.html','Actual Files Cockpit','actual files cockpit heading');
requireIncludes('epstein-files.html','Open These File Doors First','file doors heading');
requireIncludes('epstein-files.html','Open Actual Files','actual file buttons');
requireIncludes('epstein-files.html','epstein-network-architecture','network architecture section');
requireIncludes('epstein-files.html','Network Architecture Matrix','network architecture heading');
requireIncludes('epstein-files.html','Speculation Quarantine','speculation quarantine');
requireIncludes('epstein-files.html','Network functions','network function count');
requireIncludes('epstein-files.html','Evidence Boundary','evidence boundary marker');
requireIncludes('epstein-files.html','Criminal finding only where court/plea/conviction supports it','criminal finding boundary');

requireIncludes('downloads/epstein-source-watch.json','watchSources','source watch JSON data');
requireIncludes('downloads/epstein-evidence-watch.md','# Epstein Evidence Watch','markdown title');
requireIncludes('downloads/epstein-evidence-watch.md','## Source Lanes','markdown source lanes');
requireIncludes('downloads/epstein-email-signals.md','# Epstein Email Signal Map','email markdown title');
requireIncludes('downloads/epstein-people-index.md','# Epstein People / Entity Tracker','people markdown title');
requireIncludes('downloads/epstein-file-cockpit.md','# Epstein Actual Files Cockpit','cockpit markdown title');
requireIncludes('downloads/epstein-file-cockpit.json','DOJ Epstein Disclosures','cockpit JSON DOJ door');
requireIncludes('downloads/epstein-network-architecture.md','# Epstein Network Architecture Matrix','network architecture markdown title');
requireIncludes('downloads/epstein-network-architecture.json','Access Network','network architecture JSON access lane');
requireIncludes('downloads/epstein-network-architecture.json','Speculation Quarantine','network architecture JSON speculation lane');
requireIncludes('downloads/epstein-network-architecture.json','Legal Pressure / Silence Network','network architecture JSON legal/silence lane');
requireIncludes('package.json','enhance-epstein-watch.js','npm build enhancer');
requireIncludes('netlify.toml','enhance-epstein-watch.js','Netlify build enhancer');

if(problems.length){
  console.error('\nEPSTEIN WATCH PRESSURE TEST FAILED\n');
  for(const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('EPSTEIN WATCH PRESSURE TEST PASSED');
console.log('Checked UX mission navigation, scaffold-copy scan, Live Intel depth, 10/10 usefulness, evidence-watch data, email signals, people tracker, actual files cockpit, network architecture matrix, source lanes, bulletins, downloads, enhanced hub section, evidence boundaries, video/book routes, package wiring, and Netlify wiring.');