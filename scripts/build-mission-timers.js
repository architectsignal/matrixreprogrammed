const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
const clockPath = path.join(dataDir, 'global-risk-clocks.json');
const wallPath = path.join(dataDir, 'clock-wall.json');
const htmlPath = path.join(root, 'timers.html');
const markdownPath = path.join(downloadsDir, 'timer-synthesis.md');
const standardPath = path.join(dataDir, 'reader-interpretation-standard.json');

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });

function readJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function clean(value, max = 2000) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}
function unique(values) {
  return [...new Set((values || []).map(value => clean(value, 500)).filter(Boolean))];
}
function route(value) {
  const result = clean(value, 500);
  return result && !/^javascript:/i.test(result) ? result : '';
}
function scoreBand(score, standard) {
  const bands = standard?.scoreTypes?.pressureIndex?.bands || [];
  return bands.find(item => Number(score) >= Number(item.min) && Number(score) <= Number(item.max)) || {
    label: 'Unclassified', meaning: 'This score has not yet been mapped to a reader band.'
  };
}
function stripRepeatedDrops(value) {
  const text = clean(value, 5000);
  const first = text.split(/Latest public drops:/i)[0].trim();
  return first || text;
}
function tokens(value) {
  return new Set(clean(value, 1000).toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length >= 4));
}
function overlapScore(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  let score = 0;
  for (const word of left) if (right.has(word)) score += 1;
  return score;
}

const clockKeywords = {
  'wwiii-escalation': ['war', 'conflict', 'military', 'nuclear', 'security', 'ukraine', 'russia', 'middle east'],
  'ai-breakout': ['artificial intelligence', 'ai act', 'algorithm', 'model', 'automation', 'cybersecurity'],
  'surveillance-state': ['surveillance', 'digital identity', 'biometric', 'platform', 'tracking', 'wallet', 'access'],
  'financial-reset': ['financial', 'debt', 'banking', 'payment', 'tokenised', 'currency', 'settlement'],
  'cbdc-rollout': ['cbdc', 'digital euro', 'digital currency', 'wallet', 'programmable money', 'payment'],
  'cyber-blackout': ['cyber', 'blackout', 'infrastructure', 'grid', 'ransomware', 'network security'],
  'alien-disclosure': ['uap', 'ufo', 'alien', 'anomalous', 'disclosure', 'nasa', 'pentagon'],
  'pandemic-biosecurity': ['pandemic', 'biosecurity', 'health', 'who', 'pabs', 'pathogen', 'emergency health'],
  'civil-unrest': ['civil unrest', 'protest', 'election', 'migration', 'emergency powers', 'public order'],
  'food-system-stress': ['food', 'water', 'land', 'farm', 'agriculture', 'supply chain', 'fertilizer'],
  'energy-shock': ['energy', 'grid', 'lng', 'refinery', 'oil', 'gas', 'electricity', 'sanctions'],
  'machine-convergence': ['digital identity', 'cbdc', 'ai governance', 'health governance', 'platform regulation', 'convergence']
};

const missionThemeMap = {
  'wwiii-escalation': ['security-emergency-power', 'corporate-state-convergence'],
  'ai-breakout': ['information-narrative', 'corporate-state-convergence', 'identity-surveillance'],
  'surveillance-state': ['identity-surveillance', 'information-narrative', 'global-governance-convergence'],
  'financial-reset': ['money-currency-access', 'corporate-state-convergence', 'global-governance-convergence'],
  'cbdc-rollout': ['money-currency-access', 'identity-surveillance', 'global-governance-convergence'],
  'cyber-blackout': ['security-emergency-power', 'corporate-state-convergence'],
  'alien-disclosure': ['disclosure-record-control', 'information-narrative'],
  'pandemic-biosecurity': ['health-biosecurity', 'global-governance-convergence', 'identity-surveillance'],
  'civil-unrest': ['security-emergency-power', 'information-narrative', 'identity-surveillance'],
  'food-system-stress': ['corporate-state-convergence', 'global-governance-convergence'],
  'energy-shock': ['corporate-state-convergence', 'security-emergency-power'],
  'machine-convergence': ['global-governance-convergence', 'money-currency-access', 'identity-surveillance', 'information-narrative', 'health-biosecurity', 'corporate-state-convergence']
};

