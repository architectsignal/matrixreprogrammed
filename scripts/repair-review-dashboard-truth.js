const fs = require('fs');
const path = require('path');

const root = process.cwd();
const jsonPath = path.join(root, 'data', 'review-dashboard.json');
const htmlPath = path.join(root, 'review-dashboard.html');
const reportPath = path.join(root, 'downloads', 'review-dashboard-truth-repair.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const dashboard = readJson(jsonPath, null);
if (!dashboard || !Array.isArray(dashboard.deckHealth)) {
  throw new Error('Review dashboard data is missing or invalid');
}

let structurallyBroken = 0;
let evidenceDebtDecks = 0;
for (const deck of dashboard.deckHealth) {
  const structuralComplete = Number(deck.cardCount || 0) === 52
    && Number(deck.directDossiers || 0) === Number(deck.cardCount || 0)
    && Number(deck.artworkAssets || 0) === Number(deck.cardCount || 0);
  const evidenceReady = Number(deck.primarySourceNeeded || 0) === 0 && Number(deck.missingRecords || 0) === 0;
  deck.structuralComplete = structuralComplete;
  deck.evidenceReady = evidenceReady;
  deck.status = !structuralComplete ? 'broken' : evidenceReady ? 'ready' : 'needs-evidence';
  deck.ok = deck.status === 'ready';
  if (!structuralComplete) structurallyBroken += 1;
  if (structuralComplete && !evidenceReady) evidenceDebtDecks += 1;
}

const publicHighIssues = Number(dashboard.totals?.publicHighIssues || dashboard.audits?.publicAudit?.highIssues || 0);
const cardHighIssues = Number(dashboard.totals?.cardHighIssues || dashboard.audits?.cardAudit?.highIssues || 0);
const operational = structurallyBroken === 0;
const evidenceReady = operational && evidenceDebtDecks === 0 && publicHighIssues === 0 && cardHighIssues === 0;
dashboard.operational = operational;
dashboard.evidenceReady = evidenceReady;
dashboard.status = !operational ? 'broken' : evidenceReady ? 'ready' : 'operational-with-review-debt';
dashboard.ok = evidenceReady;
dashboard.truthBoundary = 'Operational means the routes and assets exist. Ready means the evidence debt and high-severity audit debt are also cleared.';
dashboard.updated = new Date().toISOString();
fs.writeFileSync(jsonPath, `${JSON.stringify(dashboard, null, 2)}\n`);

let html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
if (!html) throw new Error('Review dashboard HTML is missing');
html = html
  .replace(/<style id="public-internal-visibility">[\s\S]*?<\/style>/gi, '')
  .replace(/<style id="commercial-strategy-visibility">[\s\S]*?<\/style>/gi, '')
  .replace(/\s(?:internal-only|commercial-internal)(?=[\s"'])/g, '')
  .replace(/<section class="section commercial-internal">/gi, '<section class="section">');

for (const deck of dashboard.deckHealth) {
  const title = escapeRegExp(deck.title || deck.id || '');
  if (!title) continue;
  const articlePattern = new RegExp(`<article class="review-card (?:ok|warn)"><h3>${title}<\\/h3>`, 'i');
  const statusClass = deck.status === 'ready' ? 'ok' : 'warn';
  html = html.replace(articlePattern, `<article class="review-card ${statusClass}"><h3>${deck.title}</h3>`);
  const routePattern = new RegExp(`(<h3>${title}<\\/h3><p>Cards:[\\s\\S]*?<p class="mini">)([\\s\\S]*?)(<\\/p>)`, 'i');
  html = html.replace(routePattern, (_match, prefix, details, suffix) => `${prefix}${details} · Status: ${deck.status}${suffix}`);
}

const banner = `<!-- review-truth-banner:start --><section class="section"><article class="review-card ${dashboard.status === 'ready' ? 'ok' : 'warn'}"><span class="label">Command truth</span><h2>${dashboard.status === 'ready' ? 'READY' : dashboard.status === 'broken' ? 'BROKEN' : 'OPERATIONAL, NOT EVIDENCE-READY'}</h2><p>Routes and assets are ${operational ? 'structurally present' : 'not structurally complete'}. ${evidenceDebtDecks} deck(s) still carry evidence debt, with ${publicHighIssues} high public-copy issue(s) and ${cardHighIssues} high card-audit issue(s).</p><p class="mini">Operational means the machinery exists. Ready means the evidence and audit debt are cleared.</p><div class="cta-row"><a class="btn" href="admin-control-center.html">Open Command Center</a><a class="btn alt" href="data/review-dashboard.json">Open Live Data</a></div></article></section><!-- review-truth-banner:end -->`;
html = html.replace(/<!-- review-truth-banner:start -->[\s\S]*?<!-- review-truth-banner:end -->/gi, '');
html = html.replace(/(<p class="lead">[\s\S]*?<\/p>)/i, `$1${banner}`);
fs.writeFileSync(htmlPath, html);

const report = {
  ok: true,
  generatedAt: dashboard.updated,
  status: dashboard.status,
  operational,
  evidenceReady,
  structurallyBroken,
  evidenceDebtDecks,
  publicHighIssues,
  cardHighIssues
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Review dashboard truth repair complete: ${dashboard.status}; ${evidenceDebtDecks} evidence-debt deck(s), ${publicHighIssues + cardHighIssues} high audit issue(s).`);
