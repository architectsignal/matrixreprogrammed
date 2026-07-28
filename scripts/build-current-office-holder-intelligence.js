'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const registryPath = path.join(root, 'data', 'current-office-holders.json');
const transitionsPath = path.join(root, 'data', 'current-office-holder-transitions.json');
const downloads = path.join(root, 'downloads');
const START = '<!-- office-holder-intelligence:start -->';
const END = '<!-- office-holder-intelligence:end -->';
const skippedDirs = new Set([
  '.git', '.github', 'node_modules', '.wrangler', 'downloads', 'browsertrix-output',
  'evidence-archive', 'source-snapshots', 'scripts', 'tools'
]);
const publicExtensions = new Set(['.html', '.htm', '.json', '.md', '.js']);
const touched = new Set();
const generated = [];
const staleClaimsRepaired = [];
const unresolved = [];
const dossierMatches = [];
const MAX_TEXT_BYTES = 8 * 1024 * 1024;

if (!fs.existsSync(registryPath)) throw new Error('Missing data/current-office-holders.json');
if (!fs.existsSync(transitionsPath)) throw new Error('Missing data/current-office-holder-transitions.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const transitionLedger = JSON.parse(fs.readFileSync(transitionsPath, 'utf8'));
if (registry.schemaVersion !== 1 || !Array.isArray(registry.holders) || registry.holders.length < 1) {
  throw new Error('Invalid current office-holder registry');
}
if (transitionLedger.schemaVersion !== 1 || !Array.isArray(transitionLedger.transitions)) {
  throw new Error('Invalid current office-holder transition ledger');
}

function esc(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function stripHtml(value = '') {
  return String(value || '').replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

function normalize(value = '') {
  return stripHtml(value).toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function slug(value = '') {
  return normalize(value).replace(/\s+/g, '-').replace(/^-+|-+$/g, '') || 'unknown-office-holder';
}

function display(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const before = fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file, 'utf8') : null;
  if (before === content) return false;
  fs.writeFileSync(file, content);
  touched.add(display(file));
  return true;
}

function copyToOutput(relative) {
  if (!fs.existsSync(site)) return;
  const source = path.join(root, relative);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) return;
  const target = path.join(site, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  touched.add(display(target));
}

function syncExtensionless(base, relative) {
  const htmlFile = path.join(base, relative);
  if (!fs.existsSync(htmlFile) || !fs.statSync(htmlFile).isFile()) return;
  const alias = htmlFile.replace(/\.html$/i, '');
  if (fs.existsSync(alias) && fs.statSync(alias).isDirectory()) return;
  fs.mkdirSync(path.dirname(alias), { recursive: true });
  fs.copyFileSync(htmlFile, alias);
  touched.add(display(alias));
}

function validateHolder(holder) {
  const required = ['jurisdiction', 'office', 'name', 'currentSince', 'sourceUrl', 'evidenceClass', 'confidence'];
  const missing = required.filter(field => !String(holder[field] || '').trim());
  if (missing.length) throw new Error(`Office-holder ${holder.name || '(unnamed)'} missing ${missing.join(', ')}`);
  if (!/^https:\/\//i.test(holder.sourceUrl)) throw new Error(`${holder.name}: sourceUrl must be HTTPS`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(holder.currentSince)) throw new Error(`${holder.name}: currentSince must be YYYY-MM-DD`);
  if (holder.confidence !== 'confirmed') throw new Error(`${holder.name}: only confirmed official current roles may enter the current registry`);
}

for (const holder of registry.holders) validateHolder(holder);

function genericConclusion(holder) {
  return {
    id: `current-office-${slug(holder.jurisdiction)}-${slug(holder.office)}-${slug(holder.name)}`,
    subject: holder.name,
    jurisdiction: holder.jurisdiction,
    office: holder.office,
    checkedAt: registry.checkedAt,
    evidenceClass: holder.evidenceClass,
    confidence: holder.confidence,
    sourceUrl: holder.sourceUrl,
    found: `${holder.name} is the officially identified current ${holder.office} for ${holder.jurisdiction}, in office from ${holder.currentSince}.`,
    lanes: ['current-state integrity', 'formal authority', 'institutional access'],
    whyItFits: `The office of ${holder.office} carries documented formal authority in ${holder.jurisdiction}. Current-holder accuracy controls which person receives active authority edges and which predecessor records are historical.`,
    effect: `Active authority and access edges attach to ${holder.name}. Any predecessor remains in the historical record with a dated end to current status.`,
    widerDirection: 'This creates a verified baseline for tracking appointments, policy changes, contracts, enforcement priorities, institutional continuity and changes in access.',
    alternativeExplanation: 'A new or continuing office-holder may have limited practical freedom because legislation, civil-service structures, courts, budgets, coalitions and prior commitments constrain the office.',
    doesNotProve: 'Holding office does not prove wrongdoing, hidden control, knowledge of misconduct, policy authorship, personal agreement with every institutional action or criminal conduct.',
    nextEvidence: [
      'official appointments and delegation instruments',
      'budgets, legislation, executive directions and published strategies',
      'meetings, advisers, boards, donors, contracts and declared interests',
      'audits, court records, parliamentary scrutiny and documented outcomes'
    ]
  };
}

const conclusions = registry.holders.map(genericConclusion);
for (const transition of transitionLedger.transitions) {
  if (transition.conclusion) conclusions.push({
    id: `transition-${transition.id}`,
    transitionId: transition.id,
    evidenceClass: transition.evidenceClass,
    sources: transition.sources,
    ...transition.conclusion
  });
}

const timeline = [];
const edges = [];
const clockReassessments = [];
for (const holder of registry.holders) {
  timeline.push({
    id: `office-start-${slug(holder.jurisdiction)}-${slug(holder.office)}-${slug(holder.name)}`,
    date: holder.currentSince,
    subject: holder.name,
    event: `Became ${holder.office}`,
    jurisdiction: holder.jurisdiction,
    status: 'current',
    evidenceClass: holder.evidenceClass,
    sourceUrl: holder.sourceUrl,
    boundary: registry.policy.boundary
  });
  edges.push({
    id: `active-authority-${slug(holder.jurisdiction)}-${slug(holder.office)}-${slug(holder.name)}`,
    from: holder.name,
    to: holder.jurisdiction,
    relationship: `current ${holder.office}`,
    active: true,
    fromDate: holder.currentSince,
    evidenceClass: holder.evidenceClass,
    sourceUrl: holder.sourceUrl,
    boundary: 'This edge records formal current authority and access. It is not an allegation of wrongdoing or proof of control beyond the documented office.'
  });
  if (holder.predecessor) {
    edges.push({
      id: `former-authority-${slug(holder.jurisdiction)}-${slug(holder.office)}-${slug(holder.predecessor)}`,
      from: holder.predecessor,
      to: holder.jurisdiction,
      relationship: `former ${holder.office}`,
      active: false,
      toDate: holder.predecessorTo || holder.currentSince,
      evidenceClass: 'official-historical-role',
      sourceUrl: holder.sourceUrl,
      boundary: 'Former-holder status preserves historical authority and access without presenting it as current.'
    });
  }
}
for (const transition of transitionLedger.transitions) {
  timeline.push({
    id: `transition-${transition.id}`,
    date: transition.effectiveDate,
    subject: transition.to,
    event: `${transition.from} replaced by ${transition.to} as ${transition.office}`,
    jurisdiction: transition.jurisdiction,
    status: 'official-transition',
    evidenceClass: transition.evidenceClass,
    sources: transition.sources,
    boundary: transitionLedger.policy.boundary
  });
  clockReassessments.push({
    id: `clock-reassessment-${transition.id}`,
    trigger: `${transition.office} transition from ${transition.from} to ${transition.to}`,
    effectiveDate: transition.effectiveDate,
    jurisdiction: transition.jurisdiction,
    movement: 'no-automatic-movement',
    reason: 'Personnel change alters current authority but does not independently establish a directional change in policy, centralisation, surveillance, conflict, financial control or safeguarding risk.',
    lanesToReview: [
      'government centralisation',
      'institutional continuity',
      'financial and procurement control',
      'surveillance and civil-liberties policy',
      'foreign-policy and conflict posture',
      'safeguarding and accountability'
    ],
    evidenceNeeded: [
      'new legislation or repeal',
      'budget and procurement changes',
      'formal appointments and delegations',
      'published policy, enforcement and implementation changes',
      'audits, court findings and measurable outcomes'
    ],
    sources: transition.sources,
    boundary: transitionLedger.policy.boundary
  });
}

function officePanel(holder, status = 'current') {
  const isCurrent = status === 'current';
  const title = isCurrent ? 'Current office-holder status' : 'Former office-holder status';
  const dateLine = isCurrent
    ? `Current from ${esc(holder.currentSince)}`
    : `Former from ${esc(holder.predecessorTo || holder.currentSince)}`;
  const name = isCurrent ? holder.name : holder.predecessor;
  return `${START}<section class="section wrap current-office-holder-intelligence" data-current-office-holder-intelligence="true" data-office-status="${status}"><article class="card"><div class="eyebrow">${title}</div><h2>${esc(name)}</h2><p><strong>Office:</strong> ${esc(holder.office)} · <strong>Jurisdiction:</strong> ${esc(holder.jurisdiction)} · <strong>Status:</strong> ${dateLine}</p><p><strong>Evidence classification:</strong> ${esc(isCurrent ? holder.evidenceClass : 'official-historical-role')} · <strong>Confidence:</strong> ${esc(holder.confidence)}</p><p><strong>What this establishes:</strong> ${isCurrent ? `${esc(name)} currently holds the documented formal authority and access of this office.` : `${esc(name)} previously held this office; dated actions remain historically relevant but the active authority edge has ended.`}</p><p><strong>What it does not prove:</strong> Office, access, appointment or proximity does not by itself prove wrongdoing, hidden control, knowledge, facilitation or criminal conduct.</p><p><strong>System effect:</strong> Dossier, timeline and relationship-map status are updated. Relevant clocks enter reassessment but do not move without separate directional evidence.</p><a class="btn alt" href="${esc(holder.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open official office source</a></article></section>${END}`;
}

function removePanel(html) {
  let next = html;
  while (true) {
    const start = next.indexOf(START);
    const end = next.indexOf(END, start + START.length);
    if (start < 0 || end < 0) break;
    next = next.slice(0, start) + next.slice(end + END.length);
  }
  return next;
}

function injectPanel(html, panel) {
  const clean = removePanel(html);
  const criminal = clean.indexOf('<!-- criminal-conduct-engine:start -->');
  if (criminal >= 0) return clean.slice(0, criminal) + panel + clean.slice(criminal);
  if (/<\/main>/i.test(clean)) return clean.replace(/<\/main>/i, `${panel}</main>`);
  if (/<footer\b/i.test(clean)) return clean.replace(/<footer\b/i, `${panel}<footer`);
  if (/<\/body>/i.test(clean)) return clean.replace(/<\/body>/i, `${panel}</body>`);
  return `${clean}\n${panel}\n`;
}

function walkPublic(base) {
  const files = [];
  if (!fs.existsSync(base)) return files;
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && skippedDirs.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && publicExtensions.has(path.extname(entry.name).toLowerCase())) files.push(full);
    }
  }
  visit(base);
  return files;
}

function rolePattern(holder) {
  const office = holder.office
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
  return office;
}

function patchTextCurrentClaims(text, file) {
  let next = text;
  for (const holder of registry.holders) {
    const office = rolePattern(holder);
    for (const alias of holder.staleCurrentAliases || []) {
      const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const replacements = [
        [new RegExp(`\\bcurrent(?:ly)?\\s+(?:[^.\\n]{0,80}\\s+)?${office}\\s+(?:is\\s+)?${escapedAlias}\\b`, 'gi'), match => match.replace(new RegExp(escapedAlias, 'i'), holder.name)],
        [new RegExp(`\\b${escapedAlias}\\b\\s+(?:is\\s+)?(?:the\\s+)?current(?:ly)?\\s+(?:[^.\\n]{0,80}\\s+)?${office}\\b`, 'gi'), match => match.replace(new RegExp(escapedAlias, 'i'), holder.name)],
        [new RegExp(`\\bincumbent\\s+(?:[^.\\n]{0,80}\\s+)?${office}\\s+(?:is\\s+)?${escapedAlias}\\b`, 'gi'), match => match.replace(new RegExp(escapedAlias, 'i'), holder.name)]
      ];
      for (const [pattern, replacement] of replacements) {
        const before = next;
        next = next.replace(pattern, replacement);
        if (next !== before) staleClaimsRepaired.push({ file: display(file), office: holder.office, from: alias, to: holder.name });
      }
    }
  }
  return next;
}

function patchJsonCurrentClaims(value, file) {
  if (Array.isArray(value)) return value.map(item => patchJsonCurrentClaims(item, file));
  if (!value || typeof value !== 'object') return value;
  const next = {};
  for (const [key, item] of Object.entries(value)) next[key] = patchJsonCurrentClaims(item, file);

  const role = String(next.office || next.role || next.position || next.title || '');
  const status = String(next.status || next.state || '');
  const current = next.current === true || next.isCurrent === true || /\bcurrent|active|incumbent\b/i.test(status);
  if (!current) return next;

  for (const holder of registry.holders) {
    if (normalize(role) !== normalize(holder.office)) continue;
    const currentName = String(next.name || next.holder || next.person || '');
    if ((holder.staleCurrentAliases || []).some(alias => normalize(alias) === normalize(currentName))) {
      if ('name' in next) next.name = holder.name;
      if ('holder' in next) next.holder = holder.name;
      if ('person' in next) next.person = holder.name;
      next.currentSince = holder.currentSince;
      next.lastChecked = registry.checkedAt;
      next.sourceUrl = holder.sourceUrl;
      next.evidenceClass = holder.evidenceClass;
      staleClaimsRepaired.push({ file: display(file), office: holder.office, from: currentName, to: holder.name });
    } else if (normalize(currentName) === normalize(holder.name)) {
      next.currentSince = next.currentSince || holder.currentSince;
      next.lastChecked = registry.checkedAt;
      next.sourceUrl = next.sourceUrl || holder.sourceUrl;
      next.evidenceClass = next.evidenceClass || holder.evidenceClass;
    }
  }
  return next;
}

function extractTitle(html, file) {
  return stripHtml(
    html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
    html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
    path.basename(file, path.extname(file)).replace(/[-_]/g, ' ')
  ).replace(/\s*\|\s*Matrix Reprogrammed.*$/i, '').trim();
}

function findHolderForTitle(title) {
  const target = normalize(title);
  for (const holder of registry.holders) {
    if (target === normalize(holder.name) || target === normalize(holder.styledName || '')) return { holder, status: 'current' };
    if (holder.predecessor && target === normalize(holder.predecessor)) return { holder, status: 'former' };
  }
  return null;
}

for (const base of [root, site]) {
  if (!fs.existsSync(base)) continue;
  for (const file of walkPublic(base)) {
    if (base === root && file.startsWith(site + path.sep)) continue;
    const stat = fs.statSync(file);
    if (stat.size > MAX_TEXT_BYTES) continue;
    const ext = path.extname(file).toLowerCase();
    const before = fs.readFileSync(file, 'utf8');
    let after = before;

    if (ext === '.json') {
      try {
        const parsed = JSON.parse(before);
        after = `${JSON.stringify(patchJsonCurrentClaims(parsed, file), null, 2)}\n`;
      } catch {
        after = patchTextCurrentClaims(before, file);
      }
    } else {
      after = patchTextCurrentClaims(before, file);
    }

    if (ext === '.html' || ext === '.htm') {
      const match = findHolderForTitle(extractTitle(after, file));
      if (match && /dossier|profile|entity-brief|subject-|person-|family-|institution-|company-|foundation-|property-|death-file-/i.test(`${path.basename(file)} ${after.slice(0, 10000)}`)) {
        after = injectPanel(after, officePanel(match.holder, match.status));
        dossierMatches.push({ file: display(file), name: match.status === 'current' ? match.holder.name : match.holder.predecessor, status: match.status });
      }
    }

    if (after !== before) {
      fs.writeFileSync(file, after);
      touched.add(display(file));
    }
  }
}

function dossierPage(personName, holder, status) {
  const current = status === 'current';
  const roleStatus = current ? `Current from ${holder.currentSince}` : `Former; active status ended ${holder.predecessorTo || holder.currentSince}`;
  const conclusion = current
    ? `${personName} currently holds the documented formal authority of ${holder.office} in ${holder.jurisdiction}. That establishes office and access, not wrongdoing or control beyond the legal powers of the role.`
    : `${personName} formerly held the documented authority of ${holder.office} in ${holder.jurisdiction}. Historical actions remain relevant, but the current authority edge now belongs to ${holder.name}.`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${esc(personName)} | Office-Holder Dossier | Matrix Reprogrammed</title><meta name="description" content="Evidence-classified current-state dossier for ${esc(personName)}, preserving formal office, dates, official sources, limitations and next evidence."/><link rel="stylesheet" href="../styles.css"/><link rel="stylesheet" href="../reader-experience.css"/></head><body><canvas id="matrix"></canvas><div class="page"><header class="wrap topbar"><a class="brand" href="../index.html"><img src="../sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="../current-office-holders.html">Office Holders</a><a href="../daily-power-conclusions.html">Conclusions</a><a href="../evidence-vault.html">Evidence</a><a href="../predators-in-power.html">Predators in Power</a><a href="../search.html">Search</a></nav></header><main data-entity-dossier="true" data-current-office-holder-dossier="true"><section class="hero wrap"><div class="eyebrow">Office-Holder Intelligence Dossier</div><h1>${esc(personName)}</h1><p class="lead">${esc(holder.office)} · ${esc(holder.jurisdiction)} · ${esc(roleStatus)}</p><div class="cta-row"><a class="btn" href="${esc(holder.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open official source</a><a class="btn alt" href="../source-document-vault.html">Search source records</a><a class="btn alt" href="../predators-in-power.html">Criminal-status system</a></div></section><section class="section wrap"><div class="grid"><article class="card"><h2>Verified current-state finding</h2><p>${esc(conclusion)}</p><p><strong>Evidence class:</strong> ${esc(current ? holder.evidenceClass : 'official-historical-role')} · <strong>Confidence:</strong> ${esc(holder.confidence)}.</p></article><article class="card"><h2>Why this matters</h2><p>Current office determines which person receives active authority, appointment, policy-coordination and institutional-access edges. Former holders retain dated historical edges and evidence.</p></article><article class="card"><h2>What it does not prove</h2><p>Office, appointment, association, access or proximity does not establish knowledge, facilitation, concealment, conspiracy, criminal conduct or personal responsibility for every institutional action.</p></article><article class="card"><h2>Evidence to seek next</h2><p>Appointments, advisers, declared interests, meetings, budgets, contracts, directives, legislation, audits, court records, responses and measurable outcomes.</p></article></div><p class="mini"><strong>Registry checked:</strong> ${esc(registry.checkedAt)}. <strong>Boundary:</strong> ${esc(registry.policy.boundary)}</p></section></main><footer class="footer wrap"><p>Public-record first. Evidence before inference. Historical status is preserved.</p></footer></div><script src="../matrix.js"></script></body></html>\n`;
}

const requiredPeople = new Map();
for (const holder of registry.holders) {
  requiredPeople.set(normalize(holder.name), { name: holder.name, holder, status: 'current' });
  if (holder.predecessor) requiredPeople.set(normalize(holder.predecessor), { name: holder.predecessor, holder, status: 'former' });
}
const matchedNames = new Set(dossierMatches.map(item => normalize(item.name)));
for (const person of requiredPeople.values()) {
  if (matchedNames.has(normalize(person.name))) continue;
  const relative = `entity-briefs/${slug(person.name)}.html`;
  write(path.join(root, relative), dossierPage(person.name, person.holder, person.status));
  generated.push(relative);
  copyToOutput(relative);
  syncExtensionless(root, relative);
  if (fs.existsSync(site)) syncExtensionless(site, relative);
}

function page() {
  const cards = registry.holders.map(holder => {
    const predecessor = holder.predecessor
      ? `<p><strong>Predecessor:</strong> ${esc(holder.predecessor)}${holder.predecessorTo ? ` · historical status ended ${esc(holder.predecessorTo)}` : ''}</p>`
      : '';
    return `<article class="card" data-office-holder="${esc(holder.name)}"><div class="eyebrow">${esc(holder.jurisdiction)}</div><h2>${esc(holder.styledName || holder.name)}</h2><p><strong>${esc(holder.office)}</strong> · current from ${esc(holder.currentSince)}</p>${predecessor}<p><strong>Evidence:</strong> ${esc(holder.evidenceClass)} · ${esc(holder.confidence)}</p><p>Active formal-authority edge. No criminal or hidden-control inference follows from office alone.</p><a class="btn alt" href="${esc(holder.sourceUrl)}" target="_blank" rel="noopener noreferrer">Official source</a> <a class="btn alt" href="entity-briefs/${slug(holder.name)}.html">Open dossier</a></article>`;
  }).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Current Office-Holder Intelligence | Matrix Reprogrammed</title><meta name="description" content="Official-source current office-holder registry with dated transitions, active authority edges, historical status, clock reassessment and evidence boundaries."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="reader-experience.css"/></head><body><canvas id="matrix"></canvas><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="daily-power-conclusions.html">Conclusions</a><a href="timers.html">Clocks</a><a href="evidence-vault.html">Evidence</a><a href="predators-in-power.html">Predators in Power</a><a href="search.html">Search</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Current-State Integrity Layer</div><h1>CURRENT OFFICE-HOLDER INTELLIGENCE</h1><p class="lead">Who currently holds formal authority, when the transition occurred, which historical edge ended, what the change affects, and what it does not prove.</p><div class="cta-row"><a class="btn" href="data/current-office-holders.json">Open registry data</a><a class="btn alt" href="data/current-office-holder-transitions.json">Open transition ledger</a><a class="btn alt" href="data/current-office-holder-clock-reassessment.json">Open clock reassessment</a></div></section><section class="section wrap"><article class="card"><h2>Reading rule</h2><p>${esc(registry.policy.boundary)}</p><p>A predecessor is not erased. Their actions, decisions, relationships and evidence remain dated historical records. Active authority moves to the verified current holder.</p></article><div class="grid">${cards}</div></section></main><footer class="footer wrap"><p>Official-source current state. Historical record preserved. No guilt by office or association.</p></footer></div><script src="matrix.js"></script></body></html>\n`;
}

write(path.join(root, 'current-office-holders.html'), page());
copyToOutput('current-office-holders.html');
syncExtensionless(root, 'current-office-holders.html');
if (fs.existsSync(site)) syncExtensionless(site, 'current-office-holders.html');

const outputs = {
  'data/current-office-holder-conclusions.json': {
    ok: true, generatedAt: new Date().toISOString(), checkedAt: registry.checkedAt,
    boundary: registry.policy.boundary, conclusions
  },
  'data/current-office-holder-timeline.json': {
    ok: true, generatedAt: new Date().toISOString(), checkedAt: registry.checkedAt,
    boundary: transitionLedger.policy.boundary, events: timeline.sort((a, b) => String(a.date).localeCompare(String(b.date)))
  },
  'data/current-office-holder-relationship-edges.json': {
    ok: true, generatedAt: new Date().toISOString(), checkedAt: registry.checkedAt,
    boundary: registry.policy.boundary, edges
  },
  'data/current-office-holder-clock-reassessment.json': {
    ok: true, generatedAt: new Date().toISOString(), checkedAt: registry.checkedAt,
    movementPolicy: 'no-automatic-movement', boundary: transitionLedger.policy.boundary,
    reassessments: clockReassessments
  }
};
for (const [relative, data] of Object.entries(outputs)) {
  write(path.join(root, relative), `${JSON.stringify(data, null, 2)}\n`);
  copyToOutput(relative);
}

for (const route of ['research-tools.html', 'investigations.html', 'daily-power-conclusions.html', 'timers.html']) {
  for (const base of [root, site]) {
    const file = path.join(base, route);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const before = fs.readFileSync(file, 'utf8');
    if (before.includes('current-office-holders.html')) continue;
    const relative = base === root ? 'current-office-holders.html' : '/current-office-holders.html';
    const block = `<section class="section wrap current-office-holder-link"><article class="card"><div class="eyebrow">Current-State Integrity</div><h2>Current Office-Holder Intelligence</h2><p>Verified current authority, dated transitions, historical predecessors, relationship-edge changes and clock reassessment without automatic score movement.</p><a class="btn alt" href="${relative}">Open current office-holder intelligence</a></article></section>`;
    const after = /<\/main>/i.test(before) ? before.replace(/<\/main>/i, `${block}</main>`) : before;
    if (after !== before) {
      fs.writeFileSync(file, after);
      touched.add(display(file));
    }
  }
}

for (const base of [root, site]) {
  if (!fs.existsSync(base)) continue;
  for (const file of walkPublic(base)) {
    if (base === root && file.startsWith(site + path.sep)) continue;
    const ext = path.extname(file).toLowerCase();
    if (!['.html', '.htm', '.json', '.md', '.js'].includes(ext)) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const holder of registry.holders) {
      for (const alias of holder.staleCurrentAliases || []) {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const office = rolePattern(holder);
        const stalePattern = new RegExp(`(?:\\bcurrent(?:ly)?\\b|\\bincumbent\\b)[^.\\n]{0,120}(?:${office})[^.\\n]{0,80}\\b${escaped}\\b|\\b${escaped}\\b[^.\\n]{0,80}(?:\\bcurrent(?:ly)?\\b|\\bincumbent\\b)[^.\\n]{0,120}(?:${office})`, 'i');
        if (stalePattern.test(source) && !/\bformer\b|\bthen-current\b|\bat the time\b|\bhistorical\b/i.test(source.match(stalePattern)?.[0] || '')) {
          unresolved.push({ file: display(file), office: holder.office, staleAlias: alias, currentHolder: holder.name, excerpt: stripHtml(source.match(stalePattern)?.[0] || '').slice(0, 300) });
        }
      }
    }
  }
}

const report = {
  ok: unresolved.length === 0,
  generatedAt: new Date().toISOString(),
  checkedAt: registry.checkedAt,
  holders: registry.holders.length,
  transitions: transitionLedger.transitions.length,
  generatedDossiers: generated,
  dossierMatches,
  staleClaimsRepaired,
  unresolvedStaleCurrentClaims: unresolved,
  touched: [...touched],
  feeds: Object.keys(outputs),
  page: 'current-office-holders.html',
  boundary: registry.policy.boundary
};
fs.mkdirSync(downloads, { recursive: true });
fs.writeFileSync(path.join(downloads, 'current-office-holder-evidence-refresh.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  unresolved.forEach(item => console.error(`STALE CURRENT OFFICE CLAIM: ${item.file}: ${item.excerpt}`));
  process.exit(1);
}
console.log(`Current office-holder intelligence refreshed: ${registry.holders.length} confirmed holders, ${transitionLedger.transitions.length} transitions, ${generated.length} new dossier(s), ${dossierMatches.length} existing dossier match(es), ${staleClaimsRepaired.length} stale current claim repair(s), ${touched.size} file(s) updated.`);