function signalFiles() {
  if (!fs.existsSync(dataDir)) return [];
  const wanted = /(live|intel|probability|outcome|brief|finding|conclusion|tracker|policy|market|risk|evidence|entity|relationship)/i;
  return fs.readdirSync(dataDir)
    .filter(name => name.endsWith('.json') && wanted.test(name) && !['global-risk-clocks.json', 'clock-wall.json', 'reader-interpretation-standard.json'].includes(name))
    .map(name => path.join(dataDir, name))
    .filter(file => {
      try { return fs.statSync(file).size <= 3 * 1024 * 1024; } catch { return false; }
    })
    .slice(0, 250);
}

function extractCandidates(value, sourceFile, output, depth = 0) {
  if (depth > 4 || output.length >= 5000 || value == null) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 500)) extractCandidates(item, sourceFile, output, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  const title = clean(value.title || value.headline || value.name || value.label || value.scenario || value.claim || '', 400);
  const summary = clean(value.summary || value.description || value.whyItMatters || value.conclusion || value.signals || value.reason || '', 1200);
  const sourceRoute = route(value.route || value.url || value.sourceRoute || value.evidenceRoute || value.nextRoute || '');
  if (title && (summary || sourceRoute)) {
    output.push({
      title,
      summary,
      route: sourceRoute,
      published: clean(value.published || value.updated || value.date || value.createdAt || value.lastComputed || '', 80),
      evidenceLevel: clean(value.evidenceLevel || value.evidenceGrade || value.sourceStatus || value.claimClass || '', 180),
      confidence: clean(value.confidence || value.risk || value.status || '', 80),
      sourceFile: path.relative(root, sourceFile).replace(/\\/g, '/')
    });
  }
  for (const [key, child] of Object.entries(value)) {
    if (['html', 'content', 'body', 'raw', 'payload', 'result_json'].includes(key)) continue;
    extractCandidates(child, sourceFile, output, depth + 1);
  }
}

