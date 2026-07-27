'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const at = value => path.join(root, value);
const exists = value => fs.existsSync(at(value));
const read = value => fs.readFileSync(at(value), 'utf8');
const readJson = (value, fallback = {}) => { try { return JSON.parse(read(value)); } catch { return fallback; } };
const write = (value, content) => { fs.mkdirSync(path.dirname(at(value)), { recursive: true }); fs.writeFileSync(at(value), content); };
const clean = (value, max = 1800) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const array = value => Array.isArray(value) ? value : [];
const validRoute = value => {
  const route = clean(value, 900);
  if (!route || /^data\//i.test(route)) return '';
  return /^https?:\/\//i.test(route) || /^[a-z0-9][a-z0-9._/-]*\.html(?:[?#].*)?$/i.test(route) ? route : '';
};
const ext = route => /^https?:\/\//i.test(route) ? ' target="_blank" rel="noopener noreferrer"' : '';

const { watch, dossiers } = require('./stabilize-daily-watch-and-build-dossiers.js');
require('./build-daily-watch-history.js');
const ledger = readJson('data/investigation-ledger.json', { findings: [] });
const graph = readJson('data/evidence-weighted-relationship-graph.json', { edges: [] });
const wall = readJson('data/clock-wall.json', { clocks: [] });
const markerStart = '<!-- daily-mission-watch:start -->';
const markerEnd = '<!-- daily-mission-watch:end -->';
const labels = { person:'PERSON TO WATCH', institution:'INSTITUTION TO WATCH', family:'FAMILY TO WATCH' };
const numbers = { person:'01', institution:'02', family:'03' };

function sourceList(routes, max = 12) {
  const links = array(routes).map(validRoute).filter(Boolean).slice(0, max);
  if (!links.length) return '<p class="hit-empty">No direct public route is attached yet. The missing source remains visible.</p>';
  return `<ol class="hit-sources">${links.map(route => `<li><a href="${esc(route)}"${ext(route)}>${esc(route)}</a></li>`).join('')}</ol>`;
}

function recordStack(records, empty) {
  if (!array(records).length) return `<p class="hit-empty">${esc(empty)}</p>`;
  return `<div class="hit-records">${records.map(record => `<article class="hit-record"><div class="hit-record-meta"><span>${esc(record.legalCategory || record.status || 'source record')}</span><span>${esc(record.date || 'date unresolved')}</span></div><h6>${esc(record.title)}</h6><p>${esc(record.whyItMatters)}</p><p class="hit-boundary"><strong>Boundary:</strong> ${esc(record.whatItDoesNotProve)}</p>${sourceList(record.sourceRoutes, 4)}</article>`).join('')}</div>`;
}

function connectionStack(records) {
  if (!array(records).length) return '<p class="hit-empty">No source-linked relationship edge is attached yet.</p>';
  return `<div class="hit-connections">${records.map(record => `<article class="hit-connection"><span>${esc(record.relationshipType || 'documented relationship')}</span><h6>${esc(record.entity)}</h6><p><strong>Evidence:</strong> ${esc(record.evidenceGrade || 'ungraded')}</p><p>${esc(record.boundary || 'This connection does not establish guilt or control.')}</p>${record.route ? `<a href="${esc(record.route)}">Open connected entity</a>` : ''}</article>`).join('')}</div>`;
}

function dossier(slot, data) {
  const assessment = data.executiveAssessment || {};
  const totals = data.totals || {};
  const questions = array(data.openQuestions).slice(0, 16).map(question => `<li>${esc(question)}</li>`).join('');
  return `<div class="hit-dossier" id="${esc(slot)}-dossier">
    <div class="hit-dossier-head"><div><span>COMPLETE INTELLIGENCE DOSSIER</span><h4>${esc(data.name)}</h4></div><div class="hit-rank"><strong>${esc(data.ranking?.score ?? '—')}</strong><small>evidence rank</small></div></div>
    <div class="hit-metrics"><span>${Number(totals.matchedFindings || 0)} findings</span><span>${Number(totals.legalRecords || 0)} legal</span><span>${Number(totals.safeguardingOverlaps || 0)} safeguarding</span><span>${Number(totals.moneyRecords || 0)} money</span><span>${Number(totals.authorityRecords || 0)} authority</span><span>${Number(totals.connections || 0)} connections</span></div>
    <section class="hit-assessment"><h5>Executive assessment</h5><p><strong>What the evidence says:</strong> ${esc(assessment.whatWasFound)}</p><p><strong>Why this matters:</strong> ${esc(assessment.whyItMatters)}</p><p><strong>How it fits the mission:</strong> ${esc(assessment.howItFits)}</p><p><strong>What it points toward:</strong> ${esc(assessment.whatItPointsToward)}</p><p><strong>Alternative explanation:</strong> ${esc(assessment.alternativeExplanation)}</p><p class="hit-boundary"><strong>What it does not prove:</strong> ${esc(assessment.whatItDoesNotProve)}</p></section>
    <div class="hit-dossier-grid">
      <details open><summary>Legal status, convictions, charges and official action <b>${Number(totals.legalRecords || 0)}</b></summary>${recordStack(data.legalAndWrongdoingRecord,'No conviction, charge, judgment, sanction or formal investigation matched this entity in the active ledger. This is not proof that none exists.')}</details>
      <details><summary>Epstein and child-safeguarding overlaps <b>${Number(totals.safeguardingOverlaps || 0)}</b></summary><p class="hit-safeguard">${esc(data.safeguardingBoundary)}</p>${recordStack(data.epsteinAndChildSafeguardingOverlaps,'No source-linked Epstein or child-safeguarding overlap matched this entity in the active evidence set.')}</details>
      <details><summary>Money, ownership, contracts and funding <b>${Number(totals.moneyRecords || 0)}</b></summary>${recordStack(data.moneyOwnershipAndContracts,'No matching financial, ownership, contract or funding record was found in the active ledger.')}</details>
      <details><summary>Authority, access and institutional power <b>${Number(totals.authorityRecords || 0)}</b></summary>${recordStack(data.authorityAccessAndInstitutions,'No matching authority, appointment, policy, trustee or gatekeeping record was found in the active ledger.')}</details>
      <details><summary>Documented network connections <b>${Number(totals.connections || 0)}</b></summary>${connectionStack(data.documentedConnections)}</details>
      <details><summary>Timeline of developments <b>${array(data.timeline).length}</b></summary>${recordStack(data.timeline,'No dated timeline record matched this entity.')}</details>
      <details><summary>Contradictions, appeals and counter-evidence <b>${Number(totals.contradictionRecords || 0)}</b></summary>${recordStack(data.contradictionsAndCounterEvidence,'No explicit contradiction, appeal, denial, dismissal, acquittal or correction matched this entity. Counter-evidence must still be actively sought.')}</details>
      <details><summary>What must be investigated next <b>${array(data.openQuestions).length}</b></summary><ul class="hit-questions">${questions}</ul></details>
      <details><summary>Source routes <b>${array(data.sourceRoutes).length}</b></summary>${sourceList(data.sourceRoutes, 30)}</details>
    </div>
    <p class="hit-boundary"><strong>Dossier boundary:</strong> ${esc(data.dossierBoundary)}</p>
    <div class="hit-actions"><a class="hit-btn primary" href="search.html?q=${encodeURIComponent(data.name)}">Search full site</a><a class="hit-btn" href="contact-the-machine.html">Drop evidence</a><a class="hit-btn" href="subscriber-dashboard.html">Follow investigation</a></div>
  </div>`;
}

function card(slot, item, data) {
  const lanes = array(item.investigativeLanes).slice(0,4).map(lane => `<span>${esc(lane)}</span>`).join('');
  return `<article class="daily-hit-card ${esc(slot)}" aria-labelledby="hit-${esc(slot)}-title">
    <div class="hit-scan" aria-hidden="true"></div>
    <div class="hit-card-top"><span class="hit-number">${numbers[slot]}</span><span class="hit-label">${labels[slot]}</span><span class="hit-live">ACTIVE</span></div>
    <div class="hit-card-rank"><span>${esc(clean(item.rankingStatus || 'current evidence leader',180).replace(/-/g,' '))}</span><strong>${esc(item.rankingScore ?? '—')}</strong><small>evidence rank</small></div>
    <h3 id="hit-${esc(slot)}-title">${esc(item.name)}</h3>
    <p class="hit-signal"><strong>TODAY'S SIGNAL</strong>${esc(clean(item.whatWasFound || item.selectionBasis, 600))}</p>
    <p><strong>WHY IT MATTERS</strong>${esc(clean(item.whyItMatters, 720))}</p>
    <div class="hit-points"><strong>WHAT IT POINTS TOWARD</strong><p>${esc(clean(item.whatItPointsToward, 720))}</p></div>
    <div class="hit-lanes">${lanes}</div>
    <div class="hit-status"><span>${esc(item.effectOnLane)}</span><span>${esc(item.evidenceStrength)}</span><span>${esc(item.confidence)}</span></div>
    ${item.retentionReason ? `<p class="hit-retained"><strong>Position held:</strong> ${esc(item.retentionReason)}</p>` : ''}
    <details class="hit-dropdown"><summary><span>OPEN COMPLETE DOSSIER</span><small>Legal status · overlaps · money · power · timeline · sources</small></summary>${dossier(slot,data)}</details>
  </article>`;
}

const styles = `<style id="cinematic-daily-hit-list-style">
#daily-intelligence-hit-list{position:relative;z-index:21;width:min(1320px,calc(100% - 1rem));margin:.65rem auto 1.2rem;padding:clamp(.9rem,2.4vw,1.7rem);overflow:hidden;border:1px solid rgba(221,45,45,.58);border-radius:28px;background:radial-gradient(circle at 50% -20%,rgba(174,0,0,.3),transparent 40%),linear-gradient(180deg,rgba(8,0,0,.995),rgba(0,0,0,.995));box-shadow:0 0 72px rgba(155,0,0,.22),inset 0 0 80px rgba(255,194,90,.035)}
#daily-intelligence-hit-list:before{content:'';position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(90deg,transparent 0 79px,rgba(255,255,255,.022) 80px),repeating-linear-gradient(0deg,transparent 0 79px,rgba(255,255,255,.018) 80px)}
.hit-list-head{position:relative;display:grid;grid-template-columns:minmax(0,1fr) minmax(230px,320px);gap:1rem;align-items:end;margin-bottom:1rem}.hit-kicker{display:flex;align-items:center;gap:.5rem;color:#ff7878;font-size:.7rem;font-weight:950;letter-spacing:.17em}.hit-kicker:before{content:'';width:.62rem;height:.62rem;border-radius:50%;background:#ff2929;box-shadow:0 0 16px #ff2929;animation:hitPulse 1.7s ease-in-out infinite}.hit-list-head h2{margin:.42rem 0 .3rem;color:#fff;font-size:clamp(2rem,5.4vw,5rem);line-height:.88;letter-spacing:-.045em}.hit-list-head p{max-width:900px;margin:0;color:#d9cdb6;line-height:1.55}.hit-rule{border:1px solid rgba(239,189,80,.34);border-radius:14px;padding:.75rem;background:rgba(239,189,80,.055);color:#e5d2a0;font-size:.78rem;line-height:1.45}.daily-hit-grid{position:relative;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.85rem}.daily-hit-card{position:relative;overflow:hidden;display:flex;flex-direction:column;min-height:640px;border:1px solid rgba(255,255,255,.14);border-radius:22px;padding:1rem;background:linear-gradient(155deg,rgba(42,5,5,.97),rgba(2,2,2,.99) 58%);box-shadow:0 18px 45px rgba(0,0,0,.5);transition:.25s ease}.daily-hit-card.institution{background:linear-gradient(155deg,rgba(6,18,43,.97),rgba(2,2,2,.99) 58%)}.daily-hit-card.family{background:linear-gradient(155deg,rgba(44,25,4,.97),rgba(2,2,2,.99) 58%)}.daily-hit-card:hover{transform:translateY(-4px);border-color:rgba(255,209,105,.52);box-shadow:0 24px 60px rgba(155,0,0,.22)}.hit-scan{position:absolute;inset:0;height:22%;pointer-events:none;background:linear-gradient(180deg,transparent,rgba(255,255,255,.045),transparent);animation:hitScan 6.5s linear infinite}.hit-card-top{position:relative;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:.5rem}.hit-number{font-size:2.2rem;font-weight:950;color:rgba(255,255,255,.14)}.hit-label{font-size:.7rem;font-weight:950;letter-spacing:.11em;color:#ffd4d4}.hit-live{border:1px solid rgba(255,83,83,.6);border-radius:999px;padding:.27rem .45rem;color:#ffabab;font-size:.61rem;font-weight:950}.hit-card-rank{position:relative;display:flex;align-items:baseline;gap:.4rem;margin:.5rem 0}.hit-card-rank span{margin-right:auto;color:#a99c84;font-size:.66rem;text-transform:uppercase}.hit-card-rank strong{font-size:2rem;color:#f4d487}.hit-card-rank small{color:#aa9b7e;font-size:.62rem}.daily-hit-card h3{position:relative;margin:.2rem 0 .8rem;color:#fff;font-size:clamp(1.55rem,3vw,2.65rem);line-height:1}.daily-hit-card p{position:relative;color:#d7d0c4;line-height:1.48;font-size:.89rem}.daily-hit-card p>strong,.hit-points>strong{display:block;margin-bottom:.25rem;color:#ffb0b0;font-size:.64rem;letter-spacing:.1em}.hit-signal{border-left:3px solid #d83b3b;padding:.7rem .75rem;background:rgba(255,255,255,.035)}.hit-points{position:relative;margin:.4rem 0;padding:.7rem;border:1px solid rgba(239,189,80,.25);border-radius:12px;background:rgba(239,189,80,.045)}.hit-points>strong{color:#f0cc75}.hit-points p{margin:0}.hit-lanes,.hit-status{position:relative;display:flex;gap:.35rem;flex-wrap:wrap;margin:.45rem 0}.hit-lanes span,.hit-status span{border:1px solid rgba(255,255,255,.13);border-radius:999px;padding:.28rem .45rem;color:#d6cdbf;font-size:.62rem}.hit-status span:first-child{border-color:rgba(255,83,83,.35);color:#ffb0b0}.hit-retained{font-size:.73rem!important;color:#c5b996!important}.hit-dropdown{position:relative;margin-top:auto;border:1px solid rgba(255,208,95,.36);border-radius:15px;background:rgba(0,0,0,.48)}.hit-dropdown>summary{list-style:none;cursor:pointer;padding:.85rem}.hit-dropdown>summary::-webkit-details-marker{display:none}.hit-dropdown>summary span{display:block;color:#ffe4a3;font-size:.78rem;font-weight:950;letter-spacing:.08em}.hit-dropdown>summary small{display:block;margin-top:.23rem;color:#a99e8a;font-size:.65rem}.hit-dropdown[open]>summary{border-bottom:1px solid rgba(255,208,95,.2)}.hit-dossier{padding:.8rem}.hit-dossier-head{display:flex;justify-content:space-between;align-items:center;gap:1rem}.hit-dossier-head span{color:#ff7a7a;font-size:.63rem;font-weight:950;letter-spacing:.12em}.hit-dossier-head h4{margin:.2rem 0;color:#fff;font-size:clamp(1.45rem,3vw,2.55rem)}.hit-rank{text-align:right}.hit-rank strong{display:block;color:#f3d27d;font-size:2.1rem}.hit-rank small{color:#a99c84}.hit-metrics{display:flex;gap:.35rem;flex-wrap:wrap;margin:.6rem 0}.hit-metrics span{border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:.3rem .47rem;color:#cfc5b4;font-size:.63rem}.hit-assessment{border:1px solid rgba(255,255,255,.11);border-radius:15px;padding:.8rem;background:rgba(255,255,255,.025)}.hit-assessment h5,.hit-dossier-grid summary{color:#f2d891;font-weight:900}.hit-dossier-grid{display:grid;grid-template-columns:1fr 1fr;gap:.55rem;margin-top:.55rem}.hit-dossier-grid>details{border:1px solid rgba(255,255,255,.1);border-radius:13px;background:rgba(0,0,0,.36);padding:.7rem}.hit-dossier-grid summary{cursor:pointer;display:flex;justify-content:space-between;gap:.5rem}.hit-dossier-grid summary b{color:#ff8c8c}.hit-records,.hit-connections{display:grid;gap:.5rem;margin-top:.6rem}.hit-record,.hit-connection{border-left:3px solid rgba(229,185,78,.55);padding:.6rem;background:rgba(255,255,255,.025)}.hit-record h6,.hit-connection h6{margin:.3rem 0;color:#fff}.hit-record-meta{display:flex;justify-content:space-between;gap:.5rem;color:#c6b78f;font-size:.62rem;text-transform:uppercase}.hit-boundary,.hit-safeguard{color:#cbbd9c!important;font-size:.72rem!important}.hit-sources{padding-left:1.15rem}.hit-sources a{color:#e9c76d;word-break:break-all}.hit-questions{padding-left:1.15rem;color:#d8d0c2}.hit-empty{color:#a99e8b!important;font-style:italic}.hit-actions{display:flex;gap:.45rem;flex-wrap:wrap;margin-top:.7rem}.hit-btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border:1px solid rgba(239,189,80,.45);border-radius:10px;padding:.58rem .72rem;color:#f5ddb0;text-decoration:none;font-weight:850}.hit-btn.primary{border-color:rgba(255,67,67,.7);background:linear-gradient(135deg,#8d1111,#420505);color:#fff}.hit-support{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:1rem;align-items:center;margin-top:1rem;border:1px solid rgba(239,189,80,.35);border-radius:18px;padding:1rem;background:linear-gradient(120deg,rgba(102,9,9,.48),rgba(0,0,0,.7))}.hit-support strong{display:block;color:#fff;font-size:1.13rem}.hit-support span{display:block;margin-top:.25rem;color:#cfc4b1;line-height:1.45}.hit-support-actions{display:flex;gap:.45rem;flex-wrap:wrap;justify-content:flex-end}@keyframes hitPulse{50%{opacity:.35;transform:scale(.76)}}@keyframes hitScan{from{transform:translateY(-140%)}to{transform:translateY(620%)}}@media(max-width:1000px){.daily-hit-grid,.hit-list-head,.hit-support{grid-template-columns:1fr}.daily-hit-card{min-height:0}.hit-rule{max-width:none}.hit-support-actions{justify-content:flex-start}.hit-dossier-grid{grid-template-columns:1fr}}@media(max-width:560px){#daily-intelligence-hit-list{width:calc(100% - .4rem);padding:.65rem;border-radius:18px}.daily-hit-card{padding:.78rem}.hit-support-actions,.hit-actions{display:grid;grid-template-columns:1fr}.hit-btn{width:100%}}@media(prefers-reduced-motion:reduce){.hit-kicker:before,.hit-scan{animation:none}.daily-hit-card:hover{transform:none}}
</style>`;

const cards = ['person','institution','family'].map(slot => card(slot,watch[slot],dossiers[slot])).join('');
const block = `${markerStart}${styles}<section id="daily-intelligence-hit-list" aria-labelledby="daily-hit-list-title"><div class="hit-list-head"><div><div class="hit-kicker">LIVE EVIDENCE PRIORITY SYSTEM · ${esc(watch.date)}</div><h2 id="daily-hit-list-title">THE DAILY INTELLIGENCE HIT LIST.</h2><p>One person. One institution. One family. These positions do not rotate for attention. They change only when new source-linked evidence lifts a challenger clearly above the current leader.</p></div><div class="hit-rule"><strong>Promotion rule</strong><br>${esc(watch.rankingPolicy?.rule || 'Only materially stronger evidence changes a card.')}</div></div><div class="daily-hit-grid">${cards}</div><div class="hit-support"><div><strong>THIS IS WHAT YOUR SUPPORT BUILDS.</strong><span>${array(ledger.findings).length.toLocaleString()} active evidence findings, ${array(graph.edges).length.toLocaleString()} documented graph connections and ${array(wall.clocks).length.toLocaleString()} live clocks—connected into dossiers showing the evidence, mechanism, counterpoint and missing proof.</span></div><div class="hit-support-actions"><a class="hit-btn primary" href="https://gofund.me/0a3c74fc9" target="_blank" rel="noopener noreferrer">Support the Machine</a><a class="hit-btn" href="membership.html">Join the Site</a><a class="hit-btn" href="contact-the-machine.html">Drop Evidence</a><a class="hit-btn" href="weekly-watch-delta.html">Watch Rankings</a></div></div><p class="hit-boundary"><strong>Evidence boundary:</strong> ${esc(watch.boundary)} “Hit List” means research priority, not guilt, accusation or a call for action against any person or institution.</p></section>${markerEnd}`;

function inject(relative, homepage = false) {
  if (!exists(relative)) return false;
  let html = read(relative).replace(/<!-- daily-mission-watch:start -->[\s\S]*?<!-- daily-mission-watch:end -->/g,'');
  if (homepage && /<\/header>/i.test(html)) html = html.replace(/<\/header>/i, `</header>${block}`);
  else if (/<main[^>]*>/i.test(html)) {
    const main = html.match(/<main[^>]*>/i)[0];
    html = html.replace(main, `${main}${block}`);
  } else if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `${block}</body>`);
  else html += block;
  write(relative,html);
  return true;
}

