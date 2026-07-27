'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const registryPath = path.join(root, 'data', 'criminal-conduct-registry.json');
const reportDataPath = path.join(root, 'data', 'criminal-status-dossier-coverage.json');
const reportDownloadPath = path.join(root, 'downloads', 'criminal-status-dossier-coverage.json');
const START = '<!-- criminal-safeguarding-status:start -->';
const END = '<!-- criminal-safeguarding-status:end -->';
const TARGET = 100;

function readJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function array(value) { return Array.isArray(value) ? value : []; }
function clean(value, maximum = 2400) {
  return String(value == null ? '' : value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}
function esc(value = '') {
  return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function normalize(value = '') {
  return clean(value, 500).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\b(?:criminal investigation|intelligence dossier|complete dossier|dossier|profile|brief|historical case|current case)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function relative(file) { return path.relative(root, file).replace(/\\/g, '/'); }
function hrefFrom(route, target) {
  const fromDirectory = path.posix.dirname(String(route || '').replace(/\\/g, '/'));
  const result = path.posix.relative(fromDirectory === '.' ? '' : fromDirectory, String(target || '').replace(/\\/g, '/'));
  return result || path.posix.basename(target);
}
function walk(directory, files = []) {
  const excluded = new Set(['.git', '.github', 'node_modules', 'data', 'downloads', 'scripts', 'tools', 'tests', 'functions', 'workers', '.wrangler', '.cache', '_cloudflare-site', '.netlify', 'dist', 'build']);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
    if (entry.isDirectory() && excluded.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && /\.html$/i.test(entry.name)) files.push(full);
  }
  return files;
}
function isDossierRoute(route, html) {
  const base = path.basename(route).toLowerCase();
  if (base === 'index.html') return false;
  if (/^(?:dossier|profile|person|entity)-.+\.html$/.test(base)) return true;
  if (/(?:^|\/)(?:billionaire|institution|family|contractor|agency|people|person|company)-briefs\//i.test(route)) return true;
  if (/\b(?:dossier|subject profile|person profile|institution profile|family profile|intelligence brief)\b/i.test((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [,''])[1])) return true;
  return false;
}
function titleFrom(html, route) {
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [,''])[1];
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [,''])[1];
  return clean(h1 || String(title).split('|')[0] || path.basename(route, '.html').replace(/[-_]/g, ' '), 500);
}
function categoriesFor(subject, categories) {
  return unique(array(subject.records).filter(record => record.publicationStatus === 'approved').map(record => categories[record.category]?.label || record.category));
}
function panelFor(route, title, subject, categories) {
  const approved = subject ? array(subject.records).filter(record => record.publicationStatus === 'approved') : [];
  const known = Boolean(subject);
  const exactStatus = known
    ? clean(subject.legalStatusSummary, 1600)
    : 'No approved criminal-conduct, safeguarding, civil, regulatory or official-inquiry record is currently linked to this dossier in the authoritative registry.';
  const boundary = known
    ? clean(subject.conclusion?.doesNotProve || 'Read each record only within its exact legal and evidential status. Association and proximity do not establish wrongdoing.', 1400)
    : 'This is not a clearance statement, proof of a clean record or exoneration. It means no matching record has passed the source, identity, legal-status and editorial publication standard in this build.';
  const routeLink = hrefFrom(route, known && subject.dossierRoute ? subject.dossierRoute : 'criminal-investigations.html');
  const predatorsLink = hrefFrom(route, 'predators-in-power.html');
  const signalLink = `${predatorsLink}#pip-signal-drop`;
  const categoryBadges = known
    ? categoriesFor(subject, categories).map(value => `<span class="criminal-status-badge">${esc(value)}</span>`).join('')
    : '<span class="criminal-status-badge">No approved linked record</span>';
  return `${START}<section class="section wrap criminal-status-system" data-criminal-status-route="${esc(route)}" data-criminal-status-match="${known ? 'approved-registry-subject' : 'no-approved-match'}"><style>.criminal-status-system{margin-top:1.25rem}.criminal-status-shell{border:1px solid rgba(255,78,78,.48);background:radial-gradient(circle at 15% 0,rgba(130,0,0,.2),transparent 42%),rgba(6,6,10,.96);padding:1rem;box-shadow:0 0 30px rgba(120,0,0,.14)}.criminal-status-top{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap}.criminal-status-badge{display:inline-block;border:1px solid rgba(255,85,85,.52);padding:.22rem .48rem;margin:.14rem;font-size:.7rem;text-transform:uppercase;letter-spacing:.05em}.criminal-status-boundary{border-left:3px solid #ff5050;padding-left:.8rem}.criminal-status-actions{display:flex;gap:.55rem;flex-wrap:wrap;margin-top:.8rem}</style><div class="criminal-status-shell"><div class="criminal-status-top"><div><span class="label">Criminal & Safeguarding Status</span><h2>${esc(title)}</h2></div><div>${categoryBadges}</div></div><h3>Exact status in the authoritative registry</h3><p>${esc(exactStatus)}</p><p><strong>Approved public records:</strong> ${approved.length}</p><p class="criminal-status-boundary"><strong>Evidence boundary:</strong> ${esc(boundary)}</p><div class="criminal-status-actions"><a class="btn" href="${esc(routeLink)}">${known ? 'Open Complete Criminal Dossier' : 'Open Criminal Investigations'}</a><a class="btn alt" href="${esc(predatorsLink)}">Predators in Power</a><a class="btn alt" href="${esc(signalLink)}">Submit Evidence or Correction</a></div></div></section>${END}`;
}
function replaceOrInsert(html, panel) {
  const pattern = new RegExp(`${START}[\\s\\S]*?${END}`, 'g');
  if (pattern.test(html)) return html.replace(pattern, panel);
  if (/<\/main>/i.test(html)) return html.replace(/<\/main>/i, `${panel}</main>`);
  if (/<footer\b/i.test(html)) return html.replace(/<footer\b/i, `${panel}<footer`);
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${panel}</body>`);
  return `${html}${panel}`;
}

if (!fs.existsSync(registryPath)) throw new Error('Missing authoritative criminal-conduct registry.');
const registry = readJson(registryPath, { subjects: {}, categories: {} });
const subjects = Object.entries(registry.subjects || {}).map(([key, subject]) => ({ key, ...subject }));
const lookup = new Map();
for (const subject of subjects) {
  for (const value of [subject.name, subject.key, path.basename(subject.dossierRoute || '', '.html'), ...array(subject.aliases)]) {
    const key = normalize(value);
    if (key) lookup.set(key, subject);
  }
}

const pages = walk(root).map(file => ({ file, route: relative(file), html: fs.readFileSync(file, 'utf8') })).filter(item => isDossierRoute(item.route, item.html));
const coverage = [];
for (const page of pages) {
  const title = titleFrom(page.html, page.route);
  const routeMatch = subjects.find(subject => subject.dossierRoute === page.route);
  const subject = routeMatch || lookup.get(normalize(title)) || null;
  const panel = panelFor(page.route, title, subject, registry.categories || {});
  const updated = replaceOrInsert(page.html, panel);
  if (updated !== page.html) fs.writeFileSync(page.file, updated);
  coverage.push({ route: page.route, title, matchedSubject: subject?.name || '', matchStatus: subject ? 'approved-registry-subject' : 'no-approved-match', approvedRecords: subject ? array(subject.records).filter(record => record.publicationStatus === 'approved').length : 0, criminalDossierRoute: subject?.dossierRoute || '', statusPanelPresent: updated.includes(START) });
}

const approvedSubjects = subjects.filter(subject => subject.predatorsInPowerEligible === true && array(subject.records).some(record => record.publicationStatus === 'approved'));
const missingNativeRoutes = approvedSubjects.filter(subject => subject.dossierRoute && !fs.existsSync(path.join(root, subject.dossierRoute))).map(subject => subject.dossierRoute);
const missingPanels = coverage.filter(item => !item.statusPanelPresent).map(item => item.route);
const report = {
  ok: missingNativeRoutes.length === 0 && missingPanels.length === 0 && coverage.length > 0,
  generatedAt: new Date().toISOString(),
  policy: 'Every dossier receives a criminal and safeguarding status panel. No-match is not presented as clearance or exoneration.',
  minimumPredatorsInPowerTarget: TARGET,
  approvedPredatorsInPowerDossiers: approvedSubjects.length,
  remainingToTarget: Math.max(0, TARGET - approvedSubjects.length),
  targetReached: approvedSubjects.length >= TARGET,
  dossierPagesDetected: coverage.length,
  registryMatchedPages: coverage.filter(item => item.matchedSubject).length,
  noApprovedMatchPages: coverage.filter(item => !item.matchedSubject).length,
  missingNativeRoutes,
  missingPanels,
  coverage
};
fs.mkdirSync(path.dirname(reportDataPath), { recursive: true });
fs.mkdirSync(path.dirname(reportDownloadPath), { recursive: true });
fs.writeFileSync(reportDataPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(reportDownloadPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error(`Criminal dossier coverage failed: ${missingNativeRoutes.length} approved dossier routes and ${missingPanels.length} status panels are missing.`);
console.log(`Criminal status injected into ${coverage.length} dossier pages; ${approvedSubjects.length}/${TARGET} approved Predators in Power dossiers built.`);
