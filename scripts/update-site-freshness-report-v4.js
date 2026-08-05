'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });

const ignoredDirs = new Set(['.git', 'node_modules']);
const ignoredFiles = new Set(['site-freshness-report.html', 'site-quality-report.html']);
const rulesPath = path.join(dataDir, 'figure-source-rules.json');
const policyPath = path.join(dataDir, 'sensitive-figure-policy.json');
const publicationPolicyPath = path.join(dataDir, 'sensitive-publication-policy.json');
const rulesData = fs.existsSync(rulesPath)
  ? JSON.parse(fs.readFileSync(rulesPath, 'utf8'))
  : { rules: [], defaultAction: 'flag-for-review' };
const sensitivePolicy = fs.existsSync(policyPath)
  ? JSON.parse(fs.readFileSync(policyPath, 'utf8'))
  : { requiredFields: [], prominentFilePatterns: [], categories: [] };
const publicationPolicy = fs.existsSync(publicationPolicyPath)
  ? JSON.parse(fs.readFileSync(publicationPolicyPath, 'utf8'))
  : {
      updated: null,
      publicationRule: 'publish-all-with-evidence-status-label',
      withholdingAllowed: false,
      policy: 'Publish every sensitive item with an explicit evidence-status and human-review label.'
    };
const rules = Array.isArray(rulesData.rules) ? rulesData.rules : [];
const reportVersion = 'site-freshness-v4';
const generatedAt = new Date().toISOString();
const htmlFiles = [];

function slash(value) {
  return String(value || '').split(path.sep).join('/');
}
function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    const relative = slash(path.relative(root, full));
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html') && !ignoredFiles.has(entry.name)) htmlFiles.push(relative);
  }
}
walk(root);

