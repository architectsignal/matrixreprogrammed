'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'feature-maturity-report.json');
const manifestPath = path.join(root, 'data', 'feature-maturity.json');
const markerStart = '<!-- feature-maturity:start -->';
const markerEnd = '<!-- feature-maturity:end -->';
const styleId = 'feature-maturity-style';
const changed = [];
const issues = [];

function readJson(relative, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); }
  catch { return fallback; }
}
function slash(value) { return String(value || '').split(path.sep).join('/'); }
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const answerClock = readJson('data/public-answer-clocks.json', { count: 0, runningCount: 0, clocks: [] });
const receipts = readJson('data/lived-consequence-receipts.json', { count: 0, receipts: [] });
const halfLife = readJson('data/evidence-half-life.json', { count: 0, recallCount: 0, entries: [] });
const powerDiff = readJson('data/power-diff.json', {
  count: 0,
  materialDiffCount: 0,
  baselineAvailable: false,
  entries: []
});

const features = [
  {
    id: 'public-answer-clock',
    route: 'public-answer-clock.html',
    title: 'Public Answer Clock',
    stage: Number(answerClock.runningCount || 0) > 0
      ? 'active-verified-delivery'
      : 'pilot-awaiting-verified-delivery',
    recordCount: Number(answerClock.count || answerClock.clocks?.length || 0),
    verifiedOutputCount: Number(answerClock.runningCount || 0),
    statusHeading: Number(answerClock.runningCount || 0) > 0
      ? 'Verified clocks are running.'
      : 'Pilot ledger — no verified clock is running yet.',
    statusCopy: Number(answerClock.runningCount || 0) > 0
      ? 'At least one question has verified delivery evidence and an attributable start time.'
      : 'Question records exist, but none has verified delivery evidence. Every clock remains stopped, and silence is not treated as guilt, refusal or proof.',
    activationRule: 'A clock becomes verified only after a delivery event has a verifiable channel, target, timestamp and receipt or equivalent proof.',
    nextRoute: 'public-consequence-contracts.html',
    nextLabel: 'Open the accountability ledger'
  },
  {
    id: 'lived-consequence-receipts',
    route: 'lived-consequence-receipts.html',
    title: 'Lived Consequence Receipts',
    stage: Number(receipts.count || 0) > 0
      ? 'active-reviewed-receipts'
      : 'private-intake-no-reviewed-public-receipts',
    recordCount: Number(receipts.count || receipts.receipts?.length || 0),
    verifiedOutputCount: Number(receipts.count || 0),
    statusHeading: Number(receipts.count || 0) > 0
      ? 'Reviewed public receipts are available.'
      : 'Private intake is open — no receipt has cleared public review.',
    statusCopy: Number(receipts.count || 0) > 0
      ? 'Published receipts have passed redaction, explicit publish consent and named human review.'
      : 'No public receipt is being claimed. Submissions remain private unless lawfully obtained, redacted, explicitly approved for publication and reviewed by a named human.',
    activationRule: 'A receipt becomes verified public output only after redaction, lawful-source review, explicit publish consent and named human approval.',
    nextRoute: 'contact-the-machine.html?type=secure-pgp',
    nextLabel: 'Open secure source intake'
  },
  {
    id: 'evidence-half-life',
    route: 'evidence-half-life.html',
    title: 'Evidence Half-Life',
    stage: Number(halfLife.recallCount || 0) > 0
      ? 'active-recall-notices'
      : 'monitoring-no-active-recalls',
    recordCount: Number(halfLife.count || halfLife.entries?.length || 0),
    verifiedOutputCount: Number(halfLife.recallCount || 0),
    statusHeading: Number(halfLife.recallCount || 0) > 0
      ? 'Active evidence recall notices are published.'
      : 'Monitoring ledger — no evidence recall notice is active.',
    statusCopy: Number(halfLife.recallCount || 0) > 0
      ? 'At least one record has a visible recall notice requiring re-verification or correction.'
      : 'Review dates exist, but no record has crossed the threshold for an active recall notice. Evidence age is not evidence of falsity.',
    activationRule: 'A recall becomes verified output only when an attributable record has a visible reason, review requirement and correction route.',
    nextRoute: 'evidence-vault.html',
    nextLabel: 'Inspect current evidence'
  },
  {
    id: 'power-diff',
    route: 'power-diff.html',
    title: 'Power Diff',
    stage: powerDiff.baselineAvailable === true && Number(powerDiff.materialDiffCount || 0) > 0
      ? 'active-material-diffs'
      : 'baseline-building-no-material-diff',
    recordCount: Number(powerDiff.count || powerDiff.entries?.length || 0),
    verifiedOutputCount: Number(powerDiff.materialDiffCount || 0),
    statusHeading: powerDiff.baselineAvailable === true && Number(powerDiff.materialDiffCount || 0) > 0
      ? 'Material changes are available.'
      : 'Baseline-building stage — no historical material change is claimed.',
    statusCopy: powerDiff.baselineAvailable === true && Number(powerDiff.materialDiffCount || 0) > 0
      ? 'At least one normalized record has a genuine prior snapshot and a reviewable material difference.'
      : 'Current fingerprints have been established, but there is no genuine earlier snapshot for a defensible historical comparison. A baseline is not a change.',
    activationRule: 'A change becomes verified output only after a genuine earlier snapshot exists and a source-linked difference survives materiality and evidence-boundary review.',
    nextRoute: 'live-intel.html',
    nextLabel: 'See current verified changes'
  }
].map(feature => ({
  ...feature,
  publicationVisibility: 'public',
  labelRequired: true,
  verifiedOutputAvailable: feature.verifiedOutputCount > 0,
  primaryRecommendationEligible: feature.verifiedOutputCount > 0
}));

