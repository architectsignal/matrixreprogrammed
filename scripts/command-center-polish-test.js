const fs = require('fs');
const path = require('path');

const root = process.cwd();
const problems = [];
function exists(file){ return fs.existsSync(path.join(root, file)); }
function read(file){ return fs.readFileSync(path.join(root, file), 'utf8'); }
function fail(msg){ problems.push(msg); }
function requireFile(file){ if(!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label = text){ if(!exists(file)) return; if(!read(file).includes(text)) fail(`${file}: missing ${label}`); }

const files = [
  'scripts/build-command-center-polish.js',
  'epstein-files.html',
  'index.html',
  'live-intel.html',
  'evidence-vault.html',
  'power-atlas.html',
  'books.html',
  'package.json'
];
files.forEach(requireFile);

requireIncludes('scripts/build-command-center-polish.js', 'epstein-command-center-order', 'builder inserts Command Center order');
requireIncludes('scripts/build-command-center-polish.js', 'black-file-conversion-panel', 'builder inserts Black File conversion panel');
requireIncludes('scripts/build-command-center-polish.js', 'THE EPSTEIN FILES COMMAND CENTER', 'builder has Command Center headline');
requireIncludes('scripts/build-command-center-polish.js', 'Read The Black File', 'builder has Black File CTA');

requireIncludes('epstein-files.html', 'epstein-command-center-order', 'Command Center order section');
requireIncludes('epstein-files.html', 'THE EPSTEIN FILES COMMAND CENTER', 'Command Center title');
requireIncludes('epstein-files.html', 'Open The Actual Files', 'Actual Files step');
requireIncludes('epstein-files.html', 'Track People / Entities', 'people tracker step');
requireIncludes('epstein-files.html', 'Follow The Timeline', 'timeline step');
requireIncludes('epstein-files.html', 'Read The Emails', 'email step');
requireIncludes('epstein-files.html', 'Classify The Evidence', 'evidence ladder step');
requireIncludes('epstein-files.html', 'Map The Network Function', 'network architecture step');
requireIncludes('epstein-files.html', 'Read The Black File', 'Black File step');
requireIncludes('epstein-files.html', 'black-file-conversion-panel', 'Black File conversion panel');
requireIncludes('epstein-files.html', 'You have seen the public record', 'conversion copy');
requireIncludes('epstein-files.html', 'Get The Free Brief', 'free brief CTA');
requireIncludes('epstein-files.html', 'Open The Amazon Store', 'store CTA');
requireIncludes('epstein-files.html', 'Watch The Rumble Breakdown', 'video CTA');

for (const file of ['index.html','live-intel.html','evidence-vault.html','power-atlas.html','books.html']) {
  requireIncludes(file, 'black-file-conversion-panel', `${file} Black File conversion panel`);
  requireIncludes(file, 'Read The Black File', `${file} Black File CTA`);
}

requireIncludes('package.json', 'build-command-center-polish.js', 'npm build includes polish builder');
requireIncludes('package.json', 'command-center-polish-test.js', 'npm build includes polish test');

if(problems.length){
  console.error('\nCOMMAND CENTER POLISH TEST FAILED\n');
  for(const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('COMMAND CENTER POLISH TEST PASSED');
console.log('Checked Epstein Command Center order, public-file flow, Black File conversion panel, free brief/store/video CTAs, major-page funnel panels, and package build wiring.');
