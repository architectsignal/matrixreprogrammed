const fs = require('fs');
const path = require('path');
const root = process.cwd();
const issues = [];
const file = name => path.join(root, name);
const exists = name => fs.existsSync(file(name));
const read = name => fs.readFileSync(file(name), 'utf8');
function needFile(name) { if (!exists(name)) issues.push(`missing ${name}`); }
function needText(name, text) { if (exists(name) && !read(name).includes(text)) issues.push(`${name} missing ${text}`); }

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
const data = exists('data/global-risk-clocks.json') ? JSON.parse(read('data/global-risk-clocks.json')) : {};
if (!Array.isArray(data.clocks) || data.clocks.length !== 12) issues.push('global risk clocks must contain 12 clocks');
for (const clock of data.clocks || []) {
  if (!clock.title || typeof clock.score !== 'number' || !clock.nextRoute) issues.push('clock missing title score or nextRoute');
  if (clock.score >= 90 && clock.homepageEligible !== true) issues.push(`${clock.title} is 90+ but homepageEligible is not true`);
}
const epstein = exists('data/epstein-homepage-alerts.json') ? JSON.parse(read('data/epstein-homepage-alerts.json')) : {};
if (!Array.isArray(epstein.alerts)) issues.push('epstein homepage alerts must be an array');
if (issues.length) {
  console.error('GLOBAL RISK CLOCKS TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log('GLOBAL RISK CLOCKS TEST PASSED');
