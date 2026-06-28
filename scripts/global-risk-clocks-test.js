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
function warnFile(name) { if (!exists(name)) forumWarnings.push(`missing ${name}`); }
function warnText(name, text) { if (exists(name) && !read(name).includes(text)) forumWarnings.push(`${name} missing ${text}`); }
function warnNoText(name, text) { if (exists(name) && read(name).includes(text)) forumWarnings.push(`${name} should not show internal copy: ${text}`); }
function routeExists(route = '') {
  const clean = String(route).split('#')[0].split('?')[0];
  if (!clean || /^https?:\/\//i.test(clean)) return true;
  return exists(clean);
}

needFile('data/global-risk-clocks.json');
needFile('data/epstein-homepage-alerts.json');
needFile('timers.html');
needFile('scripts/patch-homepage-alerts.js');
needText('timers.html', 'GLOBAL RISK CLOCKS.');
needText('timers.html', 'RISK SIGNAL LANE');
needText('timers.html', 'Static page, not a live counter');
needText('timers.html', 'WWIII Escalation Clock');
needText('timers.html', 'AI Breakout Clock');
needText('timers.html', 'Surveillance State Clock');
needText('timers.html', 'Machine Convergence');
needText('timers.html', 'data/global-risk-clocks.json');
needText('timers.html', 'live-intel.html');
needText('timers.html', 'epstein-files.html');
needText('timers.html', 'evidence-vault.html');
needText('scripts/patch-homepage-alerts.js', 'Number(clock.score) >= 90');
needText('scripts/patch-homepage-alerts.js', 'expiresAt');

// Forum checks are useful deployment diagnostics, but they must not block the
// Global Risk Clocks build. Cloudflare forum availability is validated at
// runtime through /forum-health and the FORUM_POSTS KV binding.
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
for (const phrase of ['backend unavailable','Backend detail','Cloudflare Static Forum Mode','saved on this device','Cloudflare test route']) warnNoText('forum.js', phrase);

const data = exists('data/global-risk-clocks.json') ? JSON.parse(read('data/global-risk-clocks.json')) : {};
if (!Array.isArray(data.clocks) || data.clocks.length !== 12) issues.push('global risk clocks must contain 12 clocks');
for (const clock of data.clocks || []) {
  if (!clock.title || typeof clock.score !== 'number' || !clock.nextRoute) issues.push('clock missing title score or nextRoute');
  if (clock.nextRoute && !routeExists(clock.nextRoute)) issues.push(`${clock.title} route target missing: ${clock.nextRoute}`);
  if (clock.score >= 90 && clock.homepageEligible !== true) issues.push(`${clock.title} is 90+ but homepageEligible is not true`);
}
const epstein = exists('data/epstein-homepage-alerts.json') ? JSON.parse(read('data/epstein-homepage-alerts.json')) : {};
if (!Array.isArray(epstein.alerts)) issues.push('epstein homepage alerts must be an array');
const seed = exists('data/forum-seed.json') ? JSON.parse(read('data/forum-seed.json')) : {};
if (exists('data/forum-seed.json') && (!Array.isArray(seed.posts) || seed.posts.length < 1)) forumWarnings.push('forum seed needs at least one post');

if (forumWarnings.length) {
  console.warn('GLOBAL RISK CLOCKS / FORUM CLOUDFLARE WARNING');
  for (const warning of forumWarnings) console.warn(`- ${warning}`);
}

if (issues.length) {
  console.error('GLOBAL RISK CLOCKS TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log('GLOBAL RISK CLOCKS TEST PASSED');
