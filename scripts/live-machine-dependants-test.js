const fs = require('fs');
const path = require('path');

const root = process.cwd();
function readJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { return fallback; }
}
function write(file, value) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, value);
}
function millis(value) { const n = Date.parse(value || ''); return Number.isFinite(n) ? n : 0; }

const live = readJson('data/live-intel.json');
const epstein = readJson('data/daily-epstein-update.json');
const cards = readJson('data/card-live-updates.json');
const machine = readJson('data/live-machine-status.json');
const checks = [];
const failures = [];
function check(name, condition, detail) {
  const ok = Boolean(condition);
  checks.push({ name, ok, detail: ok ? '' : detail });
  if (!ok) failures.push(`${name}: ${detail}`);
}

check('Live Intel has a valid source-window timestamp', millis(live.updated) > 0, `invalid updated value ${live.updated || 'missing'}`);
check('Daily Epstein update was generated', millis(epstein.updated) > 0 && Array.isArray(epstein.items), 'daily Epstein JSON missing or malformed');
check('Daily Epstein update uses the current Live Intel window', epstein.sourceWindowUpdated === live.updated, `expected ${live.updated}, received ${epstein.sourceWindowUpdated}`);
check('Daily Epstein output is not older than Live Intel', millis(epstein.updated) >= millis(live.updated), 'daily Epstein output predates current source collection');
check('Daily Epstein items stay inside the Epstein lane contract', (epstein.items || []).every(item => item && item.evidenceBoundary && item.recordClass), 'one or more Epstein items lack evidence classification');
check('Card update feed was generated', millis(cards.updated) > 0 && Array.isArray(cards.cards) && cards.cards.length > 0, 'card feed empty or malformed');
check('Card feed uses the current Live Intel window', cards.sourceWindowUpdated === live.updated, `expected ${live.updated}, received ${cards.sourceWindowUpdated}`);
check('Every card has an explicit current state', (cards.cards || []).every(card => ['current-records-matched', 'no-new-verified-record-in-current-window'].includes(card.status)), 'card without truthful current-window state');
check('Every matched card preserves an evidence boundary', (cards.cards || []).every(card => card.evidenceBoundary && Array.isArray(card.updates)), 'card evidence boundary or updates missing');
check('Andrew Tate card is tracked', Array.isArray(cards.andrewTateRoutes) && cards.andrewTateRoutes.length > 0, 'no Andrew Tate card route discovered');
check('Machine status reports generated dependants', machine.status === 'machine-dependants-generated' && machine.andrewTateTracked === true, `machine status ${machine.status || 'missing'}`);

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  liveIntelUpdated: live.updated || null,
  dailyEpsteinUpdated: epstein.updated || null,
  cardFeedUpdated: cards.updated || null,
  trackedCards: cards.cardCount || 0,
  andrewTateRoutes: cards.andrewTateRoutes || [],
  checks,
  failures
};
write('downloads/live-machine-dependants-test.json', `${JSON.stringify(report, null, 2)}\n`);
write('downloads/live-machine-dependants-test.md', `# Live Machine Dependants Test\n\nGenerated: ${report.generatedAt}\n\n- Result: ${report.ok ? 'PASS' : 'FAIL'}\n- Live Intel: ${report.liveIntelUpdated || 'missing'}\n- Daily Epstein: ${report.dailyEpsteinUpdated || 'missing'}\n- Card feed: ${report.cardFeedUpdated || 'missing'}\n- Tracked cards: ${report.trackedCards}\n- Andrew Tate routes: ${(report.andrewTateRoutes || []).join(', ') || 'none'}\n\n${checks.map(row => `- ${row.ok ? 'PASS' : 'FAIL'} — ${row.name}${row.detail ? `: ${row.detail}` : ''}`).join('\n')}\n`);

if (failures.length) {
  console.error(`LIVE MACHINE DEPENDANTS TEST FAILED: ${failures.length} issue(s)`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Live machine dependants passed: Daily Epstein current; ${cards.cardCount} cards tracked; Andrew Tate route present.`);
