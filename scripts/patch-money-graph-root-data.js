const fs = require('fs');
const path = require('path');

const root = process.cwd();
const file = path.join(root, 'money-graph.js');
const report = path.join(root, 'downloads', 'money-graph-root-data-patch.json');

if (!fs.existsSync(file)) throw new Error('Money graph runtime is missing: money-graph.js');

const before = fs.readFileSync(file, 'utf8');
let after = before;
after = after.replace("fetch('data/money-overlap-graph.json'", "fetch('/data/money-overlap-graph.json'");
after = after.replace("fetch('data/money-intelligence-registry.json'", "fetch('/data/money-intelligence-registry.json'");

const checks = {
  overlapGraphUsesRootRoute: after.includes("fetch('/data/money-overlap-graph.json'"),
  registryUsesRootRoute: after.includes("fetch('/data/money-intelligence-registry.json'"),
  legacyRelativeOverlapRouteRemoved: !after.includes("fetch('data/money-overlap-graph.json'"),
  legacyRelativeRegistryRouteRemoved: !after.includes("fetch('data/money-intelligence-registry.json'")
};

if (Object.values(checks).some(value => value !== true)) {
  throw new Error(`Money graph root-data repair failed: ${JSON.stringify(checks)}`);
}

if (after !== before) fs.writeFileSync(file, after);
fs.mkdirSync(path.dirname(report), { recursive: true });
fs.writeFileSync(report, JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: after !== before,
  platform: 'Cloudflare Assets',
  checks,
  boundary: 'The shared overlap-map runtime uses canonical root data routes so root pages and source-route copies resolve the same generated datasets.'
}, null, 2));

console.log(`Money graph root-data routes ${after !== before ? 'repaired' : 'already current'}.`);
