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
const rulesData = fs.existsSync(rulesPath) ? JSON.parse(fs.readFileSync(rulesPath, 'utf8')) : { rules: [], defaultAction: 'flag-for-review' };
const rules = rulesData.rules || [];
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

function esc(s = '') { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function visibleCopy(html) { return html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function contexts(copy, regex) { const out = []; for (const match of copy.matchAll(regex)) { const start = Math.max(0, match.index - 90); const end = Math.min(copy.length, match.index + match[0].length + 110); const context = copy.slice(start, end).replace(/\s+/g, ' ').trim(); out.push({ value: match[0], context }); if (out.length >= 20) break; } return out; }
function priorityFor(copy, file) { const text = `${file} ${copy}`.toLowerCase(); let score = 0; for (const term of ['latest','current','today','weekly','live','updated','crisis','figure','rate','percent','percentage','death','deaths','claim','claims','payout','migration','vaccine','epstein','war','conflict','surveillance','inflation','crime','cartel','human cost']) if (text.includes(term)) score += 1; if (/\d+(\.\d+)?\s*%/.test(copy)) score += 2; if (/[€$£]\s?\d|\d+\s?(million|billion|trillion)/i.test(copy)) score += 2; if (/\b20\d{2}\b/.test(copy)) score += 1; if (score >= 8) return 'High'; if (score >= 4) return 'Medium'; return 'Low'; }
function wildcardMatch(pattern, value) { const safe = String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'); return new RegExp(safe, 'i').test(value); }
function ruleMatches(rule, file, figure) { const fileText = file.toLowerCase(); const context = `${figure.value} ${figure.context}`.toLowerCase(); const fileOk = (rule.filePatterns || []).some(pattern => wildcardMatch(pattern.toLowerCase(), fileText)); const figureOk = !(rule.figurePatterns || []).length || (rule.figurePatterns || []).some(pattern => context.includes(String(pattern).toLowerCase())); return fileOk && figureOk; }
function classifyFigure(file, figure) { const matched = rules.filter(rule => ruleMatches(rule, file, figure)); if (!matched.length) return { ...figure, classification: 'missing-source-rule', updatePolicy: rulesData.defaultAction || 'flag-for-review', matchedRules: [] }; const strongest = matched.find(r => r.updatePolicy === 'auto-update-allowed') || matched.find(r => r.updatePolicy === 'manual-review-only') || matched[0]; return { ...figure, classification: strongest.updatePolicy || 'manual-review-only', updatePolicy: strongest.updatePolicy || 'manual-review-only', matchedRules: matched.map(r => ({ id: r.id, label: r.label, updatePolicy: r.updatePolicy, sourceType: r.sourceType, reviewNote: r.reviewNote })) }; }
const pages = htmlFiles.map(file => {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const copy = visibleCopy(html);
  const percentages = contexts(copy, /\b\d+(?:\.\d+)?\s*%\b/g);
  const money = contexts(copy, /(?:[€$£]\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:million|billion|trillion)\b)/gi);
  const dates = contexts(copy, /\b(?:20\d{2}|19\d{2})\b/g);
  const crisisFigures = contexts(copy, /\b\d[\d,.]*\s?(?:deaths?|claims?|cases?|migrants?|refugees?|payouts?|lawsuits?|files?|pages?|sources?|bulletins?|updates?|feeds?|lanes?|maps?|offers?|books?)\b/gi);
  const allFigures = [...percentages, ...money, ...crisisFigures].map(fig => classifyFigure(file, fig));
  const figureCount = allFigures.length;
  const missingRuleCount = allFigures.filter(f => f.classification === 'missing-source-rule').length;
  const autoAllowedCount = allFigures.filter(f => f.classification === 'auto-update-allowed').length;
  const manualReviewCount = allFigures.filter(f => /manual-review/.test(f.classification)).length;
  const staticCount = allFigures.filter(f => f.classification === 'do-not-auto-update').length;
  const recommendation = figureCount === 0 ? 'No obvious dynamic figures detected.' : missingRuleCount ? 'Add figure-source rules before automatic replacement.' : autoAllowedCount && !manualReviewCount ? 'Eligible for controlled automatic data refresh from source rules.' : 'Covered by source rules, but manual review is required before public figure changes.';
  return { file, priority: priorityFor(copy, file), figureCount, missingRuleCount, autoAllowedCount, manualReviewCount, staticCount, percentages: percentages.map(fig => classifyFigure(file, fig)), money: money.map(fig => classifyFigure(file, fig)), crisisFigures: crisisFigures.map(fig => classifyFigure(file, fig)), dates: dates.slice(0, 6), needsSourceRule: missingRuleCount > 0, recommendation };
}).filter(p => p.figureCount || p.priority !== 'Low').sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority] - { High: 0, Medium: 1, Low: 2 }[b.priority]) || b.missingRuleCount - a.missingRuleCount || b.figureCount - a.figureCount);

