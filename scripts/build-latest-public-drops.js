const fs = require('fs');
const path = require('path');
const root = process.cwd();
const downloads = path.join(root, 'downloads');
if (!fs.existsSync(downloads)) fs.mkdirSync(downloads, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { return fallback; }
}
function write(file, value) { fs.writeFileSync(path.join(root, file), value); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function esc(value = '') { return String(value || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function activeDrops(data) {
  const now = new Date(data.updated || new Date().toISOString());
  const max = data.activeWindowDays || 7;
  return (data.drops || []).filter(drop => {
    const d = new Date(drop.published || 0);
    if (!Number.isFinite(d.getTime())) return true;
    const age = (now.getTime() - d.getTime()) / 86400000;
    return age >= -1 && age <= max;
  });
}
function card(drop) {
  return `<article class="news-item"><span class="figure-caption">${esc(String(drop.published || '').slice(0,10))} · ${esc(drop.laneTitle || drop.lane)} · ${esc(drop.sourceLabel)}</span><h3>${esc(drop.title)}</h3><p>${esc(drop.summary)}</p><div class="grid"><div class="card"><span class="label">Evidence Class</span><h3>${esc(drop.evidenceLevel)}</h3><p>${esc(drop.evidenceBoundary)}</p></div><div class="card"><span class="label">Why It Matters</span><h3>Public-Record Route</h3><p>${esc(drop.whyItMatters)}</p></div><div class="card"><span class="label">Next Action</span><h3>Watch Point</h3><p>${esc(drop.nextAction)}</p></div></div><div class="terminal">LATEST DROP\n&gt; ${esc(drop.videoHook)}\n&gt; Timer links: ${esc((drop.timerLinks || []).join(' · ') || 'none')}\n&gt; Source requirement: ${esc(drop.sourceRequirement || 'source-linked record')}</div><div class="cta-row small"><a class="btn" href="${esc(drop.url)}">Open Source</a><a class="btn alt" href="${esc(drop.evidenceRoute || 'evidence-vault.html')}">Evidence Route</a><a class="btn alt" href="${esc(drop.videoRoute || 'videos.html')}">Video Hook</a><a class="btn alt" href="${esc(drop.optinRoute || 'optin-center.html')}">Free Brief</a></div></article>`;
}
function section(id, title, lead, drops) {
  return `<section id="${id}" class="section wrap"><h2>${esc(title)}</h2><p class="lead">${esc(lead)}</p><div class="cta-row"><a class="btn" href="downloads/latest-public-drops.json">Latest Drops JSON</a><a class="btn alt" href="downloads/latest-public-drops.md">Latest Drops Brief</a><a class="btn alt" href="live-intel.html">Live Intel</a><a class="btn alt" href="timers.html">Timers</a></div>${drops.map(card).join('')}</section>`;
}
function upsertSection(file, id, title, lead, drops) {
  if (!exists(file)) return;
  let html = fs.readFileSync(path.join(root, file), 'utf8');
  const htmlSection = section(id, title, lead, drops);
  const re = new RegExp(`<section id="${id}"[\\s\\S]*?<\/section>`);
  if (html.includes(`id="${id}"`)) html = html.replace(re, htmlSection);
  else html = html.replace('</main>', `${htmlSection}</main>`);
  fs.writeFileSync(path.join(root, file), html);
}
function mergeLiveIntel(data, drops) {
  const live = readJson('data/live-intel.json', { items: [], rules: [], lanes: [] });
  const byId = new Map();
  for (const item of drops) byId.set(item.id, { ...item, status: 'curated-latest-public-drop' });
  for (const item of live.items || []) byId.set(item.id || `${item.title}-${item.published}`, item);
  live.updated = data.updated;
  live.status = 'updated-with-latest-public-drops';
  live.latestDropsRoute = 'downloads/latest-public-drops.json';
  live.rules = Array.from(new Set([...(live.rules || []), data.boundary, 'Curated latest public-source drops are merged into active Live Intel while RSS feeds catch up.']));
  live.items = [...byId.values()].sort((a,b) => new Date(b.published || 0) - new Date(a.published || 0)).slice(0, 120);
  write('data/live-intel.json', JSON.stringify(live, null, 2));
  write('downloads/seven-day-intel.json', JSON.stringify(live, null, 2));
}
function mergeEpsteinAlerts(drops) {
  const epsteinDrops = drops.filter(drop => drop.lane === 'epstein-files').slice(0, 4);
  if (!epsteinDrops.length) return;
  const alerts = {
    updated: new Date().toISOString().slice(0,10),
    policy: 'Only high-value Epstein public-record developments may surface on the homepage, and only for a limited time. Alerts must have a source route, evidence class, checked date, and expiry date. A name, contact, settlement, filing, or redaction dispute is not proof of criminal conduct.',
    alerts: epsteinDrops.map(drop => ({
      id: drop.id,
      active: true,
      title: drop.title,
      summary: drop.summary,
      evidenceClass: drop.evidenceLevel,
      route: 'epstein-files.html#latest-public-drops-epstein',
      sourceRoute: drop.url,
      checkedAt: String(drop.published || '').slice(0,10),
      expiresAt: new Date(new Date(drop.published).getTime() + 7*86400000).toISOString().slice(0,10)
    }))
  };
  write('data/epstein-homepage-alerts.json', JSON.stringify(alerts, null, 2));
}
function mergeTimers(data, drops) {
  const clocks = readJson('data/global-risk-clocks.json', { clocks: [] });
  for (const clock of clocks.clocks || []) {
    const linked = drops.filter(drop => (drop.timerLinks || []).includes(clock.slug));
    if (!linked.length) continue;
    clock.latestDrops = linked.map(drop => ({ id: drop.id, title: drop.title, published: drop.published, evidenceLevel: drop.evidenceLevel, route: drop.evidenceRoute || 'live-intel.html' }));
    if (clock.slug === 'ai-breakout') clock.score = Math.max(clock.score || 0, 86);
    if (clock.slug === 'cyber-blackout') clock.score = Math.max(clock.score || 0, 68);
    if (clock.slug === 'cbdc-rollout') clock.score = Math.max(clock.score || 0, 82);
    if (clock.slug === 'surveillance-state') clock.score = Math.max(clock.score || 0, 90);
    if (clock.slug === 'machine-convergence') clock.score = Math.max(clock.score || 0, 78);
    clock.signals = `${clock.signals || ''} Latest public drops: ${linked.map(drop => `${String(drop.published || '').slice(0,10)} ${drop.title}`).join(' | ')}`.slice(0, 900);
  }
  clocks.updated = data.updated;
  clocks.summary = 'Speculative pressure scores enriched with latest dated public-source drops. These remain evidence-boundary signals, not predictions or claims of certainty.';
  write('data/global-risk-clocks.json', JSON.stringify(clocks, null, 2));
  write('downloads/global-risk-clocks-linked.json', JSON.stringify(clocks, null, 2));
}
function patchSearchAndLlms() {
  const index = readJson('search-index.json', []);
  if (!index.some(item => item.url === 'downloads/latest-public-drops.json')) {
    index.push({ key: 'latest-public-drops', title: 'Latest Public Drops', subtitle: 'Curated current source leads', series: 'Live Intel', category: 'Source Watch', url: 'downloads/latest-public-drops.json', description: 'Curated current public-source drops merged into Live Intel, Epstein Watch and risk timers.', keywords: ['latest drops','Epstein','digital euro','digital ID','AI cyber','timers'] });
    write('search-index.json', JSON.stringify(index, null, 2));
  }
  if (exists('llms.txt')) {
    let txt = fs.readFileSync(path.join(root, 'llms.txt'), 'utf8');
    if (!txt.includes('/downloads/latest-public-drops.json')) txt += '\n\nLatest Public Drops:\n- /downloads/latest-public-drops.json: curated current public-source drops merged into Live Intel, Epstein Watch, timers and tracker lanes.\n- /downloads/latest-public-drops.md: human-readable latest drops brief.\n';
    write('llms.txt', txt);
  }
}
const data = readJson('data/latest-public-drops.json', null);
if (!data) process.exit(0);
const drops = activeDrops(data);
write('downloads/latest-public-drops.json', JSON.stringify({ ...data, activeDrops: drops }, null, 2));
write('downloads/latest-public-drops.md', ['# Latest Public-Source Drops', '', `Updated: ${data.updated}`, '', '## Boundary', data.boundary, '', ...drops.map(drop => `## ${drop.title}\n\n- Date: ${String(drop.published || '').slice(0,10)}\n- Lane: ${drop.laneTitle}\n- Evidence: ${drop.evidenceLevel}\n- Source: ${drop.url}\n- Timers: ${(drop.timerLinks || []).join(', ') || 'none'}\n\n${drop.summary}\n\nBoundary: ${drop.evidenceBoundary}\n`)].join('\n'));
mergeLiveIntel(data, drops);
mergeEpsteinAlerts(drops);
mergeTimers(data, drops);
upsertSection('live-intel.html', 'latest-public-drops-live-intel', 'Latest Public-Source Drops', 'Curated current drops that are merged into Live Intel while the automated feeds catch up. These are source leads with evidence boundaries, not verdicts.', drops);
upsertSection('epstein-files.html', 'latest-public-drops-epstein', 'Latest Epstein Public-Record Drops', 'Current Epstein-related public-record lanes: disclosure deadlines, litigation movement, settlement/NDA questions, and source requirements.', drops.filter(d => d.lane === 'epstein-files'));
upsertSection('timers.html', 'latest-public-drops-timers', 'Latest Timer Triggers', 'Dated public-source signals that enrich risk clocks without turning them into predictions.', drops.filter(d => (d.timerLinks || []).length));
upsertSection('control-system-tracker.html', 'latest-public-drops-control', 'Latest Control-System Drops', 'Current public-source control-system lanes: CBDC, digital ID, cyber, surveillance, and institutional convergence.', drops.filter(d => d.lane === 'control-system'));
patchSearchAndLlms();
console.log(`Latest public drops rendered: ${drops.length} active drop(s).`);
