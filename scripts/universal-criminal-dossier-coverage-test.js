'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const registryPath = path.join(root, 'data', 'criminal-conduct-registry.json');
const coveragePath = path.join(root, 'downloads', 'universal-criminal-dossier-coverage.json');
const outputPath = path.join(root, 'downloads', 'universal-criminal-dossier-coverage-test.json');
const START = '<!-- criminal-conduct-engine:start -->';
const END = '<!-- criminal-conduct-engine:end -->';
const failures = [];
const MAX_TEXT_BYTES = 6 * 1024 * 1024;

function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing universal criminal coverage artifact: ${path.relative(root, file)}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const registry = readJson(registryPath);
const coverage = readJson(coveragePath);
const skippedDirs = new Set([
  '.git', '.github', 'node_modules', '.wrangler', 'downloads', 'browsertrix-output',
  'evidence-archive', 'source-snapshots'
]);
const excludedBasenames = new Set([
  'index.html', 'index', '404.html', '404', 'death-files.html', 'death-files',
  'subject-index.html', 'subject-index', 'entities.html', 'entities',
  'investigations.html', 'investigations', 'dossier-packs.html', 'dossier-packs',
  'books.html', 'books', 'search.html', 'search', 'forum.html', 'forum',
  'trust-center.html', 'trust-center', 'evidence-vault.html', 'evidence-vault',
  'source-document-vault.html', 'source-document-vault',
  'download-center.html', 'download-center', 'predators-in-power.html', 'predators-in-power'
]);
const explicitPrefix = /^(?:death-file-(?!s(?:-|\.|$))|subject-|dossier-(?!packs?(?:\.|$))|dossier-pack-|profile-|person-|family-|institution-|entity-|company-|foundation-|property-|estate-|trust-|fund-|bank-|organisation-|organization-|agency-|government-|authority-|church-|religious-|university-|school-|media-|network-|operation-|case-|investigation-|atlas-|group-|ngo-|corporation-|charity-|think-tank-).+/i;
const semanticPattern = /data-(?:death|person|family|institution|entity|company|foundation|property|subject)-dossier\s*=|(?:Person|Family|Institution|Entity|Company|Foundation|Property|Estate|Trust|Fund|Bank|Organisation|Organization|Agency|Authority|Church|University|Network|Criminal|Intelligence|Subject|Death)\s+Dossier/i;
const genericDossierTitle = /<(?:title|h1|h2|div|span)\b[^>]*>[^<]{0,180}\bDossier\b[^<]{0,180}<\/(?:title|h1|h2|div|span)>/i;
const archivePattern = /(?:\barchive\b|\bindex\b|\bmethodology\b|\bpattern\s+lab\b|\byear\s+\d{4}\b|\bcatalog(?:ue)?\b|\bdirectory\b|\bsearch\b)/i;

function count(text, token) {
  return String(text).split(token).length - 1;
}

function stripHtml(value = '') {
  return String(value || '').replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function stem(file) {
  return path.basename(file).replace(/\.html?$/i, '').toLowerCase();
}

function isDossier(file, html) {
  const base = path.basename(file).toLowerCase();
  const name = stem(file);
  if (excludedBasenames.has(base) || excludedBasenames.has(name)) return false;
  if (/^(?:death-files-year-|death-files-pattern-|death-files-methodology|dossier-index-|dossier-archive-)/i.test(name)) return false;
  if (explicitPrefix.test(name) || semanticPattern.test(html)) return true;
  if (!genericDossierTitle.test(html)) return false;
  const heading = stripHtml(
    html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
    html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''
  );
  return !archivePattern.test(heading);
}

function walk(base) {
  const files = [];
  if (!fs.existsSync(base)) return files;
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && skippedDirs.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && (/\.(?:html?|htm)$/i.test(entry.name) || !path.extname(entry.name))) files.push(full);
    }
  }
  visit(base);
  return files;
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

if (!coverage.ok) failures.push('universal coverage report is not ok');
if (!coverage.policy?.universalCoverage) failures.push('universal coverage policy marker missing');
if (!coverage.policy?.noMatchBoundaryRequired) failures.push('no-match boundary policy missing');
if (coverage.policy?.automaticPublication !== false) failures.push('automatic publication must remain disabled');
if ((coverage.counts?.source || 0) < 1) failures.push('coverage report has no source dossiers');

const reported = new Set((coverage.surfaces || []).map(item => `${item.scope}/${item.route}`));
const independentlyDetected = [];
const bases = [{ label: 'source', dir: root }];
if (fs.existsSync(site)) bases.push({ label: 'built', dir: site });

for (const base of bases) {
  for (const file of walk(base.dir)) {
    if (base.label === 'source' && file.startsWith(site + path.sep)) continue;
    const html = readHtml(file);
    if (!html || !isDossier(file, html)) continue;
    const route = path.relative(base.dir, file).replace(/\\/g, '/');
    const key = `${base.label}/${route}`;
    independentlyDetected.push(key);

    if (!reported.has(key)) failures.push(`${key} detected independently but absent from coverage report`);
    if (count(html, START) !== 1 || count(html, END) !== 1) failures.push(`${key} must contain exactly one criminal-investigation block`);
    if (!html.includes('data-criminal-dossier-coverage="true"')) failures.push(`${key} missing universal coverage marker`);
    if (!html.includes('Criminal Conduct &amp; Allegations')) failures.push(`${key} missing criminal-investigation title`);
    if (!html.includes('Charges and investigations are not proof of guilt.')) failures.push(`${key} missing presumption-of-innocence boundary`);
    if (!html.includes('Association is not wrongdoing.')) failures.push(`${key} missing association boundary`);
    if (!/No verified criminal or safeguarding match is currently attached\.|No sourced conduct record is currently attached\.|class="criminal-conduct-record"/.test(html)) {
      failures.push(`${key} has neither approved records nor an explicit no-match state`);
    }
    for (const category of Object.values(registry.categories || {})) {
      if (!html.includes(String(category.label || ''))) failures.push(`${key} missing category lane ${category.label}`);
    }
  }
}

for (const key of reported) {
  if (!independentlyDetected.includes(key)) failures.push(`${key} reported as a dossier but not detected independently`);
}

const result = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  independentlyDetected: independentlyDetected.length,
  reported: reported.size,
  source: independentlyDetected.filter(key => key.startsWith('source/')).length,
  built: independentlyDetected.filter(key => key.startsWith('built/')).length,
  approvedRecordRenderings: coverage.counts?.approvedRecords || 0,
  byType: coverage.byType || {},
  policy: coverage.policy || {},
  failures
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);

if (failures.length) {
  console.error('UNIVERSAL CRIMINAL DOSSIER COVERAGE TEST FAILED');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`Universal criminal dossier coverage test passed: ${result.source} source and ${result.built} built dossier surfaces independently verified with explicit approved-record or no-match states.`);
