const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const sourcePath = path.join(root, 'index.html');
const targets = ['index.html', '_site/index.html', '_site/index'];
const changed = [];
const failures = [];
const shellRepairs = [];
const preservedSearchFirst = [];

const cinematic = '<!-- cinematic-command:start --><section class="cinematic-command wrap"><div class="cinematic-frame"><span class="eyebrow">Live Command Surface</span><h1>MAP THE STRUCTURE. READ THE SIGNALS.</h1><p>The site watches clocks, drops, entities, contractors, profiles, institutions, records and source trails, then turns them into readable reports.</p><div class="cinematic-actions"><a class="btn" href="daily-command-brief.html">Read Today’s Brief</a><a class="btn alt" href="control-structure.html">Open Power Map</a><a class="btn alt" href="search.html">Search a Name</a></div></div></section><!-- cinematic-command:end -->';
const isSearchFirst = html => String(html || '').includes('class="accountability-home"')
  && String(html || '').includes('id="accountability-search"')
  && String(html || '').includes('id="accountability-hit-list"');

function ensureMainShell(html, label) {
  let next = String(html || '');
  if (/<main\b[^>]*>/i.test(next)) return next;
  const headerEnd = next.search(/<\/header>/i);
  if (headerEnd < 0) throw new Error(`${label}: header closing tag is missing`);
  const openAt = headerEnd + next.slice(headerEnd).match(/<\/header>/i)[0].length;
  let closeAt = next.slice(openAt).search(/<footer\b/i);
  if (closeAt >= 0) closeAt += openAt;
  else {
    closeAt = next.search(/<\/body>/i);
    if (closeAt < 0) throw new Error(`${label}: no footer or body closing tag available for main-shell recovery`);
  }
  next = `${next.slice(0, openAt)}<main id="main-archive">${next.slice(openAt, closeAt)}</main>${next.slice(closeAt)}`;
  shellRepairs.push(label);
  return next;
}

function runHomepageOwner() {
  if (!fs.existsSync(sourcePath)) throw new Error('index.html is missing');
  let current = fs.readFileSync(sourcePath, 'utf8');
  const repaired = ensureMainShell(current, 'index.html');
  if (repaired !== current) {
    fs.writeFileSync(sourcePath, repaired);
    current = repaired;
    changed.push('index.html');
  }
  if (isSearchFirst(current)) return { mode: 'search-first', commandSurface: '' };
  if (current.includes('<!-- homepage-command-surface:start -->') && current.includes('What the evidence is pointing toward now')) return { mode: 'classic', commandSurface: commandSurfaceFromSource() };
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-homepage-command-surface.js')], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 30 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`Homepage command-surface owner failed with status ${result.status}`);
  return { mode: 'classic', commandSurface: commandSurfaceFromSource() };
}

function commandSurfaceFromSource() {
  const html = fs.readFileSync(sourcePath, 'utf8');
  const match = html.match(/<!-- homepage-command-surface:start -->[\s\S]*?<!-- homepage-command-surface:end -->/);
  if (!match) throw new Error('Canonical homepage command surface was not generated');
  return match[0];
}

function transformClassic(html, commandSurface, label) {
  let next = ensureMainShell(html, label)
    .replace(/FOLLOW THE FILES\./g, 'FOLLOW THE EVIDENCE.')
    .replace(/FOLLOW THE FILES/g, 'FOLLOW THE EVIDENCE')
    .replace(/<!-- cinematic-command:start -->[\s\S]*?<!-- cinematic-command:end -->/g, '')
    .replace(/<!-- homepage-command-surface:start -->[\s\S]*?<!-- homepage-command-surface:end -->/g, '');

  const main = next.match(/<main\b[^>]*>/i);
  if (!main) throw new Error(`${label}: homepage main element could not be recovered`);
  return next.replace(main[0], `${cinematic}${main[0]}${commandSurface}`);
}

