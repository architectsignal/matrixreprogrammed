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
  'data/epstein-evidence-ladder.json',
  'data/epstein-timeline-map.json',
  'data/live-intel-sources.json',
  'scripts/enhance-epstein-watch.js',
  'scripts/build-epstein-evidence-ladder.js',
  'scripts/build-epstein-timeline-map.js',
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
  'downloads/epstein-evidence-ladder.json',
  'downloads/epstein-evidence-ladder.md',
  'downloads/epstein-timeline-map.json',
  'downloads/epstein-timeline-map.md',
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
if(exists('data/epstein-evidence-ladder.json')){
  const ladder = JSON.parse(read('data/epstein-evidence-ladder.json'));
  if(!Array.isArray(ladder.levels) || ladder.levels.length < 8) fail('data/epstein-evidence-ladder.json expected at least 8 evidence levels');
  if(!Array.isArray(ladder.claimClassifier) || ladder.claimClassifier.length < 7) fail('data/epstein-evidence-ladder.json expected at least 7 claim classifiers');
  if(!String(ladder.boundary || '').includes('stronger the claim')) fail('data/epstein-evidence-ladder.json expected strong-claim boundary');
  for(const item of ladder.levels || []){
    for(const key of ['level','name','strength','claimAllowed','warning']) if(!item[key]) fail(`evidence ladder level missing ${key}`);
    if(!Array.isArray(item.needs) || item.needs.length < 3) fail(`evidence ladder level missing needs: ${item.name || 'unknown'}`);
  }
  for(const item of ladder.claimClassifier || []){
    for(const key of ['claimType','allowedLanguage','forbiddenShortcut']) if(!item[key]) fail(`claim classifier missing ${key}`);
  }
}
if(exists('data/epstein-timeline-map.json')){
  const timeline = JSON.parse(read('data/epstein-timeline-map.json'));
  if(!Array.isArray(timeline.items) || timeline.items.length < 10) fail('data/epstein-timeline-map.json expected at least 10 timeline items');
  if(!Array.isArray(timeline.crossReferenceRules) || timeline.crossReferenceRules.length < 5) fail('data/epstein-timeline-map.json expected at least 5 cross-reference rules');
  if(!String(timeline.boundary || '').includes('not a verdict')) fail('data/epstein-timeline-map.json expected not-a-verdict boundary');
  if(!timeline.dailyUpdateIntegration || timeline.dailyUpdateIntegration.laneId !== 'epstein-files') fail('data/epstein-timeline-map.json expected daily update integration with epstein-files lane');
  if(!Array.isArray(timeline.dailyUpdateIntegration.requiredSearchTerms) || !timeline.dailyUpdateIntegration.requiredSearchTerms.includes('Epstein timeline')) fail('data/epstein-timeline-map.json expected Epstein timeline daily search term');
  for(const item of timeline.items || []){
    for(const key of ['date','title','evidenceClass','recordSupports','openQuestions','sourceDoor']) if(!item[key]) fail(`timeline item missing ${key}`);
    if(!Array.isArray(item.people) || item.people.length < 1) fail(`timeline item missing people/entities: ${item.title || 'unknown'}`);
    if(!/^https?:\/\//.test(item.sourceDoor)) fail(`timeline source door must use absolute URL: ${item.title || 'unknown'}`);
  }
}
if(exists('data/live-intel-sources.json')){
  const live = JSON.parse(read('data/live-intel-sources.json'));
  const epsteinLane = (live.lanes || []).find(lane => lane.id === 'epstein-files');
  if(!epsteinLane) fail('live intel sources missing epstein-files lane');
  if(epsteinLane && !String(epsteinLane.route || '').includes('#epstein-timeline-map')) fail('live intel Epstein lane must route to timeline map');
  if(epsteinLane && !(epsteinLane.queries || []).includes('Epstein timeline')) fail('live intel Epstein lane missing Epstein timeline query');
  if(!String(live.purpose || '').includes('Epstein timeline mapping')) fail('live intel purpose missing timeline mapping');
  if(!String((live.rules || []).join(' ')).includes('timeline map')) fail('live intel rules missing timeline map integration');
}

requireIncludes('scripts/enhance-epstein-watch.js','networkMatrixFile','generator loads network matrix file');
requireIncludes('scripts/enhance-epstein-watch.js','networkJsonOut','generator writes network JSON');
requireIncludes('scripts/enhance-epstein-watch.js','networkMdOut','generator writes network markdown');
requireIncludes('scripts/enhance-epstein-watch.js','epstein-network-architecture','generator renders network section');
requireIncludes('scripts/enhance-epstein-watch.js','Speculation Quarantine','generator renders speculation quarantine');
requireIncludes('scripts/build-epstein-evidence-ladder.js','epstein-evidence-ladder','Phase 5 builder renders ladder section');
requireIncludes('scripts/build-epstein-evidence-ladder.js','Claim Classifier','Phase 5 builder renders claim classifier');
requireIncludes('scripts/build-epstein-evidence-ladder.js','downloads/epstein-evidence-ladder.json','Phase 5 builder writes JSON download');
requireIncludes('scripts/build-epstein-timeline-map.js','epstein-timeline-map','Phase 6 builder renders timeline section');
requireIncludes('scripts/build-epstein-timeline-map.js','Chronological Case Board','Phase 6 builder renders case board');
requireIncludes('scripts/build-epstein-timeline-map.js','downloads/epstein-timeline-map.json','Phase 6 builder writes JSON download');
requireIncludes('scripts/build-epstein-timeline-map.js','Daily update lane','Phase 6 builder renders daily update lane');
requireIncludes('package.json','build-epstein-evidence-ladder.js','npm build includes Phase 5 builder');
requireIncludes('package.json','build-epstein-timeline-map.js','npm build includes Phase 6 builder');
requireIncludes('netlify.toml','build-epstein-evidence-ladder.js','Netlify build includes Phase 5 builder');
requireIncludes('netlify.toml','build-epstein-timeline-map.js','Netlify build includes Phase 6 builder');

for(const [file, markers] of Object.entries({
  'epstein-files.html': ['epstein-watch-enhanced','Source Watch / Freedom Intelligence Engine','Source Watch JSON','Markdown Brief','Rumble Channels','Books / Store','EPSTEIN WATCH STATUS','epstein-email-signals','Most Telling Epstein Emails / Network Signals','Network Signal Cards','epstein-people-tracker','People / Entity Tracker','Evidence Class Legend','What the record shows','Network Function Cards','epstein-file-cockpit','Actual Files Cockpit','Open These File Doors First','Open Actual Files','epstein-network-architecture','Network Architecture Matrix','Speculation Quarantine','Network functions','epstein-evidence-ladder','Evidence Strength Ladder','Claim Classifier','Forbidden shortcut','Settlement / NDA = silence-management lane, not automatic admission','epstein-timeline-map','Timeline + Cross-Reference Map','Chronological Case Board','Cross-Reference Rules','Daily update lane','Sequence is not a verdict','Evidence Boundary','Criminal finding only where court/plea/conviction supports it'],
  'downloads/epstein-source-watch.json': ['watchSources'],
  'downloads/epstein-evidence-watch.md': ['# Epstein Evidence Watch','## Source Lanes'],
  'downloads/epstein-email-signals.md': ['# Epstein Email Signal Map'],
  'downloads/epstein-people-index.md': ['# Epstein People / Entity Tracker'],
  'downloads/epstein-file-cockpit.md': ['# Epstein Actual Files Cockpit'],
  'downloads/epstein-file-cockpit.json': ['DOJ Epstein Disclosures'],
  'downloads/epstein-network-architecture.md': ['# Epstein Network Architecture Matrix'],
  'downloads/epstein-network-architecture.json': ['Legal Pressure / Silence Network'],
  'downloads/epstein-evidence-ladder.md': ['# Epstein Evidence Strength Ladder'],
  'downloads/epstein-evidence-ladder.json': ['Conviction / Plea / Court Finding','Person named in file'],
  'downloads/epstein-timeline-map.md': ['# Epstein Timeline + Cross-Reference Map'],
  'downloads/epstein-timeline-map.json': ['Florida plea and conviction baseline','dailyUpdateIntegration','Maxwell habeas']
})){
  for(const marker of markers) requireIncludes(file,marker,marker);
}

if(problems.length){
  console.error('\nEPSTEIN WATCH PRESSURE TEST FAILED\n');
  for(const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('EPSTEIN WATCH PRESSURE TEST PASSED');
console.log('Checked focused Epstein evidence-watch data, email signals, people tracker, actual files cockpit, network architecture matrix, evidence ladder, claim classifier, timeline map, daily-update integration, source lanes, bulletins, downloads, enhanced hub section, evidence boundaries, video/book routes, package wiring, and legacy Netlify wiring marker only.');
