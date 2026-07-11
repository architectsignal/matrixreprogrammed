const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportDir = path.join(root, 'downloads');
fs.mkdirSync(reportDir, { recursive: true });

const HARD_FORBIDDEN = [
  'Free public intelligence builds trust',
  'Email capture builds the list',
  'TURN THE INTELLIGENCE MACHINE INTO PRODUCTS',
  'READER MONEY PATH',
  'CAPTURE SYSTEM',
  'Persistent Cloudflare D1 member record',
  'Weekly newsletter sender',
  'Monetisation Dashboard',
  'Mission + Money Engine',
  'Site Brain Router',
  'Card System Health',
  'Artwork Automation',
  'Copy/Intake Audit'
];

const DYNAMIC_FILE_RE = /(?:live|daily|news|intel|watch|tracker|dashboard|timer|clock|current|latest|update|brief|migration|conflict|epstein|risk|market|policy|accountability|conclusion)/i;
const CONCLUSION_FILE_RE = /(?:conclusion|theory|brief|intel|analysis|dossier|watch|power|control|accountability|investigation)/i;
const INTERNAL_ROUTE_RE = /^(?:review-dashboard|deploy-status|deploy-health|card-system-health|site-brain-router|card-artwork-automation|card-artwork-queue|information-gathering-system|source-intake|update-monitor|distribution-center|launch-room|offer-center|sales-ladder|schema-index|machine-index|campaign-calendar|card-art-studio)(?:\.html)?$/i;
const DYNAMIC_WORKER_ROUTES = new Set([
  '/forum-health','/forum-feed','/forum-feed-main','/forum-feed-speculation','/forum-feed-epstein-alive',
  '/submit-forum-post','/submit-main-post','/submit-speculation-post','/submit-epstein-alive-post',
  '/report-forum-post','/track-event','/intro-voice','/newsletter-signup','/api/membership/signup',
  '/api/membership/health','/api/auth/request-link','/api/auth/verify','/api/auth/logout','/api/auth/health',
  '/api/member/me','/api/paypal/config','/api/paypal/checkout-intent','/api/paypal/subscription/confirm',
  '/api/paypal/subscription/cancel','/api/paypal/webhook','/api/paypal/health',
  '/downloads/forum-posts.json','/downloads/forum-posts.md'
]);

