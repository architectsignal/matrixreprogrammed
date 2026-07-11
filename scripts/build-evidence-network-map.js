const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });

function readJson(relativePath, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8')); }
  catch { return fallback; }
}
function clean(value = '', max = 420) {
  const text = String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}
function safeId(prefix, value) {
  const slug = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 110);
  return `${prefix}-${slug || 'unknown'}`;
}
function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const registry = readJson('data/investigation-source-registry.json', { lanes: [], sources: [] });
const ledger = readJson('data/investigation-ledger.json', { findings: [] });
const status = readJson('data/investigation-status.json', {});
const laneById = new Map((registry.lanes || []).map(lane => [lane.id, lane]));
const sourceById = new Map((registry.sources || []).map(source => [source.id, source]));
const gradeWeight = { A: 50, B: 30, C: 15, D: 0 };
const statusWeight = {
  'established-wrongdoing': 60,
  'official-enforcement': 50,
  'official-audit-finding': 44,
  'official-charge-or-allegation': 38,
  'document-release': 28,
  'leak-or-document-lead': 24,
  'wrongdoing-lead': 22,
  'record-update': 10
};
const findings = (ledger.findings || [])
  .filter(item => item && item.id && item.title)
  .map(item => ({ ...item, _rank: Number(statusWeight[item.status] || 0) + Number(gradeWeight[item.evidenceGrade] || 0) + Number(item.severity || 0) * 8 + Math.max(0, new Date(item.published || item.lastSeen || 0).getTime() / 1e12) }))
  .sort((a, b) => b._rank - a._rank)
  .slice(0, 220);

const nodes = [];
const edges = [];
const usedLanes = new Set();
const usedSources = new Set();
for (const finding of findings) {
  if (finding.lane) usedLanes.add(finding.lane);
  if (finding.sourceId) usedSources.add(finding.sourceId);
}
for (const laneId of usedLanes) {
  const lane = laneById.get(laneId) || { id: laneId, title: laneId, description: '' };
  nodes.push({ data: { id: safeId('lane', laneId), rawId: laneId, type: 'lane', label: clean(lane.title || laneId, 90), description: clean(lane.description || '', 360), route: lane.route || 'investigation-machine.html', weight: 80 } });
}
for (const sourceId of usedSources) {
  const source = sourceById.get(sourceId) || { id: sourceId, label: sourceId, lane: '', url: '' };
  const sourceNodeId = safeId('source', sourceId);
  nodes.push({ data: { id: sourceNodeId, rawId: sourceId, type: 'source', label: clean(source.label || sourceId, 110), description: clean(`${source.authority || 'source'} · ${(source.frequency || []).join(' / ')}`, 220), lane: source.lane || '', route: source.url || '', weight: 46 } });
  if (source.lane) edges.push({ data: { id: safeId('edge', `${source.lane}-${sourceId}`), source: safeId('lane', source.lane), target: sourceNodeId, type: 'monitors', label: 'monitors source' } });
}
for (const finding of findings) {
  const findingNodeId = safeId('finding', finding.id);
  nodes.push({ data: {
    id: findingNodeId, rawId: finding.id, type: 'finding', label: clean(finding.title, 120),
    description: clean(finding.conclusion || finding.summary || '', 520), summary: clean(finding.summary || '', 520),
    boundary: clean(finding.evidenceBoundary || '', 520), mechanism: clean(finding.mechanism || '', 520), implication: clean(finding.implication || '', 520),
    nextRecords: (finding.nextRecords || []).map(item => clean(item, 240)).slice(0, 5), lane: finding.lane || '', grade: finding.evidenceGrade || 'C',
    status: finding.status || 'record-update', severity: Number(finding.severity || 1), published: finding.published || finding.lastSeen || '',
    route: finding.itemUrl || finding.sourceUrl || '', sourceLabel: clean(finding.sourceLabel || finding.sourceId || '', 120),
    indicators: (finding.wrongdoingIndicators || []).map(item => clean(item, 80)).slice(0, 12), weight: 20 + Number(finding.severity || 1) * 6
  } });
  if (finding.sourceId) edges.push({ data: { id: safeId('edge', `${finding.sourceId}-${finding.id}`), source: safeId('source', finding.sourceId), target: findingNodeId, type: 'supports', label: 'supports finding', grade: finding.evidenceGrade || 'C' } });
  else if (finding.lane) edges.push({ data: { id: safeId('edge', `${finding.lane}-${finding.id}`), source: safeId('lane', finding.lane), target: findingNodeId, type: 'contains', label: 'contains finding', grade: finding.evidenceGrade || 'C' } });
}

const graph = {
  ok: true,
  generatedAt: new Date().toISOString(),
  sourceUpdatedAt: ledger.updated || status.lastInvestigationRun || null,
  title: 'Matrix Reprogrammed Evidence Network',
  description: 'A public interactive map connecting investigation lanes, monitored sources and evidence-bounded findings.',
  boundary: 'A line shows a defined source or classification relationship. It is not proof of guilt, secret coordination or unlawful conduct beyond the cited record.',
  totals: { lanes: usedLanes.size, sources: usedSources.size, findings: findings.length, nodes: nodes.length, edges: edges.length },
  filters: { grades: [...new Set(findings.map(item => item.evidenceGrade || 'C'))].sort(), statuses: [...new Set(findings.map(item => item.status || 'record-update'))].sort(), lanes: [...usedLanes].sort() },
  elements: { nodes, edges }
};
fs.writeFileSync(path.join(dataDir, 'evidence-network-map.json'), JSON.stringify(graph, null, 2));
const csvRows = [
  ['id', 'title', 'grade', 'status', 'severity', 'lane', 'source', 'published', 'source_url', 'conclusion', 'boundary'],
  ...findings.map(item => [item.id, item.title, item.evidenceGrade || 'C', item.status || 'record-update', Number(item.severity || 1), item.lane || '', item.sourceLabel || item.sourceId || '', item.published || '', item.itemUrl || item.sourceUrl || '', item.conclusion || item.summary || '', item.evidenceBoundary || ''])
];
fs.writeFileSync(path.join(downloadsDir, 'evidence-network-map.csv'), csvRows.map(row => row.map(csvCell).join(',')).join('\n'));
fs.writeFileSync(path.join(downloadsDir, 'evidence-network-map-build.json'), JSON.stringify({ ok: true, generatedAt: graph.generatedAt, totals: graph.totals, publicRoute: 'evidence-network-map.html', dataRoute: 'data/evidence-network-map.json', csvRoute: 'downloads/evidence-network-map.csv', software: 'Cytoscape.js', access: 'Primary-source routes and the current public map remain free. Membership adds history, exports, alerts and deeper research tools.' }, null, 2));
console.log(`Evidence network map built: ${graph.totals.nodes} nodes, ${graph.totals.edges} edges, ${graph.totals.findings} findings.`);
