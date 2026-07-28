'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const registryPath = path.join(root, 'data', 'criminal-conduct-registry.json');
const reportPath = path.join(root, 'downloads', 'universal-criminal-dossier-coverage.json');
const START = '<!-- criminal-conduct-engine:start -->';
const END = '<!-- criminal-conduct-engine:end -->';
const MAX_TEXT_BYTES = 6 * 1024 * 1024;

if (!fs.existsSync(registryPath)) throw new Error('Missing data/criminal-conduct-registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
if (![1, 2].includes(Number(registry.schemaVersion || 0)) || !registry.categories || !registry.subjects) {
  throw new Error('Invalid criminal conduct registry schema for universal dossier coverage');
}

const skippedDirs = new Set([
  '.git', '.github', 'node_modules', '.wrangler', 'downloads', 'browsertrix-output',
  'evidence-archive', 'source-snapshots'
]);

const excludedBasenames = new Set([
  'index.html', 'index', '404.html', '404',
  'death-files.html', 'death-files', 'subject-index.html', 'subject-index',
  'entities.html', 'entities', 'investigations.html', 'investigations',
  'dossier-packs.html', 'dossier-packs', 'books.html', 'books',
  'search.html', 'search', 'forum.html', 'forum',
  'trust-center.html', 'trust-center', 'evidence-vault.html', 'evidence-vault',
  'source-document-vault.html', 'source-document-vault',
  'download-center.html', 'download-center', 'predators-in-power.html', 'predators-in-power'
]);

const explicitPrefix = /^(?:death-file-(?!s(?:-|\.|$))|subject-|dossier-(?!packs?(?:\.|$))|dossier-pack-|profile-|person-|family-|institution-|entity-|company-|foundation-|property-|estate-|trust-|fund-|bank-|organisation-|organization-|agency-|government-|authority-|church-|religious-|university-|school-|media-|network-|operation-|case-|investigation-|atlas-|group-|ngo-|corporation-|charity-|think-tank-).+/i;
const semanticPattern = /data-(?:death|person|family|institution|entity|company|foundation|property|subject)-dossier\s*=|(?:Person|Family|Institution|Entity|Company|Foundation|Property|Estate|Trust|Fund|Bank|Organisation|Organization|Agency|Authority|Church|University|Network|Criminal|Intelligence|Subject|Death)\s+Dossier/i;
const genericDossierTitle = /<(?:title|h1|h2|div|span)\b[^>]*>[^<]{0,180}\bDossier\b[^<]{0,180}<\/(?:title|h1|h2|div|span)>/i;
const archivePattern = /(?:\barchive\b|\bindex\b|\bmethodology\b|\bpattern\s+lab\b|\byear\s+\d{4}\b|\bcatalog(?:ue)?\b|\bdirectory\b|\bsearch\b)/i;

function esc(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function stripHtml(value = '') {
  return String(value || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ').trim();
}

function normalize(value = '') {
  return stripHtml(value).toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function count(text, token) {
  return String(text).split(token).length - 1;
}

function walkFiles(base) {
  const out = [];
  if (!fs.existsSync(base)) return out;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && skippedDirs.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === '.html' || ext === '.htm' || !ext) out.push(full);
    }
  }
  walk(base);
  return out;
}

function readHtml(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_TEXT_BYTES) return '';
    const text = fs.readFileSync(file, 'utf8');
    return /<html\b|<!doctype\s+html|<main\b|<body\b/i.test(text) ? text : '';
  } catch {
    return '';
  }
}

function basenameWithoutHtml(file) {
  return path.basename(file).replace(/\.html?$/i, '');
}

function extractTitle(html, file) {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const raw = stripHtml(h1 || title || basenameWithoutHtml(file).replace(/[-_]/g, ' '));
  return raw
    .replace(/\s*\|\s*Matrix Reprogrammed.*$/i, '')
    .replace(/^THE\s+/i, '')
    .replace(/[.\s]+$/, '')
    .trim();
}

