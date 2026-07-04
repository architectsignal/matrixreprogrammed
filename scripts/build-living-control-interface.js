const fs = require('fs');
const path = require('path');
const root = process.cwd();
function exists(p) { return fs.existsSync(path.join(root, p)); }
function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }
function write(p, v) { fs.writeFileSync(path.join(root, p), v); }
function inject(html, marker, block, beforeNeedle) {
  const start = `<!-- ${marker}:start -->`;
  const end = `<!-- ${marker}:end -->`;
  const wrapped = `${start}${block}${end}`;
  if (html.includes(start) && html.includes(end)) {
    return html.replace(new RegExp(`${start}[\\s\\S]*?${end}`), wrapped);
  }
  if (html.includes(beforeNeedle)) return html.replace(beforeNeedle, wrapped + beforeNeedle);
  return html + wrapped;
}
function ensureScript(html, src) {
  if (html.includes(`src="${src}"`) || html.includes(`src='${src}'`)) return html;
  return html.replace('</body>', `<script src="${src}"></script></body>`);
}
const controlPanel = `<section class="section wrap" id="control-structure-entry"><div class="eyebrow">Main Mission</div><h2>EXPOSE THE CONTROL STRUCTURE.</h2><p class="lead">Start with the rails ordinary life depends on: money, identity, information, emergency power, infrastructure, elite networks, and missing records.</p><div class="grid"><article class="card redline"><span class="label">MAP</span><h3>Control Structure Map</h3><p>The intuitive seven-layer route through the whole site.</p><a class="btn" href="control-structure.html">Open Control Map</a></article><article class="card redline"><span class="label">BRAIN</span><h3>Daily Brain Brief</h3><p>What the machine concludes today, what changed, and what records matter.</p><a class="btn alt" href="daily-brain-brief.html">Open Daily Brief</a></article><article class="card redline"><span class="label">SOURCE</span><h3>Evidence Vault</h3><p>Check the source route before accepting any claim.</p><a class="btn alt" href="evidence-vault.html">Open Evidence</a></article></div><div data-living-pulse></div></section>`;
const brainPanel = `<section class="section wrap" id="living-brain-pulse"><h2>Living Machine Pulse</h2><p class="lead">The brain should feel alive because it tells the reader what it sees now, what it means, and which records matter next.</p><div data-living-pulse></div></section>`;
for (const file of ['index.html', 'matrix-brain.html', 'daily-brain-brief.html', 'search.html']) {
  if (!exists(file)) continue;
  let html = read(file);
  if (file === 'index.html') html = inject(html, 'control-structure-entry', controlPanel, '<section id="machine-three-doors"');
  if (file === 'matrix-brain.html') html = inject(html, 'living-brain-pulse', brainPanel, '<section class="section wrap"><h2>Machine Pulse</h2>');
  if (file === 'search.html') html = inject(html, 'search-mission-panel', controlPanel, '</main>');
  html = ensureScript(html, 'living-pulse.js');
  write(file, html);
}
console.log('Living control interface built: control map linked, brain pulse injected, living-pulse.js attached.');
