const fs = require('fs');
const path = require('path');

const root = process.cwd();
const trackerPath = path.join(root, 'data', 'policy-convergence-tracker.json');
const mapPath = path.join(root, 'data', 'policy-convergence-timer-map.json');
const clocksPath = path.join(root, 'data', 'global-risk-clocks.json');
const downloadsDir = path.join(root, 'downloads');

if (!fs.existsSync(trackerPath) || !fs.existsSync(mapPath) || !fs.existsSync(clocksPath)) {
  console.log('Policy convergence tracker, timer map, or global risk clocks missing. Skipping timer link.');
  process.exit(0);
}
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

const tracker = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
const timerMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const clocks = JSON.parse(fs.readFileSync(clocksPath, 'utf8'));
const laneById = new Map((tracker.lanes || []).map(lane => [lane.id, lane]));

const linksByClock = new Map();
for (const mapping of timerMap.mappings || []) {
  const lane = laneById.get(mapping.trackerLane);
  for (const slug of mapping.clockSlugs || []) {
    if (!linksByClock.has(slug)) linksByClock.set(slug, []);
    linksByClock.get(slug).push({
      trackerLane: mapping.trackerLane,
      trackerTitle: lane ? lane.title : mapping.trackerLane,
      readerQuestion: lane ? lane.readerQuestion : '',
      timerTrigger: mapping.timerTrigger,
      escalationRule: mapping.escalationRule,
      trackerRoute: `control-system-tracker.html#${mapping.trackerLane}`
    });
  }
}

clocks.policyConvergence = {
  updated: tracker.updated || timerMap.updated,
  trackerRoute: 'control-system-tracker.html',
  timerMapRoute: 'downloads/policy-convergence-timer-map.json',
  method: timerMap.timerUpdateMethod || [],
  evidenceLevels: timerMap.evidenceLevels || {},
  boundary: timerMap.boundary || tracker.boundary || ''
};

for (const clock of clocks.clocks || []) {
  const links = linksByClock.get(clock.slug) || [];
  if (!links.length) continue;
  clock.policyConvergenceLinks = links;
  clock.policyConvergenceRoute = 'control-system-tracker.html';
  clock.timerUpdateRule = 'When a linked policy lane moves from mention to pilot, procurement, mandate, integration, or lock-in, update this clock with source, date, actor, jurisdiction, evidence level, and boundary.';
  if (!String(clock.nextRoute || '').includes('control-system-tracker.html')) {
    clock.secondaryRoute = 'control-system-tracker.html';
  }
  const laneNames = links.map(link => link.trackerTitle).join(' · ');
  if (!String(clock.signals || '').includes('Policy convergence tracker lanes')) {
    clock.signals = `${clock.signals} Policy convergence tracker lanes: ${laneNames}.`;
  }
}

fs.writeFileSync(clocksPath, JSON.stringify(clocks, null, 2));
fs.writeFileSync(path.join(root, 'downloads', 'policy-convergence-timer-map.json'), JSON.stringify(timerMap, null, 2));
fs.writeFileSync(path.join(root, 'downloads', 'global-risk-clocks-linked.json'), JSON.stringify(clocks, null, 2));

console.log(`Linked policy convergence tracker to ${linksByClock.size} global risk clocks.`);