function dossierType(file, html) {
  const name = basenameWithoutHtml(file).toLowerCase();
  const text = `${name} ${stripHtml(html.slice(0, 12000))}`.toLowerCase();
  if (/^death-file-|data-death-dossier=|death dossier|person dossier/.test(text)) return 'person';
  if (/^family-|data-family-dossier=|family dossier/.test(text)) return 'family';
  if (/^property-|^estate-|data-property-dossier=|property dossier|estate dossier/.test(text)) return 'property';
  if (/^company-|^corporation-|company dossier|corporation dossier/.test(text)) return 'company';
  if (/^foundation-|^charity-|^ngo-|foundation dossier|charity dossier|ngo dossier/.test(text)) return 'foundation';
  if (/^institution-|^agency-|^government-|^authority-|^bank-|^trust-|^fund-|^church-|^religious-|^university-|^school-|^media-|institution dossier|agency dossier|authority dossier|bank dossier|trust dossier|fund dossier|church dossier|university dossier/.test(text)) return 'institution';
  if (/^network-|^group-|^operation-|^investigation-|network dossier|operation dossier|investigation dossier/.test(text)) return 'network';
  if (/^entity-|data-entity-dossier=|entity dossier/.test(text)) return 'entity';
  return 'subject';
}

function isDossier(file, html) {
  const base = path.basename(file).toLowerCase();
  const stem = basenameWithoutHtml(file).toLowerCase();
  if (excludedBasenames.has(base) || excludedBasenames.has(stem)) return false;
  if (/^(?:death-files-year-|death-files-pattern-|death-files-methodology|dossier-index-|dossier-archive-)/i.test(stem)) return false;

  if (explicitPrefix.test(stem)) return true;
  if (semanticPattern.test(html)) return true;

  if (genericDossierTitle.test(html)) {
    const heading = stripHtml(
      html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
      html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''
    );
    if (!archivePattern.test(heading)) return true;
  }
  return false;
}

function keyCandidates(route, title) {
  const base = route.replace(/\.html?$/i, '');
  const leaf = path.basename(base);
  return [route, base, leaf, normalize(route), normalize(base), normalize(leaf), title, normalize(title)]
    .filter(Boolean);
}

function subjectConfig(route, title) {
  const subjects = registry.subjects || {};
  for (const key of keyCandidates(route, title)) {
    if (subjects[key]) return subjects[key];
  }
  const normalizedTitle = normalize(title);
  const normalizedLeaf = normalize(path.basename(route.replace(/\.html?$/i, '')));
  for (const value of Object.values(subjects)) {
    const aliases = [
      value.route, value.slug, value.name, value.title, ...(value.aliases || [])
    ].map(normalize).filter(Boolean);
    if (aliases.includes(normalizedTitle) || aliases.includes(normalizedLeaf)) return value;
  }
  return { name: title, aliases: [], records: [] };
}

function approvedRecords(config, subjectName) {
  const seen = new Set();
  return (config.records || []).filter(record => {
    if (record.publicationStatus !== 'approved') return false;
    const required = [
      'id', 'category', 'title', 'summary', 'sourceLabel', 'sourceUrl',
      'date', 'status', 'evidenceGrade', 'lastChecked', 'boundary'
    ];
    const missing = required.filter(field => !String(record[field] || '').trim());
    if (missing.length) {
      throw new Error(`${subjectName}: approved criminal-conduct record ${record.id || '(no id)'} missing ${missing.join(', ')}`);
    }
    if (!registry.categories[record.category]) {
      throw new Error(`${subjectName}: record ${record.id} has unknown category ${record.category}`);
    }
    if (seen.has(record.id)) throw new Error(`${subjectName}: duplicate criminal-conduct record ID ${record.id}`);
    seen.add(record.id);
    return true;
  });
}

function categoryBoundary(key) {
  return registry.categories[key]?.boundary || 'Open the cited source and preserve the evidence classification.';
}