function collectSignals() {
  const output = [];
  for (const file of signalFiles()) extractCandidates(readJson(file, {}), file, output);
  const seen = new Set();
  return output.filter(item => {
    const key = `${item.title.toLowerCase()}|${item.route}|${item.sourceFile}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchesClock(signal, clock) {
  const haystack = `${signal.title} ${signal.summary} ${signal.sourceFile}`.toLowerCase();
  const keywords = clockKeywords[clock.slug] || clock.title.toLowerCase().split(/\s+/);
  const direct = keywords.reduce((count, keyword) => count + (haystack.includes(keyword) ? 2 : 0), 0);
  return direct + overlapScore(`${clock.title} ${clock.signals || ''}`, `${signal.title} ${signal.summary}`);
}

function timerControlMeaning(clock, themes) {
  const labels = themes.map(theme => theme.label).filter(Boolean);
  if (!labels.length) return 'This clock tracks a system-pressure lane. It does not identify a single controller or prove a final coordinated plan.';
  return `This clock is relevant to ${labels.join(', ')} because its source trail shows how rules, infrastructure, institutions or access systems may concentrate practical leverage. It does not by itself prove a single secret controller, one-world government, one-world currency or one-world religion.`;
}

function normaliseClock(clock, prior, allSignals, standard, themeLookup, updated) {
  const score = Math.max(0, Math.min(100, Number(clock.score || 0)));
  const band = scoreBand(score, standard);
  const relevant = allSignals
    .map(signal => ({ ...signal, matchScore: matchesClock(signal, clock) }))
    .filter(signal => signal.matchScore >= 3)
    .sort((a, b) => b.matchScore - a.matchScore || String(b.published).localeCompare(String(a.published)))
    .slice(0, 16);
  const drops = Array.isArray(clock.latestDrops) ? clock.latestDrops : [];
  const policyLinks = Array.isArray(clock.policyConvergenceLinks) ? clock.policyConvergenceLinks : [];
  const sourceRoutes = unique([
    clock.nextRoute,
    clock.secondaryRoute,
    clock.policyConvergenceRoute,
    ...drops.map(item => item.route),
    ...policyLinks.map(item => item.trackerRoute),
    ...relevant.map(item => item.route),
    'evidence-vault.html',
    'search.html'
  ]).filter(Boolean);
  const themes = (missionThemeMap[clock.slug] || [])
    .map(id => themeLookup.get(id))
    .filter(Boolean);
  const previousScore = Number.isFinite(Number(prior?.score)) ? Number(prior.score) : score;
  const movement = score - previousScore;
  const movementText = movement === 0
    ? `Held at ${score}. No source-linked trigger justified a change in this build.`
    : `${movement > 0 ? 'Raised' : 'Lowered'} ${Math.abs(movement)} point${Math.abs(movement) === 1 ? '' : 's'} from ${previousScore} to ${score}.`;
  const directEvidenceCount = drops.length + relevant.filter(item => /official|court|regulator|primary|audited/i.test(item.evidenceLevel)).length;
  const readerQuestion = policyLinks[0]?.readerQuestion || `What documented change would make ${clock.title} more or less important?`;
  const raises = unique(policyLinks.map(item => item.escalationRule || item.timerTrigger).concat(clock.timerUpdateRule || '')).slice(0, 5);
  const lowers = [
    'Implementation is cancelled, delayed, legally blocked, defunded or reversed.',
    'New primary records show the apparent connection was overstated or incorrectly classified.',
    'Independent systems remain optional, decentralised, interoperable and subject to effective appeal or democratic oversight.'
  ];
  return {
    ...clock,
    score,
    scoreLabel: 'Pressure index — not event probability',
    scoreType: 'pressureIndex',
    scoreBand: band.label,
    scoreMeaning: band.meaning,
    scoreDefinition: standard?.scoreTypes?.pressureIndex?.definition || 'A visual index of documented pressure in the named direction, not a probability of a dramatic event.',
    scoreMethod: standard?.scoreTypes?.pressureIndex?.method || 'Updated only when dated source-linked evidence meets the published trigger rule.',
    calculationBasis: `${drops.length} curated current drop${drops.length === 1 ? '' : 's'}, ${policyLinks.length} linked policy lane${policyLinks.length === 1 ? '' : 's'}, ${relevant.length} matching evidence/feed item${relevant.length === 1 ? '' : 's'}, including ${directEvidenceCount} primary-or-official evidence indicator${directEvidenceCount === 1 ? '' : 's'}. The editorial score is not automatically increased by volume alone.`,
    plainEnglishConclusion: stripRepeatedDrops(clock.signals),
    readerQuestion,
    missionThemes: themes.map(theme => ({ id: theme.id, label: theme.label, question: theme.question })),
    controlSystemMeaning: timerControlMeaning(clock, themes),
    evidenceStatus: drops.length || relevant.length ? 'Source-linked watch lane' : 'Editorial watch lane awaiting fresh direct evidence',
    lastMovement: movementText,
    previousScore,
    scoreChange: movement,
    whatRaises: raises.length ? raises : [clock.timerUpdateRule || 'New dated evidence must meet the clock’s published trigger rule.'],
    whatLowers: lowers,
    evidenceInputs: relevant,
    sourceRoutes,
    missingEvidence: unique([
      ...policyLinks.map(item => `Primary records showing whether ${clean(item.trackerTitle, 180)} has moved from discussion into enforceable implementation.`),
      relevant.length ? '' : 'Fresh dated primary sources directly tied to the named mechanism.',
      'Clear records identifying decision authority, legal safeguards, appeal rights, procurement ownership and implementation scope.'
    ]).filter(Boolean).slice(0, 8),
    usefulNextActions: [
      `Open ${clock.nextRoute || 'the primary route'} and verify the newest source before sharing the conclusion.`,
      'Compare supporting records with counter-evidence and legal or implementation status.',
      'Track whether the system remains optional or becomes mandatory, integrated, financially enforced or difficult to exit.'
    ],
    boundary: 'This timer visualises evidence pressure and implementation convergence. It is not proof of motive, inevitability, guilt, a single central controller, one-world government, one-world currency or one-world religion.',
    generatedAt: updated
  };
}

function htmlDocument(wall, standard) {
  const cards = wall.clocks.map(clock => {
    const sources = clock.evidenceInputs.slice(0, 5).map(item => `<li><strong>${escapeHtml(item.title)}</strong>${item.evidenceLevel ? ` — ${escapeHtml(item.evidenceLevel)}` : ''}${item.route ? ` · <a href="${escapeHtml(item.route)}">open</a>` : ''}</li>`).join('') || '<li>No fresh direct source matched this build. The clock remains an editorial watch lane.</li>';
    const themes = clock.missionThemes.map(theme => `<li><strong>${escapeHtml(theme.label)}:</strong> ${escapeHtml(theme.question)}</li>`).join('') || '<li>General system-pressure relevance; no single control theme assigned.</li>';
    const raises = clock.whatRaises.map(item => `<li>${escapeHtml(item)}</li>`).join('');
    const lowers = clock.whatLowers.map(item => `<li>${escapeHtml(item)}</li>`).join('');
    const missing = clock.missingEvidence.map(item => `<li>${escapeHtml(item)}</li>`).join('');
    const actions = clock.usefulNextActions.map(item => `<li>${escapeHtml(item)}</li>`).join('');
    const sourceLinks = clock.sourceRoutes.slice(0, 10).map(item => `<a href="${escapeHtml(item)}">${escapeHtml(item.replace(/\.html.*$/, '').replace(/^.*\//, '').replace(/[-_]/g, ' ') || 'source')}</a>`).join('');
    return `<article class="clock-card" id="${escapeHtml(clock.slug)}"><div class="clock-meta"><span>${clock.score}%</span><span>${escapeHtml(clock.window || 'Review window not set')}</span></div><div class="clock-top"><div class="clock-ring" style="--p:${clock.score}"><strong>${clock.score}%</strong></div><div><span class="clock-band">${escapeHtml(clock.scoreBand)}</span><h2>${escapeHtml(clock.title)}</h2><p class="clock-movement">${escapeHtml(clock.lastMovement)}</p></div></div><section class="clock-answer"><h3>What this means</h3><p>${escapeHtml(clock.plainEnglishConclusion)}</p><p><strong>Score meaning:</strong> ${escapeHtml(clock.scoreMeaning)}</p><p><strong>How it is calculated:</strong> ${escapeHtml(clock.calculationBasis)}</p></section><section><h3>Control-system relevance</h3><p>${escapeHtml(clock.controlSystemMeaning)}</p><ul>${themes}</ul></section><section class="clock-columns"><div><h3>What would raise it</h3><ul>${raises}</ul></div><div><h3>What would lower it</h3><ul>${lowers}</ul></div></section><details><summary>Evidence feeding this timer</summary><ul>${sources}</ul><h4>Missing records</h4><ul>${missing}</ul></details><section><h3>Useful next actions</h3><ol>${actions}</ol></section><p class="clock-boundary"><strong>Boundary:</strong> ${escapeHtml(clock.boundary)}</p><div class="clock-links">${sourceLinks}</div></article>`;
  }).join('');
  const pressure = standard?.scoreTypes?.pressureIndex || {};
  const bands = (pressure.bands || []).map(item => `<li><strong>${item.min}–${item.max} · ${escapeHtml(item.label)}:</strong> ${escapeHtml(item.meaning)}</li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Mission Timers | Matrix Reprogrammed</title><meta name="description" content="Evidence-fed visual synthesis of Matrix Reprogrammed findings, policy convergence and investigative signals."><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="fixes.css"><link rel="stylesheet" href="reader-experience.css"><style>.timer-hero{padding:2rem 1rem}.timer-hero-box{border:1px solid rgba(216,181,106,.35);border-radius:28px;padding:2rem;background:radial-gradient(circle at 30% 0,rgba(180,0,0,.28),transparent 38%),linear-gradient(135deg,rgba(12,0,0,.96),rgba(0,0,0,.94))}.timer-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:1.1rem}.clock-card{border:1px solid rgba(216,181,106,.25);border-radius:22px;padding:1.15rem;background:linear-gradient(150deg,rgba(12,12,12,.97),rgba(28,0,0,.72));display:grid;gap:.9rem}.clock-meta,.clock-top,.clock-links{display:flex;gap:.65rem;flex-wrap:wrap;align-items:center;justify-content:space-between}.clock-meta span,.clock-band{border:1px solid rgba(216,181,106,.38);border-radius:999px;padding:.35rem .65rem}.clock-ring{min-width:112px;width:112px;height:112px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(rgba(210,40,35,.95) calc(var(--p)*1%),rgba(255,255,255,.08) 0)}.clock-ring strong{font-size:1.55rem}.clock-answer,.clock-boundary{padding:.85rem;border-left:4px solid #d8b56a;background:rgba(216,181,106,.07);border-radius:8px}.clock-columns{display:grid;grid-template-columns:1fr 1fr;gap:.8rem}.clock-links{justify-content:flex-start}.clock-links a{border:1px solid rgba(216,181,106,.25);border-radius:999px;padding:.3rem .55rem}.clock-card details{border:1px solid rgba(216,181,106,.2);border-radius:10px;padding:.7rem}.clock-card summary{cursor:pointer;font-weight:800}@media(max-width:680px){.clock-columns{grid-template-columns:1fr}}</style></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"> MATRIX REPROGRAMMED</a><nav class="nav"><a href="daily-command-brief.html">Daily Brief</a><a href="control-system-tracker.html">Control Tracker</a><a href="evidence-vault.html">Evidence</a><a href="search.html">Search</a></nav></header><main><section class="timer-hero wrap"><div class="timer-hero-box"><div class="eyebrow">Evidence synthesis · updated ${escapeHtml(wall.updated)}</div><h1>MISSION TIMERS.</h1><p class="lead">The timers are the visual representation of the site’s current evidence. They combine dated sources, policy lanes, conclusions, counter-signals and missing records into explained pressure indexes.</p><p><strong>Important:</strong> these percentages are pressure indexes, not predictions that an event has a ${escapeHtml('%')} chance of occurring.</p><div class="cta-row"><a class="btn" href="data/clock-wall.json">Open Machine Data</a><a class="btn alt" href="downloads/timer-synthesis.md">Download Synthesis</a><a class="btn alt" href="evidence-vault.html">Verify Evidence</a></div></div></section><section class="section wrap split"><article class="card redline"><h2>What every score means</h2><p>${escapeHtml(pressure.definition || '')}</p><p><strong>Method:</strong> ${escapeHtml(pressure.method || '')}</p></article><article class="card"><h2>Score bands</h2><ul>${bands}</ul></article></section><section class="section wrap"><h2>Current visual synthesis</h2><div class="timer-grid">${cards}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — source first, claim second, usefulness always.</p></footer></div><script src="matrix.js"></script><script src="analytics.js"></script></body></html>`;
}

function markdown(wall, standard) {
  const lines = [
    '# Matrix Reprogrammed Mission Timers', '',
    `Updated: ${wall.updated}`, '',
    standard.sitePurpose || '', '',
    '## Score definition', '',
    standard?.scoreTypes?.pressureIndex?.definition || '', '',
    'These scores are pressure indexes, not event probabilities.', ''
  ];
  for (const clock of wall.clocks) {
    lines.push(`## ${clock.title}`, '', `- Pressure index: ${clock.score}% — ${clock.scoreBand}`, `- Meaning: ${clock.scoreMeaning}`, `- Movement: ${clock.lastMovement}`, `- Calculation basis: ${clock.calculationBasis}`, `- Window: ${clock.window || 'not set'}`, '', clock.plainEnglishConclusion, '', `### Control-system relevance`, '', clock.controlSystemMeaning, '', '### Evidence inputs', '');
    if (clock.evidenceInputs.length) for (const item of clock.evidenceInputs.slice(0, 10)) lines.push(`- ${item.title}${item.evidenceLevel ? ` — ${item.evidenceLevel}` : ''}${item.route ? ` — ${item.route}` : ''}`);
    else lines.push('- No fresh direct source matched this build.');
    lines.push('', '### What would raise it', ...clock.whatRaises.map(item => `- ${item}`), '', '### What would lower it', ...clock.whatLowers.map(item => `- ${item}`), '', '### Missing records', ...clock.missingEvidence.map(item => `- ${item}`), '', '### Useful next actions', ...clock.usefulNextActions.map(item => `- ${item}`), '', `Boundary: ${clock.boundary}`, '');
  }
  return lines.join('\n');
}

const standard = readJson(standardPath, {});
const source = readJson(clockPath, { clocks: [] });
const previous = readJson(wallPath, { clocks: [] });
const allSignals = collectSignals();
const themeLookup = new Map((standard.missionThemes || []).map(theme => [theme.id, theme]));
const previousLookup = new Map((previous.clocks || []).map(clock => [clock.slug, clock]));
const updated = new Date().toISOString();
const clocks = (source.clocks || []).map(clock => normaliseClock(clock, previousLookup.get(clock.slug), allSignals, standard, themeLookup, updated));
const wall = {
  schemaVersion: 2,
  updated,
  title: 'Matrix Reprogrammed Mission Timers',
  purpose: 'Visual synthesis of the site’s evidence, conclusions, policy convergence, source changes and missing records.',
  sitePurpose: standard.sitePurpose || '',
  scoreType: 'pressureIndex',
  scoreDefinition: standard?.scoreTypes?.pressureIndex?.definition || '',
  scoreMethod: standard?.scoreTypes?.pressureIndex?.method || '',
  sourceFileCount: signalFiles().length,
  candidateSignalCount: allSignals.length,
  clocks
};

fs.writeFileSync(wallPath, JSON.stringify(wall, null, 2));
fs.writeFileSync(clockPath, JSON.stringify({ ...source, updated, summary: 'Evidence-fed pressure indexes with plain-language meanings, score methods, movement, control-system relevance, source trails, counter-signals and useful actions.', scoreRule: wall.scoreDefinition, clocks }, null, 2));
fs.writeFileSync(htmlPath, htmlDocument(wall, standard));
fs.writeFileSync(markdownPath, markdown(wall, standard));
console.log(`Mission timers generated: ${clocks.length} clocks, ${allSignals.length} candidate signals from ${wall.sourceFileCount} data files.`);
