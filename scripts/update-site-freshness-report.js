const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

const ignoredDirs = new Set(['.git', 'node_modules']);
const ignoredFiles = new Set(['site-freshness-report.html', 'site-quality-report.html']);
const rulesPath = path.join(dataDir, 'figure-source-rules.json');
const policyPath = path.join(dataDir, 'sensitive-figure-policy.json');
const rulesData = fs.existsSync(rulesPath)
  ? JSON.parse(fs.readFileSync(rulesPath, 'utf8'))
  : { rules: [], defaultAction: 'flag-for-review' };
const sensitivePolicy = fs.existsSync(policyPath)
  ? JSON.parse(fs.readFileSync(policyPath, 'utf8'))
  : { requiredFields: [], prominentFilePatterns: [], categories: [], queueLimit: 300 };
const rules = rulesData.rules || [];
const reportVersion = 'site-freshness-v3';
const generatedAt = new Date().toISOString();
const htmlFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replace(/\\/g, '/');
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html') && !ignoredFiles.has(entry.name)) htmlFiles.push(rel);
  }
}
walk(root);

function esc(s = '') {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function visibleCopy(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function contexts(copy, regex, figureType) {
  const out = [];
  for (const match of copy.matchAll(regex)) {
    const start = Math.max(0, match.index - 90);
    const end = Math.min(copy.length, match.index + match[0].length + 110);
    const context = copy.slice(start, end).replace(/\s+/g, ' ').trim();
    out.push({ value: match[0], context, figureType });
    if (out.length >= 20) break;
  }
  return out;
}
function priorityFor(copy, file) {
  const text = `${file} ${copy}`.toLowerCase();
  let score = 0;
  for (const term of [
    'latest', 'current', 'today', 'weekly', 'live', 'updated', 'crisis', 'figure',
    'rate', 'percent', 'percentage', 'death', 'deaths', 'claim', 'claims',
    'payout', 'migration', 'vaccine', 'epstein', 'war', 'conflict',
    'surveillance', 'inflation', 'crime', 'cartel', 'human cost'
  ]) if (text.includes(term)) score += 1;
  if (/\d+(\.\d+)?\s*%/.test(copy)) score += 2;
  if (/[€$£]\s?\d|\d+\s?(million|billion|trillion)/i.test(copy)) score += 2;
  if (/\b20\d{2}\b/.test(copy)) score += 1;
  if (score >= 8) return 'High';
  if (score >= 4) return 'Medium';
  return 'Low';
}
function wildcardMatch(pattern, value) {
  const safe = String(pattern)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(safe, 'i').test(value);
}
function ruleMatches(rule, file, figure) {
  const fileText = file.toLowerCase();
  const context = `${figure.value} ${figure.context}`.toLowerCase();
  const fileOk = (rule.filePatterns || []).some(pattern => wildcardMatch(pattern.toLowerCase(), fileText));
  const figureOk = !(rule.figurePatterns || []).length
    || (rule.figurePatterns || []).some(pattern => context.includes(String(pattern).toLowerCase()));
  return fileOk && figureOk;
}
function compactRule(rule) {
  if (!rule) return null;
  return {
    id: rule.id,
    label: rule.label,
    updatePolicy: rule.updatePolicy,
    sourceType: rule.sourceType,
    sourceFiles: rule.sourceFiles || [],
    sourceName: rule.sourceName || null,
    publisher: rule.publisher || null,
    sourceDatePolicy: rule.sourceDatePolicy || null,
    scope: rule.scope || null,
    evidenceClassification: rule.evidenceClassification || null,
    reviewNote: rule.reviewNote
  };
}
function classifyFigure(file, figure) {
  const matched = rules.filter(rule => ruleMatches(rule, file, figure));
  if (!matched.length) {
    return {
      ...figure,
      classification: 'missing-source-rule',
      updatePolicy: rulesData.defaultAction || 'flag-for-review',
      selectedRule: null,
      matchedRules: []
    };
  }
  const strongest = matched.find(rule => rule.updatePolicy === 'auto-update-allowed')
    || matched.find(rule => rule.updatePolicy === 'manual-review-only')
    || matched.find(rule => rule.updatePolicy === 'manual-review-before-public-claim')
    || matched[0];
  return {
    ...figure,
    classification: strongest.updatePolicy || 'manual-review-only',
    updatePolicy: strongest.updatePolicy || 'manual-review-only',
    selectedRule: compactRule(strongest),
    matchedRules: matched.map(compactRule)
  };
}
function isObsoleteMembershipFigure(figure) {
  return /€\s*(?:19|49)\s*(?:\/|per\s*)month/i.test(`${figure.value} ${figure.context}`);
}

const pages = htmlFiles.map(file => {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const copy = visibleCopy(html);
  const percentages = contexts(copy, /\b\d+(?:\.\d+)?\s*%(?!\w)/g, 'percentage');
  const money = contexts(
    copy,
    /(?:[€$£]\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:million|billion|trillion)\b)/gi,
    'money'
  ).filter(figure => !isObsoleteMembershipFigure(figure));
  const dates = contexts(copy, /\b(?:20\d{2}|19\d{2})\b/g, 'date');
  const crisisFigures = contexts(
    copy,
    /\b\d[\d,.]*\s?(?:deaths?|claims?|cases?|migrants?|refugees?|payouts?|lawsuits?|files?|pages?|sources?|bulletins?|updates?|feeds?|lanes?|maps?|offers?|books?)\b/gi,
    'count'
  );
  const classifiedPercentages = percentages.map(figure => classifyFigure(file, figure));
  const classifiedMoney = money.map(figure => classifyFigure(file, figure));
  const classifiedCrisis = crisisFigures.map(figure => classifyFigure(file, figure));
  const allFigures = [...classifiedPercentages, ...classifiedMoney, ...classifiedCrisis];
  const figureCount = allFigures.length;
  const missingRuleCount = allFigures.filter(figure => figure.classification === 'missing-source-rule').length;
  const autoAllowedCount = allFigures.filter(figure => figure.classification === 'auto-update-allowed').length;
  const manualReviewCount = allFigures.filter(figure => /manual-review/.test(figure.classification)).length;
  const staticCount = allFigures.filter(figure => figure.classification === 'do-not-auto-update').length;
  const recommendation = figureCount === 0
    ? 'No obvious dynamic figures detected.'
    : missingRuleCount
      ? 'Add figure-source rules before automatic replacement.'
      : autoAllowedCount && !manualReviewCount
        ? 'Eligible for controlled automatic data refresh from source rules.'
        : 'Covered by source rules, but manual review is required before public figure changes.';
  return {
    file,
    priority: priorityFor(copy, file),
    figureCount,
    missingRuleCount,
    autoAllowedCount,
    manualReviewCount,
    staticCount,
    percentages: classifiedPercentages,
    money: classifiedMoney,
    crisisFigures: classifiedCrisis,
    dates: dates.slice(0, 6),
    needsSourceRule: missingRuleCount > 0,
    recommendation
  };
}).filter(page => page.figureCount || page.priority !== 'Low')
  .sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority]
    - { High: 0, Medium: 1, Low: 2 }[b.priority])
    || b.missingRuleCount - a.missingRuleCount
    || b.figureCount - a.figureCount);

