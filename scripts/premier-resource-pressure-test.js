const fs = require('fs');
const path = require('path');
const root = process.cwd();
const problems = [];
function exists(file){ return fs.existsSync(path.join(root, file)); }
function read(file){ return fs.readFileSync(path.join(root, file), 'utf8'); }
function fail(msg){ problems.push(msg); }
function requireFile(file){ if(!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label = text){ if(!exists(file)) return; if(!read(file).includes(text)) fail(`${file}: missing ${label}`); }

for(const file of [
  'scripts/build-premier-resource-upgrade.js',
  'daily-drop.html',
  'network-search.html',
  'downloads/daily-drop.json',
  'downloads/daily-drop.md',
  'downloads/network-search.json',
  'downloads/network-search.md',
  'data/live-intel.json',
  'data/epstein-evidence-watch.json',
  'data/epstein-people-index.json',
  'data/epstein-file-cockpit.json',
  'data/evidence-vault.json',
  'epstein-files.html',
  'index.html',
  'search-index.json',
  'sitemap.xml',
  'llms.txt',
  'package.json',
  'netlify.toml',
  'src/worker.js'
]) requireFile(file);

for(const marker of ['WHAT CHANGED TODAY?', 'DAILY DROP STATUS', 'Epstein File Movement', 'Latest Actionable Updates', 'Source Pull Log', 'What the record proves', 'What it does not prove', 'What would strengthen it']) requireIncludes('daily-drop.html', marker, marker);
for(const marker of ['PEOPLE. ENTITIES. RECORDS. BOUNDARIES.', 'Search network records', 'Evidence Classes', 'People / Entity Cards', 'data-network-card', 'data-network-search-input']) requireIncludes('network-search.html', marker, marker);
for(const marker of ['Epstein Command Center: Source First, Claim Second', 'What The Record Proves / Does Not Prove', 'This Week In The Epstein Files', 'Actual Files First', 'Network Function Snapshot']) requireIncludes('epstein-files.html', marker, marker);
for(const file of ['index.html','live-intel.html','evidence-vault.html','download-center.html','books.html']) requireIncludes(file, 'daily-drop-command-route', `${file} daily drop route patch`);

if(exists('downloads/daily-drop.json')){
  const data = JSON.parse(read('downloads/daily-drop.json'));
  if(!data.updated) fail('downloads/daily-drop.json missing updated');
  if(typeof data.totalItems !== 'number') fail('downloads/daily-drop.json missing totalItems number');
  if(!Array.isArray(data.latest)) fail('downloads/daily-drop.json missing latest array');
  if(!Array.isArray(data.watchSources)) fail('downloads/daily-drop.json missing watchSources array');
}
if(exists('downloads/network-search.json')){
  const data = JSON.parse(read('downloads/network-search.json'));
  if(!Array.isArray(data.people) || data.people.length < 10) fail('downloads/network-search.json expected at least 10 people/entity records');
  if(!Array.isArray(data.evidenceClasses) || data.evidenceClasses.length < 8) fail('downloads/network-search.json expected evidence class legend');
}
requireIncludes('downloads/daily-drop.md', '# Matrix Reprogrammed Daily Drop', 'daily drop markdown title');
requireIncludes('downloads/network-search.md', '# Network Search', 'network search markdown title');
requireIncludes('search-index.json', 'daily-drop.html', 'daily-drop search index route');
requireIncludes('search-index.json', 'network-search.html', 'network-search search index route');
requireIncludes('sitemap.xml', '/daily-drop.html', 'daily-drop sitemap route');
requireIncludes('sitemap.xml', '/network-search.html', 'network-search sitemap route');
requireIncludes('llms.txt', '/daily-drop.html', 'daily-drop llms route');
requireIncludes('llms.txt', '/network-search.html', 'network-search llms route');
requireIncludes('package.json', 'build-premier-resource-upgrade.js', 'package build includes premier builder');
requireIncludes('package.json', 'premier-resource-pressure-test.js', 'package build includes premier pressure test');
requireIncludes('netlify.toml', 'build-premier-resource-upgrade.js', 'netlify build includes premier builder');
requireIncludes('netlify.toml', 'premier-resource-pressure-test.js', 'netlify build includes premier pressure test');
requireIncludes('netlify.toml', 'from = "/daily-drop"', 'daily-drop redirect');
requireIncludes('netlify.toml', 'from = "/network-search"', 'network-search redirect');
requireIncludes('src/worker.js', "'/daily-drop': '/daily-drop.html'", 'Cloudflare daily-drop alias');
requireIncludes('src/worker.js', "'/network-search': '/network-search.html'", 'Cloudflare network-search alias');
requireIncludes('src/worker.js', "'/people-search': '/network-search.html'", 'Cloudflare people-search alias');

if(problems.length){
  console.error('\nPREMIER RESOURCE PRESSURE TEST FAILED\n');
  for(const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('PREMIER RESOURCE PRESSURE TEST PASSED');
console.log('Checked Daily Drop, searchable network database, Epstein Command Center markers, downloads, sitemap, llms.txt, search index, redirects, Worker aliases, and build wiring.');
