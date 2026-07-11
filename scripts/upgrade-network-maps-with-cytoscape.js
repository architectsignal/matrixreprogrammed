const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataPath = path.join(root, 'data', 'network-maps.json');
const reportPath = path.join(root, 'downloads', 'cytoscape-network-map-report.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });

if (!fs.existsSync(dataPath)) {
  fs.writeFileSync(reportPath, JSON.stringify({ ok: true, skipped: true, reason: 'data/network-maps.json missing' }, null, 2));
  console.log('Cytoscape map upgrade skipped: data/network-maps.json missing.');
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const books = readJson('data/books.json', { books: [] }).books || [];
const atlas = readJson('data/power-atlas.json', { nodes: [] }).nodes || [];
const vault = readJson('data/evidence-vault.json', { sourceLanes: [] }).sourceLanes || [];
const answers = readJson('data/ai-answer-engine.json', { answers: [] }).answers || [];
const generated = [];
const failures = [];

function readJson(relative, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); }
  catch { return fallback; }
}
function esc(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}
function safeId(value = '') {
  return String(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'node';
}
function normal(value = '') {
  return safeId(value).replace(/-/g, '');
}
function compact(value = '', max = 420) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}
function bookByKey(key) { return books.find(book => book.key === key); }
function atlasBySlug(slug) { return atlas.find(node => node.slug === slug); }
function laneBySlug(slug) { return vault.find(lane => lane.slug === slug); }
function answerBySlug(slug) { return answers.find(answer => answer.slug === slug); }
function bookRoute(book) { return book?.generatedUrl || book?.localUrl || 'books.html'; }

function graphFor(map) {
  const nodes = new Map();
  const aliases = new Map();
  const edges = [];
  const edgeIds = new Set();
  const centreId = `map-${safeId(map.slug)}`;

  function addNode(input) {
    let id = input.id;
    let counter = 2;
    while (nodes.has(id) && nodes.get(id).label !== input.label) id = `${input.id}-${counter++}`;
    const node = { ...input, id };
    if (!nodes.has(id)) nodes.set(id, node);
    for (const alias of [node.label, node.id, node.slug, ...(node.aliases || [])]) {
      if (alias) aliases.set(normal(alias), id);
    }
    return id;
  }
  function addEdge(source, target, type, evidenceClass, meaning, weight = 1) {
    if (!source || !target || source === target) return;
    const base = `edge-${safeId(source)}-${safeId(target)}-${safeId(type)}`;
    let id = base;
    let counter = 2;
    while (edgeIds.has(id)) id = `${base}-${counter++}`;
    edgeIds.add(id);
    edges.push({ data: { id, source, target, type, evidenceClass, meaning: compact(meaning), weight } });
  }

  addNode({
    id: centreId,
    label: map.title,
    group: 'map',
    route: `map-${map.slug}.html`,
    notes: compact(map.summary),
    evidenceClass: 'Map Route',
    slug: map.slug
  });

  for (const slug of map.atlasNodes || []) {
    const record = atlasBySlug(slug);
    const id = addNode({
      id: `atlas-${safeId(slug)}`,
      label: record?.shortTitle || record?.title || slug.replace(/-/g, ' '),
      group: 'atlas',
      route: `atlas-${slug}.html`,
      notes: compact(record?.summary || 'Power Atlas node connected to this map.'),
      evidenceClass: record?.evidenceClass || 'Atlas Route',
      slug,
      aliases: [slug]
    });
    addEdge(centreId, id, 'Power Atlas route', 'Navigation', 'This node is part of the map research route.', 2);
  }

  for (const slug of map.evidenceLanes || []) {
    const record = laneBySlug(slug);
    const id = addNode({
      id: `evidence-${safeId(slug)}`,
      label: record?.title || slug.replace(/-/g, ' '),
      group: 'evidence',
      route: `evidence-lane-${slug}.html`,
      notes: compact(record?.summary || 'Evidence Vault lane connected to this map.'),
      evidenceClass: record?.evidenceClass || 'Evidence Route',
      slug,
      aliases: [slug]
    });
    addEdge(centreId, id, 'Evidence route', 'Navigation', 'This source lane defines what can be responsibly claimed.', 2);
  }

  for (const key of map.books || []) {
    const record = bookByKey(key);
    const id = addNode({
      id: `book-${safeId(key)}`,
      label: record?.title || key.replace(/-/g, ' '),
      group: 'book',
      route: bookRoute(record),
      notes: compact(record?.description || 'Book route connected to this map.'),
      evidenceClass: 'Book Route',
      slug: key,
      aliases: [key]
    });
    addEdge(centreId, id, 'Book route', 'Navigation', 'This book provides deeper historical or thematic context.', 3);
  }

  for (const slug of map.answers || []) {
    const record = answerBySlug(slug);
    const id = addNode({
      id: `answer-${safeId(slug)}`,
      label: record?.question || slug.replace(/-/g, ' '),
      group: 'answer',
      route: `answer-${slug}.html`,
      notes: compact(record?.shortAnswer || 'Answer route connected to this map.'),
      evidenceClass: 'Answer Route',
      slug,
      aliases: [slug]
    });
    addEdge(centreId, id, 'Answer route', 'Navigation', 'This answer explains a related evidence boundary or concept.', 3);
  }

  function endpointId(label) {
    const existing = aliases.get(normal(label));
    if (existing) return existing;
    return addNode({
      id: `relationship-${safeId(label)}`,
      label,
      group: 'relationship',
      route: '',
      notes: 'Relationship endpoint defined by the map data. Open connected nodes and evidence lines for context.',
      evidenceClass: 'Relationship Endpoint',
      aliases: [label]
    });
  }

  for (const relationship of map.relationships || []) {
    const source = endpointId(relationship.from);
    const target = endpointId(relationship.to);
    addEdge(source, target, relationship.type || 'Relationship', relationship.evidenceClass || 'Needs Review', relationship.meaning || '', 1);
  }

  return {
    slug: map.slug,
    title: map.title,
    summary: map.summary,
    riskBoundary: map.riskBoundary,
    centreId,
    elements: [
      ...[...nodes.values()].map(node => ({ data: node })),
      ...edges
    ],
    counts: { nodes: nodes.size, edges: edges.length }
  };
}

