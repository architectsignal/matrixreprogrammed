'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const generatedDate = new Date().toISOString().slice(0, 10);
const HIT_START = '<!-- exposure-hit-list-route:start -->';
const HIT_END = '<!-- exposure-hit-list-route:end -->';

function readJson(relative) { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); }
function writeJson(relative, value) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function clean(value = '') { return String(value == null ? '' : value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function array(value) { return Array.isArray(value) ? value : []; }
function unique(values) { return [...new Set(array(values).map(clean).filter(Boolean))]; }
function copyToOutput(relative) {
  if (!fs.existsSync(outputRoot)) return;
  const source = path.join(root, relative);
  if (!fs.existsSync(source)) return;
  const destination = path.join(outputRoot, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}
function replaceBlock(html, block) {
  const start = HIT_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const end = HIT_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`, 'i');
  if (pattern.test(html)) return html.replace(pattern, block);
  if (html.includes('</main>')) return html.replace('</main>', `${block}</main>`);
  return html.includes('</body>') ? html.replace('</body>', `${block}</body>`) : `${html}\n${block}`;
}
function patch(relative, transform) {
  for (const base of [root, outputRoot]) {
    if (base === outputRoot && !fs.existsSync(outputRoot)) continue;
    const file = path.join(base, relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const before = fs.readFileSync(file, 'utf8');
    const after = transform(before);
    if (after !== before) fs.writeFileSync(file, after);
  }
}
function walkHtml(base, visit) {
  if (!fs.existsSync(base)) return;
  const ignored = new Set(['node_modules', '.git']);
  const stack = [base];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && /\.html?$/i.test(entry.name)) visit(full);
    }
  }
}

const policy = readJson('data/exposure-integrity-policy.json');
const ledger = readJson('data/exposure-evidence-ledger.json');
const hit = readJson('data/cinematic-hit-list.json');
const engine = readJson('data/exposure-integrity-engine.json');

let downgradedGenericDarkClaims = 0;
for (const entry of array(ledger.entries)) {
  const hasExternalSource = array(entry.sourceRoutes).some(route => /^https?:\/\//i.test(clean(route)));
  if (entry.origin === 'dark-speculation-claims' && /^fact_/.test(clean(entry.classification)) && !hasExternalSource) {
    entry.classification = 'analytical_inference';
    entry.evidenceGrade = 'case-specific evidence required';
    entry.establishes = 'This is a public-record research lane. It does not establish a specific case until case-level sources are attached.';
    downgradedGenericDarkClaims += 1;
  }
}

for (const entry of array(hit.entries)) {
  const hasDocumentedSource = array(entry.documentedEvidence).some(item => array(item.sourceRoutes).some(route => /^https?:\/\//i.test(clean(route))));
  if (entry.entityType === 'claim under test' && /^fact_/.test(clean(entry.primaryClassification)) && !hasDocumentedSource) {
    entry.primaryClassification = 'analytical_inference';
    entry.primaryClassificationLabel = policy.classificationLanes.analytical_inference.label;
    entry.documentedEvidence = [];
  }
  if (!clean(entry.lastReviewed)) entry.lastReviewed = generatedDate;
  const hasAction = array(entry.dossierRoutes).length || array(entry.timerRoutes).length || array(entry.sourceRoutes).length;
  if (!hasAction) {
    entry.dossierRoutes = ['daily-missing-records.html'];
    entry.missingRecords = unique([...array(entry.missingRecords), 'Restore a source, dossier or timer route before drawing a conclusion.']);
  }
}

ledger.count = array(ledger.entries).length;
hit.count = array(hit.entries).length;
engine.summary.evidenceLedgerEntries = ledger.count;
engine.summary.hitListEntries = hit.count;
engine.summary.entriesWithoutAction = array(hit.entries).filter(entry => !array(entry.dossierRoutes).length && !array(entry.timerRoutes).length && !array(entry.sourceRoutes).length).length;
engine.summary.genericDarkClaimsDowngraded = downgradedGenericDarkClaims;
engine.improvements = unique([
  ...array(engine.improvements),
  downgradedGenericDarkClaims ? `${downgradedGenericDarkClaims} generic Dark Files lane(s) were kept as analytical inference until case-specific sources are attached.` : ''
]);
engine.ok = array(engine.criticalFailures).length === 0 && engine.summary.entriesWithoutAction === 0;

writeJson('data/exposure-evidence-ledger.json', ledger);
writeJson('data/cinematic-hit-list.json', hit);
writeJson('data/exposure-integrity-engine.json', engine);
writeJson('downloads/exposure-integrity-report.json', engine);

for (const relative of ['hit-list.html', 'cinematic-hit-list.html']) {
  patch(relative, html => html
    .replace(/data-classification="fact_corroborated"/g, 'data-classification="analytical_inference"')
    .replace(/Corroborated documented fact · claim under test/g, 'Analytical inference · claim under test')
    .replace(/Review date pending/g, generatedDate)
    .replace(/href="\/?corrections\.html"/g, 'href="/trust-corrections.html"'));
}

const routeBlock = `${HIT_START}<section class="section wrap exposure-entry"><article class="card redline"><span class="label">Connected investigation system</span><h2>Evidence feeds the Hit List, dossiers and timers</h2><p>Open the cinematic entry point to see what is documented, what is alleged, what remains unproven, which records are missing and where the investigation goes next.</p><div class="cta-row"><a class="btn" href="/hit-list.html">Open the Hit List</a><a class="btn alt" href="/timers.html">Follow the Timers</a><a class="btn alt" href="/source-document-vault.html">Verify Sources</a></div></article></section>${HIT_END}`;
for (const relative of ['subject-index.html','predators-in-power.html','dark-speculation-lab.html','evidence-vault.html','wrongdoing-tracker.html','live-intel.html']) patch(relative, html => replaceBlock(html, routeBlock));

let correctionRoutesRepaired = 0;
for (const base of [root, outputRoot]) walkHtml(base, file => {
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(/href="\/?corrections\.html"/g, 'href="/trust-corrections.html"');
  if (after !== before) {
    fs.writeFileSync(file, after);
    correctionRoutesRepaired += 1;
  }
});

for (const relative of ['data/exposure-evidence-ledger.json','data/cinematic-hit-list.json','data/exposure-integrity-engine.json','downloads/exposure-integrity-report.json','hit-list.html','cinematic-hit-list.html','subject-index.html','predators-in-power.html','dark-speculation-lab.html','evidence-vault.html','wrongdoing-tracker.html','live-intel.html']) copyToOutput(relative);

if (!engine.ok) throw new Error(`Exposure Integrity finalization failed: ${JSON.stringify(engine.criticalFailures || [])}`);
console.log(`Exposure Integrity finalization passed: ${downgradedGenericDarkClaims} generic Dark Files lane(s) retained as inference, all Hit List entries have review dates and investigation actions, six core investigation surfaces link to the cinematic entry point, and ${correctionRoutesRepaired} correction route file(s) were repaired.`);
