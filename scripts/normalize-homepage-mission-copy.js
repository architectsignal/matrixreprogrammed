const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const sourcePath = path.join(root, 'index.html');
const targets = ['index.html', '_site/index.html', '_site/index'];
const changed = [];
const failures = [];

const cinematic = '<!-- cinematic-command:start --><section class="cinematic-command wrap"><div class="cinematic-frame"><span class="eyebrow">Live Command Surface</span><h1>MAP THE STRUCTURE. READ THE SIGNALS.</h1><p>The site watches clocks, drops, entities, contractors, profiles, institutions, records and source trails, then turns them into readable reports.</p><div class="cinematic-actions"><a class="btn" href="daily-command-brief.html">Read Today’s Brief</a><a class="btn alt" href="control-structure.html">Open Power Map</a><a class="btn alt" href="search.html">Search a Name</a></div></div></section><!-- cinematic-command:end -->';

function runHomepageOwner() {
  if (!fs.existsSync(sourcePath)) throw new Error('index.html is missing');
  const current = fs.readFileSync(sourcePath, 'utf8');
  if (current.includes('<!-- homepage-command-surface:start -->') && current.includes('What the evidence is pointing toward now')) return;
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-homepage-command-surface.js')], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 30 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`Homepage command-surface owner failed with status ${result.status}`);
}

function commandSurfaceFromSource() {
  const html = fs.readFileSync(sourcePath, 'utf8');
  const match = html.match(/<!-- homepage-command-surface:start -->[\s\S]*?<!-- homepage-command-surface:end -->/);
  if (!match) throw new Error('Canonical homepage command surface was not generated');
  return match[0];
}

function transform(html, commandSurface) {
  let next = String(html || '')
    .replace(/FOLLOW THE FILES\./g, 'FOLLOW THE EVIDENCE.')
    .replace(/FOLLOW THE FILES/g, 'FOLLOW THE EVIDENCE')
    .replace(/<!-- cinematic-command:start -->[\s\S]*?<!-- cinematic-command:end -->/g, '')
    .replace(/<!-- homepage-command-surface:start -->[\s\S]*?<!-- homepage-command-surface:end -->/g, '');

  const main = next.match(/<main\b[^>]*>/i);
  if (!main) throw new Error('Homepage main element is missing');
  next = next.replace(main[0], `${cinematic}${main[0]}${commandSurface}`);
  return next;
}

runHomepageOwner();
const commandSurface = commandSurfaceFromSource();
for (const relative of targets) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
  const before = fs.readFileSync(file, 'utf8');
  let after;
  try { after = transform(before, commandSurface); }
  catch (error) { failures.push(`${relative}: ${error.message}`); continue; }
  for (const marker of ['MAP THE STRUCTURE. READ THE SIGNALS.', 'What the evidence is pointing toward now', 'Evidence boundary']) {
    if (!after.includes(marker)) failures.push(`${relative}: missing ${marker}`);
  }
  if ((after.match(/MAP THE STRUCTURE\. READ THE SIGNALS\./g) || []).length !== 1) failures.push(`${relative}: current mission heading must appear exactly once`);
  if (/FOLLOW THE FILES\.?/i.test(after)) failures.push(`${relative}: retired homepage slogan remains`);
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed.push(relative);
  }
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  changed,
  synchronizedTargets: targets.filter(relative => fs.existsSync(path.join(root, relative))),
  failures,
  requiredMarkers: ['MAP THE STRUCTURE. READ THE SIGNALS.', 'What the evidence is pointing toward now', 'Evidence boundary'],
  boundary: 'The canonical homepage owner runs before verification. Source and deploy variants receive one mission hero and one evidence-led command surface; retired FOLLOW THE FILES copy is removed.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'homepage-mission-normalization.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error(`Homepage mission normalization failed: ${failures.join('; ')}`);
console.log(`Homepage mission surface restored and verified across ${report.synchronizedTargets.length} route(s); ${changed.length} file(s) changed.`);