function renderRecord(record) {
  const category = registry.categories[record.category];
  return `<article class="criminal-conduct-record" data-record-id="${esc(record.id)}" data-category="${esc(record.category)}"><div class="criminal-conduct-record__head"><span class="criminal-conduct-badge">${esc(category.label)}</span><span class="criminal-conduct-grade">Evidence ${esc(record.evidenceGrade)}</span></div><h4>${esc(record.title)}</h4><p>${esc(record.summary)}</p><dl><div><dt>Date</dt><dd>${esc(record.date)}</dd></div><div><dt>Jurisdiction</dt><dd>${esc(record.jurisdiction || 'Not stated')}</dd></div><div><dt>Status</dt><dd>${esc(record.status)}</dd></div><div><dt>Outcome</dt><dd>${esc(record.outcome || 'Not yet determined or not stated')}</dd></div><div><dt>Source authority</dt><dd>${esc(record.sourceAuthority || 'Attributed public source')}</dd></div><div><dt>Last checked</dt><dd>${esc(record.lastChecked)}</dd></div></dl><p><strong>Right of reply / response:</strong> ${esc(record.rightOfReply || 'No documented response located in the approved record.')}</p><p><strong>Counter-evidence / limitation:</strong> ${esc(record.counterEvidence || 'No separate counter-evidence field is recorded; read the disposition and source boundary.')}</p><p><strong>Proof needed:</strong> ${esc(record.proofNeeded || 'The cited record controls the present classification; further primary records may change it.')}</p><p class="criminal-conduct-boundary"><strong>Boundary:</strong> ${esc(record.boundary || categoryBoundary(record.category))}</p><a class="btn alt" href="${esc(record.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open cited source: ${esc(record.sourceLabel)}</a></article>`;
}

