const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataPath = path.join(root, 'data', 'death-files.json');
if (!fs.existsSync(dataPath)) throw new Error('Death Files dataset missing before UI enhancement');
const model = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const dossiers = Array.isArray(model.dossiers) ? model.dossiers : [];
if (dossiers.length !== 100) throw new Error(`Death Files UI enhancement expected 100 dossiers; found ${dossiers.length}`);

const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

function replaceSection(html, heading, replacement) {
  const marker = `<section class="section wrap"><h2>${heading}</h2>`;
  const start = html.indexOf(marker);
  if (start < 0) throw new Error(`Generated Death Files section missing: ${heading}`);
  const end = html.indexOf('</section>', start);
  if (end < 0) throw new Error(`Generated Death Files section is not closed: ${heading}`);
  return html.slice(0, start) + replacement + html.slice(end + '</section>'.length);
}

function speculationSection(dossier) {
  const rationale = dossier.conspiracyRationale || {};
  const required = ['reason', 'suspectedMotive', 'supportingClues', 'counterEvidence', 'proofNeeded'];
  for (const field of required) {
    if (String(rationale[field] || '').trim().length < 40) {
      throw new Error(`${dossier.name}: detailed conspiracy rationale field missing: ${field}`);
    }
  }
  return `<section class="section wrap death-speculation-analysis"><h2>Speculative Conclusions — Presented for Investigation, Not as Fact</h2><p class="warning">This section explains why a theory exists and how it should be tested. It does not declare that the theory is true.</p><div class="grid death-speculation-grid"><article class="card redline"><span class="label">1 · Origin of the theory</span><h3>Why conspiracy theories exist:</h3><p>${esc(rationale.reason)}</p></article><article class="card"><span class="label">2 · Proposed power conflict</span><h3>Suspected motive:</h3><p>${esc(rationale.suspectedMotive)}</p></article><article class="card"><span class="label">3 · Case for further investigation</span><h3>Supporting clues cited:</h3><p>${esc(rationale.supportingClues)}</p></article><article class="card death-counter-evidence"><span class="label">4 · Evidence boundary</span><h3>Strongest counter-evidence and limitation:</h3><p>${esc(rationale.counterEvidence)}</p></article><article class="card death-proof-required"><span class="label">5 · Falsification standard</span><h3>Proof required:</h3><p>${esc(rationale.proofNeeded)}</p></article></div><p class="warning">Speculation cannot overwrite the evidence-based conclusion. Benefit is not proof of motive; motive is not proof of action; association is not guilt.</p></section>`;
}

for (const dossier of dossiers) {
  const file = path.join(root, `death-file-${dossier.slug}.html`);
  if (!fs.existsSync(file)) throw new Error(`Generated Death File missing: ${file}`);
  let html = fs.readFileSync(file, 'utf8');
  html = replaceSection(
    html,
    'Speculative Conclusions — Presented for Investigation, Not as Fact',
    speculationSection(dossier)
  );
  const evidenceHeading = '<section id="evidence-room" class="section wrap"><h2>Evidence Room</h2>';
  const evidenceStart = html.indexOf(evidenceHeading);
  if (evidenceStart < 0) throw new Error(`${dossier.name}: Evidence Room marker missing`);
  const questionsHeading = '<section class="section wrap"><h2>Questions, Anomalies and Evidence Gaps</h2>';
  const questionsStart = html.indexOf(questionsHeading, evidenceStart);
  if (questionsStart < 0) throw new Error(`${dossier.name}: questions section marker missing`);
  const sourceStatus = `<section class="section wrap death-source-status"><h2>Source Status and Research Depth</h2><article class="card"><span class="label">Current dossier tier</span><h3>${esc(dossier.researchTier || 'Baseline dossier')}</h3><p>${dossier.sourceExpansionRequired === true ? 'This dossier currently begins with a clearly labelled reference index. Primary records, court material, inquiry findings, archives and counter-sources remain queued for structured expansion.' : 'This dossier currently includes an individual primary or official starting record. Further sources and counter-sources remain open for continuous review.'}</p><p><span class="pill">${dossier.sourceExpansionRequired === true ? 'Primary-source expansion required' : 'Primary-source starting point present'}</span></p></article></section>`;
  html = html.slice(0, questionsStart) + sourceStatus + html.slice(questionsStart);
  fs.writeFileSync(file, html);
}