function maturityStyle() {
  return `<style id="${styleId}">
.feature-maturity{position:relative;margin:1rem auto;padding:1rem 1.1rem;border:1px solid rgba(235,190,92,.36);border-radius:18px;background:linear-gradient(135deg,rgba(57,35,5,.8),rgba(3,3,3,.96));box-shadow:0 16px 42px rgba(0,0,0,.3)}
.feature-maturity[data-verified-output="false"]{border-color:rgba(255,168,75,.48)}
.feature-maturity-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap}.feature-maturity-kicker{display:block;color:#f0c36a;font-size:.7rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.feature-maturity h2{margin:.28rem 0 .45rem;font-size:clamp(1.25rem,3vw,2rem);color:#fff}.feature-maturity p{margin:.35rem 0;color:#d7cdbb;line-height:1.55}.feature-maturity-metrics{display:flex;gap:.45rem;flex-wrap:wrap}.feature-maturity-metrics span{border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:.35rem .55rem;color:#e6dcc8;font-size:.72rem}.feature-maturity-rule{margin-top:.65rem;padding:.7rem;border-left:3px solid #d49b34;background:rgba(255,255,255,.035)}.feature-maturity a{display:inline-flex;margin-top:.55rem;color:#f1ca78;font-weight:800}
</style>`;
}

function maturityBlock(feature) {
  const label = feature.verifiedOutputAvailable
    ? 'VERIFIED OUTPUT AVAILABLE'
    : 'PILOT · NO VERIFIED OUTPUT YET';
  return `${markerStart}<section class="feature-maturity wrap" data-feature-maturity="${escapeHtml(feature.stage)}" data-feature-id="${escapeHtml(feature.id)}" data-publication-visibility="public" data-verified-output="${feature.verifiedOutputAvailable}"><div class="feature-maturity-head"><div><span class="feature-maturity-kicker">Feature maturity · PUBLIC · ${label}</span><h2>${escapeHtml(feature.statusHeading)}</h2></div><div class="feature-maturity-metrics"><span>${feature.recordCount} ledger record${feature.recordCount === 1 ? '' : 's'}</span><span>${feature.verifiedOutputCount} verified public output${feature.verifiedOutputCount === 1 ? '' : 's'}</span></div></div><p>${escapeHtml(feature.statusCopy)}</p><p class="feature-maturity-rule"><strong>Verification rule:</strong> ${escapeHtml(feature.activationRule)}</p><a href="${escapeHtml(feature.nextRoute)}">${escapeHtml(feature.nextLabel)}</a></section>${markerEnd}`;
}

function ensureStyle(html) {
  if (html.includes(`id="${styleId}"`)) return html;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${maturityStyle()}</head>`);
  return `${maturityStyle()}${html}`;
}

function patchFeaturePage(file, feature) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  let html = fs.readFileSync(file, 'utf8');
  if (!/<!doctype\s+html|<html\b/i.test(html)) return false;
  const before = html;
  html = ensureStyle(html);
  const expression = new RegExp(`${escapeRegExp(markerStart)}[\\s\\S]*?${escapeRegExp(markerEnd)}`, 'gi');
  html = html.replace(expression, '');
  html = html.replace(/<body\b([^>]*)>/i, (match, attributes) => {
    const attrs = attributes
      .replace(/\sdata-feature-maturity=["'][^"']*["']/gi, '')
      .replace(/\sdata-feature-publication=["'][^"']*["']/gi, '');
    return `<body${attrs} data-feature-maturity="${feature.stage}" data-feature-publication="public">`;
  });
  const block = maturityBlock(feature);
  if (/<main\b[^>]*>/i.test(html)) html = html.replace(/<main\b[^>]*>/i, match => `${match}${block}`);
  else if (/<body\b[^>]*>/i.test(html)) html = html.replace(/<body\b[^>]*>/i, match => `${match}${block}`);
  else issues.push(`${slash(path.relative(root, file))}: no safe insertion boundary`);
  if (html !== before) {
    fs.writeFileSync(file, html);
    changed.push(slash(path.relative(root, file)));
  }
  return true;
}

const roots = [root, site]
  .filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
for (const feature of features) {
  let surfaces = 0;
  for (const base of roots) {
    const html = path.join(base, feature.route);
    if (patchFeaturePage(html, feature)) surfaces += 1;
    if (base === site) {
      const alias = path.join(base, feature.route.replace(/\.html$/i, ''));
      if (patchFeaturePage(alias, feature)) surfaces += 1;
    }
  }
  feature.patchedSurfaces = surfaces;
  if (surfaces === 0) issues.push(`${feature.route}: no public surface found`);
}

const manifest = {
  ok: issues.length === 0,
  generatedAt: new Date().toISOString(),
  publicationRule: 'publish-and-label-all-feature-states',
  withholdingAllowed: false,
  withheldRoutes: [],
  publicRoutes: features.map(feature => feature.route),
  policy: 'Every feature route remains public. Systems without verified output carry a prominent pilot or baseline-building label; no clock, receipt, recall, baseline or material change is invented.',
  features
};
writeJson(manifestPath, manifest);
writeJson(reportPath, { ...manifest, changed, issues });
if (fs.existsSync(site)) writeJson(path.join(site, 'data', 'feature-maturity.json'), manifest);

if (issues.length) {
  console.error('FEATURE MATURITY FINALIZATION FAILED');
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}
console.log(`Feature maturity finalized: ${features.length} public systems labelled; ${features.filter(feature => !feature.verifiedOutputAvailable).length} pilot/baseline labels; zero routes withheld.`);
module.exports = manifest;
