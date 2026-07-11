const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });

function readJson(rel, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); } catch { return fallback; }
}
function text(value, max = 180) {
  const clean = String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
}
function safeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9:_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}
function pushUnique(list, seen, element) {
  const id = element?.data?.id;
  if (!id || seen.has(id)) return;
  seen.add(id);
  list.push(element);
}

const registry = readJson('data/investigation-source-registry.json', { lanes: [], sources: [] });
const daily = readJson('data/daily-investigation-conclusions.json', { strongestFindings: [], establishedWrongdoing: [], officialActions: [], documentAndLeakLeads: [] });
const weekly = readJson('data/weekly-investigation-conclusions.json', { strongestFindings: [], establishedWrongdoing: [], officialActions: [], documentAndLeakLeads: [] });

const elements = [];
const seen = new Set();
const lanes = new Map((registry.lanes || []).map(lane => [lane.id, lane]));
const sources = new Map((registry.sources || []).map(source => [source.id, source]));

for (const lane of registry.lanes || []) {
  pushUnique(elements, seen, {
    group: 'nodes',
    data: {
      id: `lane:${safeId(lane.id)}`,
      kind: 'lane',
      label: text(lane.title, 64),
      title: lane.title,
      description: lane.description,
      route: lane.route || 'investigation-machine.html',
      lane: lane.id
    }
  });
}

for (const source of registry.sources || []) {
  const sourceId = `source:${safeId(source.id)}`;
  const laneId = `lane:${safeId(source.lane)}`;
  pushUnique(elements, seen, {
    group: 'nodes',
    data: {
      id: sourceId,
      kind: 'source',
      label: text(source.label, 72),
      title: source.label,
      description: `${source.authority || 'source'} · ${(source.frequency || []).join(' / ') || 'regular monitoring'}`,
      url: source.url,
      authority: source.authority || 'source',
      lane: source.lane || 'general'
    }
  });
  if (seen.has(laneId)) {
    pushUnique(elements, seen, {
      group: 'edges',
      data: {
        id: `edge:${safeId(source.id)}:lane`,
        source: sourceId,
        target: laneId,
        relationship: 'monitored in',
        evidenceClass: 'registry'
      }
    });
  }
}

const pools = [
  ...(daily.strongestFindings || []),
  ...(daily.establishedWrongdoing || []),
  ...(daily.officialActions || []),
  ...(daily.documentAndLeakLeads || []),
  ...(weekly.strongestFindings || []),
  ...(weekly.establishedWrongdoing || []),
  ...(weekly.officialActions || []),
  ...(weekly.documentAndLeakLeads || [])
];
const uniqueFindings = new Map();
for (const finding of pools) {
  if (!finding?.id) continue;
  const prior = uniqueFindings.get(finding.id);
  if (!prior || Number(finding.severity || 0) > Number(prior.severity || 0)) uniqueFindings.set(finding.id, finding);
}
const rankedFindings = [...uniqueFindings.values()]
  .sort((a, b) => Number(b.severity || 0) - Number(a.severity || 0) || new Date(b.published || b.lastSeen || 0) - new Date(a.published || a.lastSeen || 0))
  .slice(0, 120);

