'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const roots = [root, outputRoot].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const generatedAt = new Date().toISOString();
const HOME_START = '<!-- accountability-twin:start -->';
const HOME_END = '<!-- accountability-twin:end -->';

const array = value => Array.isArray(value) ? value : [];
const clean = (value, max = 1600) => String(value == null ? '' : value).replace(/<[^>]*>/g, ' ').replace(/&(?:#39|quot|amp|lt|gt);/g, token => ({'&#39;':"'",'&quot;':'"','&amp;':'&','&lt;':'<','&gt;':'>'}[token] || token)).replace(/\s+/g, ' ').trim().slice(0, max);
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[char]);
const slug = value => clean(value, 300).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 140) || 'contract';
const readJson = (relative, fallback = {}) => { try { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); } catch { return fallback; } };
const unique = values => [...new Set(array(values).map(value => clean(value)).filter(Boolean))];
const csvCell = value => `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;

function writeEverywhere(relative, content) {
  for (const base of roots) {
    const file = path.join(base, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

function patchEverywhere(relative, transform) {
  for (const base of roots) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file)) continue;
    const before = fs.readFileSync(file, 'utf8');
    const after = transform(before);
    if (after !== before) fs.writeFileSync(file, after);
  }
}

function date(value) {
  const parsed = new Date(value || generatedAt);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date(generatedAt);
}
function plusDays(value, days) {
  const next = date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}
function checkpointStatus(dueAt) {
  const delta = date(dueAt).getTime() - date(generatedAt).getTime();
  if (delta < -86400000) return 'overdue-for-review';
  if (delta <= 86400000) return 'due-now';
  return 'scheduled';
}
function sourceClass(drop) {
  const value = `${drop.evidenceLevel || ''} ${drop.sourceLabel || ''} ${drop.url || ''}`.toLowerCase();
  if (/official|primary|court|regulator|government|un news|\.gov\b/.test(value)) return 'official-or-primary-lead';
  return 'public-source-lead';
}
function actionQuestion(title) {
  const subject = clean(title, 340);
  return `What measurable public consequence followed “${subject}”, and did the evidence support the stated or implied justification?`;
}

const dropsPayload = readJson('data/latest-public-drops.json', { drops: [] });
const drops = array(dropsPayload.drops)
  .filter(item => clean(item.title) && clean(item.url) && clean(item.published))
  .sort((a, b) => date(b.published) - date(a.published))
  .slice(0, 24);

const contractIdCounts = new Map();
const contracts = drops.map((drop, index) => {
  const baseId = `consequence-${slug(drop.id || drop.title)}`;
  const occurrence = (contractIdCounts.get(baseId) || 0) + 1;
  contractIdCounts.set(baseId, occurrence);
  const id = occurrence === 1 ? baseId : `${baseId}-${occurrence}`;
  const checkpoints = [30, 90, 365].map(days => ({
    id: `${id}-${days}d`,
    label: `${days}-day consequence check`,
    daysAfterAction: days,
    dueAt: plusDays(drop.published, days),
    status: checkpointStatus(plusDays(drop.published, days)),
    reviewQuestion: days === 30
      ? 'Was the action actually implemented, and which authority or institution carried it out?'
      : days === 90
        ? 'What measurable early outcomes, costs, beneficiaries and affected groups are visible in the public record?'
        : 'Did the claimed public benefit occur, what unintended consequences emerged, and did the money or power flow differ from the stated rationale?'
  }));
  return {
    schemaVersion: 1,
    id,
    rank: index + 1,
    title: clean(drop.title, 500),
    lane: clean(drop.lane || 'public-accountability', 120),
    laneTitle: clean(drop.laneTitle || 'Public Accountability', 240),
    actionDate: date(drop.published).toISOString(),
    createdAt: generatedAt,
    status: 'lead-stage-contract',
    termsLock: 'unlocked-pending-primary-decision-record',
    outcomeVerdict: 'not-scored',
    outcomeScoreRule: 'No success, failure or beneficiary finding may be scored until a primary decision record defines the action, authority, stated purpose and measurable checkpoint.',
    source: {
      label: clean(drop.sourceLabel || 'Public source', 220),
      url: clean(drop.url, 1200),
      classification: sourceClass(drop),
      publishedAt: date(drop.published).toISOString(),
      evidenceRoute: clean(drop.evidenceRoute || 'evidence-vault.html', 800)
    },
    actionRecord: {
      headline: clean(drop.title, 500),
      summary: clean(drop.summary || drop.whyItMatters || '', 1200),
      responsibleActor: 'Not yet resolved from a primary decision record',
      authorityBasis: 'Not yet attached',
      statedRationale: 'Not yet extracted from a primary decision record',
      claimedPublicBenefit: 'Not yet locked',
      implementationStatus: 'Unverified lead stage'
    },
    consequenceMap: {
      knownBeneficiaries: [],
      beneficiaryQuestion: 'Who receives direct financial, institutional, political or operational benefit if this action is implemented?',
      affectedGroups: [],
      affectedGroupQuestion: 'Which groups carry the cost, risk, restriction or unintended consequence?',
      moneyStatus: 'unmapped',
      moneyQuestions: [
        'What public or private money funds the action?',
        'Which contracts, grants, subsidies, asset positions or procurement routes are connected?',
        'Who receives the direct and indirect financial benefit?'
      ],
      authorityQuestion: 'Which law, vote, order, filing, contract or delegated authority made the action possible?'
    },
    checkpoints,
    outcomeMetrics: [
      { label: 'Implementation', status: 'definition-required', measure: 'Attach a primary record and define what completed implementation would look like.' },
      { label: 'Claimed public benefit', status: 'definition-required', measure: 'Extract the official measurable benefit before judging success or failure.' },
      { label: 'Money and beneficiaries', status: 'mapping-required', measure: 'Map funding, contracts, grants, ownership changes and direct beneficiaries.' },
      { label: 'Costs and affected groups', status: 'mapping-required', measure: 'Measure public cost, restrictions, displacement, risk or other material effects.' }
    ],
    falsifiers: [
      'The primary record does not support the headline or summary used to create this lead-stage contract.',
      'The responsible authority did not implement the stated action.',
      'The measurable public outcome moves in the opposite direction from the stated or implied benefit.',
      'The alleged money route, beneficiary or power effect cannot be supported by primary or corroborated records.',
      'A credible alternative explanation better accounts for the observed outcome.'
    ],
    accountabilityQuestion: actionQuestion(drop.title),
    responseStatus: 'No verified response request recorded',
    evidenceBoundary: clean(drop.evidenceBoundary || dropsPayload.boundary || 'This is a public-source lead, not proof of wrongdoing or outcome.', 1000),
    followTarget: {
      entityId: id,
      entityType: 'topic',
      label: `Consequence contract: ${clean(drop.title, 260)}`,
      route: `public-consequence-contracts.html#${id}`
    },
    version: 1,
    versionHistoryStatus: 'current-snapshot-only'
  };
});

