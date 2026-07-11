const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const failures = [];
const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
}
function read(file) { return fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), 'utf8') : ''; }

const data = JSON.parse(read('data/network-maps.json') || '{"maps":[]}');
const runtime = read('interactive-network-map.js');
check('interactive-network-map.js exists', Boolean(runtime));
if (runtime) {
  const syntax = spawnSync(process.execPath, ['--check', path.join(root, 'interactive-network-map.js')], { cwd: root, encoding: 'utf8' });
  check('interactive-network-map.js syntax', syntax.status === 0, syntax.stderr || syntax.stdout || '');
  for (const marker of ['window.cytoscape', '/api/member/me', 'data-member-level="intelligence"', 'data-member-level="research"', 'aStar', 'cy.png']) {
    check(`runtime marker ${marker}`, runtime.includes(marker));
  }
}

let totalNodes = 0;
let totalEdges = 0;
for (const map of data.maps || []) {
  const file = `map-${map.slug}.html`;
  const html = read(file);
  check(`${file} exists`, Boolean(html));
  if (!html) continue;
  check(`${file} interactive section`, html.includes('id="interactive-network-graph"'));
  check(`${file} pinned Cytoscape`, html.includes('cytoscape@3.34.0/dist/cytoscape.min.js'));
  check(`${file} local runtime`, html.includes('src="interactive-network-map.js"'));
  check(`${file} public search`, html.includes('data-map-search'));
  check(`${file} public layout`, html.includes('data-map-layout'));
  check(`${file} intelligence controls hidden`, /data-member-level="intelligence" hidden/.test(html));
  check(`${file} research controls hidden`, /data-member-level="research" hidden/.test(html));
  check(`${file} evidence boundary`, /Association is not guilt|does not turn association into guilt/i.test(html));
  const match = html.match(/<script type="application\/json" data-map-data>([\s\S]*?)<\/script>/i);
  check(`${file} graph JSON`, Boolean(match));
  if (!match) continue;
  try {
    const graph = JSON.parse(match[1]);
    check(`${file} graph slug`, graph.slug === map.slug, `${graph.slug} !== ${map.slug}`);
    check(`${file} graph centre`, Boolean(graph.centreId));
    check(`${file} graph elements`, Array.isArray(graph.elements) && graph.elements.length > 2, `${graph.elements?.length || 0} elements`);
    const nodes = (graph.elements || []).filter(element => element.data && !element.data.source);
    const edges = (graph.elements || []).filter(element => element.data && element.data.source && element.data.target);
    totalNodes += nodes.length;
    totalEdges += edges.length;
    const ids = nodes.map(node => node.data.id);
    check(`${file} unique node IDs`, new Set(ids).size === ids.length, `${ids.length - new Set(ids).size} duplicate(s)`);
    const nodeSet = new Set(ids);
    const broken = edges.filter(edge => !nodeSet.has(edge.data.source) || !nodeSet.has(edge.data.target));
    check(`${file} edge endpoints`, broken.length === 0, `${broken.length} broken edge(s)`);
    check(`${file} relationship evidence classes`, edges.some(edge => edge.data.evidenceClass && edge.data.evidenceClass !== 'Navigation'));
  } catch (error) {
    check(`${file} graph JSON parse`, false, error.message);
  }
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  maps: (data.maps || []).length,
  totalNodes,
  totalEdges,
  checks,
  failures,
  accessBoundary: {
    public: 'Full interactive evidence map, search, layouts and node routes.',
    intelligenceMember: 'Evidence filters and documented path analysis.',
    researchPro: 'Map image and structured JSON exports.'
  }
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'cytoscape-network-map-test.json'), JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(`CYTOSCAPE NETWORK MAP TEST FAILED: ${failures.length} failure(s)`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Cytoscape network map test passed: ${(data.maps || []).length} maps, ${totalNodes} nodes, ${totalEdges} edges, ${checks.length} checks.`);
