const fs = require('fs');
const path = require('path');

const root = process.cwd();
const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith('.html'));
const fileSet = new Set(fs.readdirSync(root));
const failures = [];
const warnings = [];
const dynamicWorkerRoutes = new Set([
  'forum-health',
  '/forum-health',
  'forum-feed',
  '/forum-feed',
  'submit-forum-post',
  '/submit-forum-post',
  'report-forum-post',
  '/report-forum-post',
  'track-event',
  '/track-event',
  'intro-voice',
  '/intro-voice',
  'downloads/forum-posts.json',
  '/downloads/forum-posts.json',
  'downloads/forum-posts.md',
  '/downloads/forum-posts.md',
  'forum-posts.json',
  '/forum-posts.json',
  'forum-posts.md',
  '/forum-posts.md'
]);

function normalizeTarget(target) {
  return target.split('#')[0].split('?')[0].trim();
}

function existsLocal(target) {
  const clean = normalizeTarget(target);
  if (!clean || clean.startsWith('#')) return true;
  if (dynamicWorkerRoutes.has(clean)) return true;
  if (dynamicWorkerRoutes.has(clean.replace(/^\//, ''))) return true;
  if (clean.startsWith('/')) return fileSet.has(clean.replace(/^\//, ''));
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
    if (!link || link.startsWith('mailto:') || link.startsWith('tel:') || link.startsWith('javascript:')) continue;
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
    if (anchor && localFile === file && !ids.has(anchor)) failures.push(`${file}: missing anchor target ${link}`);
  }

  if (!html.includes('<script src="matrix.js"></script>') && file !== 'index_v2.html') {
    warnings.push(`${file}: does not use shared matrix.js`);
  }
  if (!html.includes('rel="stylesheet" href="styles.css"')) {
    warnings.push(`${file}: missing shared styles.css`);
  }
}

if (warnings.length) {
  console.log('\nWARNINGS');
  warnings.forEach((w) => console.log(`- ${w}`));
}

if (failures.length) {
  console.error('\nBROKEN LINKS');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log(`Link audit passed for ${htmlFiles.length} HTML files. Dynamic Worker endpoints allowed: ${dynamicWorkerRoutes.size}.`);
