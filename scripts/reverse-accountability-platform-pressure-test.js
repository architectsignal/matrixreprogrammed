'use strict';

const fs = require('fs');
const path = require('path');
require('./finalize-accountability-mission-intro.js');
require('./power-supply-chain-pressure-test.js');

const root = process.cwd();
const failures = [];
const fail = message => failures.push(message);
const read = relative => {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) { fail(`Missing ${relative}`); return ''; }
  return fs.readFileSync(file, 'utf8');
};
const json = relative => {
  try { return JSON.parse(read(relative)); } catch (error) { fail(`Invalid JSON ${relative}: ${error.message}`); return {}; }
};

const mission = 'Matrix Reprogrammed is a public accountability system where anyone can search a consequence, trace it backwards through decisions, authority and money, follow the unanswered questions, and return to see what actually happened.';
const roadmap = json('data/accountability-innovation-roadmap.json');
const requiredSystems = [
  'reverse-accountability-search', 'power-supply-chain', 'evidence-half-life', 'power-diff',
  'red-team-mirror', 'public-answer-clock', 'missing-record-missions', 'lived-consequence-receipts'
];
const systemIds = new Set((roadmap.systems || []).map(item => item.id));
requiredSystems.forEach(id => { if (!systemIds.has(id)) fail(`Roadmap missing ${id}`); });
if (roadmap.status !== 'permanent-product-requirement') fail('Innovation roadmap is not locked as a permanent product requirement');
if (roadmap.mission !== mission) fail('Roadmap mission does not match the approved public mission');

const installer = read('scripts/install-reverse-accountability-platform.js');
for (const marker of [
  'data/reverse-accountability-index.json', 'reverse-accountability-search.html', 'reverse-accountability-search.js',
  'reverse-accountability-search.css', 'accountability-mission-intro:start', 'existing ElevenLabs endpoint with browser speech fallback'
]) if (!installer.includes(marker)) fail(`Installer missing ${marker}`);

const page = read('reverse-accountability-search.html');
const client = read('reverse-accountability-search.js');
const css = read('reverse-accountability-search.css');
const intro = read('welcome-gate.js');
const homepage = read('index.html');
const index = json('data/reverse-accountability-index.json');
const powerChain = json('data/power-supply-chain.json');

for (const marker of ['START WITH', 'data-reverse-search-form', 'data-reverse-search-results', mission, 'Search the consequence. Trace the power. Follow the outcome.']) {
  if (!page.includes(marker)) fail(`Reverse search page missing ${marker}`);
}
for (const marker of ['expandTerms', 'score(record', 'data/reverse-accountability-index.json', 'Relevance is not proof', 'Follow the outcome', 'Trace responsibility chain']) {
  if (!client.includes(marker)) fail(`Reverse search client missing ${marker}`);
}
if (!css.includes('.reverse-path-step') || !css.includes('@media')) fail('Reverse search CSS is incomplete or not responsive');
if (!intro.includes(mission)) fail('Approved mission is not present in the spoken intro lines');
if (!intro.includes('/intro-voice') || !intro.includes('browserSpeechFallback')) fail('Intro no longer retains ElevenLabs and browser voice fallback');
if (!intro.includes("if (!document.body.classList.contains('accountability-home')) mountHomepageCommandRail();")) fail('Legacy command rail is not blocked on the simple homepage');
if (!homepage.includes('data-signal-gate') || !homepage.includes('welcome-gate.js')) fail('Search-first homepage does not include the mission intro');
if (!homepage.includes('reverse-accountability-search.html')) fail('Homepage does not link to Reverse Accountability Search');
if (!Array.isArray(index.records) || index.records.length < 1) fail('Reverse accountability index has no records');
if (!Array.isArray(powerChain.chains) || powerChain.chains.length !== index.records.length) fail('Power Supply Chain is not synchronized with Reverse Accountability Search');

for (const record of index.records || []) {
  if (!record.id || !record.title || !record.consequenceSummary) fail('Reverse accountability record is missing identity or consequence summary');
  const pathTypes = new Set((record.path || []).map(item => item.type));
  for (const type of ['consequence', 'implementation', 'authority', 'money', 'justification', 'outcome']) {
    if (!pathTypes.has(type)) fail(`${record.id || 'record'} is missing ${type} path step`);
  }
  if (!record.evidenceBoundary) fail(`${record.id || 'record'} is missing an evidence boundary`);
  if (!Array.isArray(record.unansweredQuestions) || !record.unansweredQuestions.length) fail(`${record.id || 'record'} has no unanswered question`);
  if (!String(record.powerSupplyChainRoute || '').startsWith('power-supply-chain.html#power-chain-')) fail(`${record.id || 'record'} has no Power Supply Chain route`);
}

if (/\beval\s*\(|new Function\s*\(/.test(client)) fail('Reverse search client contains unsafe dynamic code execution');
if (failures.length) {
  console.error(`Reverse Accountability Search pressure test failed (${failures.length}):`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'reverse-accountability-platform-pressure-test.json'), JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  recordCount: index.records.length,
  powerChainCount: powerChain.chains.length,
  lockedSystems: requiredSystems,
  missionVoice: true,
  homepageEntry: true,
  simpleHomepageProtected: true
}, null, 2) + '\n');
console.log(`Reverse Accountability Search pressure test passed with ${index.records.length} records, synchronized Power Supply Chains and all eight systems locked.`);
