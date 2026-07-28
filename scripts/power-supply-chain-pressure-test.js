'use strict';

const fs = require('fs');
const path = require('path');
require('./install-power-supply-chain.js');

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

const ledger = json('data/power-supply-chain.json');
const page = read('power-supply-chain.html');
const client = read('power-supply-chain.js');
const css = read('power-supply-chain.css');
const reverseIndex = json('data/reverse-accountability-index.json');
const requiredStages = ['consequence','proposal','drafting','promotion','authorization','funding','implementation','benefit','justification','outcome'];

if (!Array.isArray(ledger.chains) || ledger.chains.length < 1) fail('Power Supply Chain ledger has no chains');
if (!String(ledger.boundary || '').includes('Unknown stages remain visibly unresolved')) fail('Power Supply Chain boundary does not preserve unknown stages');
if (!String(ledger.boundary || '').includes('access, proximity or network membership')) fail('Power Supply Chain boundary does not block guilt or authority by association');

for (const chain of ledger.chains || []) {
  if (!chain.id || !chain.title || !chain.accountabilityRoute) fail('Power Supply Chain record is missing identity or route');
  const stages = new Map((chain.stages || []).map(item => [item.id, item]));
  requiredStages.forEach(id => { if (!stages.has(id)) fail(`${chain.id || 'chain'} missing ${id} stage`); });
  for (const stage of chain.stages || []) {
    if (!stage.role || !stage.value || !stage.state || !stage.evidenceClassification) fail(`${chain.id || 'chain'} has an incomplete ${stage.id || 'unknown'} stage`);
    if (!String(stage.rule || '').includes('does not infer authority from access, association or proximity')) fail(`${chain.id || 'chain'} ${stage.id || 'stage'} lacks the authority boundary`);
    if (stage.state === 'unresolved' && stage.evidenceClassification !== 'missing-record') fail(`${chain.id || 'chain'} unresolved ${stage.id || 'stage'} is not classified as a missing record`);
  }
}

for (const marker of ['THE POWER', 'data-power-chain-search', 'data-power-chain-results', 'Responsibility chain, not a social graph']) {
  if (!page.includes(marker)) fail(`Power Supply Chain page missing ${marker}`);
}
for (const marker of ['data/power-supply-chain.json', 'No missing role has been invented', 'Help resolve a missing stage']) {
  if (!client.includes(marker)) fail(`Power Supply Chain client missing ${marker}`);
}
if (!css.includes('.power-chain-stage.is-unresolved') || !css.includes('@media')) fail('Power Supply Chain CSS is incomplete or not responsive');
if (!(reverseIndex.records || []).every(item => String(item.powerSupplyChainRoute || '').startsWith('power-supply-chain.html#power-chain-'))) fail('Reverse Accountability records are not linked to Power Supply Chain');
if (/\beval\s*\(|new Function\s*\(/.test(client)) fail('Power Supply Chain client contains unsafe dynamic code execution');

if (failures.length) {
  console.error(`Power Supply Chain pressure test failed (${failures.length}):`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'power-supply-chain-pressure-test.json'), JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  chainCount: ledger.chains.length,
  requiredStages,
  unknownStagesPreserved: true,
  authorityByAssociationBlocked: true
}, null, 2) + '\n');
console.log(`Power Supply Chain pressure test passed with ${ledger.chains.length} chains and ${requiredStages.length} evidence-classified stages per chain.`);