function rel(file) { return path.relative(root, file).replace(/\\/g, '/'); }
function escMd(value = '') { return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' '); }
function decodeEntities(text = '') {
  return String(text)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function visibleMarkup(html = '') {
  let out = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, ' ');
  for (const tag of ['section','article','aside','details','footer','div','form','p','li','a','span','blockquote','pre','ul','ol','h1','h2','h3','h4','h5','h6']) {
    const re = new RegExp(`<${tag}\\b[^>]*(?:internal-only|commercial-internal|data-internal-only=["']true["']|data-commercial-internal=["']true["']|\\shidden(?:\\s|>|=))[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    let before;
    do { before = out; out = out.replace(re, ' '); } while (out !== before);
  }
  return out;
}
function visibleText(html = '') {
  return decodeEntities(visibleMarkup(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}
function words(text = '') { return String(text).trim() ? String(text).trim().split(/\s+/).length : 0; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function extractAll(html, re, group = 1) { const out = []; let m; while ((m = re.exec(html))) out.push(m[group]); return out; }
function collectIds(html) { return new Set(extractAll(html, /\sid\s*=\s*["']([^"']+)["']/gi)); }
function duplicateIds(html) {
  const counts = new Map();
  for (const id of extractAll(html, /\sid\s*=\s*["']([^"']+)["']/gi)) counts.set(id, (counts.get(id) || 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([id, count]) => ({ id, count }));
}
function extractTitle(html) { const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); return m ? visibleText(m[1]) : ''; }
function extractMeta(html, name) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const n = tag.match(/\bname\s*=\s*["']([^"']+)["']/i);
    if (!n || n[1].toLowerCase() !== name.toLowerCase()) continue;
    const c = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);
    return c ? c[1] : '';
  }
  return '';
}
function extractH1(html) { const m = visibleMarkup(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i); return m ? visibleText(m[1]) : ''; }
function isNoIndex(html) { return /<meta\b[^>]*name\s*=\s*["']robots["'][^>]*content\s*=\s*["'][^"']*noindex/i.test(html) || /<meta\b[^>]*content\s*=\s*["'][^"']*noindex[^"']*["'][^>]*name\s*=\s*["']robots["']/i.test(html); }
function cleanTarget(target = '') { return String(target).trim().split('?')[0].split('#')[0]; }
function resolveLocal(fromFile, target) {
  const clean = cleanTarget(target);
  if (!clean) return null;
  if (/^(?:https?:|mailto:|tel:|javascript:|data:|blob:)/i.test(clean)) return null;
  const pathname = clean.startsWith('/') ? clean.slice(1) : path.normalize(path.join(path.dirname(rel(fromFile)), clean)).replace(/\\/g, '/');
  return pathname.replace(/^\.\//, '');
}
function localExists(target) {
  if (!target) return true;
  const route = '/' + target.replace(/^\//, '');
  if (DYNAMIC_WORKER_ROUTES.has(route)) return true;
  const direct = path.join(root, target);
  if (fs.existsSync(direct)) return true;
  if (!path.extname(target) && fs.existsSync(path.join(root, `${target}.html`))) return true;
  if (target.endsWith('/') && fs.existsSync(path.join(root, target, 'index.html'))) return true;
  return false;
}
function parseDates(text) {
  const dates = [];
  const iso = /\b(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])(?:T[0-2]\d:[0-5]\d(?::[0-5]\d(?:\.\d+)?)?Z?)?\b/g;
  let m;
  while ((m = iso.exec(text))) {
    const value = Date.parse(m[0].length === 10 ? `${m[0]}T00:00:00Z` : m[0]);
    if (Number.isFinite(value)) dates.push({ raw: m[0], value });
  }
  const named = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+([0-3]?\d)(?:st|nd|rd|th)?,?\s+(20\d{2})\b/gi;
  while ((m = named.exec(text))) {
    const value = Date.parse(m[0]);
    if (Number.isFinite(value)) dates.push({ raw: m[0], value });
  }
  return dates;
}
function conclusionScore(text, html) {
  const lower = text.toLowerCase();
  const sourceLinks = (html.match(/<a\b[^>]*href\s*=\s*["']https?:\/\/[^"']+["']/gi) || []).length;
  const checks = {
    substantial: words(text) >= 220,
    sources: sourceLinks >= 2 || /source|court record|official|filing|report|document|dataset|archive/i.test(text),
    specifics: /\b20\d{2}\b|\b\d+(?:\.\d+)?%\b|[€$£]\s?\d|\b\d+(?:\.\d+)?\s*(?:million|billion|trillion)\b/i.test(text),
    evidenceBoundary: /evidence boundary|documented fact|sourced analysis|not proof|does not prove|association is not|speculation/i.test(text),
    mechanism: /because|through|by means of|mechanism|route|pipeline|incentive|dependency|control layer|operates through|works by/i.test(lower),
    implication: /this means|therefore|implication|impact|consequence|risk|what changes|why it matters/i.test(lower),
    limitation: /however|but this does not|limitation|caveat|uncertain|unknown|cannot establish|counterpoint|alternative explanation/i.test(lower),
    nextStep: /next record|watch for|what to watch|check next|missing record|next step|follow the|verify|request|monitor/i.test(lower)
  };
  return { score: Object.values(checks).filter(Boolean).length, checks, sourceLinks };
}

const allRootHtml = fs.readdirSync(root).filter(name => name.endsWith('.html')).map(name => path.join(root, name));
const pages = [];
const hard = [];
const warnings = [];
const linkInventory = [];
const now = Date.now();
const staleDays = 21;

for (const file of allRootHtml) {
  const html = fs.readFileSync(file, 'utf8');
  const fileName = path.basename(file);
  const noindex = isNoIndex(html) || INTERNAL_ROUTE_RE.test(fileName);
  const text = visibleText(html);
  const title = extractTitle(html);
  const description = extractMeta(html, 'description');
  const h1 = extractH1(html);
  const ids = collectIds(html);
  const duplicates = duplicateIds(html);
  const pageHard = [];
  const pageWarnings = [];
  const wc = words(text);

  if (!noindex) {
    if (!title) pageHard.push('missing <title>');
    if (!description || description.length < 50) pageWarnings.push('missing or thin meta description');
    if (!h1) pageHard.push('missing visible H1');
    if (!/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(html)) pageHard.push('missing viewport meta');
    if (wc < 70) pageWarnings.push(`thin visible copy (${wc} words)`);
    for (const phrase of HARD_FORBIDDEN) if (text.toLowerCase().includes(phrase.toLowerCase())) pageHard.push(`visible author-facing phrase: ${phrase}`);
  }
  if (duplicates.length) pageWarnings.push(`duplicate IDs: ${duplicates.map(x => `${x.id}×${x.count}`).join(', ')}`);

  const attrs = [];
  const attrRe = /\s(href|src|action)\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = attrRe.exec(html))) attrs.push({ attr: match[1].toLowerCase(), target: match[2].trim() });
  for (const item of attrs) {
    const target = item.target;
    if (!target || target === '#') { if (!noindex) pageWarnings.push(`${item.attr} uses empty placeholder ${target || '(empty)'}`); continue; }
    if (/^(?:mailto:|tel:|javascript:|data:|blob:)/i.test(target)) continue;
    if (target.startsWith('#')) {
      const anchor = target.slice(1);
      if (anchor && !ids.has(anchor)) pageHard.push(`missing same-page anchor ${target}`);
      continue;
    }
    if (/^https?:\/\//i.test(target)) {
      linkInventory.push({ from: fileName, kind: 'external', target });
      continue;
    }
    const [withoutHash, anchor] = target.split('#');
    const local = resolveLocal(file, withoutHash);
    linkInventory.push({ from: fileName, kind: item.attr, target, resolved: local });
    if (local && !localExists(local)) pageHard.push(`missing local ${item.attr} target ${target}`);
    if (anchor && local) {
      const targetPath = fs.existsSync(path.join(root, local)) ? path.join(root, local) : (!path.extname(local) && fs.existsSync(path.join(root, `${local}.html`)) ? path.join(root, `${local}.html`) : null);
      if (targetPath && /\.html$/i.test(targetPath)) {
        const targetIds = collectIds(fs.readFileSync(targetPath, 'utf8'));
        if (!targetIds.has(anchor)) pageHard.push(`missing cross-page anchor ${target}`);
      }
    }
  }

  const dates = parseDates(text);
  const newest = dates.length ? Math.max(...dates.map(d => d.value)) : null;
  const newestAgeDays = newest ? Math.floor((now - newest) / 86400000) : null;
  const dynamic = DYNAMIC_FILE_RE.test(fileName) || /\b(?:latest|current|today|daily|live|this week|updated|watch|tracker)\b/i.test(text);
  if (!noindex && dynamic) {
    if (!newest) pageWarnings.push('dynamic page has no machine-readable recent date');
    else if (newestAgeDays > staleDays) pageWarnings.push(`dynamic page newest visible date is ${newestAgeDays} days old`);
  }

  let conclusion = null;
  const conclusionRelevant = !noindex && (CONCLUSION_FILE_RE.test(fileName) || /\b(?:conclusion|what this means|why it matters|assessment|analysis)\b/i.test(text));
  if (conclusionRelevant) {
    conclusion = conclusionScore(text, html);
    if (conclusion.score < 5) pageWarnings.push(`shallow conclusion/analysis score ${conclusion.score}/8`);
    if (/conclusion/i.test(fileName) && conclusion.score < 6) pageHard.push(`conclusion page score ${conclusion.score}/8; requires more mechanism, evidence, limits and next steps`);
  }

  for (const issue of pageHard) hard.push(`${fileName}: ${issue}`);
  for (const issue of pageWarnings) warnings.push(`${fileName}: ${issue}`);
  pages.push({ file: fileName, noindex, title, h1, words: wc, hard: pageHard, warnings: pageWarnings, dynamic, newestDate: newest ? new Date(newest).toISOString() : null, newestAgeDays, conclusion });
}

const publicPages = pages.filter(p => !p.noindex);
const sitemapPath = path.join(root, 'sitemap.xml');
let sitemapUrls = [];
if (fs.existsSync(sitemapPath)) {
  sitemapUrls = extractAll(fs.readFileSync(sitemapPath, 'utf8'), /<loc>([^<]+)<\/loc>/gi);
  const sitemapFiles = sitemapUrls.map(url => {
    try { return new URL(url).pathname.replace(/^\//, '') || 'index.html'; } catch { return ''; }
  });
  for (const target of sitemapFiles) if (target && !localExists(target)) hard.push(`sitemap.xml: missing listed page ${target}`);
  for (const page of publicPages) {
    if (!sitemapFiles.includes(page.file) && page.file !== '404.html') warnings.push(`${page.file}: public page missing from sitemap.xml`);
  }
}

const linkedPublicTargets = new Set(linkInventory.filter(x => x.kind !== 'external' && x.resolved).map(x => path.basename(x.resolved)));
for (const page of publicPages) {
  if (page.file === 'index.html' || page.file === '404.html') continue;
  if (!linkedPublicTargets.has(page.file)) warnings.push(`${page.file}: possible orphan page (not linked by another root HTML page)`);
}

const conclusionPages = publicPages.filter(p => p.conclusion);
const deepConclusions = conclusionPages.filter(p => p.conclusion.score >= 6);
const shallowConclusions = conclusionPages.filter(p => p.conclusion.score < 5);
const report = {
  ok: hard.length === 0,
  generatedAt: new Date().toISOString(),
  scope: 'Every root public HTML page, all local href/src/action targets, anchors, sitemap entries, visible author-facing copy, freshness markers and conclusion depth.',
  totals: {
    htmlPages: pages.length,
    publicPages: publicPages.length,
    noindexOrInternalPages: pages.length - publicPages.length,
    sitemapUrls: sitemapUrls.length,
    linkReferences: linkInventory.length,
    uniqueExternalLinks: unique(linkInventory.filter(x => x.kind === 'external').map(x => x.target)).length,
    conclusionPages: conclusionPages.length,
    deepConclusionPages: deepConclusions.length,
    shallowConclusionPages: shallowConclusions.length,
    hardFailures: hard.length,
    warnings: warnings.length
  },
  hardFailures: hard,
  warnings,
  pages,
  externalLinks: unique(linkInventory.filter(x => x.kind === 'external').map(x => x.target)).sort(),
  boundary: 'This audit proves local structural integrity and editorial signals. The separate live crawl proves production HTTP behavior and checks external destinations.'
};
fs.writeFileSync(path.join(reportDir, 'exhaustive-public-site-audit.json'), JSON.stringify(report, null, 2));

const md = [
  '# Exhaustive Public Site Audit', '',
  `Generated: ${report.generatedAt}`,
  `Result: ${report.ok ? 'PASS' : 'FAIL'}`, '',
  '## Coverage', '',
  `- HTML pages checked: ${report.totals.htmlPages}`,
  `- Public pages checked: ${report.totals.publicPages}`,
  `- Sitemap URLs checked: ${report.totals.sitemapUrls}`,
  `- Link and asset references checked: ${report.totals.linkReferences}`,
  `- Unique external links inventoried: ${report.totals.uniqueExternalLinks}`,
  `- Conclusion/analysis pages scored: ${report.totals.conclusionPages}`,
  `- Deep conclusion pages (6+/8): ${report.totals.deepConclusionPages}`,
  `- Shallow conclusion pages (<5/8): ${report.totals.shallowConclusionPages}`, '',
  '## Hard Failures', '', ...(hard.length ? hard.map(x => `- ${x}`) : ['- None']), '',
  '## Warnings', '', ...(warnings.length ? warnings.slice(0, 300).map(x => `- ${x}`) : ['- None']), '',
  '## Public Page Review', '',
  '| Page | Words | Freshness | Conclusion | Hard | Warnings |',
  '|---|---:|---|---:|---:|---:|',
  ...publicPages.map(p => `| ${escMd(p.file)} | ${p.words} | ${p.dynamic ? (p.newestAgeDays == null ? 'no date' : `${p.newestAgeDays}d`) : 'static'} | ${p.conclusion ? `${p.conclusion.score}/8` : '—'} | ${p.hard.length} | ${p.warnings.length} |`)
].join('\n');
fs.writeFileSync(path.join(reportDir, 'exhaustive-public-site-audit.md'), md);

if (hard.length) {
  console.error(`EXHAUSTIVE PUBLIC SITE AUDIT FAILED: ${hard.length} hard issue(s), ${warnings.length} warning(s).`);
  hard.slice(0, 80).forEach(x => console.error(`- ${x}`));
  process.exit(1);
}
console.log(`EXHAUSTIVE PUBLIC SITE AUDIT PASSED: ${publicPages.length} public pages, ${linkInventory.length} references, ${conclusionPages.length} conclusion/analysis pages; ${warnings.length} editorial warning(s).`);
