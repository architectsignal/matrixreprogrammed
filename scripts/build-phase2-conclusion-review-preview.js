const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = process.cwd();
const outputDir = path.join(root, 'downloads', 'phase2-conclusion-review-preview');
const siteDir = path.join(outputDir, 'site', '__preview', 'conclusion-review');
const namespace = '/__preview/conclusion-review/';

function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); }
function stableJson(value) { return JSON.stringify(value, null, 2) + '\n'; }
function ensureDir(target) { fs.mkdirSync(target, { recursive: true }); }
function writeRel(rel, content) { const target = path.join(outputDir, rel); ensureDir(path.dirname(target)); fs.writeFileSync(target, content); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function escapeHtml(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function asArray(value) { if (value === undefined || value === null) return []; return Array.isArray(value) ? value : [value]; }
function compact(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(compact).filter(Boolean).join(' · ');
  return Object.entries(value).map(([key,item]) => `${key}: ${compact(item)}`).filter(item => !item.endsWith(': ')).join(' · ');
}
function safeSegment(value) { return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,180) || 'record'; }
function list(items, empty = 'None recorded.') {
  const values = asArray(items).filter(item => compact(item).trim());
  return values.length ? `<ul>${values.map(item => `<li>${escapeHtml(compact(item))}</li>`).join('')}</ul>` : `<p class="muted">${escapeHtml(empty)}</p>`;
}
function panel(title, body, className = '') { return `<section class="panel ${escapeHtml(className)}"><h2>${escapeHtml(title)}</h2>${body}</section>`; }
function statusClass(value) { return value === 'publishable_preview' ? 'pass' : value === 'needs_evidence' ? 'hold' : 'review'; }
function page({ title, eyebrow, body, route }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="googlebot" content="noindex,nofollow,noarchive"><title>${escapeHtml(title)} · Conclusion Review</title><style>
:root{color-scheme:dark;--bg:#080b10;--panel:#111722;--panel2:#171e2a;--line:#2d3747;--text:#eef3fb;--muted:#aeb8c8;--gold:#d9ad55;--blue:#8bc8ff;--green:#88ddb0;--red:#ff9b9b;--amber:#f0c978}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top,#182137 0,#080b10 45%);color:var(--text);font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}a{color:var(--blue)}header,main,footer{width:min(1320px,calc(100% - 28px));margin:auto}header{padding:34px 0 16px}.eyebrow{text-transform:uppercase;letter-spacing:.16em;color:var(--gold);font-size:.72rem}h1{font-size:clamp(2rem,5vw,4rem);line-height:1.04;margin:.3rem 0 1rem}h2{font-size:.9rem;text-transform:uppercase;letter-spacing:.08em;color:var(--gold);margin:0 0 12px}h3{margin:18px 0 6px}.boundary{border-left:4px solid var(--gold);background:#141a24;padding:13px 15px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:16px}.panel{background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:14px;padding:18px;margin:16px 0;overflow-wrap:anywhere}.source{border-color:#4b5e79}.candidate{border-color:#6d5d36}.speculation{border-color:#7e4b58}.counter{border-color:#405c70}.gate{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding:8px 0}.gate:last-child{border-bottom:0}.yes{color:var(--green)}.no{color:var(--red)}.state{display:inline-flex;border-radius:999px;border:1px solid var(--line);padding:5px 10px;font-weight:700}.state.pass{color:var(--green)}.state.hold{color:var(--amber)}.state.review{color:var(--red)}.muted{color:var(--muted)}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:14px}.card{display:block;text-decoration:none;color:inherit;background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:14px;padding:17px}.card:hover{border-color:var(--gold)}.card h3{margin:.4rem 0}.meta{display:flex;gap:7px;flex-wrap:wrap}.badge{font-size:.75rem;border:1px solid var(--line);border-radius:999px;padding:3px 7px}.nav{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}.nav a{border:1px solid var(--line);border-radius:999px;padding:6px 10px;text-decoration:none}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--gold)}code{overflow-wrap:anywhere}footer{padding:28px 0 55px;color:var(--muted)}
</style></head><body data-preview-route="${escapeHtml(route)}"><header><div class="eyebrow">${escapeHtml(eyebrow)}</div><h1>${escapeHtml(title)}</h1><p class="boundary">Editorial preview only. Candidate conclusions do not replace canonical records and cannot publish, send email, grant access or take payment.</p></header><main>${body}</main><footer>Matrix Reprogrammed · report-only conclusion review · isolated under <code>${escapeHtml(namespace)}</code></footer></body></html>`;
}
function runEngine() {
  const result = spawnSync(process.execPath, ['scripts/build-phase2-conclusion-engine-preview.js'], { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
  if (result.status !== 0) throw new Error(`Conclusion engine failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  process.stdout.write(result.stdout || '');
}
function vectorTable(vectors) {
  return `<table><thead><tr><th>Vector</th><th>Score</th><th>Cap</th><th>Coordination</th><th>Rationale</th></tr></thead><tbody>${asArray(vectors).map(vector => `<tr><td>${escapeHtml(String(vector.vector).replaceAll('_',' '))}</td><td>${escapeHtml(vector.score)}</td><td>${escapeHtml(vector.cap)}</td><td>${escapeHtml(vector.coordinationStatus)}</td><td>${escapeHtml(vector.rationale)}</td></tr>`).join('')}</tbody></table>`;
}
function gateRows(publication) {
  return Object.entries(publication.gates || {}).map(([name, pass]) => `<div class="gate"><span>${escapeHtml(name.replaceAll('_',' '))}</span><strong class="${pass ? 'yes' : 'no'}">${pass ? 'PASS' : 'FAIL'}</strong></div>`).join('');
}
function recordPage(canonical, analysis, route) {
  const generated = analysis.generated;
  const currentConclusion = canonical.solidConclusion || {};
  const currentMechanism = canonical.mechanismOfPower || {};
  const currentMission = canonical.missionAssessment || {};
  const currentSpeculation = canonical.speculativeConclusion || {};
  const body = `<div class="nav"><a href="../index.html">← Review index</a></div>
<div class="grid">
${panel('Publication decision', `<span class="state ${statusClass(analysis.publication.state)}">${escapeHtml(analysis.publication.state)}</span><p><strong>Failed gates:</strong> ${escapeHtml(analysis.publication.failed.join(', ') || 'none')}</p><p><strong>Current confidence:</strong> ${escapeHtml(analysis.publication.currentConfidence)} · <strong>recommended:</strong> ${escapeHtml(analysis.publication.recommendedConfidence)}</p><p><strong>Source authority:</strong> ${escapeHtml(analysis.publication.sourceAuthority)} · <strong>claim:</strong> ${escapeHtml(analysis.publication.claimClass)} · <strong>grade:</strong> ${escapeHtml(analysis.publication.evidenceGrade)}</p>`)}
${panel('Quality decision', `<p><strong>Source flags:</strong> ${escapeHtml(analysis.quality.source.flags.join(', ') || 'none')}</p><p><strong>Candidate flags:</strong> ${escapeHtml(analysis.quality.candidate.flags.join(', ') || 'none')}</p><p><strong>Title overlap:</strong> ${analysis.quality.candidate.titleOverlap.toFixed(3)} · <strong>summary overlap:</strong> ${analysis.quality.candidate.summaryOverlap.toFixed(3)}</p><p><strong>Record-specific tokens:</strong> ${escapeHtml(analysis.quality.candidate.recordSpecificTokenCount)}</p>`)}
</div>
<div class="grid">
${panel('Current evidence conclusion', `<p>${escapeHtml(currentConclusion.text)}</p><p class="boundary">${escapeHtml(currentConclusion.boundary)}</p>`, 'source')}
${panel('Generated evidence conclusion', `<p>${escapeHtml(generated.evidenceBasedConclusion.candidateText)}</p><p><strong>Scope:</strong> ${escapeHtml(generated.evidenceBasedConclusion.scope)}</p><p><strong>Sources:</strong> ${escapeHtml(generated.evidenceBasedConclusion.sourceIds.join(', '))}</p><p class="boundary">${escapeHtml(generated.evidenceBasedConclusion.boundary)}</p>`, 'candidate')}
</div>
<div class="grid">
${panel('Current mechanism', `<p>${escapeHtml(currentMechanism.description)}</p><p><strong>Authority:</strong> ${escapeHtml(compact(currentMechanism.authorityHolder))}</p><p><strong>Route:</strong> ${escapeHtml(compact(currentMechanism.implementationRoute))}</p><p class="boundary">${escapeHtml(currentMechanism.limitation)}</p>`, 'source')}
${panel('Generated mechanism analysis', `<p><strong>Status:</strong> ${escapeHtml(generated.mechanism.status)}</p><p>${escapeHtml(generated.mechanism.candidateText)}</p><p><strong>Dimensions:</strong> ${escapeHtml(generated.mechanism.dimensions.join(', ') || 'none')}</p><p><strong>Authority:</strong> ${escapeHtml(generated.mechanism.authorityHolders.join(', ') || 'not established')}</p><p><strong>Implementation:</strong> ${escapeHtml(generated.mechanism.implementationRoutes.join(', ') || 'not established')}</p>`, 'candidate')}
</div>
<div class="grid">
${panel('Current mission link', `<p><strong>Outcome:</strong> ${escapeHtml(currentMission.outcome)}</p><p>${escapeHtml(currentMission.missionRelevance)}</p><p><strong>Elite-control relevance:</strong> ${escapeHtml(currentMission.eliteControlRelevance)}</p><p class="boundary">${escapeHtml(currentMission.boundary)}</p>`, 'source')}
${panel('Generated mission and elite-control analysis', `<p><strong>Outcome:</strong> ${escapeHtml(generated.mission.outcome)}</p><p>${escapeHtml(generated.mission.candidateText)}</p><p><strong>Elite-control status:</strong> ${escapeHtml(generated.mission.eliteControl.status)}</p><p><strong>Concentration dimensions:</strong> ${escapeHtml(generated.mission.eliteControl.concentrationDimensions.join(', ') || 'none')}</p><p><strong>Coordination:</strong> ${escapeHtml(generated.mission.eliteControl.coordinationStatus)}</p><p><strong>Legitimate alternative:</strong> ${escapeHtml(generated.mission.eliteControl.legitimateAlternative)}</p><p class="boundary">${escapeHtml(generated.mission.boundary)}</p>`, 'candidate')}
</div>
${panel('Ten-vector convergence assessment', vectorTable(generated.convergence.vectors))}
<div class="grid">
${panel('Current speculative conclusion', `<p><strong>${escapeHtml(currentSpeculation.label || 'speculative')}</strong></p><p>${escapeHtml(currentSpeculation.text)}</p><h3>Conditions</h3>${list(currentSpeculation.conditions)}<h3>Falsifiers</h3>${list(currentSpeculation.falsifiers)}<p class="boundary">${escapeHtml(currentSpeculation.boundary)}</p>`, 'speculation')}
${panel('Generated speculative conclusion', `<p><strong>${escapeHtml(generated.speculativeConclusion.label)}</strong></p><p>${escapeHtml(generated.speculativeConclusion.text)}</p><h3>Conditions</h3>${list(generated.speculativeConclusion.conditions)}<h3>Falsifiers</h3>${list(generated.speculativeConclusion.falsifiers)}<p class="boundary">${escapeHtml(generated.speculativeConclusion.boundary)}</p>`, 'speculation')}
</div>
<div class="grid">
${panel('Counter-hypothesis', `<p>${escapeHtml(generated.counterAndMissing.counterHypothesis.candidateAssessment)}</p><h3>Alternative explanations</h3>${list(generated.counterAndMissing.counterHypothesis.alternativeExplanations)}<h3>Contradictory evidence</h3>${list(generated.counterAndMissing.counterHypothesis.contradictoryEvidence)}`, 'counter')}
${panel('Missing evidence and falsification', `<h3>Missing records</h3>${list(generated.counterAndMissing.missingEvidence)}<h3>Falsifiers</h3>${list(generated.counterAndMissing.falsifiers)}<h3>Watch next</h3>${list(generated.counterAndMissing.watchNext)}`, 'counter')}
</div>
${panel('Publication gates', gateRows(analysis.publication))}`;
  return page({ title: analysis.title, eyebrow: `${analysis.recordType} · ${analysis.publication.state}`, body, route });
}

runEngine();
const enginePackage = readJson('downloads/phase2-conclusion-engine-preview/engine-records.json');
const engineManifest = readJson('downloads/phase2-conclusion-engine-preview/manifest.json');
const canonicalPackage = readJson('downloads/canonical-preview-bundle/canonical-records.json');
if (!enginePackage.ok || !engineManifest.ok || !canonicalPackage.ok) throw new Error('Conclusion or canonical package is not healthy.');
const canonicalById = new Map(canonicalPackage.records.map(record => [record.id, record]));
if (canonicalById.size !== enginePackage.recordCount) throw new Error('Canonical and conclusion-engine record counts differ.');
fs.rmSync(outputDir, { recursive: true, force: true });
ensureDir(siteDir);

const routes = [];
const cards = [];
for (const analysis of enginePackage.records) {
  const canonical = canonicalById.get(analysis.id);
  if (!canonical) throw new Error(`${analysis.id}: canonical record missing`);
  const segment = safeSegment(analysis.id);
  const rel = `site/__preview/conclusion-review/records/${segment}.html`;
  const route = `${namespace}records/${segment}.html`;
  writeRel(rel, recordPage(canonical, analysis, route));
  routes.push({ type: 'record', id: analysis.id, route, outputFile: rel, publicationState: analysis.publication.state });
  cards.push({ id: analysis.id, route: `records/${segment}.html`, title: analysis.title, recordType: analysis.recordType, publicationState: analysis.publication.state, failedGateCount: analysis.publication.failed.length, sourceFlagCount: analysis.quality.source.flags.length, candidateFlagCount: analysis.quality.candidate.flags.length, mechanismStatus: analysis.generated.mechanism.status, claimClass: analysis.publication.claimClass, authority: analysis.publication.sourceAuthority });
}
cards.sort((a,b) => (a.publicationState === 'publishable_preview') - (b.publicationState === 'publishable_preview') || b.failedGateCount - a.failedGateCount || a.title.localeCompare(b.title));
const stateCounts = {};
for (const card of cards) stateCounts[card.publicationState] = (stateCounts[card.publicationState] || 0) + 1;
const indexBody = `<div class="grid">${Object.entries(stateCounts).map(([state,count]) => panel(state.replaceAll('_',' '), `<div style="font-size:2rem;font-weight:700">${count}</div>`)).join('')}${panel('Exit condition', `<p>No record may publish when documented fact, allegation, inference, model output or speculation can be confused.</p>`)}</div><div class="cards">${cards.map(card => `<a class="card" href="${escapeHtml(card.route)}"><div class="meta"><span class="badge">${escapeHtml(card.recordType)}</span><span class="badge">${escapeHtml(card.claimClass)}</span><span class="badge">${escapeHtml(card.authority)}</span></div><h3>${escapeHtml(card.title)}</h3><span class="state ${statusClass(card.publicationState)}">${escapeHtml(card.publicationState)}</span><p class="muted">Failed gates: ${card.failedGateCount} · source flags: ${card.sourceFlagCount} · candidate flags: ${card.candidateFlagCount} · mechanism: ${escapeHtml(card.mechanismStatus)}</p></a>`).join('')}</div>`;
const indexRel = 'site/__preview/conclusion-review/index.html';
writeRel(indexRel, page({ title: 'Conclusion-engine editorial review', eyebrow: 'Phase 2 · report only', body: indexBody, route: `${namespace}index.html` }));
routes.push({ type: 'index', route: `${namespace}index.html`, outputFile: indexRel });
writeRel('review-feed.json', stableJson({ ok: true, mode: 'report-only', generatedAt: enginePackage.generatedAt, recordCount: cards.length, stateCounts, cards }));
routes.push({ type: 'feed', route: `${namespace}review-feed.json`, outputFile: 'review-feed.json' });

const htmlFiles = routes.filter(route => route.outputFile.endsWith('.html'));
const errors = [];
for (const route of htmlFiles) {
  const html = fs.readFileSync(path.join(outputDir, route.outputFile), 'utf8');
  const lower = html.toLowerCase();
  if (!lower.includes('noindex,nofollow,noarchive')) errors.push(`${route.outputFile}: noindex missing`);
  if (!lower.includes(`data-preview-route="${namespace}`)) errors.push(`${route.outputFile}: namespace marker missing`);
  if (/<script|<form/i.test(html)) errors.push(`${route.outputFile}: executable script or form detected`);
  if (/paypal|createsubscription|checkout-intent|\/api\//i.test(html)) errors.push(`${route.outputFile}: active functionality marker detected`);
}
const artifactHashes = {};
function walk(dir, out = []) { for (const entry of fs.readdirSync(dir,{withFileTypes:true})) { const target = path.join(dir,entry.name); if (entry.isDirectory()) walk(target,out); else out.push(target); } return out; }
for (const file of walk(outputDir).sort()) { const rel = path.relative(outputDir,file).split(path.sep).join('/'); if (rel !== 'manifest.json') artifactHashes[rel] = sha256(fs.readFileSync(file)); }
const manifest = { ok: errors.length === 0, mode: 'report-only', version: '1.0.0', generatedAt: enginePackage.generatedAt, namespace, canonicalRecordCount: canonicalPackage.recordCount, engineRecordCount: enginePackage.recordCount, recordPageCount: enginePackage.recordCount, htmlPageCount: htmlFiles.length, routeCount: routes.length, stateCounts, publicationEnforcement: false, paymentActivation: false, artifactHashes, errors, boundary: 'Editorial review artifacts only. Candidate conclusions do not replace canonical data and cannot publish or activate services.' };
writeRel('route-manifest.json', stableJson({ ok: manifest.ok, mode: manifest.mode, namespace, routeCount: routes.length, routes }));
writeRel('manifest.json', stableJson(manifest));
writeRel('README.md', `# Conclusion Review Preview\n\n- Records: ${manifest.engineRecordCount}\n- Record pages: ${manifest.recordPageCount}\n- Publication enforcement: ${manifest.publicationEnforcement}\n- Payments: ${manifest.paymentActivation}\n- Namespace: ${manifest.namespace}\n\n${manifest.boundary}\n`);
console.log(`CONCLUSION REVIEW PREVIEW: ${manifest.recordPageCount} record review pages; ${stateCounts.publishable_preview || 0} publishable previews; ${cards.length - (stateCounts.publishable_preview || 0)} held.`);
console.log(`Output: ${outputDir}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