function transformSearchFirst(html, label) {
  const next = ensureMainShell(html, label)
    .replace(/<!-- cinematic-command:start -->[\s\S]*?<!-- cinematic-command:end -->/g, '')
    .replace(/<!-- homepage-command-surface:start -->[\s\S]*?<!-- homepage-command-surface:end -->/g, '');
  for (const marker of ['class="accountability-home"','id="accountability-search"','id="accountability-hit-list"','id="open-question-ledger"','id="explore-system"']) {
    if (!next.includes(marker)) failures.push(`${label}: missing search-first marker ${marker}`);
  }
  if (next.includes('MAP THE STRUCTURE. READ THE SIGNALS.')) failures.push(`${label}: legacy cinematic command surface remains on search-first homepage`);
  preservedSearchFirst.push(label);
  return next;
}

const owner = runHomepageOwner();
const canonicalSearchFirst = owner.mode === 'search-first'
  ? fs.readFileSync(sourcePath, 'utf8')
      .replace(/<!-- cinematic-command:start -->[\s\S]*?<!-- cinematic-command:end -->/g, '')
      .replace(/<!-- homepage-command-surface:start -->[\s\S]*?<!-- homepage-command-surface:end -->/g, '')
  : '';
for (const relative of targets) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
  const before = fs.readFileSync(file, 'utf8');
  let after;
  try {
    if (owner.mode === 'search-first') {
      after = transformSearchFirst(canonicalSearchFirst, relative);
    } else {
      after = isSearchFirst(before)
        ? transformSearchFirst(before, relative)
        : transformClassic(before, owner.commandSurface, relative);
    }
  } catch (error) { failures.push(error.message); continue; }
  if (!isSearchFirst(after)) {
    for (const marker of ['MAP THE STRUCTURE. READ THE SIGNALS.', 'What the evidence is pointing toward now', 'Evidence boundary']) {
      if (!after.includes(marker)) failures.push(`${relative}: missing ${marker}`);
    }
    if ((after.match(/MAP THE STRUCTURE\. READ THE SIGNALS\./g) || []).length !== 1) failures.push(`${relative}: current mission heading must appear exactly once`);
    if ((after.match(/<!-- homepage-command-surface:start -->/g) || []).length !== 1) failures.push(`${relative}: command surface must appear exactly once`);
    if (/FOLLOW THE FILES\.?/i.test(after)) failures.push(`${relative}: retired homepage slogan remains`);
  }
  if (after !== before) {
    fs.writeFileSync(file, after);
    if (!changed.includes(relative)) changed.push(relative);
  }
}

require('./restore-homepage-navigation.js');

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  mode: owner.mode,
  changed,
  preservedSearchFirst: [...new Set(preservedSearchFirst)],
  shellRepairs: [...new Set(shellRepairs)],
  synchronizedTargets: targets.filter(relative => fs.existsSync(path.join(root, relative))),
  failures,
  requiredMarkers: owner.mode === 'search-first'
    ? ['class="accountability-home"','id="accountability-search"','id="accountability-hit-list"','id="open-question-ledger"','id="explore-system"']
    : ['MAP THE STRUCTURE. READ THE SIGNALS.', 'What the evidence is pointing toward now', 'Evidence boundary'],
  boundary: owner.mode === 'search-first'
    ? 'The search-first homepage is authoritative. Source and both deploy variants are synchronized from one canonical page; legacy cinematic and command surfaces are removed.'
    : 'The canonical homepage owner repairs a missing main shell before rebuilding. Source and deploy variants receive one mission hero and one evidence-led command surface; retired FOLLOW THE FILES copy is removed.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'homepage-mission-normalization.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error(`Homepage mission normalization failed: ${failures.join('; ')}`);
console.log(owner.mode === 'search-first'
  ? `Search-first homepage synchronized across ${report.synchronizedTargets.length} route(s); ${changed.length} variant repair(s) applied.`
  : `Homepage mission surface restored across ${report.synchronizedTargets.length} route(s); ${changed.length} file(s) changed; ${report.shellRepairs.length} main shell(s) recovered.`);