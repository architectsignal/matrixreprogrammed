const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportDir = path.join(root, 'downloads');
fs.mkdirSync(reportDir, { recursive: true });

function removeHiddenFlags(openingTag) {
  let next = openingTag
    .replace(/\sdata-internal-only\s*=\s*(["'])true\1/gi, '')
    .replace(/\sdata-commercial-internal\s*=\s*(["'])true\1/gi, '');
  next = next.replace(/\bclass\s*=\s*(["'])([^"']*)\1/i, (match, quote, classes) => {
    const kept = String(classes)
      .split(/\s+/)
      .filter(Boolean)
      .filter(name => !['internal-only', 'commercial-internal'].includes(name));
    return kept.length ? `class=${quote}${kept.join(' ')}${quote}` : '';
  });
  return next;
}

function preserveSection(html, id) {
  const expression = new RegExp(`<section\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i');
  return html.replace(expression, opening => removeHiddenFlags(opening));
}

function preserveArticleByHeading(html, heading) {
  const articles = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)];
  const edits = [];
  for (const match of articles) {
    if (!match[0].includes(`<h2>${heading}</h2>`) && !match[0].includes(`<h3>${heading}</h3>`)) continue;
    const opening = match[0].match(/^<article\b[^>]*>/i);
    if (!opening) continue;
    edits.push({ start: match.index, end: match.index + opening[0].length, replacement: removeHiddenFlags(opening[0]) });
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    html = html.slice(0, edit.start) + edit.replacement + html.slice(edit.end);
  }
  return html;
}

function patch(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  let html = fs.readFileSync(file, 'utf8');
  const before = html;

  html = html
    .replace(/href=(["'])epstein-timeline\.html\1>Open Timeline<\/a>/gi, 'href="epstein-files.html">Open Epstein Files</a>')
    .replace(/href=(["'])epstein-timeline\.html\1/gi, 'href="epstein-files.html"');

  if (path.basename(file) === 'index.html' || path.basename(file) === 'index') {
    html = preserveSection(html, 'power-deck-home-link');
    for (const heading of ['PERSONS OF INTEREST', 'CONTROLLED OPPOSITION', 'INSTITUTIONS']) {
      html = preserveArticleByHeading(html, heading);
    }
  }

  if (html !== before) fs.writeFileSync(file, html);
  return html !== before;
}

const targets = [];
for (const name of fs.readdirSync(root)) {
  if (name.endsWith('.html')) targets.push(path.join(root, name));
}
const siteDir = path.join(root, '_site');
if (fs.existsSync(siteDir)) {
  for (const name of fs.readdirSync(siteDir)) {
    const file = path.join(siteDir, name);
    if (fs.statSync(file).isFile() && (name.endsWith('.html') || !path.extname(name))) targets.push(file);
  }
}

const changed = targets.filter(patch).map(file => path.relative(root, file).replace(/\\/g, '/'));
const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  publicSectionsPreserved: ['power-deck-home-link', 'PERSONS OF INTEREST', 'CONTROLLED OPPOSITION', 'INSTITUTIONS'],
  repairedRoute: 'epstein-timeline.html -> epstein-files.html'
};
fs.writeFileSync(path.join(reportDir, 'restore-public-core-routes.json'), JSON.stringify(report, null, 2));
console.log(`Public core route repair complete: ${changed.length} file(s) changed.`);
