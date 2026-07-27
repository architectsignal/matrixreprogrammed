'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const at = value => path.join(root, value);
const readJson = (value, fallback = {}) => { try { return JSON.parse(fs.readFileSync(at(value), 'utf8')); } catch { return fallback; } };
const read = value => fs.existsSync(at(value)) ? fs.readFileSync(at(value), 'utf8') : '';
const clean = value => String(value ?? '').trim();
const array = value => Array.isArray(value) ? value : [];
const slots = ['person','institution','family'];
const before = readJson('data/daily-watch.json', {});
const beforeIncumbents = readJson('data/daily-watch-incumbents.json', {});

if (!before.ok || !before.rankingPolicy) throw new Error('Run the cinematic Daily Hit List build before the stability test.');
execFileSync(process.execPath, [at('scripts/build-daily-watch.js')], { cwd:root, stdio:'inherit', env:process.env });
execFileSync(process.execPath, [at('scripts/inject-daily-watch-surfaces.js')], { cwd:root, stdio:'inherit', env:process.env });

const after = readJson('data/daily-watch.json', {});
const afterIncumbents = readJson('data/daily-watch-incumbents.json', {});
const dossiers = readJson('data/daily-watch-dossiers.json', {});
const publication = readJson('downloads/daily-watch-publication-report.json', {});
const index = read('index.html');
const requiredDossierArrays = ['legalAndWrongdoingRecord','epsteinAndChildSafeguardingOverlaps','moneyOwnershipAndContracts','authorityAccessAndInstitutions','documentedConnections','timeline','contradictionsAndCounterEvidence','openQuestions','sourceRoutes'];
const checks = [];
const add = (id, ok, detail) => checks.push({ id, ok:Boolean(ok), detail });

for (const slot of slots) {
  add(`stable-${slot}`, clean(before[slot]?.name) === clean(after[slot]?.name), `${slot}: before=${before[slot]?.name || 'missing'}; after=${after[slot]?.name || 'missing'}`);
  add(`incumbent-${slot}`, clean(afterIncumbents.slots?.[slot]?.item?.name) === clean(after[slot]?.name) && Number(afterIncumbents.slots?.[slot]?.rankingScore) > 0, `${slot}: incumbent=${afterIncumbents.slots?.[slot]?.item?.name || 'missing'}; score=${afterIncumbents.slots?.[slot]?.rankingScore || 0}`);
  add(`dossier-${slot}`, dossiers[slot]?.name === after[slot]?.name && requiredDossierArrays.every(field => Array.isArray(dossiers[slot]?.[field])) && clean(dossiers[slot]?.dossierBoundary), `${slot}: dossier=${dossiers[slot]?.name || 'missing'}`);
}
add('positive-promotion-margin', Number(after.rankingPolicy?.promotionMargin) > 0, `margin=${after.rankingPolicy?.promotionMargin || 0}`);
add('stable-policy-mode', after.rankingPolicy?.mode === 'stable-incumbent-evidence-promotion', `mode=${after.rankingPolicy?.mode || 'missing'}`);
add('homepage-first-hook', publication.firstPostIntroHomepageSurface === true && index.indexOf('<!-- daily-mission-watch:start -->') > index.search(/<\/header>/i) && (index.indexOf('<!-- construction-banner:start -->') < 0 || index.indexOf('<!-- daily-mission-watch:start -->') < index.indexOf('<!-- construction-banner:start -->')), `firstPostIntro=${publication.firstPostIntroHomepageSurface}`);
add('three-expandable-dossiers', (index.match(/OPEN COMPLETE DOSSIER/g) || []).length === 3, `count=${(index.match(/OPEN COMPLETE DOSSIER/g) || []).length}`);
add('support-conversion', /Support the Machine/.test(index) && /membership\.html/.test(index) && /contact-the-machine\.html/.test(index), 'support, membership and Signal Drop actions checked');
add('history-survives-repeat', array(readJson('data/daily-watch-history.json', {}).entries).length > 0, `history=${array(readJson('data/daily-watch-history.json', {}).entries).length}`);

const failures = checks.filter(check => !check.ok);
const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  rule: 'With no new source collection between builds, the three incumbents must not change.',
  promotionMargin: after.rankingPolicy?.promotionMargin,
  before: Object.fromEntries(slots.map(slot => [slot,{name:before[slot]?.name,score:before[slot]?.rankingScore,incumbentSince:before[slot]?.incumbentSince || beforeIncumbents.slots?.[slot]?.incumbentSince}])),
  after: Object.fromEntries(slots.map(slot => [slot,{name:after[slot]?.name,score:after[slot]?.rankingScore,incumbentSince:after[slot]?.incumbentSince || afterIncumbents.slots?.[slot]?.incumbentSince}])),
  checks,
  failures
};
fs.mkdirSync(at('downloads'), { recursive:true });
fs.writeFileSync(at('downloads/daily-hit-list-stability-test.json'), JSON.stringify(report,null,2));
fs.writeFileSync(at('downloads/daily-hit-list-stability-test.md'), ['# Daily Hit List Stability Test','',`Generated: ${report.generatedAt}`,`Result: ${report.ok ? 'PASS' : 'FAIL'}`,`Promotion margin: ${report.promotionMargin}`,'',...checks.map(check => `- **${check.ok ? 'PASS' : 'FAIL'} · ${check.id}:** ${check.detail}`)].join('\n'));
if (failures.length) {
  console.error(`DAILY HIT LIST STABILITY TEST FAILED: ${failures.length} issue(s).`);
  for (const failure of failures) console.error(`- ${failure.id}: ${failure.detail}`);
  process.exit(1);
}
console.log(`Daily Hit List stability passed: ${slots.map(slot => `${slot}=${after[slot].name}`).join('; ')}.`);
