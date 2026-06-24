const fs = require('fs');
const path = require('path');
const root = process.cwd();
const problems = [];
function exists(file){return fs.existsSync(path.join(root,file));}
function read(file){return fs.readFileSync(path.join(root,file),'utf8');}
function fail(msg){problems.push(msg);}
function requireFile(file){if(!exists(file)) fail(`missing required file: ${file}`);}
function requireIncludes(file,text,label=text){if(!exists(file)) return; if(!read(file).includes(text)) fail(`${file}: missing ${label}`);}

for(const file of ['data/epstein-evidence-watch.json','scripts/enhance-epstein-watch.js','epstein-files.html','downloads/epstein-source-watch.json','downloads/epstein-evidence-watch.md','package.json','netlify.toml']) requireFile(file);

if(exists('data/epstein-evidence-watch.json')){
  const data = JSON.parse(read('data/epstein-evidence-watch.json'));
  if(!Array.isArray(data.watchSources) || data.watchSources.length < 6) fail('data/epstein-evidence-watch.json expected at least 6 source lanes');
  if(!Array.isArray(data.bulletins) || data.bulletins.length < 3) fail('data/epstein-evidence-watch.json expected at least 3 bulletins');
  for(const route of ['optin','offer','book','store','video','trust','evidence']) if(!data.moneyRoutes || !data.moneyRoutes[route]) fail(`moneyRoutes missing ${route}`);
}

requireIncludes('epstein-files.html','epstein-watch-enhanced','enhanced watch section');
requireIncludes('epstein-files.html','Source Watch / Freedom Intelligence Engine','source-watch heading');
requireIncludes('epstein-files.html','Source Watch JSON','source watch download link');
requireIncludes('epstein-files.html','Markdown Brief','markdown download link');
requireIncludes('epstein-files.html','Rumble Channels','video route');
requireIncludes('epstein-files.html','Books / Store','book/store route');
requireIncludes('epstein-files.html','EPSTEIN WATCH STATUS','status terminal');
requireIncludes('downloads/epstein-source-watch.json','watchSources','source watch JSON data');
requireIncludes('downloads/epstein-evidence-watch.md','# Epstein Evidence Watch','markdown title');
requireIncludes('downloads/epstein-evidence-watch.md','## Source Lanes','markdown source lanes');
requireIncludes('package.json','enhance-epstein-watch.js','npm build enhancer');
requireIncludes('netlify.toml','enhance-epstein-watch.js','Netlify build enhancer');

if(problems.length){
  console.error('\nEPSTEIN WATCH PRESSURE TEST FAILED\n');
  for(const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('EPSTEIN WATCH PRESSURE TEST PASSED');
console.log('Checked evidence-watch data, source lanes, bulletins, downloads, enhanced hub section, video/book routes, package wiring, and Netlify wiring.');
