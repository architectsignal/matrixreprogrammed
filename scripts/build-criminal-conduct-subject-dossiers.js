const fs = require('fs');
const path = require('path');

const root = process.cwd();
const registryPath = path.join(root, 'data', 'criminal-conduct-registry.json');
const reportPath = path.join(root, 'downloads', 'criminal-conduct-subject-dossiers.json');
if (!fs.existsSync(registryPath)) throw new Error('Missing compiled criminal conduct registry');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const safeRoute = value => /^[a-z0-9][a-z0-9._/-]*\.html$/i.test(String(value || '')) ? String(value) : '';
const generated = [];
const preserved = [];
const failures = [];

function recordCard(record) {
  const category = registry.categories?.[record.category]?.label || record.category;
  return `<article class="card redline"><div class="label">${esc(category)} · Evidence ${esc(record.evidenceGrade || 'not stated')}</div><h3>${esc(record.title)}</h3><p>${esc(record.summary)}</p><dl class="record-grid"><div><dt>Date</dt><dd>${esc(record.date)}</dd></div><div><dt>Jurisdiction</dt><dd>${esc(record.jurisdiction || 'Not stated')}</dd></div><div><dt>Status</dt><dd>${esc(record.status || 'Not stated')}</dd></div><div><dt>Outcome</dt><dd>${esc(record.outcome || 'Not stated')}</dd></div></dl><p><strong>Response / right of reply:</strong> ${esc(record.rightOfReply || 'No response recorded.')}</p><p><strong>Counter-evidence / limitation:</strong> ${esc(record.counterEvidence || 'No separate limitation recorded.')}</p><p><strong>What would change this record:</strong> ${esc(record.proofNeeded || 'A later authoritative record.')}</p><p class="boundary"><strong>Boundary:</strong> ${esc(record.boundary || registry.categories?.[record.category]?.boundary || '')}</p><a class="btn alt" href="${esc(record.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open cited source: ${esc(record.sourceLabel)}</a></article>`;
}

function roleCard(role) {
  return `<article class="card"><div class="label">Documented power / influence role</div><h3>${esc(role.title)}</h3><p>${esc(role.organization)} · ${esc(role.status || 'status not stated')}</p><p>${esc([role.from, role.to].filter(Boolean).join(' – '))}</p><a href="${esc(role.sourceUrl)}" target="_blank" rel="noopener noreferrer">Verify role: ${esc(role.sourceLabel)}</a></article>`;
}

for (const [key, subject] of Object.entries(registry.subjects || {})) {
  const route = safeRoute(subject.dossierRoute);
  if (!route || route.startsWith('death-file-')) continue;
  const file = path.join(root, route);
  if (fs.existsSync(file)) {
    preserved.push(route);
    continue;
  }
  const records = (subject.records || []).filter(record => record.publicationStatus === 'approved');
  const roles = subject.powerRoles || [];
  if (!subject.name || !records.length || !roles.length) {
    failures.push(`${key}: cannot generate dossier without name, approved record and sourced role`);
    continue;
  }
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${esc(subject.name)} Conduct Dossier | Matrix Reprogrammed</title><meta name="description" content="Evidence-classified public-record dossier for ${esc(subject.name)}."><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="fixes.css"><style>.conduct-hero{padding:3rem 1rem}.record-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.7rem}.record-grid dt{font-size:.75rem;text-transform:uppercase;opacity:.7}.record-grid dd{margin:0}.boundary{border-left:3px solid #ff4b4b;padding-left:.8rem}.conduct-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1rem}</style></head><body><header><a class="brand" href="index.html">MATRIX REPROGRAMMED</a><nav><a href="predators-in-power.html">Predators in Power</a><a href="wrongdoing-tracker.html">Wrongdoing Tracker</a><a href="evidence-vault.html">Evidence Vault</a></nav></header><main><section class="conduct-hero wrap"><div class="eyebrow">Evidence-classified public record</div><h1>${esc(subject.name)}</h1><p>${esc(subject.publicSummary || 'Public-record conduct dossier.')}</p><p class="boundary"><strong>Legal boundary:</strong> This dossier separates convictions, charges, investigations, civil actions, allegations, analytical hypotheses, rumors, responses and reversals. A charge is not a conviction. A civil finding is not a criminal conviction. Association is not wrongdoing.</p></section><section class="section wrap"><h2>Documented power and influence roles</h2><div class="conduct-grid">${roles.map(roleCard).join('')}</div></section><section class="section wrap"><h2>Approved conduct records</h2><div class="conduct-grid">${records.map(recordCard).join('')}</div></section><section class="section wrap"><div class="card"><h2>Corrections and right of reply</h2><p>Later court orders, dismissals, reversals, pardons, settlements, denials and documented responses must be added to the same record. Submit a source through the relevant Signal Drop; victim identities and identifying details about children must not be posted.</p><a class="btn" href="contact-the-machine.html">Submit correction or source</a></div></section></main><footer><a href="trust-center.html">Trust &amp; Evidence</a> · <a href="predators-in-power.html">Predators in Power</a></footer></body></html>`;
  fs.writeFileSync(file, `${html}\n`);
  generated.push(route);
}

if (failures.length) {
  failures.forEach(item => console.error(`CONDUCT DOSSIER BUILD FAILURE: ${item}`));
  process.exit(1);
}
const result = { ok: true, generatedAt: new Date().toISOString(), generated, preserved, subjectCount: Object.keys(registry.subjects || {}).length };
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Criminal conduct subject dossiers ready: ${generated.length} generated, ${preserved.length} existing route(s) preserved.`);
