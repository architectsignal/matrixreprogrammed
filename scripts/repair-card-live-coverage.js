const fs = require('fs');
const path = require('path');

const root = process.cwd();
function read(file, fallback = '') { try { return fs.readFileSync(path.join(root, file), 'utf8'); } catch { return fallback; } }
function readJson(file, fallback = {}) { try { return JSON.parse(read(file)); } catch { return fallback; } }
function write(file, value) { const full = path.join(root, file); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, value); }
function clean(value = '') { return String(value).replace(/<[^>]+>/g, ' ').replace(/&(?:#039|quot|amp|lt|gt);/g, ' ').replace(/\s+/g, ' ').trim(); }
function runtimePath(route) {
  const directory = path.posix.dirname(String(route || '').replace(/\\/g, '/'));
  const depth = directory === '.' ? 0 : directory.split('/').filter(Boolean).length;
  return `${'../'.repeat(depth)}investigation-pulse.js`;
}

const feedPath = 'data/card-live-updates.json';
const feed = readJson(feedPath, { cards: [], byRoute: {}, andrewTateRoutes: [] });
const touched = [];
const missing = [];
const discoveredAndrew = [];

function walk(dir = '') {
  const absolute = path.join(root, dir);
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '_site' || entry.name === '.wrangler') continue;
    const rel = path.join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) walk(rel);
    else if (entry.isFile() && entry.name.endsWith('.html')) {
      const html = read(rel);
      if (/Andrew\s+Tate/i.test(html) || /andrew-tate/i.test(rel)) discoveredAndrew.push(rel);
    }
  }
}
walk();

for (const route of discoveredAndrew) {
  if (!feed.byRoute[route]) {
    const html = read(route);
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = clean((h1 && h1[1]) || 'Andrew Tate');
    const card = {
      route,
      title,
      category: 'Tracked person card',
      checkedAt: feed.updated || new Date().toISOString(),
      sourceWindowUpdated: feed.sourceWindowUpdated || null,
      status: 'no-new-verified-record-in-current-window',
      currentRecordCount: 0,
      latestRecordAt: null,
      evidenceBoundary: 'A matched source updates the card research trail; it does not convert association, reporting, allegation, charge or mention into proven wrongdoing.',
      updates: []
    };
    feed.cards.push(card);
    feed.byRoute[route] = card;
  }
}
feed.andrewTateRoutes = [...new Set([...(feed.andrewTateRoutes || []), ...discoveredAndrew])];
feed.cardCount = feed.cards.length;
feed.quietCardCount = feed.cards.filter(card => Number(card.currentRecordCount || 0) === 0).length;
feed.currentRecordCardCount = feed.cards.filter(card => Number(card.currentRecordCount || 0) > 0).length;
write(feedPath, `${JSON.stringify(feed, null, 2)}\n`);

const machine = readJson('data/live-machine-status.json', {});
machine.updated = new Date().toISOString();
machine.cardFeedUpdated = feed.updated || machine.updated;
machine.trackedCards = feed.cardCount;
machine.currentRecordCards = feed.currentRecordCardCount;
machine.quietCards = feed.quietCardCount;
machine.andrewTateTracked = feed.andrewTateRoutes.length > 0;
machine.status = feed.cardCount > 0 && feed.sourceWindowUpdated ? 'machine-dependants-generated' : 'machine-dependants-incomplete';
write('data/live-machine-status.json', `${JSON.stringify(machine, null, 2)}\n`);
write('downloads/live-machine-status.md', `# Live Machine Status\n\nGenerated: ${machine.updated}\n\n- Live Intel updated: ${machine.liveIntelUpdated || feed.sourceWindowUpdated || 'unavailable'}\n- Live Intel items: ${machine.liveIntelItemCount || 0}\n- Tracked cards: ${machine.trackedCards}\n- Cards with current records: ${machine.currentRecordCards}\n- Cards with no new verified record: ${machine.quietCards}\n- Andrew Tate tracked: ${machine.andrewTateTracked}\n- Status: ${machine.status}\n`);

for (const card of feed.cards) {
  const route = String(card.route || '').replace(/^\//, '');
  if (!route || route.includes('?') || route.includes('#') || !route.endsWith('.html')) continue;
  const full = path.join(root, route);
  if (!fs.existsSync(full)) { missing.push(route); continue; }
  const before = read(route);
  const src = runtimePath(route);
  const tag = `<script src="${src}"></script>`;
  let html = before.replace(/<script\b[^>]*\bsrc=["'][^"']*investigation-pulse\.js["'][^>]*>\s*<\/script>/gi, '');
  if (html.includes('</body>')) html = html.replace('</body>', `${tag}</body>`);
  else html += tag;
  if (html !== before) {
    write(route, html);
    touched.push(route);
  }
}

const report = {
  ok: feed.cards.length > 0 && feed.andrewTateRoutes.length > 0 && missing.length === 0,
  generatedAt: new Date().toISOString(),
  trackedCards: feed.cards.length,
  runtimeInjectedOrCorrected: touched.length,
  andrewTateRoutes: feed.andrewTateRoutes,
  missingRoutes: missing,
  boundary: 'This repair adds the shared live intelligence runtime with a depth-correct relative path. It does not modify approved card artwork or promote unverified claims.'
};
write('downloads/card-live-coverage-repair.json', `${JSON.stringify(report, null, 2)}\n`);
write('downloads/card-live-coverage-repair.md', `# Card Live Coverage Repair\n\nGenerated: ${report.generatedAt}\n\n- Result: ${report.ok ? 'PASS' : 'FAIL'}\n- Tracked cards: ${report.trackedCards}\n- Runtime injected or corrected: ${report.runtimeInjectedOrCorrected}\n- Andrew Tate routes: ${report.andrewTateRoutes.join(', ') || 'none'}\n- Missing routes: ${report.missingRoutes.join(', ') || 'none'}\n\n${report.boundary}\n`);

if (!report.ok) {
  console.error(`Card live coverage failed: Andrew Tate routes ${report.andrewTateRoutes.length}; missing routes ${missing.length}.`);
  process.exit(1);
}
console.log(`Card live coverage repaired for ${feed.cards.length} card(s); runtime corrected on ${touched.length}; Andrew Tate route(s): ${feed.andrewTateRoutes.join(', ')}.`);