const report = { generatedBy: 'Matrix Reprogrammed weekly site-wide freshness scanner', policy: rulesData.policy || 'This scanner finds figures and stale-risk copy. It does not rewrite figures unless a trusted source rule exists.', sourceRulesUpdated: rulesData.updated || null, sourceRuleCount: rules.length, scannedPages: htmlFiles.length, flaggedPages: pages.length, highPriorityPages: pages.filter(p => p.priority === 'High').length, mediumPriorityPages: pages.filter(p => p.priority === 'Medium').length, pagesWithMissingRules: pages.filter(p => p.missingRuleCount > 0).length, autoUpdateEligibleFigures: pages.reduce((sum, p) => sum + p.autoAllowedCount, 0), manualReviewFigures: pages.reduce((sum, p) => sum + p.manualReviewCount, 0), missingRuleFigures: pages.reduce((sum, p) => sum + p.missingRuleCount, 0), pages };
function stableSignature(obj) { return JSON.stringify({ sourceRuleCount: obj.sourceRuleCount, scannedPages: obj.scannedPages, pages: obj.pages.map(p => ({ file: p.file, priority: p.priority, figureCount: p.figureCount, missingRuleCount: p.missingRuleCount, autoAllowedCount: p.autoAllowedCount, manualReviewCount: p.manualReviewCount, figures: [...p.percentages, ...p.money, ...p.crisisFigures].map(x => `${x.value}:${x.classification}:${(x.matchedRules || []).map(r => r.id).join('|')}`) })) }); }
const reportPath = path.join(dataDir, 'site-freshness-report.json');
let previous = null;
if (fs.existsSync(reportPath)) { try { previous = JSON.parse(fs.readFileSync(reportPath, 'utf8')); } catch (_) {} }
if (previous && stableSignature(previous) === stableSignature(report)) { console.log(`Site freshness scan checked ${htmlFiles.length} pages: no meaningful figure-rule changes.`); process.exit(0); }
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
const md = ['# Site Freshness Report','',report.policy,'',`Source rules: ${report.sourceRuleCount}`,`Scanned pages: ${report.scannedPages}`,`Flagged pages: ${report.flaggedPages}`,`High priority pages: ${report.highPriorityPages}`,`Medium priority pages: ${report.mediumPriorityPages}`,`Pages with missing rules: ${report.pagesWithMissingRules}`,`Auto-update eligible figures: ${report.autoUpdateEligibleFigures}`,`Manual-review figures: ${report.manualReviewFigures}`,`Missing-rule figures: ${report.missingRuleFigures}`,'','## High Priority Pages',...pages.filter(p => p.priority === 'High').slice(0, 30).map(p => `- ${p.file}: ${p.figureCount} figure/stat markers; ${p.missingRuleCount} missing rules. ${p.recommendation}`),'','## Missing Source Rules',...pages.filter(p => p.missingRuleCount > 0).slice(0, 40).map(p => `- ${p.file}: ${p.missingRuleCount} figure(s) need source rules.`),'','## Auto-Update Boundary','- Live Intel and site inventory counts may be updated automatically only when a rule allows it.','- Hard figures, percentages, payouts, deaths, claims, migration figures, vaccine figures, and crisis numbers require source rules and often manual review.','- The safe path is scan → classify → source-rule → update.'].join('\n');
fs.writeFileSync(path.join(downloadsDir, 'site-freshness-report.md'), md);
const cards = pages.slice(0, 100).map(p => { const examples = [...p.percentages, ...p.money, ...p.crisisFigures].slice(0, 8).map(x => `${x.value} — ${x.classification} — ${x.context}`).join('\n'); return `<article class="card ${p.priority === 'High' ? 'redline' : ''}"><span class="label">${esc(p.priority)} · ${p.figureCount} figures · ${p.missingRuleCount} missing rules</span><h3>${esc(p.file)}</h3><p>${esc(p.recommendation)}</p><details><summary>Detected examples</summary><p>${esc(examples)}</p></details></article>`; }).join('');
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Site Freshness Report | Matrix Reprogrammed</title><meta name="description" content="Weekly figure freshness scan for Matrix Reprogrammed pages." /><link rel="stylesheet" href="styles.css" /></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="live-intel.html">Live Intel</a><a href="news.html">Intel Desk</a><a href="evidence-vault.html">Evidence Vault</a><a href="books.html">Books</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Weekly Freshness Scanner</div><h1>SITE FRESHNESS REPORT.</h1><p class="lead">This report scans public pages for figures, percentages, money amounts, crisis numbers, dates, deaths, claims, and stale-risk language. It classifies each detected figure against the source-rule registry before any automatic replacement is allowed.</p><div class="cta-row"><a class="btn" href="data/site-freshness-report.json">JSON Report</a><a class="btn alt" href="downloads/site-freshness-report.md">Markdown Report</a><a class="btn alt" href="data/figure-source-rules.json">Source Rules</a><a class="btn alt" href="live-intel.html">Live Intel</a></div></section><section class="section wrap split"><div class="terminal">FRESHNESS SCAN STATUS\n&gt; Pages scanned: ${report.scannedPages}\n&gt; Flagged pages: ${report.flaggedPages}\n&gt; Source rules: ${report.sourceRuleCount}\n&gt; Auto-update eligible figures: ${report.autoUpdateEligibleFigures}\n&gt; Manual-review figures: ${report.manualReviewFigures}\n&gt; Missing-rule figures: ${report.missingRuleFigures}</div><aside class="card redline"><h2>Important Boundary</h2><p>${esc(report.policy)}</p></aside></section><section class="section wrap"><h2>Flagged Pages</h2><div class="grid">${cards}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — scan, classify, verify, then update.</p></footer></div><script src="matrix.js"></script></body></html>`;
fs.writeFileSync(path.join(root, 'site-freshness-report.html'), html);
console.log(`Site freshness scan complete: ${report.flaggedPages} flagged pages from ${report.scannedPages} scanned pages; ${report.missingRuleFigures} figures need source rules.`);