function renderBlock(route, title, type, records, mode) {
  const counts = Object.fromEntries(
    Object.keys(registry.categories).map(key => [key, records.filter(record => record.category === key).length])
  );
  const adjudicated = (counts.conviction_final_judgment || 0) + (counts.canonical_penal_judgment || 0);
  const officialPending = (counts.charge_indictment_complaint || 0) + (counts.investigation_inquiry || 0);
  const speculative = (counts.suspected_conduct || 0) + (counts.rumor_speculation || 0);
  const categories = Object.entries(registry.categories).map(([key, category]) => {
    const matched = records.filter(record => record.category === key);
    const body = matched.length
      ? matched.map(renderRecord).join('')
      : `<p class="criminal-conduct-empty">No editorially approved ${esc(category.label.toLowerCase())} record is currently attached to this dossier.</p>`;
    return `<section class="criminal-conduct-category" data-category="${esc(key)}"><h3>${esc(category.label)} <span>${matched.length}</span></h3><p class="criminal-conduct-category__boundary">${esc(category.boundary)}</p>${body}</section>`;
  }).join('');

  return `${START}<style id="criminal-conduct-engine-style">.criminal-conduct-engine{margin:2rem auto;border:1px solid rgba(255,75,75,.45);background:rgba(7,7,10,.94);box-shadow:0 0 30px rgba(165,0,0,.16)}.criminal-conduct-engine>summary{cursor:pointer;list-style:none;padding:1.15rem 1.25rem;font-weight:900;letter-spacing:.06em;text-transform:uppercase;display:flex;justify-content:space-between;gap:1rem;align-items:center}.criminal-conduct-engine>summary::-webkit-details-marker{display:none}.criminal-conduct-engine>summary:after{content:'+';font-size:1.5rem;color:#ff5454}.criminal-conduct-engine[open]>summary:after{content:'−'}.criminal-conduct-engine__body{padding:0 1.25rem 1.4rem}.criminal-conduct-status{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.75rem;margin:1rem 0}.criminal-conduct-status div,.criminal-conduct-category,.criminal-conduct-record{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.025);padding:1rem}.criminal-conduct-status strong{display:block;font-size:1.35rem;color:#ff6464}.criminal-conduct-category{margin:1rem 0}.criminal-conduct-category h3{display:flex;justify-content:space-between;gap:1rem}.criminal-conduct-category h3 span,.criminal-conduct-badge,.criminal-conduct-grade{border:1px solid rgba(255,80,80,.45);padding:.18rem .5rem;font-size:.72rem;letter-spacing:.05em;text-transform:uppercase}.criminal-conduct-record{margin:1rem 0}.criminal-conduct-record__head{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:space-between}.criminal-conduct-record dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.65rem}.criminal-conduct-record dt{font-size:.72rem;text-transform:uppercase;opacity:.7}.criminal-conduct-record dd{margin:0}.criminal-conduct-boundary,.criminal-conduct-warning{border-left:3px solid #ff4b4b;padding-left:.8rem}.criminal-conduct-empty{opacity:.72;font-style:italic}.criminal-conduct-rules{font-size:.92rem;opacity:.9}@media(max-width:640px){.criminal-conduct-engine>summary{align-items:flex-start;flex-direction:column}.criminal-conduct-engine__body{padding-left:.8rem;padding-right:.8rem}}</style><section class="section wrap criminal-conduct-engine-shell" data-criminal-conduct-route="${esc(route)}" data-subject-type="${esc(type)}" data-criminal-dossier-coverage="true" data-coverage-mode="${esc(mode)}"><details class="criminal-conduct-engine"><summary><span>Criminal Conduct &amp; Allegations</span><small>${records.length} approved record${records.length === 1 ? '' : 's'}</small></summary><div class="criminal-conduct-engine__body"><p class="criminal-conduct-warning"><strong>Legal and evidence boundary:</strong> This panel separates convictions and final judgments from charges, inquiries, civil actions, substantiated allegations, analytical hypotheses, rumors, speculation, acquittals, dismissals and reversals. Charges and investigations are not proof of guilt. Association is not wrongdoing. Read every cited source, disposition, response and limitation.</p><div class="criminal-conduct-status"><div><strong>${adjudicated}</strong> adjudicated outcome${adjudicated === 1 ? '' : 's'}</div><div><strong>${officialPending}</strong> charge / inquiry record${officialPending === 1 ? '' : 's'}</div><div><strong>${speculative}</strong> suspected / speculative record${speculative === 1 ? '' : 's'}</div><div><strong>${records.length}</strong> approved record${records.length === 1 ? '' : 's'}</div></div>${records.length ? '' : `<p class="criminal-conduct-empty"><strong>No verified criminal or safeguarding match is currently attached.</strong> This is not a declaration of innocence, clearance, guilt or wrongdoing. It means no editorially approved registry entry matched this dossier at the current build. The dossier remains inside the criminal-investigation census and will be rechecked when new evidence enters the ledger.</p>`}${categories}<details class="criminal-conduct-rules"><summary>Classification, correction and propagation rules</summary><ul>${(registry.rules || []).map(rule => `<li>${esc(rule)}</li>`).join('')}<li>Every dossier remains in the criminal-investigation census even when no approved record is found.</li><li>New evidence must update the dossier, timeline, relationship graph, relevant clocks, daily conclusions and review history without erasing prior dispositions.</li></ul><p><a class="btn alt" href="/source-document-vault.html">Search source documents</a> <a class="btn alt" href="/predators-in-power.html">Open Predators in Power</a> <a class="btn alt" href="/signal-drop.html">Submit a Signal Drop</a></p></details></div></details></section>${END}`;
}

function removeExisting(html) {
  let next = html;
  while (true) {
    const start = next.indexOf(START);
    const end = next.indexOf(END, start + START.length);
    if (start < 0 || end < 0) break;
    next = next.slice(0, start) + next.slice(end + END.length);
  }
  return next;
}

function inject(html, block) {
  const clean = removeExisting(html);
  if (/<\/main>/i.test(clean)) return clean.replace(/<\/main>/i, `${block}</main>`);
  if (/<footer\b/i.test(clean)) return clean.replace(/<footer\b/i, `${block}<footer`);
  if (/<\/body>/i.test(clean)) return clean.replace(/<\/body>/i, `${block}</body>`);
  return `${clean}\n${block}\n`;
}