const ledger = {
  schemaVersion: 1,
  generatedAt,
  title: 'The Accountability Twin: Public Consequence Contracts',
  proposition: 'Every consequential exercise of power should retain its original justification, evidence boundary, money questions, expected public benefit, falsifiers and dated outcome checks.',
  differentiation: 'This layer connects the source record, power map, money questions, public-interest claim, future checkpoints and eventual outcome assessment in one followable record.',
  boundary: 'A contract is an accountability framework, not a legal contract, accusation or prediction. Lead-stage contracts cannot receive an outcome verdict until a primary decision record locks the terms.',
  count: contracts.length,
  contracts
};
writeEverywhere('data/public-consequence-contracts.json', `${JSON.stringify(ledger, null, 2)}\n`);

const csvHeaders = ['id','title','lane','actionDate','status','termsLock','outcomeVerdict','sourceLabel','sourceUrl','accountabilityQuestion','checkpoint30','checkpoint90','checkpoint365'];
const csvRows = contracts.map(contract => [
  contract.id, contract.title, contract.lane, contract.actionDate, contract.status, contract.termsLock, contract.outcomeVerdict,
  contract.source.label, contract.source.url, contract.accountabilityQuestion,
  contract.checkpoints[0]?.dueAt || '', contract.checkpoints[1]?.dueAt || '', contract.checkpoints[2]?.dueAt || ''
].map(csvCell).join(','));
writeEverywhere('downloads/public-consequence-contracts.csv', `${csvHeaders.map(csvCell).join(',')}\n${csvRows.join('\n')}\n`);