const pages = [];
if (inject('index.html',true)) pages.push('index.html');
for (const page of ['daily-command-brief.html','daily-brain-brief.html','live-intel.html']) if (inject(page,false)) pages.push(page);
const fullPage = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Daily Intelligence Hit List | Matrix Reprogrammed</title><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="reader-experience.css">${styles}</head><body><div class="page"><header class="wrap topbar"><a class="brand" href="index.html">MATRIX REPROGRAMMED</a><nav class="nav"><a href="weekly-watch-delta.html">Ranking History</a><a href="daily-command-brief.html">Daily Brief</a><a href="live-intel.html">Live Intel</a><a href="membership.html">Support</a></nav></header>${block.replace(markerStart,'').replace(markerEnd,'')}</div></body></html>`;
write('daily-watch.html',fullPage);

for (const relative of ['data/homepage-command-surface.json','data/daily-command-brief.json','data/daily-brain-brief.json','data/live-intel.json']) {
  if (!exists(relative)) continue;
  const value = readJson(relative, {});
  value.dailyWatch = { updated:watch.updated,date:watch.date,route:'daily-watch.html',person:watch.person,institution:watch.institution,family:watch.family,boundary:watch.boundary,rankingPolicy:watch.rankingPolicy,dossierRoute:'data/daily-watch-dossiers.json' };
  write(relative,JSON.stringify(value,null,2));
}

const report = { ok:pages.length >= 3,generatedAt:new Date().toISOString(),watchDate:watch.date,pages,dedicatedPage:'daily-watch.html',firstPostIntroHomepageSurface:pages.includes('index.html'),rankingPolicy:watch.rankingPolicy,dossierTotals:{person:dossiers.person.totals,institution:dossiers.institution.totals,family:dossiers.family.totals},supportActions:['GoFundMe','Membership','Signal Drop','Ranking History'] };
write('downloads/daily-watch-publication-report.json',JSON.stringify(report,null,2));
if (!report.ok) throw new Error(`Daily hit list reached only ${pages.length} public pages.`);
console.log(`Cinematic daily hit list published first after the intro across ${pages.length} public pages with expandable dossiers.`);