const bases = [{ label: 'source', dir: root }];
if (fs.existsSync(site)) bases.push({ label: 'built', dir: site });

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  schemaVersion: registry.schemaVersion,
  compatibilitySchemaVersion: registry.compatibilitySchemaVersion || null,
  policy: {
    universalCoverage: true,
    requiredTypes: ['person', 'family', 'institution', 'company', 'foundation', 'property', 'entity', 'network', 'subject'],
    noMatchBoundaryRequired: true,
    automaticPublication: false
  },
  counts: { detected: 0, existing: 0, injected: 0, repaired: 0, approvedRecords: 0, source: 0, built: 0 },
  byType: {},
  surfaces: [],
  failures: []
};

for (const base of bases) {
  for (const file of walkFiles(base.dir)) {
    if (base.label === 'source' && file.startsWith(site + path.sep)) continue;
    const html = readHtml(file);
    if (!html || !isDossier(file, html)) continue;

    const route = path.relative(base.dir, file).replace(/\\/g, '/');
    const title = extractTitle(html, file);
    const type = dossierType(file, html);
    const records = approvedRecords(subjectConfig(route, title), title);
    const starts = count(html, START);
    const ends = count(html, END);
    const complete = starts === 1 && ends === 1 && html.includes('Criminal Conduct &amp; Allegations');

    let output = html;
    let action = 'existing';
    if (!complete) {
      output = inject(html, renderBlock(route, title, type, records, starts || ends ? 'universal-repair' : 'universal-injection'));
      fs.writeFileSync(file, output);
      action = starts || ends ? 'repaired' : 'injected';
    } else if (!html.includes('data-criminal-dossier-coverage="true"')) {
      output = html.replace(
        /data-criminal-conduct-route=(["'][^"']+["'])/,
        'data-criminal-dossier-coverage="true" data-coverage-mode="primary-engine" data-criminal-conduct-route=$1'
      );
      fs.writeFileSync(file, output);
      action = 'repaired';
    }

    const finalText = fs.readFileSync(file, 'utf8');
    const finalStarts = count(finalText, START);
    const finalEnds = count(finalText, END);
    const noMatchBoundary = records.length > 0 || finalText.includes('No verified criminal or safeguarding match is currently attached.') || finalText.includes('No sourced conduct record is currently attached.');

    if (finalStarts !== 1 || finalEnds !== 1) report.failures.push(`${base.label}/${route}: expected exactly one criminal engine block`);
    if (!finalText.includes('data-criminal-dossier-coverage="true"')) report.failures.push(`${base.label}/${route}: missing universal coverage marker`);
    if (!finalText.includes('Charges and investigations are not proof of guilt.')) report.failures.push(`${base.label}/${route}: missing presumption-of-innocence boundary`);
    if (!finalText.includes('Association is not wrongdoing.')) report.failures.push(`${base.label}/${route}: missing association boundary`);
    if (!noMatchBoundary) report.failures.push(`${base.label}/${route}: missing explicit no-match boundary`);

    report.counts.detected++;
    report.counts[base.label]++;
    report.counts[action]++;
    report.counts.approvedRecords += records.length;
    report.byType[type] = (report.byType[type] || 0) + 1;
    report.surfaces.push({
      scope: base.label, route, title, type, action,
      approvedRecords: records.length,
      noMatch: records.length === 0
    });
  }
}

if (report.counts.source < 1) report.failures.push('Universal criminal dossier census found no source dossier surfaces');
report.ok = report.failures.length === 0;
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!report.ok) {
  report.failures.forEach(item => console.error(`UNIVERSAL CRIMINAL DOSSIER COVERAGE FAILURE: ${item}`));
  process.exit(1);
}

console.log(`Universal criminal-investigation coverage passed: ${report.counts.source} source and ${report.counts.built} built dossier surfaces; ${report.counts.injected} injected, ${report.counts.repaired} repaired, ${report.counts.existing} already covered; ${report.counts.approvedRecords} approved record renderings.`);