const indicatorCounts = new Map();
for (const finding of rankedFindings) {
  for (const indicator of finding.wrongdoingIndicators || []) {
    const key = String(indicator || '').toLowerCase().trim();
    if (key) indicatorCounts.set(key, (indicatorCounts.get(key) || 0) + 1);
  }
}
for (const [indicator, count] of [...indicatorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  pushUnique(elements, seen, {
    group: 'nodes',
    data: {
      id: `indicator:${safeId(indicator)}`,
      kind: 'indicator',
      label: indicator,
      title: `Indicator: ${indicator}`,
      description: `Appears in ${count} selected evidence finding${count === 1 ? '' : 's'}. Keyword occurrence is a research signal, not a verdict.`,
      count
    }
  });
}

for (const finding of rankedFindings) {
  const findingId = `finding:${safeId(finding.id)}`;
  const sourceId = `source:${safeId(finding.sourceId)}`;
  const laneId = `lane:${safeId(finding.lane)}`;
  pushUnique(elements, seen, {
    group: 'nodes',
    data: {
      id: findingId,
      kind: 'finding',
      label: text(finding.title, 70),
      title: finding.title,
      description: text(finding.conclusion || finding.summary, 360),
      status: finding.status || 'record-update',
      grade: finding.evidenceGrade || 'C',
      severity: Number(finding.severity || 1),
      published: finding.published || finding.lastSeen || '',
      url: finding.itemUrl || finding.sourceUrl || '',
      route: `daily-investigation-conclusions.html?finding=${encodeURIComponent(finding.id)}`,
      sourceLabel: finding.sourceLabel || sources.get(finding.sourceId)?.label || finding.sourceId,
      lane: finding.lane || 'general',
      boundary: text(finding.evidenceBoundary, 420),
      mechanism: text(finding.mechanism, 420)
    }
  });
  if (seen.has(sourceId)) {
    pushUnique(elements, seen, {
      group: 'edges',
      data: {
        id: `edge:${safeId(finding.id)}:source`,
        source: findingId,
        target: sourceId,
        relationship: 'documented by',
        evidenceClass: finding.evidenceGrade || 'C'
      }
    });
  }
  if (seen.has(laneId)) {
    pushUnique(elements, seen, {
      group: 'edges',
      data: {
        id: `edge:${safeId(finding.id)}:lane`,
        source: findingId,
        target: laneId,
        relationship: 'investigation lane',
        evidenceClass: finding.evidenceGrade || 'C'
      }
    });
  }
  for (const indicator of finding.wrongdoingIndicators || []) {
    const indicatorId = `indicator:${safeId(String(indicator).toLowerCase().trim())}`;
    if (!seen.has(indicatorId)) continue;
    pushUnique(elements, seen, {
      group: 'edges',
      data: {
        id: `edge:${safeId(finding.id)}:indicator:${safeId(indicator)}`,
        source: findingId,
        target: indicatorId,
        relationship: 'contains indicator',
        evidenceClass: 'keyword-triage'
      }
    });
  }
}

const nodes = elements.filter(element => element.group === 'nodes');
const edges = elements.filter(element => element.group === 'edges');
const output = {
  ok: true,
  generatedAt: new Date().toISOString(),
  library: 'Cytoscape.js',
  publicScope: 'Selected high-priority findings, all registered source platforms and all investigation lanes.',
  boundary: 'The network visualises evidence routes. A connection is not proof of guilt, intent, conspiracy or unlawful conduct. Open the underlying source and evidence boundary before drawing a conclusion.',
  stats: {
    nodes: nodes.length,
    edges: edges.length,
    lanes: nodes.filter(node => node.data.kind === 'lane').length,
    sources: nodes.filter(node => node.data.kind === 'source').length,
    findings: nodes.filter(node => node.data.kind === 'finding').length,
    indicators: nodes.filter(node => node.data.kind === 'indicator').length
  },
  filters: {
    lanes: [...lanes.values()].map(lane => ({ id: lane.id, label: lane.title })),
    statuses: [...new Set(nodes.filter(node => node.data.kind === 'finding').map(node => node.data.status))].sort()
  },
  elements
};
fs.writeFileSync(path.join(dataDir, 'investigation-network.json'), JSON.stringify(output, null, 2));

const mapsPath = path.join(root, 'network-maps.html');
if (fs.existsSync(mapsPath)) {
  let html = fs.readFileSync(mapsPath, 'utf8');
  if (!html.includes('investigation-network.html')) {
    html = html.replace('<a class="btn alt" href="evidence-vault.html">Source Vault</a>', '<a class="btn alt" href="evidence-vault.html">Source Vault</a><a class="btn alt" href="investigation-network.html">Interactive Evidence Network</a>');
    fs.writeFileSync(mapsPath, html);
  }
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'investigation-network-build.json'), JSON.stringify({ ok: true, generatedAt: output.generatedAt, stats: output.stats }, null, 2));
console.log(`Investigation network built: ${output.stats.nodes} nodes, ${output.stats.edges} edges, ${output.stats.findings} selected findings.`);
