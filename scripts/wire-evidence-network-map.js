const fs = require('fs');
const path = require('path');

const root = process.cwd();
const route = 'evidence-network-map.html';
const today = new Date().toISOString().slice(0, 10);
const changed = [];

function patchFile(file, transform) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) return;
  const before = fs.readFileSync(full, 'utf8');
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(full, after);
    changed.push(file);
  }
}

patchFile('network-maps.html', html => {
  if (html.includes(`href="${route}"`)) return html;
  const button = `<a class="btn" href="${route}">Open Interactive Evidence Map</a>`;
  if (html.includes('<div class="cta-row">')) return html.replace('<div class="cta-row">', `<div class="cta-row">${button}`);
  return html.replace('</main>', `<section class="section wrap"><h2>Interactive Evidence Map</h2><p>Explore current investigation lanes, source platforms and evidence findings with every relationship type and evidence boundary attached.</p>${button}</section></main>`);
});

patchFile('network-map-index.html', html => {
  if (html.includes(`href="${route}"`)) return html;
  const card = `<article class="card redline"><span class="label">Open-source interactive map</span><h3>Evidence Network Map</h3><p>Filter investigation findings by source lane, evidence grade and record status. Select a node to inspect the conclusion, mechanism, limitation and next record.</p><a class="btn" href="${route}">Open Interactive Map</a></article>`;
  const marker = '<section class="section wrap"><h2>Map Lanes</h2><div class="grid">';
  return html.includes(marker) ? html.replace(marker, `${marker}${card}`) : html.replace('</main>', `<section class="section wrap"><div class="grid">${card}</div></section></main>`);
});

patchFile('sitemap.xml', xml => {
  if (xml.includes(`/${route}</loc>`)) return xml;
  const entry = `  <url><loc>https://matrixreprogrammed.com/${route}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>\n`;
  return xml.includes('</urlset>') ? xml.replace('</urlset>', `${entry}</urlset>`) : xml;
});

patchFile('llms.txt', text => {
  if (text.includes('Interactive Evidence Network')) return text;
  return `${text.trim()}\n- Interactive Evidence Network: /${route}\n- Evidence Network JSON: /data/evidence-network-map.json\n- Public Evidence Map CSV: /downloads/evidence-network-map.csv\n`;
});

patchFile('robots.txt', text => {
  const additions = [];
  if (!text.includes('/data/evidence-network-map.json')) additions.push('Allow: /data/evidence-network-map.json');
  if (!text.includes('/downloads/evidence-network-map.csv')) additions.push('Allow: /downloads/evidence-network-map.csv');
  return additions.length ? `${text.trim()}\n${additions.join('\n')}\n` : text;
});

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'evidence-network-map-wiring.json'), JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  route,
  data: 'data/evidence-network-map.json',
  csv: 'downloads/evidence-network-map.csv'
}, null, 2));
console.log(`Evidence network map wiring complete: ${changed.length ? changed.join(', ') : 'already wired'}.`);
