const fs = require('fs');
const path = require('path');

const root = process.cwd();
const markerStart = '<!-- conclusion-integrity:start -->';
const markerEnd = '<!-- conclusion-integrity:end -->';

function full(rel) { return path.join(root, rel); }
function exists(rel) { return fs.existsSync(full(rel)); }
function read(rel) { return fs.readFileSync(full(rel), 'utf8'); }
function write(rel, value) { fs.mkdirSync(path.dirname(full(rel)), { recursive: true }); fs.writeFileSync(full(rel), value); }
function json(rel, fallback = {}) { try { return JSON.parse(read(rel)); } catch { return fallback; } }
function esc(value = '') { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function cleanSentence(value = '') { return String(value || '').replace(/\.{2,}$/g, '.').replace(/\s+/g, ' ').trim(); }
function pretty(value) { const date = new Date(value || 0); return Number.isFinite(date.getTime()) ? date.toISOString().replace('T', ' ').replace('.000Z', ' UTC') : 'Unavailable'; }
function gradeConfidence(grade = '') { return ({ A: 'high', B: 'medium-high', C: 'medium', D: 'low', E: 'very low' })[String(grade).toUpperCase()] || 'method-dependent'; }
function array(value) { return Array.isArray(value) ? value : []; }
function replaceIntegrity(html, section) {
  const expression = new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`, 'i');
  if (expression.test(html)) return html.replace(expression, section);
  return html.includes('</main>') ? html.replace('</main>', `${section}</main>`) : `${html}${section}`;
}
function sourceList(items) { return `<ul>${array(items).filter(Boolean).map(item => `<li>${esc(item)}</li>`).join('')}</ul>`; }
function card(item) {
  return `<article class="card redline conclusion-integrity-card"><span class="label">${esc(item.classification)} · confidence ${esc(item.confidence)}</span><h3>${esc(item.title)}</h3><p>${esc(cleanSentence(item.conclusion))}</p><p><strong>Evidence basis:</strong> ${esc(item.evidenceBasis)}</p><p><strong>Supporting records/signals:</strong> ${esc(item.supportingCount)}</p><p><strong>Freshness:</strong> ${esc(pretty(item.freshness))}</p><p><strong>Scoring or decision rule:</strong> ${esc(item.formula)}</p><p><strong>Counter-evidence status:</strong> ${esc(item.counterEvidence)}</p><p><strong>Limitation:</strong> ${esc(item.limitation)}</p><details><summary>Source inputs</summary>${sourceList(item.sources)}</details>${item.route ? `<a class="btn alt" href="${esc(item.route)}">Inspect evidence route</a>` : ''}</article>`;
}
function section(title, lead, items) {
  return `${markerStart}<section id="conclusion-integrity" class="section wrap"><style id="conclusion-integrity-style">.conclusion-integrity-card .label{text-transform:uppercase}.conclusion-integrity-card details{margin:.75rem 0}.conclusion-integrity-card summary{cursor:pointer;font-weight:700}</style><div class="eyebrow">Evidence And Confidence Layer</div><h2>${esc(title)}</h2><p class="lead">${esc(lead)}</p><div class="grid">${items.map(card).join('')}</div><p><strong>Boundary:</strong> confidence describes the strength of the stated method and available records. It is not a probability that a person or institution is guilty, corrupt or secretly coordinated.</p></section>${markerEnd}`;
}

function powerIntegrity() {
  if (!exists('data/daily-power-conclusions.json') || !exists('daily-power-conclusions.html')) return 0;
  const product = json('data/daily-power-conclusions.json', { conclusions: [] });
  const graph = json('data/evidence-weighted-relationship-graph.json', {});
  const sourceMap = {
    'Strongest route today': ['data/evidence-weighted-relationship-graph.json', 'data/site-relationship-map.json', 'data/control-brain-v2.json'],
    'Highest clock pressure': ['data/clock-wall.json'],
    'Top capital lane': ['data/big-three-asset-managers.json'],
    'Top contractor lane': ['data/private-contractor-intelligence.json'],
    'Top institution lane': ['data/institution-control-index.json'],
    'Top billionaire lane': ['data/billionaire-control-index.json'],
    'Most important missing record': ['data/missing-records.json']
  };
  const integrity = array(product.conclusions).map((conclusion, index) => {
    const sources = sourceMap[conclusion.title] || ['data/daily-power-conclusions.json'];
    const isMissing = /missing record/i.test(conclusion.title || '');
    return {
      id: `power-${index + 1}`,
      title: conclusion.title,
      conclusion: cleanSentence(conclusion.text),
      route: conclusion.route,
      classification: isMissing ? 'missing-record priority' : 'heuristic ranking',
      confidence: isMissing ? 'medium' : 'medium-low',
      evidenceBasis: isMissing ? 'A queue priority derived from explicitly missing primary records.' : 'A transparent site-ranking heuristic over route presence, notes, type and any matching brain score.',
      supportingCount: isMissing ? 1 : Math.max(1, Number(graph.nodeCount || 0)),
      freshness: product.updated,
      formula: isMissing ? 'First unresolved record in the current missing-record queue.' : 'Base 20 + note signals + route signal + category signal + capped matching brain score; maximum 100.',
      counterEvidence: isMissing ? 'The missing record itself may confirm, narrow or falsify the route.' : 'Not systematically collected by this ranking. Open the evidence route and missing-record queue before drawing a substantive conclusion.',
      limitation: isMissing ? 'Priority does not establish that the absent record contains wrongdoing.' : 'Rank position measures the site model, not real-world control, guilt, intent or coordination.',
      sources
    };
  });
  product.integrityVersion = 1;
  product.conclusions = array(product.conclusions).map((item, index) => ({ ...item, text: cleanSentence(item.text), integrity: integrity[index] }));
  write('data/daily-power-conclusions.json', JSON.stringify(product, null, 2));
  write('daily-power-conclusions.html', replaceIntegrity(read('daily-power-conclusions.html'), section('HOW STRONG IS EACH MACHINE CONCLUSION?', 'Every ranking is labelled as fact, official finding, inference, heuristic or missing-record priority, with the input files and limitations shown.', integrity)));
  return integrity.length;
}

function investigationIntegrity(kind) {
  const dataFile = kind === 'weekly' ? 'data/weekly-investigation-conclusions.json' : 'data/daily-investigation-conclusions.json';
  const htmlFile = kind === 'weekly' ? 'weekly-investigation-report.html' : 'daily-investigation-conclusions.html';
  if (!exists(dataFile) || !exists(htmlFile)) return 0;
  const product = json(dataFile, { strongestFindings: [] });
  const integrity = array(product.strongestFindings).map((finding, index) => ({
    id: `${kind}-${index + 1}`,
    title: finding.title,
    conclusion: finding.conclusion,
    route: finding.itemUrl || finding.sourceUrl,
    classification: String(finding.status || 'record update').replace(/-/g, ' '),
    confidence: gradeConfidence(finding.evidenceGrade),
    evidenceBasis: `${finding.sourceLabel || 'Registered source'}; evidence grade ${finding.evidenceGrade || 'ungraded'}; authority ${finding.authority || 'not stated'}.`,
    supportingCount: 1 + array(finding.wrongdoingIndicators).length,
    freshness: finding.published || product.generatedAt,
    formula: 'Official authority + adjudication/status boundary + severity + recency + corroborating indicators. Charges and allegations never become established wrongdoing without a final record.',
    counterEvidence: finding.counterpoint || 'Counter-records, appeals, dismissals, corrected filings and alternative explanations remain required where applicable.',
    limitation: finding.evidenceBoundary || product.boundary || 'The source establishes only its exact stated scope.',
    sources: [finding.itemUrl || finding.sourceUrl, dataFile, 'data/investigation-source-registry.json', 'data/investigation-ledger.json']
  }));
  product.integrityVersion = 1;
  product.strongestFindings = array(product.strongestFindings).map((item, index) => ({ ...item, integrity: integrity[index] }));
  write(dataFile, JSON.stringify(product, null, 2));
  write(htmlFile, replaceIntegrity(read(htmlFile), section(`${kind.toUpperCase()} CONCLUSION CONFIDENCE CARDS`, 'Each published finding shows its legal/evidential status, direct source, freshness, counter-evidence requirement and exact limitation.', integrity.length ? integrity : [{ title: 'No threshold finding', conclusion: 'No new finding crossed the publication threshold.', classification: 'neutral result', confidence: 'not applicable', evidenceBasis: 'Registered sources were checked, but no finding met the current threshold.', supportingCount: 0, freshness: product.generatedAt, formula: 'No qualifying finding.', counterEvidence: 'Continue monitoring the source ledger.', limitation: 'Absence of a published finding does not prove absence of wrongdoing.', sources: [dataFile], route: 'investigation-source-ledger.html' }])));
  return integrity.length;
}

function brainIntegrity() {
  if (!exists('data/daily-brain-brief.json') || !exists('daily-brain-brief.html')) return 0;
  const brain = json('data/daily-brain-brief.json', { topConclusions: [] });
  const items = array(brain.topConclusions).map((text, index) => ({
    id: `brain-${index + 1}`,
    title: `Daily brain conclusion ${index + 1}`,
    conclusion: text,
    route: 'daily-brain-brief.html',
    classification: 'evidence-graded synthesis',
    confidence: index === 0 ? 'medium-high' : 'medium',
    evidenceBasis: `${brain.summary?.signalCount || 0} signals, ${brain.summary?.scenarioCount || 0} scenarios and ${brain.summary?.outcomeBriefCount || 0} outcome briefs.`,
    supportingCount: Number(brain.summary?.signalCount || 0),
    freshness: brain.updated,
    formula: 'Synthesis of outcome, probability, signal, policy, reserve and disclosure feeds; not a criminal or factual verdict.',
    counterEvidence: 'Downgrade conditions, missing records and contradictory official records must remain visible in the linked source routes.',
    limitation: brain.boundary || 'This is a briefing synthesis, not proof of intent or coordination.',
    sources: ['data/daily-brain-brief.json', 'data/outcome-briefings.json', 'data/probability-lab-core.json']
  }));
  brain.integrityVersion = 1;
  brain.integrity = items;
  write('data/daily-brain-brief.json', JSON.stringify(brain, null, 2));
  write('daily-brain-brief.html', replaceIntegrity(read('daily-brain-brief.html'), section('DAILY BRAIN CONFIDENCE CARDS', 'The daily synthesis is separated from primary records and shows the data volume, freshness and downgrade boundary behind each conclusion.', items)));
  return items.length;
}

function outcomeIntegrity() {
  if (!exists('data/outcome-briefings.json') || !exists('outcome-briefings.html')) return 0;
  const outcomes = json('data/outcome-briefings.json', { briefings: [] });
  const items = array(outcomes.briefings).map(brief => ({
    id: brief.id,
    title: brief.headline,
    conclusion: brief.likely,
    route: array(brief.pages)[0] || 'outcome-briefings.html',
    classification: 'scenario briefing',
    confidence: brief.confidence || 'method-dependent',
    evidenceBasis: `${array(brief.records).length} named record types and ${array(brief.institutions).length} institution classes.`,
    supportingCount: array(brief.records).length,
    freshness: outcomes.updated,
    formula: 'Current situation + named records + institutional mechanism + explicit watch conditions.',
    counterEvidence: `Watch conditions: ${array(brief.watch).join('; ') || 'not stated'}.`,
    limitation: outcomes.boundary || 'A scenario briefing is not a prediction guarantee or proof of a hidden plan.',
    sources: ['data/outcome-briefings.json', ...array(brief.records)]
  }));
  outcomes.integrityVersion = 1;
  outcomes.briefings = array(outcomes.briefings).map((item, index) => ({ ...item, integrity: items[index] }));
  write('data/outcome-briefings.json', JSON.stringify(outcomes, null, 2));
  write('outcome-briefings.html', replaceIntegrity(read('outcome-briefings.html'), section('OUTCOME BRIEFING CONFIDENCE CARDS', 'Scenario language is displayed separately from established facts, with named record requirements and watch conditions.', items)));
  return items.length;
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  power: powerIntegrity(),
  dailyInvestigation: investigationIntegrity('daily'),
  weeklyInvestigation: investigationIntegrity('weekly'),
  dailyBrain: brainIntegrity(),
  outcomes: outcomeIntegrity()
};
fs.mkdirSync(full('downloads'), { recursive: true });
write('downloads/conclusion-integrity-report.json', JSON.stringify(report, null, 2));
console.log(`Conclusion integrity cards built: ${Object.values(report).filter(value => typeof value === 'number').reduce((a, b) => a + b, 0)} cards.`);
