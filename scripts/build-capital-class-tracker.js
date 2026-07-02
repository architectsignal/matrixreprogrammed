const fs = require('fs');
const path = require('path');
const root = process.cwd();
const dataPath = path.join(root, 'data', 'epstein-capital-class-map.json');
if (!fs.existsSync(dataPath)) {
  console.log('No capital class tracker data found. Skipping.');
  process.exit(0);
}
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const esc = v => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const wealthCount = (data.nodes || []).filter(n => String(n.status).includes('billionaire') || String(n.status).includes('wealth')).length;
const section = `<section id="capital-class-tracker-link" class="section wrap"><div class="eyebrow">EFTA01104262 · Capital Class Map</div><h2>THE CAPITAL CLASS TRACKER.</h2><p class="lead">The Connections Web file is now tracked as a public-record map layer: source file, nodes, labels, wealth lanes, research routes, update rules, and a visual power-map asset. A map node is not a verdict; every stronger claim needs its own evidence class.</p><div class="cta-row"><a class="btn" href="epstein-capital-class-map.html">Open Capital Class Map</a><a class="btn alt" href="epstein-billionaire-tracker.html">Open Billionaire Tracker</a><a class="btn alt" href="data/epstein-capital-class-map.json">Open JSON</a><a class="btn alt" href="downloads/epstein-capital-class-power-map.svg">Open Power Map SVG</a></div><div class="terminal">CAPITAL CLASS TRACKING METHOD\n&gt; Source: ${esc(data.sourceFile)} / ${esc(data.batesRange)}\n&gt; Nodes: ${(data.nodes || []).length}\n&gt; Wealth watch nodes: ${wealthCount}\n&gt; Node first: name, label, page, tracking lane\n&gt; Wealth second: net worth, filings, property/entity, philanthropy, political money, aircraft/company-aircraft leads\n&gt; Boundary always: association is not guilt</div></section>`;
function patchHtml(file) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return false;
  let html = fs.readFileSync(p, 'utf8');
  if (html.includes('capital-class-tracker-link')) return false;
  if (!html.includes('</main>')) return false;
  html = html.replace('</main>', section + '</main>');
  fs.writeFileSync(p, html);
  return true;
}
function patchSearch() {
  const p = path.join(root, 'search-index.json');
  if (!fs.existsSync(p)) return false;
  let search;
  try { search = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return false; }
  const add = [
    { key:'epstein-capital-class-map', title:'Epstein Capital Class Map', subtitle:'EFTA01104262 tracker', series:'Epstein Files', category:'Public-record tracker', url:'epstein-capital-class-map.html', description:'Source-first tracker for the EFTA01104262 Connections Web map.', keywords:['Epstein','EFTA01104262','capital class','money map','wealth nodes'] },
    { key:'epstein-billionaire-tracker', title:'Epstein Billionaire Tracker', subtitle:'Advanced wealth-node tracking', series:'Epstein Files', category:'Money and power tracker', url:'epstein-billionaire-tracker.html', description:'Billionaire and wealth-node tracker with money, property, investment, philanthropy, political-money and aircraft/corporate-aircraft fields.', keywords:['Epstein','billionaires','wealth nodes','SEC','property','aircraft','philanthropy','OpenSecrets'] }
  ];
  const existing = new Set(search.map(item => item.url));
  let changed = false;
  for (const item of add) if (!existing.has(item.url)) { search.push(item); changed = true; }
  if (changed) fs.writeFileSync(p, JSON.stringify(search, null, 2));
  return changed;
}
function patchSitemap() {
  const p = path.join(root, 'sitemap.xml');
  if (!fs.existsSync(p)) return false;
  let xml = fs.readFileSync(p, 'utf8');
  let changed = false;
  for (const file of ['epstein-capital-class-map.html', 'epstein-billionaire-tracker.html']) {
    if (!xml.includes('/' + file + '</loc>')) {
      xml = xml.replace('</urlset>', `  <url><loc>https://matrixreprogrammed.com/${file}</loc><lastmod>${data.updated || '2026-07-02'}</lastmod><changefreq>weekly</changefreq><priority>0.88</priority></url>\n</urlset>`);
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(p, xml);
  return changed;
}
function patchLlms() {
  const p = path.join(root, 'llms.txt');
  if (!fs.existsSync(p)) return false;
  let txt = fs.readFileSync(p, 'utf8');
  if (txt.includes('/epstein-capital-class-map.html')) return false;
  txt = `${txt.trim()}\n\nCapital Class tracker:\n- /epstein-capital-class-map.html: EFTA01104262/EFTA01104263 source-first map tracker.\n- /epstein-billionaire-tracker.html: billionaire and wealth-node tracker with money, property, investment, philanthropy, political money and aircraft/corporate-aircraft research fields.\n- /data/epstein-capital-class-map.json: machine-readable tracker data.\n- /downloads/epstein-capital-class-power-map.svg: visual power-map asset.\n`;
  fs.writeFileSync(p, txt);
  return true;
}
const results = {
  epsteinFiles: patchHtml('epstein-files.html'),
  powerAtlas: patchHtml('power-atlas.html'),
  search: patchSearch(),
  sitemap: patchSitemap(),
  llms: patchLlms()
};
console.log('Capital Class tracker build complete:', results);
