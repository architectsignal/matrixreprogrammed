'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const roots = [root, outputRoot].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const clean = (value, max = 300) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);

function readJson(relative, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); } catch { return fallback; }
}

function writeEverywhere(relative, content) {
  for (const base of roots) {
    const file = path.join(base, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

const mirrors = readJson('data/red-team-mirror.json', { mirrors: [] });
const validIds = new Set((mirrors.mirrors || []).map(item => clean(item.sourceRecordId, 220)).filter(Boolean));
const diff = readJson('data/power-diff.json', { entries: [] });
let removedInvalidRoutes = 0;

diff.entries = (diff.entries || []).map(entry => {
  const sourceRecordId = clean(entry.sourceRecordId, 220);
  if (validIds.has(sourceRecordId)) return { ...entry, redTeamMirrorRoute: `red-team-mirror.html#red-team-${sourceRecordId}` };
  if (entry.redTeamMirrorRoute) removedInvalidRoutes += 1;
  const next = { ...entry };
  delete next.redTeamMirrorRoute;
  return next;
});
writeEverywhere('data/power-diff.json', `${JSON.stringify(diff, null, 2)}\n`);

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'red-team-mirror-route-finalization.json'), JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  currentMirrorCount: validIds.size,
  removedInvalidRoutes,
  boundary: 'Power Diff entries absent from the current accountability index retain their historical diff but do not receive a Red-Team Mirror route to a nonexistent current proposition.'
}, null, 2) + '\n');
console.log(`Red-Team Mirror routes finalized; removed ${removedInvalidRoutes} invalid historical-only route(s).`);