function esc(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function visibleCopy(html) {
  return String(html || '')
    .replace(/<!--\s*sensitive-publication-label:start\s*-->[\s\S]*?<!--\s*sensitive-publication-label:end\s*-->/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function contexts(copy, regex, figureType) {
  const output = [];
  for (const match of String(copy || '').matchAll(regex)) {
    const start = Math.max(0, match.index - 90);
    const end = Math.min(copy.length, match.index + match[0].length + 110);
    output.push({
      value: match[0],
      context: copy.slice(start, end).replace(/\s+/g, ' ').trim(),
      figureType
    });
    if (output.length >= 20) break;
  }
  return output;
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
  if (/\d+(?:\.\d+)?\s*%/.test(copy)) score += 2;
  if (/[€$£]\s?\d|\d+\s?(?:million|billion|trillion)/i.test(copy)) score += 2;
  if (/\b20\d{2}\b/.test(copy)) score += 1;
  if (score >= 8) return 'High';
  if (score >= 4) return 'Medium';
  return 'Low';
}
function wildcardMatch(pattern, value) {
  const safe = String(pattern || '')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(safe, 'i').test(String(value || ''));
}
function ruleMatches(rule, file, figure) {
  const fileText = String(file || '').toLowerCase();
  const context = `${figure.value} ${figure.context}`.toLowerCase();
  const fileOk = (rule.filePatterns || [])
    .some(pattern => wildcardMatch(String(pattern).toLowerCase(), fileText));
  const figureOk = !(rule.figurePatterns || []).length
    || (rule.figurePatterns || [])
      .some(pattern => context.includes(String(pattern).toLowerCase()));
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
    reviewNote: rule.reviewNote || null
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
  const missingRuleCount = allFigures
    .filter(figure => figure.classification === 'missing-source-rule').length;
  const autoAllowedCount = allFigures
    .filter(figure => figure.classification === 'auto-update-allowed').length;
  const manualReviewCount = allFigures
    .filter(figure => /manual-review/.test(figure.classification)).length;
  const staticCount = allFigures
    .filter(figure => figure.classification === 'do-not-auto-update').length;
  const recommendation = figureCount === 0
    ? 'No obvious dynamic figures detected.'
    : missingRuleCount
      ? 'Publish with a visible unconfirmed / not-human-reviewed label and add an attributable source rule.'
      : autoAllowedCount && !manualReviewCount
        ? 'Publish with the source-linked label; controlled refresh may remain enabled.'
        : 'Publish with a visible not-human-reviewed label until a human review decision is recorded.';
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
    const fileMatch = (category.filePatterns || [])
      .some(pattern => wildcardMatch(pattern, fileText));
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
  return (sensitivePolicy.prominentFilePatterns || [])
    .some(pattern => wildcardMatch(pattern, canonicalFile(file)));
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
function labelFor({ category, rule, missingBeforeStatus, publicReviewStatus }) {
  if (category.id === 'risk-clock-probability') {
    return {
      evidenceStatus: 'model-output-not-confirmed',
      confirmationStatus: 'not-confirmed',
      publicLabel: 'MODEL OUTPUT · NOT A CONFIRMED EVENT · NOT HUMAN REVIEWED',
      disposition: 'publish-model-output-not-confirmed'
    };
  }
  if (!rule) {
    return {
      evidenceStatus: 'no-attributable-source-rule',
      confirmationStatus: 'unconfirmed',
      publicLabel: 'UNCONFIRMED · NO ATTRIBUTABLE SOURCE RULE · NOT HUMAN REVIEWED',
      disposition: 'publish-unconfirmed-no-attributable-source'
    };
  }
  if (missingBeforeStatus.length > 0) {
    return {
      evidenceStatus: 'source-metadata-incomplete',
      confirmationStatus: 'unconfirmed',
      publicLabel: 'SOURCE METADATA INCOMPLETE · NOT CONFIRMED · NOT HUMAN REVIEWED',
      disposition: 'publish-source-incomplete-not-human-reviewed'
    };
  }
  if (publicReviewStatus === 'static-context-no-update') {
    return {
      evidenceStatus: 'static-source-context',
      confirmationStatus: 'source-linked-not-confirmed',
      publicLabel: 'STATIC SOURCE CONTEXT · NOT HUMAN REVIEWED',
      disposition: 'publish-static-context-not-human-reviewed'
    };
  }
  if (publicReviewStatus === 'eligible-controlled-refresh') {
    return {
      evidenceStatus: 'source-rule-complete',
      confirmationStatus: 'source-linked-not-human-confirmed',
      publicLabel: 'SOURCE-LINKED · NOT HUMAN REVIEWED',
      disposition: 'publish-source-complete-not-human-reviewed'
    };
  }
  return {
    evidenceStatus: 'source-linked-manual-review-pending',
    confirmationStatus: 'source-linked-not-confirmed',
    publicLabel: 'SOURCED · NOT CONFIRMED · NOT HUMAN REVIEWED',
    disposition: 'publish-sourced-not-human-reviewed'
  };
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
  let publicReviewStatus = 'not-human-reviewed';
  if (!rule) publicReviewStatus = 'not-human-reviewed-no-source';
  else if (metadata.updatePolicy === 'do-not-auto-update') {
    publicReviewStatus = 'static-context-no-update';
  } else if (missingBeforeStatus.length > 0) {
    publicReviewStatus = 'not-human-reviewed-source-incomplete';
  } else if (metadata.updatePolicy === 'auto-update-allowed') {
    publicReviewStatus = 'eligible-controlled-refresh';
  } else if (/manual-review/.test(metadata.updatePolicy || '')) {
    publicReviewStatus = 'not-human-reviewed-sourced';
  }
  metadata.publicReviewStatus = publicReviewStatus;
  const missingRequiredFields = requiredFields.filter(field => !metadata[field]);
  const label = labelFor({ category, rule, missingBeforeStatus, publicReviewStatus });
  const automatedPromotionAllowed = publicReviewStatus === 'eligible-controlled-refresh'
    && missingRequiredFields.length === 0;
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
    humanReviewStatus: 'not-human-reviewed',
    publicationAllowed: true,
    publicationStatus: 'published-with-evidence-status-label',
    labelRequired: true,
    ...label,
    missingRequiredFields,
    automatedPromotionAllowed,
    confirmedPublicationAllowed: false,
    reviewAction: automatedPromotionAllowed
      ? 'The labelled figure may receive controlled source refreshes. It remains not human reviewed until an explicit review decision is recorded.'
      : 'Keep the figure public with this label; add or verify the attributable record, source date, scope and evidence classification, then record a human review decision.'
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
reviewItems.sort((a, b) => (sensitivityRank[a.sensitivity] ?? 9)
    - (sensitivityRank[b.sensitivity] ?? 9)
  || Number(b.prominent) - Number(a.prominent)
  || b.missingRequiredFields.length - a.missingRequiredFields.length
  || a.file.localeCompare(b.file)
  || a.id.localeCompare(b.id));

const dispositionCounts = {};
const categoryCounts = {};
const labelCounts = {};
for (const item of reviewItems) {
  dispositionCounts[item.disposition] = (dispositionCounts[item.disposition] || 0) + 1;
  categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
  labelCounts[item.publicLabel] = (labelCounts[item.publicLabel] || 0) + 1;
}
const sensitiveFigureReview = {
  policyUpdated: sensitivePolicy.updated || null,
  publicationPolicyUpdated: publicationPolicy.updated || null,
  publicationRule: publicationPolicy.publicationRule || 'publish-all-with-evidence-status-label',
  withholdingAllowed: publicationPolicy.withholdingAllowed === true,
  policy: publicationPolicy.policy || sensitivePolicy.policy || '',
  requiredFields: sensitivePolicy.requiredFields || [],
  totalUniqueSensitiveFigures: reviewItems.length,
  publishedSensitiveFigures: reviewItems.length,
  publishedWithLabel: reviewItems.filter(item => item.labelRequired).length,
  withheldFigures: 0,
  prominentSensitiveFigures: reviewItems.filter(item => item.prominent).length,
  prominentNotHumanReviewed: reviewItems
    .filter(item => item.prominent && item.humanReviewStatus === 'not-human-reviewed').length,
  unresolvedProminentFigures: reviewItems
    .filter(item => item.prominent && item.humanReviewStatus === 'not-human-reviewed').length,
  automatedPromotionEligible: reviewItems.filter(item => item.automatedPromotionAllowed).length,
  notEligibleForAutomatedPromotion: reviewItems
    .filter(item => !item.automatedPromotionAllowed).length,
  verificationPending: reviewItems
    .filter(item => item.confirmationStatus === 'unconfirmed').length,
  manualReviewRequired: reviewItems
    .filter(item => item.humanReviewStatus === 'not-human-reviewed').length,
  withheldFromAutomatedPromotion: 0,
  dispositionCounts,
  categoryCounts,
  labelCounts,
  queueLimit: null,
  truncatedItems: 0,
  items: reviewItems,
  boundary: 'Nothing in this queue is withheld from publication. Every sensitive figure remains public with an explicit evidence-status label. “Not human reviewed”, “unconfirmed”, “source incomplete” and “model output” labels are publication states—not proof, confirmation or verdicts. Only source-complete rules may drive automated refresh, and no unreviewed item may be presented as human-confirmed evidence.'
};

const unpublished = reviewItems.filter(item => item.publicationAllowed !== true
  || item.publicationStatus !== 'published-with-evidence-status-label'
  || !item.publicLabel
  || item.labelRequired !== true
  || /^withhold-/i.test(item.disposition));
const unsafeConfirmed = reviewItems.filter(item => item.humanReviewStatus === 'not-human-reviewed'
  && (item.confirmedPublicationAllowed === true
    || /\bconfirmed\b/i.test(item.publicLabel.replace(/not (?:a )?confirmed/gi, ''))));
const invalidEligible = reviewItems.filter(item => item.automatedPromotionAllowed
  && (item.missingRequiredFields.length > 0
    || item.publicReviewStatus !== 'eligible-controlled-refresh'));
if (unpublished.length || unsafeConfirmed.length || invalidEligible.length) {
  throw new Error(
    `Sensitive publication label gate failed: ${unpublished.length} unpublished item(s), `
    + `${unsafeConfirmed.length} unreviewed confirmed item(s), `
    + `${invalidEligible.length} incomplete automated item(s).`
  );
}

const report = {
  reportVersion,
  generatedAt,
  generatedBy: 'Matrix Reprogrammed weekly site-wide freshness scanner',
  policy: rulesData.policy
    || 'This scanner finds figures and stale-risk copy. It does not rewrite figures unless a trusted source rule exists.',
  sourceRulesUpdated: rulesData.updated || null,
  sourceRuleCount: rules.length,
  sensitiveFigurePolicyUpdated: sensitivePolicy.updated || null,
  sensitivePublicationPolicyUpdated: publicationPolicy.updated || null,
  publicationRule: publicationPolicy.publicationRule || 'publish-all-with-evidence-status-label',
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
    sensitivePublicationPolicyUpdated: obj.sensitivePublicationPolicyUpdated,
    publicationRule: obj.publicationRule,
    scannedPages: obj.scannedPages,
    sensitiveFigureReview: {
      totalUniqueSensitiveFigures: obj.sensitiveFigureReview?.totalUniqueSensitiveFigures || 0,
      publishedSensitiveFigures: obj.sensitiveFigureReview?.publishedSensitiveFigures || 0,
      withheldFigures: obj.sensitiveFigureReview?.withheldFigures || 0,
      dispositionCounts: obj.sensitiveFigureReview?.dispositionCounts || {},
      categoryCounts: obj.sensitiveFigureReview?.categoryCounts || {},
      labelCounts: obj.sensitiveFigureReview?.labelCounts || {},
      items: (obj.sensitiveFigureReview?.items || []).map(item => ({
        id: item.id,
        publicReviewStatus: item.publicReviewStatus,
        humanReviewStatus: item.humanReviewStatus,
        confirmationStatus: item.confirmationStatus,
        evidenceStatus: item.evidenceStatus,
        publicLabel: item.publicLabel,
        disposition: item.disposition,
        publicationAllowed: item.publicationAllowed,
        automatedPromotionAllowed: item.automatedPromotionAllowed,
        missingRequiredFields: item.missingRequiredFields
      }))
    },
    pages: (obj.pages || []).map(page => ({
      file: page.file,
      priority: page.priority,
      figureCount: page.figureCount,
      missingRuleCount: page.missingRuleCount,
      autoAllowedCount: page.autoAllowedCount,
      manualReviewCount: page.manualReviewCount,
      figures: [...page.percentages, ...page.money, ...page.crisisFigures]
        .map(figure => `${figure.value}:${figure.classification}:${(figure.matchedRules || [])
          .map(rule => rule.id).join('|')}`)
    }))
  });
}

const reportPath = path.join(dataDir, 'site-freshness-report.json');
let previous = null;
if (fs.existsSync(reportPath)) {
  try {
    previous = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch (_) {
    previous = null;
  }
}
const previousContainsObsoletePricing = previous
  && /€\s*(?:19|49)\s*(?:\/|per\s*)month/i.test(JSON.stringify(previous));
if (previous
  && !previousContainsObsoletePricing
  && stableSignature(previous) === stableSignature(report)) {
  console.log(
    `Site freshness scan checked ${htmlFiles.length} pages: `
    + 'no meaningful figure-rule or publication-label changes.'
  );
  process.exit(0);
}
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const displayItems = sensitiveFigureReview.items.slice(0, 100);
const queueLines = displayItems.map(item =>
  `- **${item.publicLabel}** · ${item.file} · ${item.value} · `
  + `${item.categoryLabel} · missing: ${item.missingRequiredFields.join(', ') || 'none'}`
);
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
  '## Sensitive Figure Publication Labels',
  sensitiveFigureReview.policy,
  '',
  `Unique sensitive figures: ${sensitiveFigureReview.totalUniqueSensitiveFigures}`,
  `Published sensitive figures: ${sensitiveFigureReview.publishedSensitiveFigures}`,
  `Published with an evidence-status label: ${sensitiveFigureReview.publishedWithLabel}`,
  `Withheld figures: ${sensitiveFigureReview.withheldFigures}`,
  `Prominent figures not human reviewed: ${sensitiveFigureReview.prominentNotHumanReviewed}`,
  `Not eligible for automated promotion: ${sensitiveFigureReview.notEligibleForAutomatedPromotion}`,
  `Eligible for controlled refresh: ${sensitiveFigureReview.automatedPromotionEligible}`,
  `Machine-readable items published: ${sensitiveFigureReview.items.length}`,
  `Truncated items: ${sensitiveFigureReview.truncatedItems}`,
  '',
  ...queueLines,
  '',
  '## High Priority Pages',
  ...pages.filter(page => page.priority === 'High').slice(0, 30)
    .map(page => `- ${page.file}: ${page.figureCount} figure/stat markers; `
      + `${page.missingRuleCount} missing rules. ${page.recommendation}`),
  '',
  '## Missing Source Rules',
  ...pages.filter(page => page.missingRuleCount > 0).slice(0, 40)
    .map(page => `- ${page.file}: ${page.missingRuleCount} figure(s) need source rules.`),
  '',
  '## Publication Boundary',
  '- Nothing in the sensitive queue is hidden or withheld from publication.',
  '- Every sensitive item carries a visible publicLabel and machine-readable evidence status.',
  '- “Not human reviewed” and “unconfirmed” items must not be represented as established fact.',
  '- Risk scores and clocks are labelled model outputs, not confirmed events.',
  '- Automated source refresh remains limited to complete source rules; publication is not the same as confirmation.',
  '- The review path is publish with label → source record → human review → corrected or confirmed status.'
].join('\n');
fs.writeFileSync(path.join(downloadsDir, 'site-freshness-report.md'), md);

const reviewCards = displayItems.map(item =>
  `<article class="card ${item.sensitivity === 'critical' ? 'redline' : ''}" `
  + `data-publication-status="${esc(item.publicationStatus)}">`
  + `<span class="label">${esc(item.publicLabel)}</span>`
  + `<h3>${esc(item.file)} · ${esc(item.value)}</h3>`
  + `<p>${esc(item.categoryLabel)}</p>`
  + `<p><strong>Evidence status:</strong> ${esc(item.evidenceStatus)}<br />`
  + `<strong>Human review:</strong> ${esc(item.humanReviewStatus)}<br />`
  + `<strong>Missing:</strong> ${esc(item.missingRequiredFields.join(', ') || 'none')}</p>`
  + `<details><summary>Context and next action</summary>`
  + `<p>${esc(item.context)}</p><p>${esc(item.reviewAction)}</p></details></article>`
).join('');
const cards = pages.slice(0, 100).map(page => {
  const examples = [...page.percentages, ...page.money, ...page.crisisFigures]
    .slice(0, 8)
    .map(figure => `${figure.value} — ${figure.classification} — ${figure.context}`)
    .join('\n');
  return `<article class="card ${page.priority === 'High' ? 'redline' : ''}">`
    + `<span class="label">${esc(page.priority)} · ${page.figureCount} figures · `
    + `${page.missingRuleCount} missing rules</span><h3>${esc(page.file)}</h3>`
    + `<p>${esc(page.recommendation)}</p><details><summary>Detected examples</summary>`
    + `<p>${esc(examples)}</p></details></article>`;
}).join('');
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />`
  + `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`
  + `<title>Site Freshness Report | Matrix Reprogrammed</title>`
  + `<meta name="description" content="Weekly figure freshness and evidence-status labels for Matrix Reprogrammed pages." />`
  + `<link rel="stylesheet" href="styles.css" /></head><body><canvas id="matrix"></canvas>`
  + `<div class="signal-face"></div><div class="veil"></div><div class="page">`
  + `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" `
  + `alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav">`
  + `<a href="index.html">Home</a><a href="live-intel.html">Live Intel</a>`
  + `<a href="news.html">Intel Desk</a><a href="evidence-vault.html">Evidence Vault</a>`
  + `<a href="books.html">Books</a></nav></header><main><section class="hero wrap">`
  + `<div class="eyebrow">Weekly Freshness and Publication Labels</div>`
  + `<h1>SITE FRESHNESS REPORT.</h1><p class="lead">Sensitive figures remain public. `
  + `Each item is marked with its evidence status, source completeness and human-review status. `
  + `A label is not proof that the underlying claim is true or false.</p><div class="cta-row">`
  + `<a class="btn" href="data/site-freshness-report.json">JSON Report</a>`
  + `<a class="btn alt" href="downloads/site-freshness-report.md">Markdown Report</a>`
  + `<a class="btn alt" href="data/figure-source-rules.json">Source Rules</a>`
  + `<a class="btn alt" href="data/sensitive-figure-policy.json">Figure Classification Policy</a>`
  + `<a class="btn alt" href="data/sensitive-publication-policy.json">Publication Label Policy</a>`
  + `</div></section><section class="section wrap split"><div class="terminal">`
  + `FRESHNESS SCAN STATUS\n&gt; Report version: ${report.reportVersion}`
  + `\n&gt; Pages scanned: ${report.scannedPages}`
  + `\n&gt; Sensitive figures published: ${sensitiveFigureReview.publishedSensitiveFigures}`
  + `\n&gt; Withheld figures: ${sensitiveFigureReview.withheldFigures}`
  + `\n&gt; Not human reviewed: ${sensitiveFigureReview.manualReviewRequired}`
  + `\n&gt; Controlled-refresh eligible: ${sensitiveFigureReview.automatedPromotionEligible}`
  + `\n&gt; Missing-rule figures: ${report.missingRuleFigures}</div>`
  + `<aside class="card redline"><h2>Evidence Boundary</h2>`
  + `<p>${esc(sensitiveFigureReview.boundary)}</p></aside></section>`
  + `<section class="section wrap"><h2>Sensitive Figure Publication Labels</h2>`
  + `<p class="lead">Nothing in this queue is withheld. Labels distinguish source-linked records, `
  + `unconfirmed material, incomplete source metadata, model outputs and items that have not received human review.</p>`
  + `<div class="grid">${reviewCards}</div></section><section class="section wrap">`
  + `<h2>Flagged Pages</h2><div class="grid">${cards}</div></section></main>`
  + `<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — publish, label, source, review, correct.</p>`
  + `</footer></div><script src="matrix.js"></script></body></html>`;
fs.writeFileSync(path.join(root, 'site-freshness-report.html'), html);

const generated = `${JSON.stringify(report)}\n${md}\n${html}`;
if (/€\s*(?:19|49)\s*(?:\/|per\s*)month/i.test(generated)) {
  throw new Error('Site freshness report republished obsolete membership pricing');
}
if (/withhold-prominent-publication|withhold-from-automated-promotion/i.test(generated)) {
  throw new Error('Site freshness report retained a withholding disposition');
}
console.log(
  `Site freshness scan complete: ${report.flaggedPages} flagged pages from `
  + `${report.scannedPages} scanned pages; ${report.missingRuleFigures} figures need source rules; `
  + `${sensitiveFigureReview.publishedSensitiveFigures} sensitive figures published with labels; `
  + `${sensitiveFigureReview.withheldFigures} withheld.`
);