const checkpointHtml = contract => contract.checkpoints.map(item => `<li><strong>${esc(item.label)}</strong><span>${esc(item.dueAt.slice(0,10))} · ${esc(item.status.replace(/-/g,' '))}</span><small>${esc(item.reviewQuestion)}</small></li>`).join('');
const contractCard = (contract, compact = false) => `<article id="${esc(contract.id)}" class="consequence-contract-card${compact?' compact':''}"><div class="consequence-contract-meta"><span>${esc(contract.laneTitle)}</span><span>${esc(contract.source.classification.replace(/-/g,' '))}</span></div><h3>${esc(contract.title)}</h3><p class="consequence-question"><strong>Accountability question:</strong> ${esc(contract.accountabilityQuestion)}</p>${compact?'':`<div class="consequence-contract-grid"><div><h4>Terms not yet locked</h4><p>${esc(contract.actionRecord.summary || contract.evidenceBoundary)}</p><ul class="consequence-unknowns"><li><strong>Authority:</strong> ${esc(contract.consequenceMap.authorityQuestion)}</li><li><strong>Beneficiaries:</strong> ${esc(contract.consequenceMap.beneficiaryQuestion)}</li><li><strong>Affected groups:</strong> ${esc(contract.consequenceMap.affectedGroupQuestion)}</li></ul></div><div><h4>Outcome checkpoints</h4><ol class="consequence-checkpoints">${checkpointHtml(contract)}</ol></div></div><details><summary>What would falsify or change the conclusion?</summary><ul>${contract.falsifiers.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></details>`}<p class="consequence-boundary"><strong>Boundary:</strong> ${esc(contract.evidenceBoundary)}</p><div class="accountability-hit-actions"><a class="primary" href="${esc(contract.source.url)}" rel="noopener noreferrer">Open source</a><a href="${esc(contract.source.evidenceRoute)}">Evidence route</a><button type="button" data-action="follow-checkpoints" data-follow-id="${esc(contract.followTarget.entityId)}" data-follow-label="${esc(contract.title)}" data-follow-route="${esc(contract.followTarget.route)}">Follow checkpoints</button></div></article>`;

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Public Consequence Contracts | Matrix Reprogrammed</title><meta name="description" content="Living accountability twins that preserve the original exercise of power, its justification, money questions, expected public benefit, falsifiers and dated outcome checks."><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="fixes.css"><link rel="stylesheet" href="accountability-home.css"><link rel="stylesheet" href="public-consequence-contracts.css"></head><body class="accountability-home consequence-contract-page"><canvas id="matrix" aria-hidden="true"></canvas><div class="page"><header class="accountability-topbar wrap"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"> MATRIX REPROGRAMMED</a><nav><a href="index.html">Search</a><a href="hit-list.html">Hit List</a><a href="data/accountability-question-ledger.json">Open Questions</a><a href="member-dashboard.html">My Watchlist</a></nav></header><main class="wrap"><section class="consequence-hero"><p class="accountability-kicker">A future-facing accountability system</p><h1>THE ACCOUNTABILITY TWIN.</h1><p class="lead">A Public Consequence Contract remembers what power did, why it was justified, who may benefit, what evidence would prove it worked, what would falsify the case and exactly when the outcome must be checked again.</p><div class="accountability-boundary"><strong>Evidence boundary:</strong> ${esc(ledger.boundary)}</div><div class="accountability-primary-actions"><a href="data/public-consequence-contracts.json">Open JSON ledger</a><a href="downloads/public-consequence-contracts.csv">Download CSV</a><a href="contact-the-machine.html?type=evidence">Submit a decision record</a></div></section><section class="consequence-explainer"><article><span>1</span><h2>Lock the original terms</h2><p>Attach the primary decision, authority, stated rationale and measurable public benefit before any verdict is allowed.</p></article><article><span>2</span><h2>Map who gains and who pays</h2><p>Trace contracts, grants, ownership, institutional advantage, public cost and affected groups without assuming wrongdoing.</p></article><article><span>3</span><h2>Check the real outcome</h2><p>Reopen the record at 30, 90 and 365 days and compare measurable results with the original justification and falsifiers.</p></article></section><section class="consequence-list"><div class="accountability-section-head"><div><p class="accountability-kicker">${contracts.length} lead-stage contracts</p><h2>CURRENT CONSEQUENCE QUEUE</h2></div><a href="daily-command-brief.html">Open today’s intelligence</a></div>${contracts.map(contract=>contractCard(contract)).join('')}</section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — power should be judged against the consequences it creates.</p></footer></div><script src="matrix.js"></script><script src="accountability-home.js"></script><script src="analytics.js"></script></body></html>`;
writeEverywhere('public-consequence-contracts.html', page);

const css = `.consequence-hero{padding:clamp(4rem,9vw,8rem) 0 2rem;text-align:center}.consequence-hero h1{margin:.2rem 0;font-size:clamp(3rem,8vw,7rem);letter-spacing:-.06em}.consequence-hero .lead{max-width:900px;margin:1rem auto;color:#d0c7b4;line-height:1.6}.consequence-explainer{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.8rem;padding:2rem 0}.consequence-explainer article{padding:1rem;border:1px solid rgba(216,181,106,.24);border-radius:18px;background:rgba(255,255,255,.02)}.consequence-explainer span{display:grid;place-items:center;width:2rem;height:2rem;border-radius:50%;background:#701010;color:white;font-weight:900}.consequence-explainer h2{font-size:1.25rem}.consequence-explainer p{color:#bdb4a4;line-height:1.5}.consequence-list{padding-bottom:4rem}.consequence-contract-card{margin:1rem 0;padding:1.1rem;border:1px solid rgba(216,181,106,.24);border-radius:22px;background:linear-gradient(145deg,rgba(17,9,2,.96),rgba(2,2,2,.98));box-shadow:0 20px 60px rgba(0,0,0,.28)}.consequence-contract-card.compact{margin:0;min-height:100%;display:flex;flex-direction:column}.consequence-contract-card h3{margin:.6rem 0;font-size:clamp(1.35rem,3vw,2.4rem);line-height:1.05}.consequence-contract-meta{display:flex;justify-content:space-between;gap:.5rem;flex-wrap:wrap;color:#d8b56a;font-size:.7rem;text-transform:uppercase;letter-spacing:.09em}.consequence-question{font-size:1rem;line-height:1.55}.consequence-contract-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.consequence-contract-grid>div{padding:.85rem;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.018)}.consequence-contract-grid h4{margin:.1rem 0 .6rem;color:#e2c47b}.consequence-unknowns,.consequence-checkpoints{display:grid;gap:.55rem;padding-left:1.1rem}.consequence-checkpoints li span,.consequence-checkpoints li small{display:block;color:#aaa08d}.consequence-checkpoints li small{margin-top:.2rem;line-height:1.4}.consequence-contract-card details{margin-top:.8rem;border-top:1px solid rgba(216,181,106,.18);padding-top:.7rem}.consequence-contract-card summary{cursor:pointer;color:#e1c477;font-weight:800}.consequence-boundary{color:#a99d89;font-size:.8rem;line-height:1.45}.accountability-twin-home{padding-block:3rem}.accountability-twin-home-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.8rem;margin-top:1rem}@media(max-width:900px){.consequence-explainer,.consequence-contract-grid,.accountability-twin-home-grid{grid-template-columns:1fr}}`;
writeEverywhere('public-consequence-contracts.css', `${css}\n`);

const homeFeatured = contracts.slice(0, 3);
const homeBlock = `${HOME_START}<section id="accountability-twin" class="accountability-twin-home wrap"><div class="accountability-section-head"><div><p class="accountability-kicker">The future-facing accountability layer</p><h2>THE ACCOUNTABILITY TWIN</h2></div><a href="public-consequence-contracts.html">Open all consequence contracts</a></div><p class="accountability-boundary">Every consequential action receives a Public Consequence Contract: the original source, authority and benefit still to be verified, money and beneficiary questions, falsifiers, and dated 30-, 90- and 365-day outcome checks. No verdict is allowed before the terms are locked.</p><div class="accountability-twin-home-grid">${homeFeatured.map(contract=>contractCard(contract,true)).join('')}</div></section>${HOME_END}`;
patchEverywhere('index.html', html => {
  let next = html;
  if (!next.includes('public-consequence-contracts.css')) next = next.replace('</head>', '<link rel="stylesheet" href="public-consequence-contracts.css"></head>');
  const pattern = new RegExp(`${HOME_START.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}[\\s\\S]*?${HOME_END.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`);
  next = pattern.test(next) ? next.replace(pattern, homeBlock) : next.replace('<section class="accountability-return-loop', `${homeBlock}<section class="accountability-return-loop`);
  return next;
});

const index = readJson('search-index.json', []);
if (Array.isArray(index)) {
  const filtered = index.filter(item => !String(item.url || '').startsWith('public-consequence-contracts.html'));
  filtered.push({ title: 'The Accountability Twin: Public Consequence Contracts', url: 'public-consequence-contracts.html', category: 'Accountability system', layer: 'Public consequence contracts', description: ledger.proposition, keywords: ['accountability twin','public consequence contract','outcome checkpoints','money beneficiaries','decision consequences'], priority: 100 });
  for (const contract of contracts) filtered.push({ title: contract.title, url: `public-consequence-contracts.html#${contract.id}`, category: 'Public Consequence Contract', layer: contract.laneTitle, description: contract.accountabilityQuestion, keywords: [contract.lane, contract.source.label, '30 day review','90 day review','365 day review'], priority: 86 });
  writeEverywhere('search-index.json', `${JSON.stringify(filtered, null, 2)}\n`);
}

const report = {
  ok: true,
  generatedAt,
  contracts: contracts.length,
  scheduledCheckpoints: contracts.reduce((sum, contract) => sum + contract.checkpoints.length, 0),
  leadStage: contracts.filter(contract => contract.status === 'lead-stage-contract').length,
  outcomeVerdictsIssued: contracts.filter(contract => contract.outcomeVerdict !== 'not-scored').length,
  inputs: ['data/latest-public-drops.json'],
  outputs: ['data/public-consequence-contracts.json','public-consequence-contracts.html','public-consequence-contracts.css','downloads/public-consequence-contracts.csv']
};
writeEverywhere('downloads/public-consequence-contracts-report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`Public Consequence Contracts built: ${report.contracts} accountability twins and ${report.scheduledCheckpoints} dated outcome checks; no premature verdicts issued.`);
