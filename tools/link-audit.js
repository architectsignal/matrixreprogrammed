const fs = require('fs');
const path = require('path');

const root = process.cwd();
const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith('.html'));
const fileSet = new Set(fs.readdirSync(root));
const failures = [];
const warnings = [];
const dynamicWorkerRoutes = new Set([
  'forum-health',
  'forum-feed',
  'forum-feed-main',
  'forum-feed-speculation',
  'forum-feed-epstein-alive',
  'forum-posts.json',
  'forum-posts.md',
  'downloads/forum-posts.json',
  'downloads/forum-posts.md',
  'submit-forum-post',
  'submit-main-post',
  'submit-speculation-post',
  'submit-epstein-alive-post',
  'report-forum-post',
  'report-main-post',
  'report-speculation-post',
  'report-epstein-alive-post',
  'track-event',
  'intro-voice',
  '.netlify/functions/forum-feed',
  '.netlify/functions/submit-forum-post',
  '.netlify/functions/report-forum-post'
]);

function normalizeTarget(target) {
  return target.split('#')[0].split('?')[0].trim();
}

function normalizedRoute(target) {
  return normalizeTarget(target).replace(/^\/+/, '');
}

function existsLocal(target) {
  const clean = normalizeTarget(target);
  if (!clean || clean.startsWith('#')) return true;
  const route = normalizedRoute(clean);
  if (dynamicWorkerRoutes.has(route)) return true;
  if (clean.startsWith('/')) return fileSet.has(route) || fs.existsSync(path.join(root, route));
  return fileSet.has(clean) || fs.existsSync(path.join(root, clean));
}

function collectIds(html) {
  const ids = new Set();
  const idRegex = /\sid=["']([^"']+)["']/gi;
  let match;
  while ((match = idRegex.exec(html))) ids.add(match[1]);
  return ids;
}

for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const ids = collectIds(html);
  const attrRegex = /\s(?:href|src)=["']([^"']+)["']/gi;
  let match;
  while ((match = attrRegex.exec(html))) {
    const link = match[1].trim();
    if (!link || link.startsWith('mailto:') || link.startsWith('tel:') || link.startsWith('javascript:') || link.startsWith('data:')) continue;
    if (link.startsWith('http://') || link.startsWith('https://')) continue;
    if (link.startsWith('#')) {
      const id = link.slice(1);
      if (id && !ids.has(id)) failures.push(`${file}: missing anchor target ${link}`);
      continue;
    }
    const [localFile, anchor] = link.split('#');
    if (!existsLocal(localFile)) {
      failures.push(`${file}: missing local target ${link}`);
      continue;
    }
    if (anchor && normalizeTarget(localFile) === file && !ids.has(anchor)) failures.push(`${file}: missing anchor target ${link}`);
  }

  if (!html.includes('<script src="matrix.js"></script>') && file !== 'index_v2.html') {
    warnings.push(`${file}: does not use shared matrix.js`);
  }
  if (!html.includes('rel="stylesheet" href="styles.css"')) {
    warnings.push(`${file}: missing shared styles.css`);
  }
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  htmlFiles: htmlFiles.length,
  dynamicWorkerRoutes: [...dynamicWorkerRoutes].sort(),
  failureCount: failures.length,
  warningCount: warnings.length,
  failures,
  warnings
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'link-audit-report.json'), JSON.stringify(report, null, 2));

if (warnings.length) {
  console.log('\nWARNINGS');
  warnings.forEach((warning) => console.log(`- ${warning}`));
}
if (failures.length) {
  console.error('\nBROKEN LINKS');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Link audit passed for ${htmlFiles.length} HTML files. Dynamic Worker endpoints allowed: ${dynamicWorkerRoutes.size}.`);