const primaryCount = dossiers.filter(dossier => dossier.sourceExpansionRequired !== true).length;
const referenceCount = dossiers.length - primaryCount;
const landingPath = path.join(root, 'death-files.html');
let landing = fs.readFileSync(landingPath, 'utf8');
const boundaryMarker = '<section class="section wrap"><h2>Permanent Evidence Boundary</h2>';
const boundaryIndex = landing.indexOf(boundaryMarker);
if (boundaryIndex < 0) throw new Error('Death Files landing evidence-boundary marker missing');
const selectionSection = `<section class="section wrap death-selection-principle"><h2>Why These 100 Cases Were Selected</h2><div class="grid"><article class="card redline"><span class="label">Selection principle</span><p>${esc(model.selectionPrinciple)}</p></article><article class="card"><span class="label">Mandatory speculation rule</span><p>${esc(model.speculationRule)}</p></article><article class="card"><span class="label">Current source depth</span><h3>${primaryCount} primary-source starts · ${referenceCount} expansion-queued baselines</h3><p>No reference starting point is presented as an official finding. Every dossier remains open to stronger evidence, counter-evidence, corrections and Signal Drops.</p></article></div></section>`;
landing = landing.slice(0, boundaryIndex) + selectionSection + landing.slice(boundaryIndex);
fs.writeFileSync(landingPath, landing);

const methodologyPath = path.join(root, 'death-files-methodology.html');
let methodology = fs.readFileSync(methodologyPath, 'utf8');
const communityMarker = '<section class="section wrap"><h2>Community Intelligence Rules</h2>';
const communityIndex = methodology.indexOf(communityMarker);
if (communityIndex < 0) throw new Error('Death Files methodology community marker missing');
const methodSection = `<section class="section wrap"><h2>The Five-Part Conspiracy Test</h2><ol class="death-process"><li><strong>Reason:</strong> explain why suspicion arose and identify the documented conflict.</li><li><strong>Suspected motive:</strong> state the proposed interest threatened by the person.</li><li><strong>Supporting clues:</strong> identify the facts and anomalies cited by theory supporters.</li><li><strong>Counter-evidence:</strong> present the strongest ordinary explanation and evidence weakening the theory.</li><li><strong>Proof required:</strong> state what authenticated evidence would confirm or falsify the causal claim.</li></ol></section>`;
methodology = methodology.slice(0, communityIndex) + methodSection + methodology.slice(communityIndex);
fs.writeFileSync(methodologyPath, methodology);

const cssPath = path.join(root, 'fixes.css');
if (fs.existsSync(cssPath)) {
  let css = fs.readFileSync(cssPath, 'utf8');
  if (!css.includes('/* death-files-100-analysis */')) {
    css += `\n/* death-files-100-analysis */\n.death-speculation-analysis{border-top:1px solid rgba(183,25,25,.55);border-bottom:1px solid rgba(183,25,25,.3)}.death-speculation-grid{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}.death-counter-evidence{border:1px solid rgba(90,145,210,.5)}.death-proof-required{border:1px solid rgba(216,181,106,.55)}.death-source-status .card{max-width:950px}.death-selection-principle .grid{align-items:stretch}\n`;
    fs.writeFileSync(cssPath, css);
  }
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'death-files-100-ui-enhancement.json'), JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  dossiersEnhanced: dossiers.length,
  primarySourceStartingPoints: primaryCount,
  referenceStartingPointsQueuedForExpansion: referenceCount,
  requiredPanels: ['reason', 'suspected motive', 'supporting clues', 'counter-evidence', 'proof required']
}, null, 2) + '\n');
console.log(`Death Files UI enhanced: ${dossiers.length} dossiers with five-part conspiracy analysis.`);