const styles = `<style id="cytoscape-network-map-styles">
.cytoscape-map-shell{border:1px solid rgba(216,181,106,.28);border-radius:24px;padding:1rem;background:linear-gradient(145deg,rgba(14,8,2,.97),rgba(0,0,0,.96));box-shadow:0 25px 70px rgba(0,0,0,.35)}
.cytoscape-map-toolbar{display:flex;gap:.65rem;flex-wrap:wrap;align-items:end;margin-bottom:.85rem}.cytoscape-map-toolbar label{display:grid;gap:.3rem;min-width:180px;font-size:.82rem}.cytoscape-map-toolbar input,.cytoscape-map-toolbar select{width:100%;padding:.72rem;border:1px solid rgba(216,181,106,.35);border-radius:10px;background:#090909;color:#f7efdb}.cytoscape-map-canvas{height:min(72vh,760px);min-height:480px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:radial-gradient(circle at 50% 50%,rgba(92,12,12,.2),rgba(0,0,0,.97) 65%)}
.cytoscape-map-grid{display:grid;grid-template-columns:minmax(0,2.2fr) minmax(260px,.8fr);gap:1rem}.cytoscape-map-details{border:1px solid rgba(216,181,106,.25);border-radius:18px;padding:1rem;background:rgba(0,0,0,.7);align-self:start}.cytoscape-member-tools{margin-top:1rem;padding-top:1rem;border-top:1px solid rgba(216,181,106,.2)}.cytoscape-member-tools[hidden]{display:none!important}.cytoscape-path-row{display:grid;grid-template-columns:1fr 1fr auto;gap:.6rem;align-items:end}.cytoscape-map-note{font-size:.86rem;color:#c8b98c;margin:.65rem 0 0}
@media(max-width:850px){.cytoscape-map-grid{grid-template-columns:1fr}.cytoscape-map-canvas{min-height:430px}.cytoscape-path-row{grid-template-columns:1fr}}
</style>`;

