const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataFile = path.join(root, 'data', 'epstein-evidence-ladder.json');
const pageFile = path.join(root, 'epstein-files.html');
const downloadsDir = path.join(root, 'downloads');

if (!fs.existsSync(dataFile)) {
  console.log('No Epstein evidence ladder data found. Skipping Phase 5.');
  process.exit(0);
}
if (!fs.existsSync(pageFile)) {
  console.log('No epstein-files.html found. Skipping Phase 5.');
  process.exit(0);
}
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const esc = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const jsonOut = 'downloads/epstein-evidence-ladder.json';
const mdOut = 'downloads/epstein-evidence-ladder.md';
fs.writeFileSync(path.join(root, jsonOut), JSON.stringify(data, null, 2));
fs.writeFileSync(path.join(root, mdOut), [
  '# Epstein Evidence Strength Ladder',
  '',
  `Updated: ${data.updated || '2026-06-25'}`,
  '',
  '## Boundary',
  data.boundary || '',
  '',
  '## Evidence Levels',
  ...(data.levels || []).map(item => `- ${item.level} — ${item.name}: ${item.claimAllowed} Warning: ${item.warning}`),
  '',
  '## Claim Classifier',
  ...(data.claimClassifier || []).map(item => `- ${item.claimType}: ${item.allowedLanguage} Do not shortcut to: ${item.forbiddenShortcut}`)
].join('\n'));

const levelCards = (data.levels || []).map(item => `<article class="card redline"><span class="label">${esc(item.level)} · ${esc(item.strength)}</span><h3>${esc(item.name)}</h3><p><strong>Claim allowed:</strong> ${esc(item.claimAllowed)}</p><p><strong>Needs:</strong> ${esc((item.needs || []).join(' · '))}</p><p><strong>Warning:</strong> ${esc(item.warning)}</p></article>`).join('');
const classifierCards = (data.claimClassifier || []).map(item => `<article class="card"><span class="label">Claim classifier</span><h3>${esc(item.claimType)}</h3><p><strong>Allowed language:</strong> ${esc(item.allowedLanguage)}</p><p><strong>Forbidden shortcut:</strong> ${esc(item.forbiddenShortcut)}</p></article>`).join('');
const section = `<section id="epstein-evidence-ladder" class="section wrap"><h2>Evidence Strength Ladder</h2><p class="lead">The Command Center goes hard by ranking the evidence. A conviction is not the same as an email. A flight log is not the same as a confession. A settlement is not the same as an admission. This ladder shows what each record type can support, what it cannot support, and how strong the claim can be.</p><div class="cta-row"><a class="btn" href="${jsonOut}">Open evidence ladder source file</a><a class="btn alt" href="${mdOut}">Evidence ladder brief</a><a class="btn alt" href="downloads/epstein-people-index.json">People tracker</a><a class="btn alt" href="downloads/epstein-file-cockpit.json">Actual files cockpit</a></div><h2>Evidence Levels</h2><div class="grid">${levelCards}</div><h2>Claim Classifier</h2><div class="grid">${classifierCards}</div><div class="terminal">CLAIM CLASSIFIER\n&gt; Conviction / plea / court finding = strongest public-record weight\n&gt; Official document = record item and source context\n&gt; Sworn testimony = formal claim record\n&gt; Email / contact / flight / ledger = network trail\n&gt; Settlement / NDA = silence-management lane, not automatic admission\n&gt; Speculation = labelled question only</div></section>`;

let html = fs.readFileSync(pageFile, 'utf8');
if (!html.includes('id="epstein-evidence-ladder"')) {
  const anchor = 'id="epstein-network-architecture"';
  if (html.includes(anchor)) {
    html = html.replace(`<section ${anchor}`, `${section}<section ${anchor}`);
  } else {
    html = html.replace('</main>', `${section}</main>`);
  }
  fs.writeFileSync(pageFile, html);
}

console.log(`Built Epstein Evidence Strength Ladder with ${(data.levels || []).length} evidence levels and ${(data.claimClassifier || []).length} claim classifiers.`);