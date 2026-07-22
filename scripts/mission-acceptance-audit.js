const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = fs.existsSync(path.join(root, '_site', 'index.html')) ? path.join(root, '_site') : root;
const failures = [];
const warnings = [];
const inventory = {
  pages: [],
  links: { checked: 0, external: 0, dynamic: 0, broken: [] },
  downloads: [],
  tools: {},
  conclusions: {},
  timers: {},
  search: {},
  membership: {}
};

const read = file => fs.readFileSync(file, 'utf8');
const readJson = file => JSON.parse(read(file));
const rel = file => path.relative(site, file).replace(/\\/g, '/');
const cleanText = html => html
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&(?:nbsp|amp|quot|#39);/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const unique = values => [...new Set(values)];
const addFailure = message => { failures.push(message); };
const addWarning = message => { warnings.push(message); };

function walk(dir, predicate, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, output);
    else if (predicate(full, entry)) output.push(full);
  }
  return output;
}

function decodeSafe(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

const dynamicPrefixes = [
  '/api/', '/.netlify/functions/', '/forum-health', '/forum-feed', '/submit-', '/report-',
  '/newsletter-signup', '/track-event', '/intro-voice', '/paypal/', '/webhooks/'
];
const dynamicExact = new Set([
  '/forum-posts.json', '/forum-posts.md', '/downloads/forum-posts.json', '/downloads/forum-posts.md'
]);
function isDynamic(target) {
  return dynamicExact.has(target) || dynamicPrefixes.some(prefix => target.startsWith(prefix));
}

function localCandidates(pageFile, target) {
  let value = decodeSafe(String(target || '').split('#')[0].split('?')[0].trim());
  if (!value) return [];
  value = value.replace(/^https?:\/\/matrixreprogrammed\.com/i, '');
  if (!value) value = '/';
  const base = value.startsWith('/') ? path.join(site, value.replace(/^\/+/, '')) : path.resolve(path.dirname(pageFile), value);
  const candidates = [base];
  if (value.endsWith('/')) candidates.push(path.join(base, 'index.html'));
  if (!path.extname(base)) {
    candidates.push(`${base}.html`);
    candidates.push(path.join(base, 'index.html'));
  }
  if (path.basename(base) === '') candidates.push(path.join(site, 'index.html'));
  return unique(candidates);
}

function localTargetExists(pageFile, target) {
  return localCandidates(pageFile, target).some(candidate => fs.existsSync(candidate));
}

function pageIds(html) {
  const ids = new Set();
  for (const match of html.matchAll(/\sid=["']([^"']+)["']/gi)) ids.add(match[1]);
  return ids;
}

const corePages = new Map([
  ['index.html', ['evidence', 'record', 'investigation', 'control']],
  ['start-here.html', ['evidence', 'source', 'search']],
  ['daily-command-brief.html', ['brief', 'evidence', 'source']],
  ['live-intel.html', ['intel', 'source', 'evidence']],
  ['control-structure.html', ['control', 'institution', 'power']],
  ['entities.html', ['entit', 'relationship', 'evidence']],
  ['investigations.html', ['investigation', 'evidence', 'source']],
  ['evidence-vault.html', ['evidence', 'source', 'record']],
  ['search.html', ['search', 'evidence', 'source']],
  ['research-tools.html', ['research', 'evidence', 'verified']],
  ['timers.html', ['score', 'evidence', 'pressure']],
  ['membership.html', ['member', 'tier', 'access']],
  ['newsletter.html', ['weekly', 'email', 'verify']],
  ['evidence-reader.html', ['evidence', 'document', 'source']],
  ['evidence-timeline.html', ['evidence', 'timeline', 'source']],
  ['evidence-archive.html', ['evidence', 'archive', 'source']],
  ['data-lab.html', ['data', 'evidence', 'research']],
  ['investigation-machine.html', ['investigation', 'source', 'conclusion']],
  ['daily-investigation-conclusions.html', ['conclusion', 'evidence', 'record']],
  ['weekly-investigation-report.html', ['weekly', 'evidence', 'conclusion']],
  ['source-changes.html', ['source', 'record', 'evidence']]
]);

const htmlFiles = walk(site, file => file.endsWith('.html'));
for (const file of htmlFiles) {
  const name = rel(file);
  const html = read(file);
  const text = cleanText(html);
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/<[^>]+>/g, '').trim() || '';
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]?.replace(/<[^>]+>/g, '').trim() || '';
  const hrefCount = (html.match(/\shref=["'][^"']+["']/gi) || []).length;
  const sourceCount = (html.match(/\s(?:href|src|action)=["'][^"']+["']/gi) || []).length;
  const missionHits = ['evidence','source','record','investigation','entity','institution','control','power','money','search','report','research','intel','conclusion','timer','member'].filter(term => text.toLowerCase().includes(term));
  inventory.pages.push({ route: name, title, h1, characters: text.length, links: hrefCount, assetsAndActions: sourceCount, missionHits });

  if (corePages.has(name)) {
    if (!title) addFailure(`${name}: core page has no title`);
    if (!h1) addFailure(`${name}: core page has no H1`);
    if (text.length < 250) addFailure(`${name}: core page has too little explanatory content (${text.length} characters)`);
    const requiredTerms = corePages.get(name);
    if (!requiredTerms.some(term => text.toLowerCase().includes(term))) addFailure(`${name}: does not explain its mission purpose using any of: ${requiredTerms.join(', ')}`);
    if (hrefCount < 2) addFailure(`${name}: offers no useful onward route`);
  } else {
    if (!title) addWarning(`${name}: no title`);
    if (!h1 && text.length > 120) addWarning(`${name}: no H1`);
  }

  const ids = pageIds(html);
  for (const match of html.matchAll(/\s(href|src|action)=["']([^"']+)["']/gi)) {
    const attribute = match[1].toLowerCase();
    const target = match[2].trim();
    if (!target || target.startsWith('data:') || target.startsWith('mailto:') || target.startsWith('tel:') || target.startsWith('javascript:')) continue;
    inventory.links.checked += 1;
    if (/^https?:\/\//i.test(target) && !/^https?:\/\/matrixreprogrammed\.com/i.test(target)) {
      inventory.links.external += 1;
      continue;
    }
    if (target.startsWith('#')) {
      const anchor = target.slice(1);
      if (anchor && !ids.has(anchor)) {
        const issue = `${name}: missing local anchor ${target}`;
        inventory.links.broken.push(issue);
        addFailure(issue);
      }
      continue;
    }
    const normal = target.replace(/^https?:\/\/matrixreprogrammed\.com/i, '') || '/';
    if (isDynamic(normal)) {
      inventory.links.dynamic += 1;
      continue;
    }
    if (!localTargetExists(file, normal)) {
      const issue = `${name}: ${attribute} target missing: ${target}`;
      inventory.links.broken.push(issue);
      addFailure(issue);
    }
  }
}

