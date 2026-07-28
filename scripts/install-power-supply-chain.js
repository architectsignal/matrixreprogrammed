'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const roots = [root, outputRoot].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const generatedAt = new Date().toISOString();

const array = value => Array.isArray(value) ? value : [];
const clean = (value, max = 1800) => String(value == null ? '' : value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
const unresolvedPattern = /\b(?:not yet|unresolved|unmapped|unknown|pending|not attached|not verified|definition required|contract required|no dated checkpoint|has not yet)\b/i;

function readJson(relative, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); } catch { return fallback; }
}

function writeEverywhere(relative, content) {
  for (const base of roots) {
    const file = path.join(base, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

function copyToOutput(relative) {
  const source = path.join(root, relative);
  if (!fs.existsSync(source) || !fs.existsSync(outputRoot)) return;
  const destination = path.join(outputRoot, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function pathValue(record, type, fallback) {
  const step = array(record.path).find(item => item.type === type);
  return clean(step?.value || fallback, 1600);
}

function stage({ id, label, role, value, source, status }) {
  const resolved = Boolean(value) && !unresolvedPattern.test(value);
  return {
    id,
    label,
    role,
    value: value || 'No evidence-classified record has yet been attached.',
    state: status || (resolved ? 'review-stage-record' : 'unresolved'),
    evidenceClassification: resolved ? clean(source?.classification || 'public-source-lead', 160) : 'missing-record',
    sourceLabel: resolved ? clean(source?.label || 'Public source', 260) : '',
    sourceUrl: resolved ? clean(source?.url, 1200) : '',
    rule: 'This stage identifies a documented role or an explicit evidence gap. It does not infer authority from access, association or proximity.'
  };
}

const reverseIndex = readJson('data/reverse-accountability-index.json', { records: [] });
const records = array(reverseIndex.records);
const chains = records.map(record => {
  const source = record.source || {};
  const beneficiaries = array(record.knownBeneficiaries).map(item => clean(item, 260)).filter(Boolean);
  const affected = array(record.affectedGroups).map(item => clean(item, 260)).filter(Boolean);
  const implementation = pathValue(record, 'implementation', 'The implementer and implementation status remain unresolved.');
  const authority = pathValue(record, 'authority', 'The authorising person, body and legal basis remain unresolved.');
  const money = pathValue(record, 'money', 'The funding route, contracts and financial beneficiaries remain unresolved.');
  const justification = pathValue(record, 'justification', 'The stated justification and promised public benefit remain unresolved.');
  const outcome = pathValue(record, 'outcome', 'No reviewed outcome checkpoint is available.');
  const benefitValue = beneficiaries.length || affected.length
    ? [beneficiaries.length ? `Potential or documented beneficiaries under review: ${beneficiaries.join(', ')}` : '', affected.length ? `Affected groups under review: ${affected.join(', ')}` : ''].filter(Boolean).join(' · ')
    : 'Direct beneficiaries, affected groups and transferred risks remain unresolved.';
  const chainId = `power-chain-${clean(record.id, 220)}`;
  return {
    schemaVersion: 1,
    id: chainId,
    sourceRecordId: clean(record.id, 220),
    title: clean(record.title, 500),
    lane: clean(record.lane || 'public-accountability', 160),
    laneTitle: clean(record.laneTitle || 'Public Accountability', 220),
    consequenceSummary: clean(record.consequenceSummary || record.title, 1200),
    accountabilityRoute: clean(record.route || 'public-consequence-contracts.html', 900),
    reverseSearchRoute: `reverse-accountability-search.html?q=${encodeURIComponent(clean(record.title, 300))}`,
    source,
    stages: [
      stage({ id:'consequence', label:'Observed consequence', role:'Public effect being investigated', value:clean(record.consequenceSummary || record.title, 1200), source }),
      stage({ id:'proposal', label:'Proposal', role:'Who first proposed the action', value:'The proposer and originating record remain unresolved.', source }),
      stage({ id:'drafting', label:'Drafting and design', role:'Who wrote or designed the mechanism', value:'The drafter, adviser or technical designer remains unresolved.', source }),
      stage({ id:'promotion', label:'Promotion and influence', role:'Who promoted, lobbied for or shaped adoption', value:'Promotion, lobbying and influence records remain unresolved.', source }),
      stage({ id:'authorization', label:'Authorization', role:'Who possessed legal, contractual or delegated authority', value:authority, source }),
      stage({ id:'funding', label:'Funding and contracts', role:'Who supplied money and through which instrument', value:money, source }),
      stage({ id:'implementation', label:'Implementation', role:'Who carried the decision into effect', value:implementation, source }),
      stage({ id:'benefit', label:'Benefit, cost and risk transfer', role:'Who gained, paid or absorbed risk', value:benefitValue, source }),
      stage({ id:'justification', label:'Stated justification', role:'What public benefit was promised', value:justification, source }),
      stage({ id:'outcome', label:'Measured outcome', role:'What happened after implementation', value:outcome, source })
    ],
    unansweredQuestions: array(record.unansweredQuestions).map(item => clean(item, 900)).filter(Boolean).slice(0, 10),
    evidenceBoundary: clean(record.evidenceBoundary || 'This chain is an evidence map, not proof of wrongdoing or causation.', 1400),
    operatingRule: 'Authority, funding, implementation and benefit must be separately evidenced. A relationship or meeting cannot substitute for proof of decision authority.'
  };
});

const ledger = {
  schemaVersion: 1,
  generatedAt,
  title: 'Power Supply Chain',
  proposition: 'Trace who proposed, drafted, promoted, authorised, funded, implemented and benefited from an exercise of power without confusing association with authority.',
  boundary: 'Unknown stages remain visibly unresolved. The system must not infer authority, payment, responsibility, causation or benefit from access, proximity or network membership.',
  count: chains.length,
  chains
};
writeEverywhere('data/power-supply-chain.json', `${JSON.stringify(ledger, null, 2)}\n`);

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Power Supply Chain | Matrix Reprogrammed</title><meta name="description" content="Trace proposal, drafting, influence, authority, funding, implementation, beneficiaries and real outcomes without confusing association with authority."><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="fixes.css"><link rel="stylesheet" href="power-supply-chain.css"></head><body class="power-chain-page"><canvas id="matrix" aria-hidden="true"></canvas><div class="page"><header class="power-chain-topbar wrap"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"> MATRIX REPROGRAMMED</a><nav><a href="reverse-accountability-search.html">Search a consequence</a><a href="public-consequence-contracts.html">Accountability Twins</a><a href="hit-list.html">Hit List</a></nav></header><main><section class="power-chain-hero wrap"><p class="power-chain-kicker">Responsibility chain, not a social graph</p><h1>THE POWER<br>SUPPLY CHAIN.</h1><p>Trace who proposed, drafted, promoted, authorised, funded, implemented and benefited from an exercise of power. Missing stages remain missing; association is never converted into authority.</p><form data-power-chain-search class="power-chain-search" role="search"><label class="sr-only" for="power-chain-query">Search a consequence or accountability record</label><input id="power-chain-query" type="search" placeholder="Search a decision, consequence, institution or money route…"><button type="submit">Trace chain</button></form><p data-power-chain-status class="power-chain-status" aria-live="polite">Loading evidence-classified chains…</p></section><section data-power-chain-results class="power-chain-results wrap"></section><section class="power-chain-boundary wrap"><strong>Boundary:</strong> ${esc(ledger.boundary)}</section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — trace responsibility through evidence, not association.</p></footer></div><script src="matrix.js"></script><script src="power-supply-chain.js"></script><script src="analytics.js"></script></body></html>`;
writeEverywhere('power-supply-chain.html', page);
copyToOutput('power-supply-chain.js');
copyToOutput('power-supply-chain.css');

const reversePath = path.join(root, 'data', 'reverse-accountability-index.json');
if (fs.existsSync(reversePath)) {
  const updated = readJson('data/reverse-accountability-index.json', { records: [] });
  updated.records = array(updated.records).map(record => ({
    ...record,
    powerSupplyChainRoute: `power-supply-chain.html#power-chain-${clean(record.id, 220)}`
  }));
  writeEverywhere('data/reverse-accountability-index.json', `${JSON.stringify(updated, null, 2)}\n`);
}

const report = {
  ok: chains.length > 0,
  generatedAt,
  chainCount: chains.length,
  stageCount: chains.reduce((sum, item) => sum + item.stages.length, 0),
  unresolvedStages: chains.reduce((sum, item) => sum + item.stages.filter(stageItem => stageItem.state === 'unresolved').length, 0),
  boundary: ledger.boundary
};
writeEverywhere('downloads/power-supply-chain-report.json', `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error('Power Supply Chain could not build any accountability chains.');
console.log(`Power Supply Chain installed with ${chains.length} chains and explicit unresolved-stage boundaries.`);