function canonicalFile(file) {
  return String(file || '').replace(/^_site\//i, '');
}
function categoryFor(file, figure) {
  const fileText = canonicalFile(file).toLowerCase();
  const contextText = `${figure.value} ${figure.context}`.toLowerCase();
  const candidates = [];
  for (const category of sensitivePolicy.categories || []) {
    const types = category.figureTypes || [];
    if (types.length && !types.includes(figure.figureType)) continue;
    const fileMatch = (category.filePatterns || []).some(pattern => wildcardMatch(pattern, fileText));
    const termMatches = (category.contextTerms || [])
      .filter(term => contextText.includes(String(term).toLowerCase())).length;
    const score = (fileMatch ? 5 : 0) + Math.min(termMatches, 4) * 2;
    if (score < Number(category.minimumScore || 2)) continue;
    candidates.push({ category, score });
  }
  candidates.sort((a, b) => b.score - a.score
    || Number(b.category.priority || 0) - Number(a.category.priority || 0));
  return candidates[0]?.category || null;
}
function isProminent(file) {
  const canonical = canonicalFile(file);
  return (sensitivePolicy.prominentFilePatterns || [])
    .some(pattern => wildcardMatch(pattern, canonical));
}
function sourceDateFor(rule) {
  if (!rule) return null;
  if (rule.sourceDatePolicy === 'report-generated-at') return generatedAt.slice(0, 10);
  return null;
}
function signatureFor(file, figure, category) {
  const normalizedContext = String(figure.context || '')
    .toLowerCase()
    .replace(/\d+(?:[.,]\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
  return `${canonicalFile(file)}|${figure.figureType}|${category.id}|${normalizedContext}`;
}
function buildReviewItem(page, figure, category) {
  const rule = figure.selectedRule;
  const prominent = isProminent(page.file);
  const metadata = {
    sourceName: rule?.sourceName || null,
    publisher: rule?.publisher || null,
    sourceDate: sourceDateFor(rule),
    scope: rule?.scope || category.scope || null,
    evidenceClassification: rule?.evidenceClassification
      || category.defaultEvidenceClassification
      || null,
    updatePolicy: figure.updatePolicy || null,
    publicReviewStatus: null
  };
  const requiredFields = sensitivePolicy.requiredFields || [];
  const missingBeforeStatus = requiredFields
    .filter(field => field !== 'publicReviewStatus' && !metadata[field]);
  let publicReviewStatus = 'verification-pending';
  if (!rule) publicReviewStatus = 'verification-pending';
  else if (metadata.updatePolicy === 'do-not-auto-update') publicReviewStatus = 'static-context-no-update';
  else if (metadata.updatePolicy === 'auto-update-allowed' && missingBeforeStatus.length === 0) {
    publicReviewStatus = 'eligible-controlled-refresh';
  } else if (/manual-review/.test(metadata.updatePolicy || '')) {
    publicReviewStatus = 'manual-review-required';
  }
  metadata.publicReviewStatus = publicReviewStatus;
  const missingRequiredFields = requiredFields.filter(field => !metadata[field]);
  const highStakes = ['critical', 'high'].includes(category.sensitivity);
  let disposition = 'verification-pending';
  if (publicReviewStatus === 'eligible-controlled-refresh' && missingRequiredFields.length === 0) {
    disposition = 'eligible-controlled-refresh';
  } else if (publicReviewStatus === 'static-context-no-update') {
    disposition = 'do-not-auto-update';
  } else if (prominent && highStakes) {
    disposition = 'withhold-prominent-publication';
  } else if (highStakes) {
    disposition = 'withhold-from-automated-promotion';
  }
  const id = crypto.createHash('sha256')
    .update(signatureFor(page.file, figure, category))
    .digest('hex')
    .slice(0, 20);
  return {
    id,
    file: canonicalFile(page.file),
    pagePriority: page.priority,
    figureType: figure.figureType,
    value: figure.value,
    context: figure.context,
    category: category.id,
    categoryLabel: category.label,
    sensitivity: category.sensitivity,
    prominent,
    classification: figure.classification,
    sourceRuleIds: (figure.matchedRules || []).map(item => item.id),
    sourceFiles: rule?.sourceFiles || [],
    ...metadata,
    missingRequiredFields,
    disposition,
    automatedPromotionAllowed: disposition === 'eligible-controlled-refresh',
    reviewAction: disposition === 'eligible-controlled-refresh'
      ? 'Controlled refresh may use the named generated source lane.'
      : 'Open the attributable record, capture the named publisher and source date, verify scope and classification, then record a human review decision.'
  };
}

const reviewItems = [];
const seenReviewIds = new Set();
for (const page of pages) {
  for (const figure of [...page.percentages, ...page.money, ...page.crisisFigures]) {
    const category = categoryFor(page.file, figure);
    if (!category || category.queue !== true) continue;
    const item = buildReviewItem(page, figure, category);
    if (seenReviewIds.has(item.id)) continue;
    seenReviewIds.add(item.id);
    reviewItems.push(item);
  }
}
const sensitivityRank = { critical: 0, high: 1, medium: 2, low: 3 };
reviewItems.sort((a, b) => (sensitivityRank[a.sensitivity] ?? 9) - (sensitivityRank[b.sensitivity] ?? 9)
  || Number(b.prominent) - Number(a.prominent)
  || b.missingRequiredFields.length - a.missingRequiredFields.length
  || a.file.localeCompare(b.file)
  || a.id.localeCompare(b.id));

const queueLimit = Math.max(1, Number(sensitivePolicy.queueLimit || 300));
const dispositionCounts = {};
const categoryCounts = {};
for (const item of reviewItems) {
  dispositionCounts[item.disposition] = (dispositionCounts[item.disposition] || 0) + 1;
  categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
}
const sensitiveFigureReview = {
  policyUpdated: sensitivePolicy.updated || null,
  policy: sensitivePolicy.policy || '',
  requiredFields: sensitivePolicy.requiredFields || [],
  totalUniqueSensitiveFigures: reviewItems.length,
  prominentSensitiveFigures: reviewItems.filter(item => item.prominent).length,
  unresolvedProminentFigures: reviewItems.filter(item => item.disposition === 'withhold-prominent-publication').length,
  automatedPromotionEligible: reviewItems.filter(item => item.automatedPromotionAllowed).length,
  verificationPending: reviewItems.filter(item => item.publicReviewStatus === 'verification-pending').length,
  manualReviewRequired: reviewItems.filter(item => item.publicReviewStatus === 'manual-review-required').length,
  withheldFromAutomatedPromotion: reviewItems.filter(item => /^withhold-/.test(item.disposition)).length,
  dispositionCounts,
  categoryCounts,
  queueLimit,
  truncatedItems: Math.max(0, reviewItems.length - queueLimit),
  items: reviewItems.slice(0, queueLimit),
  boundary: 'A queue item is not a verdict and does not prove the underlying claim. Critical and high-sensitivity figures cannot be automatically promoted unless every required source field is present and the rule explicitly allows controlled refresh.'
};

const invalidEligible = reviewItems.filter(item => item.automatedPromotionAllowed
  && (item.missingRequiredFields.length > 0 || item.publicReviewStatus !== 'eligible-controlled-refresh'));
const unsafeHighStakes = reviewItems.filter(item => ['critical', 'high'].includes(item.sensitivity)
  && item.automatedPromotionAllowed
  && item.disposition !== 'eligible-controlled-refresh');
if (invalidEligible.length || unsafeHighStakes.length) {
  throw new Error(`Sensitive figure publication gate failed: ${invalidEligible.length} incomplete eligible item(s), ${unsafeHighStakes.length} unsafe high-stakes item(s).`);
}

const report = {
  reportVersion,
  generatedAt,
  generatedBy: 'Matrix Reprogrammed weekly site-wide freshness scanner',
  policy: rulesData.policy || 'This scanner finds figures and stale-risk copy. It does not rewrite figures unless a trusted source rule exists.',
  sourceRulesUpdated: rulesData.updated || null,
  sourceRuleCount: rules.length,
  sensitiveFigurePolicyUpdated: sensitivePolicy.updated || null,
  scannedPages: htmlFiles.length,
  flaggedPages: pages.length,
  highPriorityPages: pages.filter(page => page.priority === 'High').length,
  mediumPriorityPages: pages.filter(page => page.priority === 'Medium').length,
  pagesWithMissingRules: pages.filter(page => page.missingRuleCount > 0).length,
  autoUpdateEligibleFigures: pages.reduce((sum, page) => sum + page.autoAllowedCount, 0),
  manualReviewFigures: pages.reduce((sum, page) => sum + page.manualReviewCount, 0),
  missingRuleFigures: pages.reduce((sum, page) => sum + page.missingRuleCount, 0),
  sensitiveFigureReview,
  pages
};
function stableSignature(obj) {
  return JSON.stringify({
    reportVersion: obj.reportVersion || null,
    sourceRuleCount: obj.sourceRuleCount,
    sourceRulesUpdated: obj.sourceRulesUpdated,
    sensitiveFigurePolicyUpdated: obj.sensitiveFigurePolicyUpdated,
    scannedPages: obj.scannedPages,
    sensitiveFigureReview: {
      totalUniqueSensitiveFigures: obj.sensitiveFigureReview?.totalUniqueSensitiveFigures || 0,
      prominentSensitiveFigures: obj.sensitiveFigureReview?.prominentSensitiveFigures || 0,
      dispositionCounts: obj.sensitiveFigureReview?.dispositionCounts || {},
      categoryCounts: obj.sensitiveFigureReview?.categoryCounts || {},
      items: (obj.sensitiveFigureReview?.items || []).map(item => ({
        id: item.id,
        publicReviewStatus: item.publicReviewStatus,
        disposition: item.disposition,
        missingRequiredFields: item.missingRequiredFields
      }))
    },
    pages: obj.pages.map(page => ({
      file: page.file,
      priority: page.priority,
      figureCount: page.figureCount,
      missingRuleCount: page.missingRuleCount,
      autoAllowedCount: page.autoAllowedCount,
      manualReviewCount: page.manualReviewCount,
      figures: [...page.percentages, ...page.money, ...page.crisisFigures]
        .map(figure => `${figure.value}:${figure.classification}:${(figure.matchedRules || []).map(rule => rule.id).join('|')}`)
    }))
  });
}
const reportPath = path.join(dataDir, 'site-freshness-report.json');
let previous = null;
if (fs.existsSync(reportPath)) {
  try { previous = JSON.parse(fs.readFileSync(reportPath, 'utf8')); } catch (_) {}
}
const previousContainsObsoletePricing = previous
  && /€\s*(?:19|49)\s*(?:\/|per\s*)month/i.test(JSON.stringify(previous));
if (previous
  && !previousContainsObsoletePricing
  && stableSignature(previous) === stableSignature(report)) {
  console.log(`Site freshness scan checked ${htmlFiles.length} pages: no meaningful figure-rule or sensitive-review changes.`);
  process.exit(0);
}
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

const queueLines = sensitiveFigureReview.items.slice(0, 100).map(item =>
  `- **${item.sensitivity.toUpperCase()} · ${item.disposition}** · ${item.file} · ${item.value} · ${item.categoryLabel} · missing: ${item.missingRequiredFields.join(', ') || 'none'}`);
const md = [
  '# Site Freshness Report',
  '',
  report.policy,
  '',
  `Report version: ${report.reportVersion}`,
  `Source rules: ${report.sourceRuleCount}`,
  `Scanned pages: ${report.scannedPages}`,
  `Flagged pages: ${report.flaggedPages}`,
  `High priority pages: ${report.highPriorityPages}`,
  `Medium priority pages: ${report.mediumPriorityPages}`,
  `Pages with missing rules: ${report.pagesWithMissingRules}`,
  `Auto-update eligible figures: ${report.autoUpdateEligibleFigures}`,
  `Manual-review figures: ${report.manualReviewFigures}`,
  `Missing-rule figures: ${report.missingRuleFigures}`,
  '',
  '## Sensitive Figure Review Queue',
  sensitiveFigureReview.policy,
  '',
  `Unique sensitive figures: ${sensitiveFigureReview.totalUniqueSensitiveFigures}`,
  `Prominent sensitive figures: ${sensitiveFigureReview.prominentSensitiveFigures}`,
  `Prominent figures withheld pending verification: ${sensitiveFigureReview.unresolvedProminentFigures}`,
  `Withheld from automated promotion: ${sensitiveFigureReview.withheldFromAutomatedPromotion}`,
  `Eligible for controlled refresh: ${sensitiveFigureReview.automatedPromotionEligible}`,
  `Queue items shown: ${sensitiveFigureReview.items.length}`,
  `Truncated items: ${sensitiveFigureReview.truncatedItems}`,
  '',
  ...queueLines,
  '',
  '## High Priority Pages',
  ...pages.filter(page => page.priority === 'High').slice(0, 30)
    .map(page => `- ${page.file}: ${page.figureCount} figure/stat markers; ${page.missingRuleCount} missing rules. ${page.recommendation}`),
  '',
  '## Missing Source Rules',
  ...pages.filter(page => page.missingRuleCount > 0).slice(0, 40)
    .map(page => `- ${page.file}: ${page.missingRuleCount} figure(s) need source rules.`),
  '',
  '## Automated Publication Boundary',
  '- Live Intel and site inventory counts may update automatically only when a rule allows it and every required metadata field is present.',
  '- Criminal allegations, Epstein or victim material, health, deaths, migration, money, public policy and risk scores enter the sensitive review queue.',
  '- A queued figure marked withhold-prominent-publication or withhold-from-automated-promotion cannot be treated as cleared evidence.',
  '- The safe path is scan → classify → source record → public review → controlled update.'
].join('\n');
fs.writeFileSync(path.join(downloadsDir, 'site-freshness-report.md'), md);

const reviewCards = sensitiveFigureReview.items.slice(0, 100).map(item =>
  `<article class="card ${item.sensitivity === 'critical' ? 'redline' : ''}"><span class="label">${esc(item.sensitivity)} · ${esc(item.disposition)}</span><h3>${esc(item.file)} · ${esc(item.value)}</h3><p>${esc(item.categoryLabel)}</p><p><strong>Review status:</strong> ${esc(item.publicReviewStatus)}<br /><strong>Missing:</strong> ${esc(item.missingRequiredFields.join(', ') || 'none')}</p><details><summary>Context and next action</summary><p>${esc(item.context)}</p><p>${esc(item.reviewAction)}</p></details></article>`
).join('');
const cards = pages.slice(0, 100).map(page => {
  const examples = [...page.percentages, ...page.money, ...page.crisisFigures]
    .slice(0, 8)
    .map(figure => `${figure.value} — ${figure.classification} — ${figure.context}`)
    .join('\n');
  return `<article class="card ${page.priority === 'High' ? 'redline' : ''}"><span class="label">${esc(page.priority)} · ${page.figureCount} figures · ${page.missingRuleCount} missing rules</span><h3>${esc(page.file)}</h3><p>${esc(page.recommendation)}</p><details><summary>Detected examples</summary><p>${esc(examples)}</p></details></article>`;
}).join('');
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Site Freshness Report | Matrix Reprogrammed</title><meta name="description" content="Weekly figure freshness and sensitive-publication review for Matrix Reprogrammed pages." /><link rel="stylesheet" href="styles.css" /></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="live-intel.html">Live Intel</a><a href="news.html">Intel Desk</a><a href="evidence-vault.html">Evidence Vault</a><a href="books.html">Books</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Weekly Freshness and Publication Review</div><h1>SITE FRESHNESS REPORT.</h1><p class="lead">This report scans public pages for figures, percentages, money amounts, crisis numbers, dates, deaths, claims and stale-risk language. Sensitive figures enter a source-completeness queue before controlled refresh or automated promotion.</p><div class="cta-row"><a class="btn" href="data/site-freshness-report.json">JSON Report</a><a class="btn alt" href="downloads/site-freshness-report.md">Markdown Report</a><a class="btn alt" href="data/figure-source-rules.json">Source Rules</a><a class="btn alt" href="data/sensitive-figure-policy.json">Sensitive Figure Policy</a></div></section><section class="section wrap split"><div class="terminal">FRESHNESS SCAN STATUS\n&gt; Report version: ${report.reportVersion}\n&gt; Pages scanned: ${report.scannedPages}\n&gt; Flagged pages: ${report.flaggedPages}\n&gt; Source rules: ${report.sourceRuleCount}\n&gt; Sensitive figures: ${sensitiveFigureReview.totalUniqueSensitiveFigures}\n&gt; Prominent figures withheld: ${sensitiveFigureReview.unresolvedProminentFigures}\n&gt; Controlled-refresh eligible: ${sensitiveFigureReview.automatedPromotionEligible}\n&gt; Missing-rule figures: ${report.missingRuleFigures}</div><aside class="card redline"><h2>Evidence Boundary</h2><p>${esc(sensitiveFigureReview.boundary)}</p></aside></section><section class="section wrap"><h2>Sensitive Figure Review Queue</h2><p class="lead">The queue separates figures that may update from figures that need a named source, date, scope and human review. A queue entry is not proof that the underlying claim is true or false.</p><div class="grid">${reviewCards}</div></section><section class="section wrap"><h2>Flagged Pages</h2><div class="grid">${cards}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — scan, classify, verify, then update.</p></footer></div><script src="matrix.js"></script></body></html>`;
fs.writeFileSync(path.join(root, 'site-freshness-report.html'), html);

const generated = `${JSON.stringify(report)}\n${md}\n${html}`;
if (/€\s*(?:19|49)\s*(?:\/|per\s*)month/i.test(generated)) {
  throw new Error('Site freshness report republished obsolete membership pricing');
}
console.log(`Site freshness scan complete: ${report.flaggedPages} flagged pages from ${report.scannedPages} scanned pages; ${report.missingRuleFigures} figures need source rules; ${sensitiveFigureReview.totalUniqueSensitiveFigures} sensitive figures queued.`);
