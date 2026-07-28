const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-email-lifecycle.js');
const fragmentPath = path.join(root, 'scripts', 'fragments', 'daily-control-brief-worker-block.txt');
const reportPath = path.join(root, 'downloads', 'daily-control-brief-email-upgrade.json');

if (!fs.existsSync(workerPath)) throw new Error('src/worker-email-lifecycle.js is required');
if (!fs.existsSync(fragmentPath)) throw new Error('Daily Control Brief worker fragment is required');

let source = fs.readFileSync(workerPath, 'utf8');
const before = source;
const fragment = fs.readFileSync(fragmentPath, 'utf8').trim();
const marker = "const DAILY_CONTROL_BRIEF_VERSION='daily-control-brief-v3';";
const contractMarkers = [
  marker,
  'subjectSuffix',
  'clean(rendered.subjectSuffix,82)',
  'briefVersion:DAILY_CONTROL_BRIEF_VERSION',
  'Named people and institutions in the record',
  'Speculation desk — testable, not decorative',
  'What would strengthen it:',
  'What would weaken it:',
  "'/data/daily-command-brief.json'",
  "'/data/speculative-intelligence-synthesis.json'"
];

const contractComplete = contractMarkers.every(required => source.includes(required));
if (!contractComplete) {
  const pattern = source.includes(marker)
    ? /const DAILY_CONTROL_BRIEF_VERSION='daily-control-brief-v3';[\s\S]*?\n\nasync function adminHealth/
    : /async function loadCampaignSource[\s\S]*?\n\nasync function adminHealth/;
  if (!pattern.test(source)) throw new Error('Could not locate the automated campaign content block for Daily Control Brief v3 repair');
  source = source.replace(pattern, `${fragment}\n\nasync function adminHealth`);
}

for (const required of contractMarkers) {
  if (!source.includes(required)) throw new Error(`Daily Control Brief upgrade marker missing: ${required}`);
}

if (source !== before) fs.writeFileSync(workerPath, source);
require('./patch-daily-control-brief-actor-sources.js');

const finalSource = fs.readFileSync(workerPath, 'utf8');
for (const required of contractMarkers) {
  if (!finalSource.includes(required)) throw new Error(`Daily Control Brief final contract marker missing after actor-source expansion: ${required}`);
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: finalSource !== before,
  version: 'daily-control-brief-v3',
  subjectStrategy: 'Strongest current development, then named actor, then evidence-bounded fallback.',
  auditVersionRecorded: true,
  repeatSafe: true,
  improvements: [
    'Uses the Daily Brain Brief, Daily Command Brief, speculative synthesis, public drops and Live Intel instead of flattening one generic array.',
    'Names people and institutions only when a documented role exists.',
    'Explains why each named actor or institution matters.',
    'Adds current developments with evidence status and lane.',
    'Turns speculation into testable scenarios with strengthening and weakening evidence.',
    'Adds records to pull, watch-next triggers, source routes and a full evidence boundary.',
    'Builds a useful subject line from the strongest current development.',
    'Records the Daily Control Brief renderer version in campaign audit metadata.'
  ]
}, null, 2)}\n`);
require('./daily-control-brief-email-test.js');
console.log(`Daily Control Brief email renderer ${finalSource !== before ? 'upgraded' : 'already current'} (${contractMarkers.length} contract markers verified).`);
