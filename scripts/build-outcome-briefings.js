const fs = require('fs');
const path = require('path');
const root = process.cwd();
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });
const updated = new Date().toISOString();
function readJson(file, fallback = {}) {
  try {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) return fallback;
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch { return fallback; }
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function list(items) { return `<ul>${(items || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`; }
const feeds = {
  matrixBrain: readJson('data/site-brain-ui.json'),
  policy: readJson('data/agenda-2030-policy-watch.json'),
  gold: readJson('data/gold-reserves-worldwide.json'),
  snapshot: readJson('data/probability-snapshot.json'),
  signal4: readJson('data/probability-signal-feed-004.json'),
  intake: readJson('data/policy-record-intake-001.json'),
  disclosure: readJson('data/epstein-transparency-trigger-2026-07-03.json'),
  findings: readJson('data/deep-findings-batch-001.json')
};
const worldGold = feeds.gold?.sourceBasis?.worldTotalTonnes;
const topGold = feeds.gold?.sourceBasis?.top50CountryTonnes;
const signalCount = Array.isArray(feeds.signal4.signals) ? feeds.signal4.signals.length : 0;
const scenarioCount = feeds.snapshot?.summary?.scenarioCount || 0;
const briefings = [
  {
    id: 'OB-001', section: 'Disclosure Watch', confidence: 'medium',
    headline: 'The key outcome is the disclosure logic, not just another file drop.',
    situation: 'When records are released in partial or redacted form, the important question becomes how the withholding categories work. A serious public archive should not just count pages; it should classify what was withheld, why it was withheld, who benefits from the category, and whether the same rule is applied consistently across different records.',
    meaning: 'The site should treat each release as a record-control event: index, redaction category, changed file count, duplicate handling, legal explanation, appeal posture and missing record list. This turns public outrage into a usable pressure map.',
    likely: 'More staged releases, more argument over privacy and legal categories, more demand for a public redaction explanation, and more pressure to compare duplicate records for inconsistent treatment.',
    institutions: ['courts', 'justice department route', 'archive custodians', 'public records request route', 'oversight route'],
    records: ['response filing', 'redaction explanation', 'follow-up order', 'changed file index', 'less-redacted record set', 'duplicate comparison table'],
    watch: ['new filing deadline', 'public redaction log', 'appeal notice', 'large file removal or reposting', 'changed document count'],
    pages: ['epstein-files.html', 'trigger-watchtower.html', 'record-intake-queue.html']
  },
  {
    id: 'OB-002', section: 'Policy Systems', confidence: 'medium',
    headline: 'The strongest public pattern is convergence across access systems.',
    situation: `The policy watch currently tracks ${Array.isArray(feeds.policy.lanes) ? feeds.policy.lanes.length : 0} review lanes across identity, payment, health, standards, institutions and public-private routes. The useful claim is not that every overlap proves command; the useful claim is that systems are being made interoperable and should be tested for access control, data sharing and appeal rights.`,
    meaning: 'Every policy-system brief should answer: Is it optional or mandatory? Who runs it? What data is collected? Who can deny access? What vendor controls the infrastructure? What appeal route exists? What law or contract authorizes it?',
    likely: 'More interoperability, more public-private infrastructure, more compliance-linked access points, and more disputes over privacy, consent, exclusion and resilience.',
    institutions: ['central banks', 'standards bodies', 'public agencies', 'identity vendors', 'payment networks', 'health agencies', 'cloud providers'],
    records: ['implementation plans', 'procurement records', 'vendor contracts', 'privacy assessments', 'payment-system papers', 'access terms'],
    watch: ['mandatory language', 'data sharing terms', 'private vendor role', 'denial-of-access rules', 'cross-border interoperability'],
    pages: ['policy-watch.html', 'probability-snapshot.html', 'matrix-brain.html']
  },
  {
    id: 'OB-003', section: 'Reserve Power', confidence: 'medium-high',
    headline: 'Gold is a custody map as much as a tonnage table.',
    situation: `The gold tracker records a world official total of ${worldGold || 'unknown'} tonnes and a visible top-50 country subtotal of ${topGold || 'unknown'} tonnes. Reported holdings show reserve power, but they do not by themselves prove physical location, audit quality, direct possession or whether holdings are free of leases or swaps.`,
    meaning: 'The correct output is two maps: ownership and custody. Ownership tracks the reporting authority and tonnes. Custody tracks vault route, domestic versus foreign storage, audit statement, encumbrance disclosure and repatriation activity.',
    likely: 'During debt stress, sanctions risk, reserve diversification and currency stress, gold custody transparency becomes a more valuable geopolitical signal.',
    institutions: ['central banks', 'treasuries', 'mints', 'custodian banks', 'international financial institutions', 'audit bodies'],
    records: ['central bank annual report', 'reserve statement', 'custody disclosure', 'audit report', 'swap or lease disclosure', 'repatriation announcement'],
    watch: ['central bank purchases', 'reserve-share changes', 'repatriation statements', 'audit disputes', 'custody concentration'],
    pages: ['gold-reserve-tracker.html', 'matrix-brain.html']
  },
  {
    id: 'OB-004', section: 'Power And Wealth', confidence: 'medium',
    headline: 'Influence should be mapped through infrastructure, filings and contracts.',
    situation: 'Power is visible when wealth connects to infrastructure: cloud, finance, payments, energy, communications, identity systems, AI systems, foundations, grants, lobbying and public contracts. A serious tracker should avoid slogans and show the exact route of influence.',
    meaning: 'Each power brief should list the person or institution, the asset layer, the public record, the policy route, the money route, the public dependency and the missing records. The outcome should be a map of leverage rather than a claim of secret command.',
    likely: 'The largest influence lanes will remain AI/cloud infrastructure, payments, energy, data centers, defense/security, media platforms, philanthropy and public-private digital systems.',
    institutions: ['companies', 'foundations', 'funds', 'public agencies', 'standards bodies', 'lobbying networks', 'contracting offices'],
    records: ['SEC filings', 'foundation filings', 'lobbying records', 'government contracts', 'board records', 'grant records'],
    watch: ['infrastructure acquisition', 'policy partnership', 'large public contract', 'foundation grant cluster', 'cross-board relationship'],
    pages: ['billionaire-watch.html', 'power-atlas.html', 'network-map-index.html']
  },
  {
    id: 'OB-005', section: 'Speculation Review', confidence: 'method',
    headline: 'Speculation becomes useful when it produces records and counter-records.',
    situation: 'The speculation section should be deep, but disciplined. The goal is not to turn every viral claim into a finding. The goal is to identify claims that generate source routes, archive checks, metadata checks, counter-sources and probability conditions.',
    meaning: 'Every speculation brief should have the exact claim, original source chain, available records, missing records, counter-sources, probability triggers and downgrade conditions. This makes the section harder to dismiss and more useful to readers.',
    likely: 'The strongest speculation pages will be the ones that openly show what is unproven and what record would change the status.',
    institutions: ['archives', 'courts', 'platforms', 'media outlets', 'public-record offices', 'independent researchers'],
    records: ['original archive', 'metadata', 'official record', 'credible report', 'counter-source', 'source timeline'],
    watch: ['testable claims', 'claims without source chain', 'claims contradicted by records', 'newly surfaced archive material'],
    pages: ['speculation-review.html', 'dark-speculation-lab.html', 'dark-speculation-forum.html']
  }
];
const output = { updated, title: 'Outcome Briefings', sourceFeeds: Object.keys(feeds), scenarioCount, signalCount, boundary: 'Outcome briefings are evidence graded and update from repo feeds when the daily build runs.', briefings };
fs.writeFileSync(path.join(dataDir, 'outcome-briefings.json'), JSON.stringify(output, null, 2));
function card(b) { return `<article class="card redline"><span class="label">${esc(b.id)} · ${esc(b.section)} · ${esc(b.confidence)}</span><h2>${esc(b.headline)}</h2><p><strong>Situation:</strong> ${esc(b.situation)}</p><p><strong>Meaning:</strong> ${esc(b.meaning)}</p><p><strong>Likely outcome:</strong> ${esc(b.likely)}</p><h3>Institutions / routes</h3>${list(b.institutions)}<h3>Records needed</h3>${list(b.records)}<h3>Watch triggers</h3>${list(b.watch)}<p><strong>Pages to update:</strong> ${esc(b.pages.join(' / '))}</p></article>`; }
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Outcome Briefings | Matrix Reprogrammed</title><meta name="description" content="Finished briefings from Matrix Reprogrammed trackers: situation, meaning, likely outcome, records needed and watch triggers."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="fixes.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="matrix-brain.html">Matrix Brain</a><a href="record-intake-queue.html">Records</a><a href="probability-snapshot.html">Snapshot</a><a href="findings-dashboard.html">Findings</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Finished Intelligence</div><h1>OUTCOME BRIEFINGS.</h1><p class="lead">Detailed tracker outputs translated into situation, meaning, likely outcome, records needed and watch triggers.</p><div class="cta-row"><a class="btn" href="data/outcome-briefings.json">Open JSON</a><a class="btn alt" href="matrix-brain.html">Matrix Brain</a><a class="btn alt" href="probability-snapshot.html">Probability Snapshot</a><a class="btn alt" href="record-intake-queue.html">Record Intake</a></div></section><section class="section wrap split"><div class="terminal">OUTCOME ENGINE\\n&gt; updated: ${esc(updated)}\\n&gt; briefings: ${briefings.length}\\n&gt; scenarios: ${scenarioCount}\\n&gt; signals: ${signalCount}\\n&gt; rebuilds during daily site update</div><aside class="card redline"><h2>Boundary</h2><p>${esc(output.boundary)}</p></aside></section><section class="section wrap"><h2>Current Outcome Briefings</h2><div class="grid">${briefings.map(card).join('')}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — the useful output is meaning, records and likely next moves.</p></footer></div><script src="matrix.js"></script></body></html>`;
fs.writeFileSync(path.join(root, 'outcome-briefings.html'), html);
const md = ['# Outcome Briefings', '', `Updated: ${updated}`, '', ...briefings.flatMap(b => [`## ${b.id} — ${b.section}`, '', `### ${b.headline}`, '', `Situation: ${b.situation}`, '', `Meaning: ${b.meaning}`, '', `Likely outcome: ${b.likely}`, '', `Records needed: ${b.records.join('; ')}`, '', `Watch triggers: ${b.watch.join('; ')}`, ''])].join('\n');
fs.writeFileSync(path.join(downloadsDir, 'outcome-briefings.md'), md);
console.log(`Outcome briefings generated: ${briefings.length} detailed briefs.`);
