const fs = require('fs');
const path = require('path');

const root = process.cwd();
const registryPath = path.join(root, 'data', 'criminal-conduct-registry.json');
const downloadsDir = path.join(root, 'downloads');
const START = '<!-- criminal-conduct-engine:start -->';
const END = '<!-- criminal-conduct-engine:end -->';
const today = new Date().toISOString().slice(0, 10);

if (!fs.existsSync(registryPath)) throw new Error('Missing data/criminal-conduct-registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
if (registry.schemaVersion !== 1 || !registry.categories || !registry.subjects) throw new Error('Invalid criminal conduct registry schema');
fs.mkdirSync(downloadsDir, { recursive: true });

const excludedNames = new Set([
  'index.html', 'death-files.html', 'subject-index.html', 'entities.html', 'investigations.html',
  'dossier-packs.html', 'books.html', 'search.html', 'forum.html', 'trust-center.html',
  'evidence-vault.html', 'source-document-vault.html', 'download-center.html'
]);
const explicitPattern = /^(?:death-file-(?!s(?:-|\.))|subject-|dossier-|dossier-pack-|profile-|person-|institution-|entity-|company-|foundation-|atlas-|authority-).+\.html$/i;
const semanticPattern = /data-death-dossier=|Subject Intelligence Hub|Person Dossier|Institution Dossier|Entity Dossier|Company Dossier|Foundation Dossier|Intelligence Dossier|Criminal Dossier/i;

function esc(value = '') {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function stripHtml(value = '') {
  return String(value || '').replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}
function normalize(value = '') {
  return stripHtml(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function extractTitle(html, file) {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const raw = stripHtml(h1 || title || path.basename(file, '.html').replace(/[-_]/g, ' '));
  return raw.replace(/\s*\|\s*Matrix Reprogrammed.*$/i, '').replace(/^THE\s+/i, '').replace(/[.\s]+$/, '').trim();
}
function dossierType(file, html) {
  const name = path.basename(file).toLowerCase();
  if (name.startsWith('death-file-') || /Person Dossier|data-death-dossier=/i.test(html)) return 'person';
  if (/^(institution|company|foundation|authority|atlas)-/.test(name) || /Institution Dossier|Company Dossier|Foundation Dossier/i.test(html)) return 'institution';
  if (/^entity-/.test(name) || /Entity Dossier/i.test(html)) return 'entity';
  return 'subject';
}
function isDossier(file, html) {
  const name = path.basename(file).toLowerCase();
  if (excludedNames.has(name)) return false;
  if (/^(?:death-files-year-|death-files-pattern-|death-files-methodology)/i.test(name)) return false;
  return explicitPattern.test(name) || semanticPattern.test(html);
}
function walkHtml(base) {
  if (!fs.existsSync(base)) return [];
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'downloads') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) files.push(full);
    }
  }
  walk(base);
  return files;
}
function keyCandidates(route, title) {
  const base = path.basename(route, '.html');
  return [route, base, normalize(base), title, normalize(title)].filter(Boolean);
}
function subjectConfig(route, title) {
  const subjects = registry.subjects || {};
  for (const key of keyCandidates(route, title)) {
    if (subjects[key]) return subjects[key];
  }
  for (const value of Object.values(subjects)) {
    const aliases = [value.route, value.slug, value.name, value.title, ...(value.aliases || [])].map(normalize).filter(Boolean);
    if (aliases.includes(normalize(title)) || aliases.includes(normalize(path.basename(route, '.html')))) return value;
  }
  return { name: title, aliases: [], records: [] };
}
function validateApprovedRecord(record, subjectName) {
  if (record.publicationStatus !== 'approved') return false;
  const required = ['id', 'category', 'title', 'summary', 'sourceLabel', 'sourceUrl', 'date', 'status', 'evidenceGrade', 'lastChecked', 'boundary'];
  const missing = required.filter(field => !String(record[field] || '').trim());
  if (missing.length) throw new Error(`${subjectName}: approved criminal-conduct record ${record.id || '(no id)'} missing ${missing.join(', ')}`);
  if (!registry.categories[record.category]) throw new Error(`${subjectName}: record ${record.id} has unknown category ${record.category}`);
  if (!/^https?:\/\//i.test(record.sourceUrl)) throw new Error(`${subjectName}: record ${record.id} requires an absolute source URL`);
  if (record.category === 'conviction_final_judgment' && !/(adjudicated|convicted|guilty|final judgment|sentenced)/i.test(`${record.status} ${record.outcome || ''}`)) {
    throw new Error(`${subjectName}: conviction record ${record.id} lacks an adjudicated disposition`);
  }
  if (record.category === 'rumor_speculation') {
    for (const field of ['counterEvidence', 'proofNeeded', 'rightOfReply']) {
      if (!String(record[field] || '').trim()) throw new Error(`${subjectName}: rumor/speculation record ${record.id} missing ${field}`);
    }
  }
  return true;
}
function approvedRecords(config, subjectName) {
  const seen = new Set();
  return (config.records || []).filter(record => validateApprovedRecord(record, subjectName)).filter(record => {
    if (seen.has(record.id)) throw new Error(`${subjectName}: duplicate criminal-conduct record ID ${record.id}`);
    seen.add(record.id);
    return true;
  });
}
function categoryBoundary(category) {
  return registry.categories[category]?.boundary || 'Open the cited source and preserve the evidence classification.';
}
function renderRecord(record) {
  const category = registry.categories[record.category];
  const reply = record.rightOfReply || 'No documented response located in the approved record.';
  const counter = record.counterEvidence || 'No separate counter-evidence field is recorded; read the disposition and source boundary.';
  const proof = record.proofNeeded || 'The cited record controls the present classification; further primary records may change it.';
  return `<article class="criminal-conduct-record" data-record-id="${esc(record.id)}" data-category="${esc(record.category)}"><div class="criminal-conduct-record__head"><span class="criminal-conduct-badge">${esc(category.label)}</span><span class="criminal-conduct-grade">Evidence ${esc(record.evidenceGrade)}</span></div><h4>${esc(record.title)}</h4><p>${esc(record.summary)}</p><dl><div><dt>Date</dt><dd>${esc(record.date)}</dd></div><div><dt>Jurisdiction</dt><dd>${esc(record.jurisdiction || 'Not stated')}</dd></div><div><dt>Status</dt><dd>${esc(record.status)}</dd></div><div><dt>Outcome</dt><dd>${esc(record.outcome || 'Not yet determined or not stated')}</dd></div><div><dt>Source authority</dt><dd>${esc(record.sourceAuthority || 'Attributed public source')}</dd></div><div><dt>Last checked</dt><dd>${esc(record.lastChecked)}</dd></div></dl><p><strong>Right of reply / response:</strong> ${esc(reply)}</p><p><strong>Counter-evidence / limitation:</strong> ${esc(counter)}</p><p><strong>Proof needed:</strong> ${esc(proof)}</p><p class="criminal-conduct-boundary"><strong>Boundary:</strong> ${esc(record.boundary || categoryBoundary(record.category))}</p><a class="btn alt" href="${esc(record.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open cited source: ${esc(record.sourceLabel)}</a></article>`;
}
function renderEngine(route, title, type, records) {
  const counts = Object.fromEntries(Object.keys(registry.categories).map(category => [category, records.filter(record => record.category === category).length]));
  const adjudicated = counts.conviction_final_judgment || 0;
  const officialPending = (counts.charge_indictment_complaint || 0) + (counts.investigation_inquiry || 0);
  const speculative = (counts.suspected_conduct || 0) + (counts.rumor_speculation || 0);
  const categorySections = Object.entries(registry.categories).map(([key, category]) => {
    const categoryRecords = records.filter(record => record.category === key);
    const empty = `<p class="criminal-conduct-empty">No editorially approved ${esc(category.label.toLowerCase())} record is currently attached to this dossier.</p>`;
    return `<section class="criminal-conduct-category" data-category="${esc(key)}"><h3>${esc(category.label)} <span>${categoryRecords.length}</span></h3><p class="criminal-conduct-category__boundary">${esc(category.boundary)}</p>${categoryRecords.length ? categoryRecords.map(renderRecord).join('') : empty}</section>`;
  }).join('');
  return `${START}<style id="criminal-conduct-engine-style">.criminal-conduct-engine{margin:2rem auto;border:1px solid rgba(255,75,75,.45);background:rgba(7,7,10,.94);box-shadow:0 0 30px rgba(165,0,0,.16)}.criminal-conduct-engine>summary{cursor:pointer;list-style:none;padding:1.15rem 1.25rem;font-weight:900;letter-spacing:.06em;text-transform:uppercase;display:flex;justify-content:space-between;gap:1rem;align-items:center}.criminal-conduct-engine>summary::-webkit-details-marker{display:none}.criminal-conduct-engine>summary:after{content:'+';font-size:1.5rem;color:#ff5454}.criminal-conduct-engine[open]>summary:after{content:'−'}.criminal-conduct-engine__body{padding:0 1.25rem 1.4rem}.criminal-conduct-status{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.75rem;margin:1rem 0}.criminal-conduct-status div,.criminal-conduct-category,.criminal-conduct-record{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.025);padding:1rem}.criminal-conduct-status strong{display:block;font-size:1.35rem;color:#ff6464}.criminal-conduct-category{margin:1rem 0}.criminal-conduct-category h3{display:flex;justify-content:space-between;gap:1rem}.criminal-conduct-category h3 span,.criminal-conduct-badge,.criminal-conduct-grade{border:1px solid rgba(255,80,80,.45);padding:.18rem .5rem;font-size:.72rem;letter-spacing:.05em;text-transform:uppercase}.criminal-conduct-record{margin:1rem 0}.criminal-conduct-record__head{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:space-between}.criminal-conduct-record dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.65rem}.criminal-conduct-record dt{font-size:.72rem;text-transform:uppercase;opacity:.7}.criminal-conduct-record dd{margin:0}.criminal-conduct-boundary,.criminal-conduct-warning{border-left:3px solid #ff4b4b;padding-left:.8rem}.criminal-conduct-empty{opacity:.72;font-style:italic}.criminal-conduct-rules{font-size:.92rem;opacity:.9}@media(max-width:640px){.criminal-conduct-engine>summary{align-items:flex-start;flex-direction:column}.criminal-conduct-engine__body{padding-left:.8rem;padding-right:.8rem}}</style><section class="section wrap criminal-conduct-engine-shell" data-criminal-conduct-route="${esc(route)}" data-subject-type="${esc(type)}"><details class="criminal-conduct-engine"><summary><span>Criminal Conduct &amp; Allegations</span><small>${records.length} approved record${records.length === 1 ? '' : 's'}</small></summary><div class="criminal-conduct-engine__body"><p class="criminal-conduct-warning"><strong>Legal and evidence boundary:</strong> This panel separates adjudicated outcomes from accusations, inquiries, civil actions, analytical hypotheses, rumors and speculation. Charges and investigations are not proof of guilt. Association is not wrongdoing. Read every cited source, disposition, response and limitation.</p><div class="criminal-conduct-status"><div><strong>${adjudicated}</strong> adjudicated criminal outcome${adjudicated === 1 ? '' : 's'}</div><div><strong>${officialPending}</strong> charge / indictment / inquiry record${officialPending === 1 ? '' : 's'}</div><div><strong>${speculative}</strong> suspected / rumor / speculation record${speculative === 1 ? '' : 's'}</div><div><strong>${records.length}</strong> total editorially approved record${records.length === 1 ? '' : 's'}</div></div>${records.length ? '' : `<p class="criminal-conduct-empty"><strong>No sourced conduct record is currently attached.</strong> This is not a declaration of innocence, clearance, guilt or wrongdoing; it means the editorial registry has no approved entry for this dossier at the present check.</p>`}${categorySections}<details class="criminal-conduct-rules"><summary>Classification rules, corrections and right of reply</summary><ul>${(registry.rules || []).map(rule => `<li>${esc(rule)}</li>`).join('')}</ul><p>Corrections, updated dispositions and documented responses must be added to the same subject record rather than silently replacing earlier history. Registry checked ${esc(today)}.</p></details></div></details></section>${END}`;
}
function removeExisting(html) {
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start >= 0 && end > start) return html.slice(0, start) + html.slice(end + END.length);
  return html;
}
function inject(html, block) {
  const clean = removeExisting(html);
  if (/<\/main>/i.test(clean)) return clean.replace(/<\/main>/i, `${block}</main>`);
  if (/<footer\b/i.test(clean)) return clean.replace(/<footer\b/i, `${block}<footer`);
  if (/<\/body>/i.test(clean)) return clean.replace(/<\/body>/i, `${block}</body>`);
  return `${clean}\n${block}\n`;
}
function ledgerCandidates(targets) {
  const ledgerPath = path.join(root, 'data', 'investigation-ledger.json');
  if (!fs.existsSync(ledgerPath)) return [];
  let ledger;
  try { ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); } catch { return []; }
  const findings = Array.isArray(ledger.findings) ? ledger.findings : [];
  const officialStatuses = new Set(['established-wrongdoing', 'official-enforcement', 'official-charge-or-allegation', 'official-audit-finding']);
  const categoryFor = finding => {
    const text = `${finding.title || ''} ${finding.summary || ''} ${finding.status || ''}`;
    if (finding.status === 'established-wrongdoing' && /convicted|sentenced|guilty plea|pled guilty|criminal conviction/i.test(text)) return 'conviction_final_judgment';
    if (finding.status === 'official-charge-or-allegation') return 'charge_indictment_complaint';
    if (finding.status === 'official-enforcement') return 'civil_regulatory_action';
    if (finding.status === 'official-audit-finding') return 'investigation_inquiry';
    return null;
  };
  const queue = [];
  for (const target of targets) {
    const name = normalize(target.title);
    if (name.length < 5) continue;
    const phrase = new RegExp(`(^|[^a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[^a-z0-9]+')}([^a-z0-9]|$)`, 'i');
    for (const finding of findings) {
      if (!officialStatuses.has(finding.status) || !/^primary-official/.test(String(finding.sourceAuthority || ''))) continue;
      const category = categoryFor(finding);
      if (!category) continue;
      const hay = normalize(`${finding.title || ''} ${finding.summary || ''}`);
      if (!phrase.test(hay)) continue;
      queue.push({
        publicationStatus: 'requires-editorial-review',
        subject: target.title,
        route: target.route,
        subjectType: target.type,
        candidateCategory: category,
        findingId: finding.id,
        title: finding.title,
        summary: finding.summary,
        sourceLabel: finding.sourceLabel,
        sourceUrl: finding.itemUrl || finding.sourceUrl,
        sourceAuthority: finding.sourceAuthority,
        date: finding.published,
        status: finding.status,
        evidenceGrade: finding.evidenceGrade,
        establishes: finding.establishes,
        boundary: finding.boundary,
        reviewRule: 'Do not publish until identity, accused party, legal posture, disposition, jurisdiction, right of reply and source scope are manually confirmed.'
      });
    }
  }
  const seen = new Set();
  return queue.filter(item => {
    const key = `${item.route}|${item.findingId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const bases = [{ label: 'source', dir: root }];
const site = path.join(root, '_site');
if (fs.existsSync(site)) bases.push({ label: 'built', dir: site });
const report = { ok: true, generatedAt: new Date().toISOString(), registryUpdated: registry.updated, surfaces: [], counts: { source: 0, built: 0, records: 0 } };
const targetMap = new Map();

for (const base of bases) {
  for (const file of walkHtml(base.dir)) {
    if (base.label === 'source' && file.startsWith(site + path.sep)) continue;
    let html = fs.readFileSync(file, 'utf8');
    if (!isDossier(file, html)) continue;
    const route = path.relative(base.dir, file).replace(/\\/g, '/');
    const title = extractTitle(html, file);
    const type = dossierType(file, html);
    const config = subjectConfig(route, title);
    const records = approvedRecords(config, title);
    const block = renderEngine(route, title, type, records);
    const output = inject(html, block);
    if (output !== html) fs.writeFileSync(file, output);
    report.surfaces.push({ scope: base.label, route, title, type, approvedRecords: records.length });
    report.counts[base.label]++;
    report.counts.records += records.length;
    if (base.label === 'source') targetMap.set(route, { route, title, type });
  }
}

if (report.counts.source < 1) throw new Error('Criminal conduct engine found no dossier surfaces; target detection failed closed.');
const candidates = ledgerCandidates([...targetMap.values()]);
fs.writeFileSync(path.join(downloadsDir, 'criminal-conduct-review-queue.json'), `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  publicationStatus: 'requires-editorial-review',
  count: candidates.length,
  boundary: 'These are machine-matched official-record candidates. They are not published allegations and must be manually verified before entering the approved registry.',
  candidates
}, null, 2)}\n`);
report.reviewCandidates = candidates.length;
fs.writeFileSync(path.join(downloadsDir, 'criminal-conduct-engine-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Criminal Conduct & Allegations engine installed on ${report.counts.source} source dossier surfaces${report.counts.built ? ` and ${report.counts.built} built surfaces` : ''}; ${report.counts.records} approved records rendered; ${candidates.length} candidates held for editorial review.`);