function graphSection(map, graph) {
  const json = JSON.stringify(graph).replace(/</g, '\\u003c');
  return `<section id="interactive-network-graph" class="section wrap" data-cytoscape-map>
  <div class="eyebrow">Interactive Evidence Map</div>
  <h2>Explore The Documented Routes</h2>
  <p class="lead">Search, move and inspect the network. A line describes the relationship written on it; it does not turn association into guilt.</p>
  <div class="cytoscape-map-shell">
    <div class="cytoscape-map-toolbar" aria-label="Map controls">
      <label>Search this map<input type="search" data-map-search placeholder="Person, institution, evidence or route" autocomplete="off"/></label>
      <label>Layout<select data-map-layout><option value="cose">Evidence network</option><option value="concentric">Concentric</option><option value="breadthfirst">Decision chain</option><option value="circle">Circle</option><option value="grid">Grid</option></select></label>
      <button class="btn alt" type="button" data-map-fit>Fit map</button>
      <button class="btn alt" type="button" data-map-reset>Reset</button>
    </div>
    <div class="cytoscape-map-grid">
      <div class="cytoscape-map-canvas" data-map-canvas role="img" aria-label="Interactive relationship map for ${esc(map.title)}"></div>
      <aside class="cytoscape-map-details" data-map-details><h3>${esc(map.title)}</h3><p>${esc(map.summary)}</p></aside>
    </div>
    <div class="cytoscape-member-tools" data-member-level="intelligence" hidden>
      <h3>Advanced Relationship Analysis</h3>
      <div class="cytoscape-map-toolbar"><label>Evidence class<select data-evidence-filter></select></label></div>
      <div class="cytoscape-path-row"><label>Start node<select data-path-source></select></label><label>End node<select data-path-target></select></label><button class="btn" type="button" data-find-path>Find documented path</button></div>
      <p class="cytoscape-map-note" data-path-status>Select two nodes to find the shortest documented route in this map.</p>
    </div>
    <div class="cytoscape-member-tools" data-member-level="research" hidden>
      <h3>Research Exports</h3>
      <div class="cta-row"><button class="btn alt" type="button" data-export-png>Export map image</button><button class="btn alt" type="button" data-export-json>Export map data</button></div>
    </div>
    <p class="cytoscape-map-note">Public access includes the full interactive map, map search, layouts, node details and evidence routes.</p>
    <script type="application/json" data-map-data>${json}</script>
  </div>
</section>`;
}

for (const map of data.maps || []) {
  const file = path.join(root, `map-${map.slug}.html`);
  if (!fs.existsSync(file)) {
    failures.push(`Missing generated page: map-${map.slug}.html`);
    continue;
  }
  let html = fs.readFileSync(file, 'utf8');
  html = html
    .replace(/<style id="cytoscape-network-map-styles">[\s\S]*?<\/style>/i, '')
    .replace(/\s*<section id="interactive-network-graph"[\s\S]*?<\/section>/i, '')
    .replace(/\s*<script[^>]*src=["']https:\/\/cdn\.jsdelivr\.net\/npm\/cytoscape[^"']*["'][^>]*><\/script>/i, '')
    .replace(/\s*<script[^>]*src=["']interactive-network-map\.js["'][^>]*><\/script>/i, '');

  const graph = graphFor(map);
  if (html.includes('</head>')) html = html.replace('</head>', `${styles}</head>`);
  const anchor = '<section class="section wrap"><h2>Relationship Lines</h2>';
  if (html.includes(anchor)) html = html.replace(anchor, `${graphSection(map, graph)}${anchor}`);
  else if (html.includes('</main>')) html = html.replace('</main>', `${graphSection(map, graph)}</main>`);
  else failures.push(`No insertion point in map-${map.slug}.html`);

  const scripts = '<script src="https://cdn.jsdelivr.net/npm/cytoscape@3.34.0/dist/cytoscape.min.js" crossorigin="anonymous"></script><script src="interactive-network-map.js"></script>';
  if (html.includes('</body>')) html = html.replace('</body>', `${scripts}</body>`);
  fs.writeFileSync(file, html);
  generated.push({ file: path.basename(file), ...graph.counts });
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  library: 'Cytoscape.js 3.34.0',
  licence: 'MIT',
  generated,
  failures,
  access: {
    public: ['interactive map', 'map search', 'layout switching', 'node details', 'evidence routes'],
    intelligenceMember: ['evidence-class filters', 'documented shortest-path analysis'],
    researchPro: ['PNG export', 'JSON export']
  },
  boundary: 'A graph line carries its relationship type and evidence class. Association is not guilt.'
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('CYTOSCAPE NETWORK MAP UPGRADE FAILED');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Cytoscape network map upgrade complete: ${generated.length} map page(s), ${generated.reduce((sum, item) => sum + item.nodes, 0)} nodes, ${generated.reduce((sum, item) => sum + item.edges, 0)} edges.`);
