const fs = require('fs');
const path = require('path');

const root = process.cwd();
for (const relative of ['search.html', 'search']) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes('pagefind-fallback.js')) {
    const script = '<script type="module" src="pagefind-fallback.js"></script>';
    html = html.includes('</body>') ? html.replace('</body>', `${script}</body>`) : html + script;
  }
  if (!html.includes('data-pagefind-body')) {
    html = html.replace(/<main(\s|>)/, '<main data-pagefind-body$1');
  }
  fs.writeFileSync(file, html);
}

const indexFile = path.join(root, 'index.html');
if (fs.existsSync(indexFile)) {
  let html = fs.readFileSync(indexFile, 'utf8');
  const start = '<!-- open-source-research-suite:start -->';
  const end = '<!-- open-source-research-suite:end -->';
  const section = `${start}<section class="section wrap" id="open-source-research-suite"><div class="eyebrow">Open-source research interfaces</div><h2>READ THE DOCUMENT. FOLLOW THE TIMELINE. SEARCH THE FULL BUILD.</h2><p class="lead">Use the page-specific PDF evidence reader, the evidence-led timeline and an independent Pagefind fallback index alongside Search V3.</p><div class="cta-row"><a class="btn" href="evidence-reader.html">Evidence Reader</a><a class="btn alt" href="evidence-timeline.html">Evidence Timeline</a><a class="btn alt" href="search.html">Search Everything</a></div></section>${end}`;
  if (html.includes(start) && html.includes(end)) html = html.replace(new RegExp(`${start}[\\s\\S]*?${end}`), section);
  else if (html.includes('</main>')) html = html.replace('</main>', section + '</main>');
  fs.writeFileSync(indexFile, html);
}

for (const [fileName, line] of [
  ['llms.txt', '- Evidence Reader: https://matrixreprogrammed.com/evidence-reader.html\n- Evidence Timeline: https://matrixreprogrammed.com/evidence-timeline.html\n'],
  ['sitemap.xml', '<url><loc>https://matrixreprogrammed.com/evidence-reader.html</loc></url><url><loc>https://matrixreprogrammed.com/evidence-timeline.html</loc></url>']
]) {
  const file = path.join(root, fileName);
  if (!fs.existsSync(file)) continue;
  let text = fs.readFileSync(file, 'utf8');
  if (fileName === 'sitemap.xml') {
    if (!text.includes('/evidence-reader.html')) text = text.replace('</urlset>', `${line}</urlset>`);
  } else if (!text.includes('/evidence-reader.html')) text += `\n${line}`;
  fs.writeFileSync(file, text);
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'open-source-research-wiring.json'), JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  routes: ['evidence-reader.html', 'evidence-timeline.html', 'search.html'],
  searchFallback: 'Pagefind generated assets are optional at runtime; Search V3 remains primary.',
  evidenceBoundary: 'Open-source interfaces do not change the underlying evidence grade or factual status.'
}, null, 2));
console.log('Open-source research suite wired into public routes.');