for (const [page] of corePages) {
  if (!fs.existsSync(path.join(site, page))) addFailure(`missing core mission page: ${page}`);
}

const policyFile = path.join(root, 'data', 'access-route-policy.json');
const policy = fs.existsSync(policyFile) ? readJson(policyFile) : null;
if (!policy) addFailure('data/access-route-policy.json missing or unreadable');
const tierOrder = policy?.tierOrder || [];
const exactRules = new Map((policy?.exactRules || []).map(rule => [String(rule.route || '').replace(/^\//, ''), rule]));
const patternRules = (policy?.patternRules || []).map(rule => ({ ...rule, regex: new RegExp(rule.pattern) }));
const publicPatterns = [...(policy?.publicEvidencePatterns || []), ...(policy?.neverPaywallPatterns || [])].map(value => String(value).toLowerCase());
function classifyDownload(route) {
  const clean = route.replace(/^\//, '');
  if (exactRules.has(clean)) return { tier: exactRules.get(clean).minimumTier, reason: exactRules.get(clean).reason, rule: 'exact' };
  const slash = `/${clean}`;
  for (const rule of patternRules) if (rule.regex.test(slash)) return { tier: rule.minimumTier, reason: rule.reason, rule: 'pattern' };
  const lower = clean.toLowerCase();
  if (publicPatterns.some(pattern => lower.includes(pattern))) return { tier: 'public', reason: 'Public evidence, correction or methodology rule.', rule: 'public-pattern' };
  if (/^(downloads\/)?(?:forum-posts|market-activity|investigation-(?:entities|relationships)|evidence-network-map)\./.test(lower)) return { tier: 'public', reason: 'Public site data export.', rule: 'public-data' };
  return { tier: 'unclassified', reason: '', rule: 'none' };
}

const downloadDir = path.join(site, 'downloads');
const downloadableExt = new Set(['.pdf','.json','.csv','.md','.txt','.zip','.wacz','.mp4','.webm']);
const downloads = walk(downloadDir, file => downloadableExt.has(path.extname(file).toLowerCase()));
for (const file of downloads) {
  const route = rel(file);
  if (route.startsWith('downloads/report-manifests/')) continue;
  const ext = path.extname(file).toLowerCase();
  const stat = fs.statSync(file);
  const classification = classifyDownload(route);
  const item = { route, extension: ext, bytes: stat.size, ...classification, valid: true };
  if (stat.size === 0) {
    item.valid = false;
    addFailure(`${route}: empty download`);
  }
  if (ext === '.pdf') {
    const signature = fs.readFileSync(file).subarray(0, 5).toString('ascii');
    if (signature !== '%PDF-') {
      item.valid = false;
      addFailure(`${route}: invalid PDF signature`);
    }
  }
  if (ext === '.json') {
    try { JSON.parse(read(file)); } catch (error) {
      item.valid = false;
      addFailure(`${route}: invalid downloadable JSON: ${error.message}`);
    }
  }
  if (ext === '.csv') {
    const firstLine = read(file).split(/\r?\n/, 1)[0] || '';
    if (!firstLine.includes(',')) {
      item.valid = false;
      addFailure(`${route}: CSV has no header row`);
    }
  }
  if (['.md','.txt'].includes(ext) && read(file).trim().length < 20) {
    item.valid = false;
    addFailure(`${route}: text download has no useful content`);
  }
  const premiumLike = /(?:brief|report|dossier|research|archive|export|pack|bundle|snapshot|timer|probability|intelligence|member)/i.test(path.basename(route));
  if (classification.tier === 'unclassified') {
    if (premiumLike) addFailure(`${route}: value-added download has no public or membership-tier classification`);
    else addWarning(`${route}: download is not explicitly classified; treated as public until reviewed`);
  }
  if (classification.tier !== 'unclassified' && classification.tier !== 'public' && !tierOrder.includes(classification.tier)) {
    addFailure(`${route}: unknown membership tier ${classification.tier}`);
  }
  inventory.downloads.push(item);
}

const toolPage = path.join(site, 'research-tools.html');
const toolClient = path.join(site, 'research-tools.js');
const workerFile = path.join(root, 'src', 'worker.js');
if (![toolPage, toolClient, workerFile].every(fs.existsSync)) addFailure('research tool page, client or Worker missing');
else {
  const page = read(toolPage);
  const client = read(toolClient);
  const worker = read(workerFile);
  inventory.tools = {
    holeheForm: page.includes('data-tool-form="holehe"'),
    spiderfootForm: page.includes('data-tool-form="spiderfoot"'),
    h8mailForm: page.includes('data-tool-form="h8mail"'),
    oneRenderer: client.includes('Email account-signal decision brief') && client.includes('Passive footprint decision brief') && client.includes('Defensive exposure decision brief'),
    reopenableJobs: client.includes('Open clear report') && client.includes('openJob(job)'),
    collapsedTechnicalData: client.includes('Sanitised technical appendix') && client.includes('decision-details'),
    holeheTier: worker.includes("holehe:{label:'Email account signals',access:'member',minimumTier:'registered'"),
    spiderfootTier: worker.includes("spiderfoot:{label:'Passive digital footprint scan',access:'member',minimumTier:'intelligence_6'"),
    h8mailTier: worker.includes("h8mail:{label:'Breach exposure review',access:'member',minimumTier:'intelligence_6',selfOnlyForMembers:true"),
    h8mailSelfOnly: worker.includes('This Intelligence tool may review only your own verified account email')
  };
  for (const [name, ok] of Object.entries(inventory.tools)) if (!ok) addFailure(`research tools: ${name} failed`);
}

const timersFile = path.join(site, 'data', 'global-risk-clocks.json');
if (!fs.existsSync(timersFile)) addFailure('timer data missing');
else {
  const timerData = readJson(timersFile);
  const clocks = Array.isArray(timerData.clocks) ? timerData.clocks : [];
  const required = ['scoreType','scoreMeaning','bandMeaning','calculationBasis','whatRaises','whatLowers','evidenceBoundary'];
  const incomplete = clocks.filter(clock => required.some(field => !clock[field]));
  inventory.timers = { count: clocks.length, incomplete: incomplete.map(clock => clock.id || clock.name || 'unknown') };
  if (!clocks.length) addFailure('timer data has no clocks');
  if (incomplete.length) addFailure(`timers missing score explanations: ${inventory.timers.incomplete.join(', ')}`);
  const timerPage = fs.existsSync(path.join(site, 'timers.html')) ? read(path.join(site, 'timers.html')) : '';
  for (const label of ['What this score means','What would raise it','What would lower it']) if (!timerPage.includes(label)) addFailure(`timers.html missing explanation: ${label}`);
}

const searchPage = path.join(site, 'search.html');
const searchClient = path.join(site, 'search.js');
const searchIndex = path.join(site, 'search-index.json');
if (![searchPage, searchClient, searchIndex].every(fs.existsSync)) addFailure('search page, runtime or index missing');
else {
  const index = readJson(searchIndex);
  const entries = Array.isArray(index) ? index : Array.isArray(index.items) ? index.items : Array.isArray(index.documents) ? index.documents : Object.keys(index || {});
  inventory.search = { entries: entries.length, pagefindFallback: fs.existsSync(path.join(site, 'pagefind-fallback.js')), facets: fs.existsSync(path.join(site, 'data', 'search-facets.json')) };
  if (entries.length < 100) addFailure(`search index is unexpectedly small (${entries.length})`);
  if (!read(searchPage).includes('search.js')) addFailure('search.html does not load search.js');
  if (!inventory.search.pagefindFallback) addFailure('Pagefind fallback missing');
}

function auditConclusionFile(relative) {
  const file = path.join(site, relative);
  if (!fs.existsSync(file)) return { missing: true, findings: 0, incomplete: [] };
  const data = readJson(file);
  const findings = [];
  function visit(value) {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    if (typeof value.conclusion === 'string' && (value.sourceUrl || value.itemUrl || value.sourceLabel)) findings.push(value);
    for (const child of Object.values(value)) visit(child);
  }
  visit(data);
  const incomplete = findings.filter(item => !item.evidenceGrade || !item.evidenceBoundary || !item.mechanism || !item.implication || !Array.isArray(item.nextRecords) || !item.nextRecords.length);
  return { missing: false, findings: findings.length, incomplete: incomplete.slice(0, 50).map(item => item.id || item.title || 'unknown') };
}
for (const file of ['data/daily-investigation-conclusions.json','data/weekly-investigation-conclusions.json']) {
  const result = auditConclusionFile(file);
  inventory.conclusions[file] = result;
  if (result.missing) addFailure(`${file}: missing`);
  else if (!result.findings) addFailure(`${file}: contains no source-linked conclusions`);
  else if (result.incomplete.length) addFailure(`${file}: ${result.incomplete.length} sampled conclusions lack evidence, boundary, mechanism, implication or next records`);
}

const newsletterPage = path.join(site, 'newsletter.html');
const newsletterClient = path.join(site, 'newsletter.js');
if (![newsletterPage, newsletterClient].every(fs.existsSync)) addFailure('newsletter page or client missing');
else {
  const html = read(newsletterPage);
  const client = read(newsletterClient);
  inventory.membership.newsletter = {
    explicitConsent: (html.match(/data-marketing-consent/g) || []).length === 1 && /data-marketing-consent[^>]*required|required[^>]*data-marketing-consent/.test(html),
    truthfulStorage: html.includes('protected member database') && html.includes('manage preferences or unsubscribe'),
    consentPayload: client.includes('consent:consentGranted') && client.includes('marketingConsent:consentGranted'),
    verificationMessage: client.includes('Check your inbox to verify your email and activate reports.')
  };
  for (const [name, ok] of Object.entries(inventory.membership.newsletter)) if (!ok) addFailure(`newsletter: ${name} failed`);
}

inventory.membership.policyStatus = policy?.status || 'missing';
inventory.membership.tierOrder = tierOrder;
if (policy?.status !== 'active-fail-closed') addFailure('membership route policy is not active-fail-closed');

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  siteRoot: path.relative(root, site) || '.',
  purpose: 'Verify that every generated route, link, download and core tool works and serves the Matrix Reprogrammed public-record intelligence mission.',
  summary: {
    pages: inventory.pages.length,
    linksChecked: inventory.links.checked,
    brokenLinks: inventory.links.broken.length,
    downloads: inventory.downloads.length,
    unclassifiedDownloads: inventory.downloads.filter(item => item.tier === 'unclassified').length,
    failures: failures.length,
    warnings: warnings.length
  },
  failures: unique(failures),
  warnings: unique(warnings),
  inventory
};

const downloadsDir = path.join(root, 'downloads');
fs.mkdirSync(downloadsDir, { recursive: true });
fs.writeFileSync(path.join(downloadsDir, 'mission-acceptance-audit.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(downloadsDir, 'mission-acceptance-audit.md'), [
  '# Matrix Reprogrammed Mission Acceptance Audit', '',
  `Generated: ${report.generatedAt}`,
  `Status: ${report.ok ? 'PASS' : 'FAIL'}`, '',
  '## Site purpose', '', report.purpose, '',
  '## Coverage', '',
  `- Pages: ${report.summary.pages}`,
  `- Links and asset routes checked: ${report.summary.linksChecked}`,
  `- Downloads checked: ${report.summary.downloads}`,
  `- Broken links: ${report.summary.brokenLinks}`,
  `- Unclassified downloads: ${report.summary.unclassifiedDownloads}`, '',
  '## Failures', '', ...(report.failures.length ? report.failures.map(item => `- ${item}`) : ['- None']), '',
  '## Warnings', '', ...(report.warnings.length ? report.warnings.slice(0, 500).map(item => `- ${item}`) : ['- None'])
].join('\n'));

if (!report.ok) {
  console.error(`MISSION ACCEPTANCE AUDIT FAILED: ${report.failures.length} issue(s)`);
  report.failures.slice(0, 200).forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Mission acceptance audit passed: ${report.summary.pages} pages, ${report.summary.linksChecked} links/assets and ${report.summary.downloads} downloads checked.`);
