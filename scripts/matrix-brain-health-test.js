const fs = require('fs');
const path = require('path');

const root = process.cwd();
const issues = [];
const exists = file => fs.existsSync(path.join(root, file));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const needFile = file => { if (!exists(file)) issues.push(`missing ${file}`); };
const needText = (file, text) => { if (exists(file) && !read(file).includes(text)) issues.push(`${file} missing ${text}`); };

for (const file of [
  'data/site-intelligence-core.json',
  'scripts/build-matrix-brain.js',
  'matrix-brain.js',
  'site-intelligence-core.html',
  'downloads/site-intelligence-core.json',
  'downloads/site-intelligence-core.md',
  'downloads/site-intelligence-graph.json',
  'docs/MATRIX_MASTER_OPERATING_PROMPT.md'
]) needFile(file);

if (exists('data/site-intelligence-core.json')) {
  const core = JSON.parse(read('data/site-intelligence-core.json'));
  if (!String(core.publicMissionLine || '').includes('Expose wrongdoing')) issues.push('Matrix Brain mission line missing expose wrongdoing wording');
  if (!core.selfAwarenessModel) issues.push('Matrix Brain missing operational self-awareness model');
  if (!Array.isArray(core.signalClasses) || core.signalClasses.length < 7) issues.push('Matrix Brain needs at least seven signal classes');
  if (!Array.isArray(core.sourceFiles) || core.sourceFiles.length < 10) issues.push('Matrix Brain sourceFiles should include tracker and maintenance sources');
}

if (exists('downloads/site-intelligence-graph.json')) {
  const graph = JSON.parse(read('downloads/site-intelligence-graph.json'));
  if (!Array.isArray(graph.knowledge) || graph.knowledge.length < 20) issues.push('Matrix Brain graph needs at least 20 knowledge items');
  if (!graph.counts || graph.counts.policyLanes < 5) issues.push('Matrix Brain graph missing policy lane counts');
}

for (const marker of [
  'THE SITE THINKS IN PUBLIC RECORDS.',
  'Operational Self-Awareness',
  'Signal Classes',
  'Ask The Matrix Brain',
  'association is not guilt',
  'Speculation is not evidence'
]) needText('site-intelligence-core.html', marker);

for (const marker of [
  'downloads/site-intelligence-graph.json',
  'matrix-brain-query',
  'Classification:',
  'Open source route',
  'association, rumour, symbolism'
]) needText('scripts/build-matrix-brain.js', marker);

for (const marker of [
  'matrix-brain-query',
  'fallbackAnswer',
  'control-system-tracker.html',
  'epstein-files.html',
  'dark-speculation-lab.html',
  'Speculation is allowed when labelled'
]) needText('matrix-brain.js', marker);

needText('scripts/ensure-shared-assets.js', 'build-matrix-brain.js');
needText('llms.txt', '/site-intelligence-core.html');

if (issues.length) {
  console.error('\nMATRIX BRAIN HEALTH TEST FAILED\n');
  for (const issue of issues) console.error(`- ${issue}`);
  console.error(`\n${issues.length} issue(s) found.\n`);
  process.exit(1);
}

console.log('MATRIX BRAIN HEALTH TEST PASSED');
console.log('Checked Matrix Brain mission, operational self-awareness model, graph, page, classifier, downloads, llms route, and master operating prompt.');
