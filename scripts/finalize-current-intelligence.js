const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const at = relative => path.join(root, relative);
const feedsOnly = process.env.MATRIX_CURRENT_INTELLIGENCE_FEEDS_ONLY === '1';
const readJson = (relative, fallback = {}) => {
  try { return JSON.parse(fs.readFileSync(at(relative), 'utf8')); } catch { return fallback; }
};
const writeJson = (relative, value) => {
  fs.mkdirSync(path.dirname(at(relative)), { recursive: true });
  fs.writeFileSync(at(relative), JSON.stringify(value, null, 2));
};
const clean = (value, max = 3000) => String(value ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);
const slug = value => clean(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
const ageDays = value => {
  const stamp = Date.parse(value || '');
  return Number.isFinite(stamp) ? Math.floor((Date.now() - stamp) / 86400000) : null;
};

function runRequired(label, script, extraEnv = {}) {
  const result = spawnSync(process.execPath, [at(script)], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, ...extraEnv }
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${label} failed with status ${result.status}`);
}

function current(item, maxAge = 7) {
  const age = ageDays(item?.published || item?.date || item?.updated);
  return age !== null && age >= 0 && age <= maxAge;
}

runRequired('Final seven-day public-source refresh', 'scripts/update-seven-day-intel.js');

const now = new Date().toISOString();
const prior = readJson('data/latest-public-drops.json', { drops: [] });
const live = readJson('data/live-intel.json', { items: [], feedResults: [] });
const clocks = readJson('data/global-risk-clocks.json', { clocks: [] });
const validClockSlugs = new Set((clocks.clocks || []).map(clock => clean(clock.slug, 120)).filter(Boolean));
const candidates = [
  ...(prior.drops || []).filter(item => current(item)),
  ...(live.items || []).filter(item => current(item)),
  ...(live.feedResults || []).filter(item => current(item))
];

const seen = new Set();
const drops = [];
for (const raw of candidates.sort((a, b) => Date.parse(b.published || 0) - Date.parse(a.published || 0))) {
  const title = clean(raw.title || raw.headline || raw.summary, 300);
  const url = clean(raw.url || raw.sourceUrl || raw.evidenceRoute, 900);
  const published = clean(raw.published || raw.date || raw.updated, 80);
  if (!title || !url || !published || !current({ published })) continue;
  const key = `${title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${url}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const lane = clean(raw.lane || 'control-system', 100);
  const sourceLabel = clean(raw.sourceLabel || raw.publisher || raw.source || 'Dated public source', 180);
  const timerLinks = [...new Set((raw.timerLinks || []).map(value => clean(value, 120)).filter(value => validClockSlugs.has(value)))];
  drops.push({
    id: clean(raw.id, 180) || `${lane}-${published.slice(0, 10)}-${slug(title)}`,
    lane,
    laneTitle: clean(raw.laneTitle || lane.replace(/[-_]/g, ' '), 180),
    sourceLabel,
    title,
    url,
    published,
    summary: clean(raw.summary || raw.description || title, 900),
    evidenceLevel: clean(raw.evidenceLevel || 'Current public-source lead pending primary-record verification', 260),
    evidenceBoundary: clean(raw.evidenceBoundary || 'This dated source is a lead, not proof of wrongdoing. Verify the underlying primary record and keep allegation, association, enforcement action and final judgment separate.', 700),
    whyItMatters: clean(raw.whyItMatters || 'This item may alter the documented institutional, legal, ownership, enforcement or implementation picture and therefore warrants source-level review.', 700),
    nextAction: clean(raw.nextAction || 'Open the source, identify the named actors, authority, law, filing or contract, and update the evidence graph only at the strength supported by the record.', 600),
    evidenceRoute: clean(raw.evidenceRoute || 'live-intel.html', 500),
    videoRoute: clean(raw.videoRoute || 'videos.html', 500),
    bookRoute: clean(raw.bookRoute || 'books.html', 500),
    offerRoute: clean(raw.offerRoute || 'offer-center.html', 500),
    optinRoute: clean(raw.optinRoute || 'newsletter.html', 500),
    timerLinks,
    sourceRequirement: clean(raw.sourceRequirement || 'Underlying primary record, official release, court filing, regulator notice, corporate filing or independently verified source.', 500)
  });
  if (drops.length >= 24) break;
}

const latest = {
  updated: now,
  title: 'Latest Public-Source Drops',
  purpose: 'Current dated public-source leads rebuilt after every legacy generator so stale files cannot overwrite the final intelligence surface.',
  activeWindowDays: 7,
  refreshStatus: drops.length ? 'fresh-current-items' : 'fresh-empty-state',
  boundary: 'These are dated public-source leads, not proof of wrongdoing. Every item must preserve its source, date, evidence class, boundary and verification route. An empty current window is preferable to stale material.',
  drops
};
writeJson('data/latest-public-drops.json', latest);
writeJson('downloads/latest-public-drops.json', latest);

runRequired('Final Live Intel rebuild', 'scripts/build-live-intel-machine.js');
if (!feedsOnly) {
  const activeEnv = { MATRIX_CURRENT_INTELLIGENCE_ACTIVE: '1' };
  runRequired('Final mission conclusion rebuild', 'scripts/build-mission-brief-conclusions.js', activeEnv);
  runRequired('Final homepage and clock intelligence rebuild', 'scripts/build-homepage-command-surface.js', activeEnv);
}

const finalLive = readJson('downloads/seven-day-intel.json', {});
const finalDrops = readJson('data/latest-public-drops.json', {});
const report = {
  ok: ageDays(finalLive.updated) !== null && ageDays(finalLive.updated) <= 1 && ageDays(finalDrops.updated) !== null && ageDays(finalDrops.updated) <= 1,
  generatedAt: now,
  mode: feedsOnly ? 'feeds-only' : 'full-dependent-rebuild',
  authoritativeOrder: feedsOnly ? [
    'update-seven-day-intel',
    'rebuild-latest-public-drops',
    'build-live-intel-machine'
  ] : [
    'update-seven-day-intel',
    'rebuild-latest-public-drops',
    'build-live-intel-machine',
    'build-mission-brief-conclusions',
    'build-homepage-command-surface'
  ],
  sevenDayFeedUpdated: finalLive.updated || null,
  sevenDayFeedAgeDays: ageDays(finalLive.updated),
  latestDropsUpdated: finalDrops.updated || null,
  latestDropsAgeDays: ageDays(finalDrops.updated),
  currentDropCount: (finalDrops.drops || []).length,
  emptyStateAllowed: true,
  staleMaterialAllowedAsCurrent: false
};
writeJson('downloads/current-intelligence-finalization.json', report);
if (!report.ok) throw new Error(`Final current-intelligence freshness failed: ${JSON.stringify(report)}`);
console.log(`Current intelligence finalised authoritatively (${report.mode}): ${(finalDrops.drops || []).length} current drop(s); feed and curated surfaces age ${report.sevenDayFeedAgeDays}/${report.latestDropsAgeDays} day(s).`);
