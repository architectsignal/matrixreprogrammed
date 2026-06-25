const fs = require('fs');
const path = require('path');
const root = process.cwd();
const issues = [];
const file = name => path.join(root, name);
const exists = name => fs.existsSync(file(name));
const read = name => fs.readFileSync(file(name), 'utf8');
const needFile = name => { if (!exists(name)) issues.push(`missing ${name}`); };
const needText = (name, text) => { if (exists(name) && !read(name).includes(text)) issues.push(`${name} needs ${text}`); };

needFile('data/atlas-layers.json');
needFile('data/atlas-layer-panels.json');
needFile('scripts/build-atlas-layers.js');
needFile('atlas-layers.html');
needFile('search-index.json');
needFile('sitemap.xml');
needFile('llms.txt');

const data = exists('data/atlas-layers.json') ? JSON.parse(read('data/atlas-layers.json')) : { layers: [] };
const panels = exists('data/atlas-layer-panels.json') ? JSON.parse(read('data/atlas-layer-panels.json')) : { panels: {} };
if (!Array.isArray(data.layers) || data.layers.length !== 7) issues.push('atlas layer count must be 7');
for (const layer of data.layers || []) {
  if (!layer.slug || !layer.title || !layer.definition) issues.push('layer needs slug title definition');
  if (layer.slug) {
    needText('atlas-layers.html', `id="layer-${layer.slug}"`);
    const panel = panels.panels && panels.panels[layer.slug];
    if (!panel) issues.push(`missing expanded panel for ${layer.slug}`);
    if (panel && (!Array.isArray(panel.categories) || panel.categories.length < 6)) issues.push(`${layer.slug} panel needs expanded categories`);
    if (panel && (!Array.isArray(panel.lanes) || panel.lanes.length < 7)) issues.push(`${layer.slug} panel needs current source lanes`);
  }
}
needText('atlas-layers.html', 'ATLAS LAYERS.');
needText('atlas-layers.html', 'ATLAS LAYER STATUS');
needText('atlas-layers.html', 'Expanded Layer Brief');
needText('atlas-layers.html', 'Current Source Lane');
needText('atlas-layers.html', 'Expanded source-lane panels: active');
needText('atlas-layers.html', 'data/atlas-layer-panels.json');
needText('atlas-layers.html', 'Entity Page Rule');
needText('atlas-layers.html', 'Machine-readable data');
needText('atlas-layers.html', 'data/atlas-layers.json');
needText('atlas-layers.html', 'power-atlas.html');
needText('atlas-layers.html', 'atlas-index.html');
needText('atlas-layers.html', 'evidence-vault.html');
needText('search-index.json', 'atlas-layers.html');
needText('sitemap.xml', '/atlas-layers.html');
needText('llms.txt', '/atlas-layers.html');

if (issues.length) {
  console.error('ATLAS LAYERS TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log('ATLAS LAYERS TEST PASSED');
