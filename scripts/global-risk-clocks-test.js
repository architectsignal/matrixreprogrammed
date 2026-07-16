require('./build-public-usefulness-clock-system.js');
require('./build-homepage-command-surface.js');

const fs = require('fs');
const path = require('path');
const root = process.cwd();
const issues = [];
const forumWarnings = [];
const file = name => path.join(root, name);
const exists = name => fs.existsSync(file(name));
const read = name => fs.readFileSync(file(name), 'utf8');
function needFile(name) { if (!exists(name)) issues.push(`missing ${name}`); }
function needText(name, text) { if (exists(name) && !read(name).includes(text)) issues.push(`${name} missing ${text}`); }
function needNoText(name, text) { if (exists(name) && read(name).includes(text)) issues.push(`${name} still contains obsolete text: ${text}`); }
function warnFile(name) { if (!exists(name)) forumWarnings.push(`missing ${name}`); }
function warnText(name, text) { if (exists(name) && !read(name).includes(text)) forumWarnings.push(`${name} missing ${text}`); }
function warnNoText(name, text) { if (exists(name) && read(name).includes(text)) forumWarnings.push(`${name} should not show internal copy: ${text}`); }
function routeExists(route = '') {
  const clean = String(route).split('#')[0].split('?')[0].replace(/^\//, '');
  if (!clean || /^https?:\/\//i.test(clean)) return true;
  return exists(clean);
}

for (const name of [
  'data/global-risk-clocks.json', 'data/clock-wall.json', 'data/reader-interpretation-standard.json',
  'data/homepage-command-surface.json', 'downloads/timer-synthesis.md', 'data/epstein-homepage-alerts.json',
  'timers.html', 'index.html', 'scripts/build-mission-timers.js', 'scripts/build-clock-wall.js',
  'scripts/build-homepage-command-surface.js', 'scripts/public-usefulness-clocks.js',
  'scripts/update-public-usefulness-clock-scores.js', 'scripts/enrich-public-usefulness-clock-evidence.js'
]) needFile(name);

for (const text of [
  'MISSION TIMERS.', 'pressure indexes, not predictions', 'What changed:', 'Open deeper information',
  'What this score means', 'How it is calculated', 'Control-system relevance', 'Speculation angle',
  'What would raise it', 'What would lower it', 'Missing records', 'Useful next actions',
  'one-world government', 'data/clock-wall.json', 'downloads/timer-synthesis.md',
  'Reader early-warning dashboard', 'Your Freedom', 'Your Money', 'Your Essential Services',
  'Your Government', 'Global Watch', 'Speculative Watch'
]) needText('timers.html', text);
needNoText('timers.html', 'Static page, not a live counter');
needNoText('timers.html', 'Connected systems');
for (const text of ['homepage-command-surface', 'What the evidence is pointing toward now', 'Clearly labelled speculation', 'Risk clocks over 90%', 'Seven-day window only']) needText('index.html', text);
needNoText('index.html', 'Top Moments Now');
needText('scripts/build-homepage-command-surface.js', 'Number(clock.score) > 90');
needText('scripts/build-homepage-command-surface.js', 'ageDays(item.published) <= 7');

warnFile('forum.html');
warnFile('dark-speculation-forum.html');
warnFile('epstein-alive-board.html');
warnFile('forum.js');
warnFile('data/forum-seed.json');
warnText('forum.html', 'data-board="main"');
warnText('dark-speculation-forum.html', 'data-board="speculation"');
warnText('epstein-alive-board.html', 'data-board="epstein-alive"');
warnText('forum.html', 'signal-board-feed');
warnText('forum.html', 'signal-board-form');
warnText('forum.html', 'forum.js');
warnText('forum.js', 'boardFromPath');
warnText('forum.js', 'lockFormToBoard');
warnText('forum.js', '/forum-feed-main');
warnText('forum.js', '/forum-feed-speculation');
warnText('forum.js', '/forum-feed-epstein-alive');
warnText('forum.js', '/submit-main-post');
warnText('forum.js', '/submit-speculation-post');
warnText('forum.js', '/submit-epstein-alive-post');
warnText('forum.js', 'LOCAL_POSTS_KEY');
warnText('forum.js', 'loadFallback');
warnText('forum.js', 'Signal Board is syncing');
warnText('forum.js', 'pending sync');
for (const phrase of ['backend unavailable', 'Backend detail', 'Cloudflare Static Forum Mode', 'saved on this device', 'Cloudflare test route']) warnNoText('forum.js', phrase);

const data = exists('data/global-risk-clocks.json') ? JSON.parse(read('data/global-risk-clocks.json')) : {};
const wall = exists('data/clock-wall.json') ? JSON.parse(read('data/clock-wall.json')) : {};
const homepage = exists('data/homepage-command-surface.json') ? JSON.parse(read('data/homepage-command-surface.json')) : {};
const publicDefinitions = require('./public-usefulness-clocks.js');
const originalSlugs = [
  'wwiii-escalation', 'ai-breakout', 'surveillance-state', 'financial-reset', 'cbdc-rollout', 'cyber-blackout',
  'alien-disclosure', 'pandemic-biosecurity', 'civil-unrest', 'food-system-stress', 'energy-shock', 'machine-convergence'
];
const expectedPublicSlugs = publicDefinitions.map(clock => clock.slug);
const expectedMinimum = originalSlugs.length + expectedPublicSlugs.length;
if (!Array.isArray(data.clocks) || data.clocks.length < expectedMinimum) issues.push(`global risk clocks must contain at least ${expectedMinimum} clocks`);
if (!Array.isArray(wall.clocks) || wall.clocks.length < expectedMinimum) issues.push(`clock wall must contain at least ${expectedMinimum} clocks`);
const canonicalSlugs = new Set((data.clocks || []).map(clock => clock.slug));
const wallSlugs = new Set((wall.clocks || []).map(clock => clock.slug));
for (const slug of [...originalSlugs, ...expectedPublicSlugs]) {
  if (!canonicalSlugs.has(slug)) issues.push(`canonical clocks missing ${slug}`);
  if (!wallSlugs.has(slug)) issues.push(`clock wall missing ${slug}`);
}
if (wall.scoreType !== 'pressureIndex') issues.push('clock wall must declare pressureIndex score type');
if (!wall.scoreDefinition || !/not the probability/i.test(wall.scoreDefinition)) issues.push('clock wall must explain that pressure index is not event probability');
if (!Number.isFinite(Number(wall.candidateSignalCount))) issues.push('clock wall must report candidate signal count');
if (!Number.isFinite(Number(wall.sourceFileCount))) issues.push('clock wall must report source file count');
if (Number(wall.publicUsefulnessClockCount) !== expectedPublicSlugs.length) issues.push('clock wall public usefulness count does not match registry');

const sourceLookup = new Map((data.clocks || []).map(clock => [clock.slug, clock]));
for (const clock of wall.clocks || []) {
  if (!clock.title || typeof clock.score !== 'number' || !clock.nextRoute) issues.push('clock missing title, score or nextRoute');
  if (clock.nextRoute && !routeExists(clock.nextRoute)) issues.push(`${clock.title} route target missing: ${clock.nextRoute}`);
  if (sourceLookup.has(clock.slug) && Number(sourceLookup.get(clock.slug).score) !== Number(clock.score)) issues.push(`${clock.title} score differs from canonical data`);
  for (const field of ['scoreBand', 'scoreMeaning', 'scoreDefinition', 'scoreMethod', 'calculationBasis', 'plainEnglishConclusion', 'controlSystemMeaning', 'lastMovement', 'boundary']) if (!String(clock[field] || '').trim()) issues.push(`${clock.title} missing ${field}`);
  for (const field of ['whatRaises', 'whatLowers', 'sourceRoutes', 'missingEvidence', 'usefulNextActions']) if (!Array.isArray(clock[field]) || !clock[field].length) issues.push(`${clock.title} missing ${field}`);
  if (!/not proof|does not by itself prove|not event probability/i.test(`${clock.controlSystemMeaning} ${clock.boundary}`)) issues.push(`${clock.title} lacks a clear claim boundary`);
  if (!/one-world government|one world government/i.test(`${clock.controlSystemMeaning} ${clock.boundary}`)) issues.push(`${clock.title} does not bound one-world-government interpretation`);
}

for (const definition of publicDefinitions) {
  const sourceClock = sourceLookup.get(definition.slug);
  const wallClock = (wall.clocks || []).find(clock => clock.slug === definition.slug);
  if (!sourceClock || !wallClock) continue;
  if (sourceClock.automaticUpdate !== true) issues.push(`${definition.title} automatic update disabled`);
  if (!String(sourceClock.evidenceFingerprint || '').trim()) issues.push(`${definition.title} missing evidence fingerprint`);
  if (!String(sourceClock.automaticUpdateStatus || '').trim()) issues.push(`${definition.title} missing automatic update status`);
  if (!Number.isFinite(Number(sourceClock.maxMovementPerBuild)) || Number(sourceClock.maxMovementPerBuild) < 1) issues.push(`${definition.title} missing movement cap`);
  if (!String(wallClock.category || '').trim()) issues.push(`${definition.title} missing reader category`);
  if (!Array.isArray(wallClock.evidenceInputs)) issues.push(`${definition.title} evidence inputs must be an array`);
  if (wallClock.automaticUpdateEnabled !== true) issues.push(`${definition.title} wall update marker disabled`);
}

if (homepage.rules?.clockThreshold !== 'strictly greater than 90') issues.push('homepage clock threshold is not strictly greater than 90');
if (!String(homepage.evidenceConclusion || '').trim()) issues.push('homepage missing evidence conclusion');
if (!String(homepage.speculation || '').trim()) issues.push('homepage missing labelled speculation');
if (!String(homepage.counterpoint || '').trim()) issues.push('homepage missing counterpoint');
const expectedCritical = (wall.clocks || []).filter(clock => Number(clock.score) > 90).map(clock => `${clock.slug}:${clock.score}`).sort();
const actualCritical = (homepage.criticalClocks || []).map(clock => `${clock.slug}:${clock.score}`).sort();
if (JSON.stringify(expectedCritical) !== JSON.stringify(actualCritical)) issues.push('homepage critical clocks do not exactly match canonical clocks over 90');
for (const item of homepage.latestNews || []) {
  const age = Math.floor((Date.now() - Date.parse(item.published || 0)) / 86400000);
  if (!Number.isFinite(age) || age > 7) issues.push(`homepage contains stale news: ${item.title || 'untitled'}`);
}

const epstein = exists('data/epstein-homepage-alerts.json') ? JSON.parse(read('data/epstein-homepage-alerts.json')) : {};
if (!Array.isArray(epstein.alerts)) issues.push('epstein homepage alerts must be an array');
const seed = exists('data/forum-seed.json') ? JSON.parse(read('data/forum-seed.json')) : {};
if (exists('data/forum-seed.json') && (!Array.isArray(seed.posts) || seed.posts.length < 1)) forumWarnings.push('forum seed needs at least one post');
if (forumWarnings.length) {
  console.warn('MISSION TIMERS / FORUM CLOUDFLARE WARNING');
  for (const warning of forumWarnings) console.warn(`- ${warning}`);
}
if (issues.length) {
  console.error('MISSION TIMERS TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log(`MISSION TIMERS TEST PASSED: ${wall.clocks.length} canonical clocks, ${expectedPublicSlugs.length} reader-facing clocks, ${homepage.criticalClocks.length} homepage clocks over 90, ${homepage.latestNews.length} current news items.`);
