const fs = require('fs');
const path = require('path');

const root = process.cwd();
const indexPath = path.join(root, 'index.html');
const timersPath = path.join(root, 'timers.html');
const clocksPath = path.join(root, 'data', 'global-risk-clocks.json');
const epsteinPath = path.join(root, 'data', 'epstein-homepage-alerts.json');
const today = new Date().toISOString().slice(0, 10);
function esc(s = '') { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function readJson(file, fallback) { try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback; } catch { return fallback; } }
function activeEpstein(alert) {
  return alert && alert.active === true && (!alert.expiresAt || alert.expiresAt >= today) && alert.title && alert.route;
}
function nav() {
  return `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="start-here.html">Start Here</a><a href="books.html">Books</a><a href="search.html">Search</a><a href="news.html">Intel Desk</a><a href="timers.html">Timers</a><a href="forum.html">Signal Board</a><a href="epstein-files.html">Epstein Files</a><a href="black-file.html">Black File</a><a href="transmissions.html">Rumble</a></nav></header>`;
}
function layout(title, description, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title><meta name="description" content="${esc(description)}" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(description)}" /><meta property="og:type" content="website" /><link rel="stylesheet" href="styles.css" /></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${nav()}${body}<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — decode the illusion, follow the signal.</p><p class="warning">Speculative dashboards, public-record investigation, symbolic analysis, esoteric commentary, fiction, and author interpretation are separated where needed. Risk timers are not predictions, advice, or claims of certainty.</p></footer></div><script src="matrix.js"></script></body></html>`;
}
function patchTimers(clocks) {
  if (!fs.existsSync(timersPath)) return;
  const items = Array.isArray(clocks.clocks) ? clocks.clocks : [];
  const cards = items.map(clock => `<article class="card redline"><div class="pill">${esc(clock.status || 'Watch')}</div><h2>${esc(clock.title)}</h2><div class="metric"><strong>${esc(clock.score)}%</strong><span>${esc(clock.scoreLabel || 'Speculative pressure score')}</span></div><p><strong>Estimated window:</strong> ${esc(clock.window || 'Unknown')}</p><p>${esc(clock.signals || '')}</p><div class="terminal">RISK SIGNAL LANE\n&gt; Dated signals only\n&gt; Static page, not a live counter\n&gt; Homepage rule: 90% or above only</div><a class="btn" href="${esc(clock.nextRoute || 'live-intel.html')}">Open Next Step</a></article>`).join('');
  const body = `<main><section class="hero wrap"><div class="eyebrow">Static Risk Signals</div><h1>GLOBAL RISK CLOCKS.</h1><p class="lead">These are speculative pressure scores, not live counters or predictions. They route readers into dated public-signal lanes.</p><div class="cta-row"><a class="btn" href="live-intel.html">Live Intel</a><a class="btn alt" href="epstein-files.html">Epstein Files</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a><a class="btn alt machine-data-link" href="data/global-risk-clocks.json">Machine-readable data</a></div></section><section class="section wrap split"><div class="terminal">RISK SIGNAL LANE\n&gt; Dated signals only\n&gt; Static page, not a live counter\n&gt; Homepage rule: 90% or above only\n&gt; Epstein rule: active high-value alerts only\n&gt; Speculation remains labelled</div><aside class="card redline"><h2>Evidence Rule</h2><p>Use dated public signals only. Keep speculation labelled. A pressure score is a routing signal, not a claim of certainty.</p><p>Clocks below 90% stay on this page. Clocks at 90% or above may appear on the homepage. High-value Epstein alerts may appear only until their expiry date.</p></aside></section><section class="section wrap"><h2>Global Risk Clocks</h2><div class="grid">${cards}</div></section></main>`;
  fs.writeFileSync(timersPath, layout('Global Risk Clocks | Matrix Reprogrammed', 'Static speculative pressure scores for global risk lanes with evidence boundaries and homepage alert rules.', body));
}

const clocks = readJson(clocksPath, { clocks: [] });
const epstein = readJson(epsteinPath, { alerts: [] });
patchTimers(clocks);

if (fs.existsSync(indexPath)) {
  const hotClocks = (clocks.clocks || []).filter(clock => Number(clock.score) >= 90);
  const activeAlerts = (epstein.alerts || []).filter(activeEpstein);
  let html = fs.readFileSync(indexPath, 'utf8').replace(/<section id="homepage-alerts"[\s\S]*?<\/section>/, '');
  if (hotClocks.length || activeAlerts.length) {
    const clockCards = hotClocks.map(clock => `<article class="card redline"><span class="label">${esc(clock.status || 'Alert')}</span><h3>${esc(clock.title)}</h3><p class="figure-block">${esc(clock.score)}%</p><p>${esc(clock.scoreLabel || 'Speculative pressure score')}</p><p>Estimated window: ${esc(clock.window || 'unknown')}</p><p>${esc(clock.signals || '')}</p><a class="btn" href="${esc(clock.nextRoute || 'timers.html')}">Open Risk Lane</a></article>`).join('');
    const epsteinCards = activeAlerts.map(alert => `<article class="card redline"><span class="label">Epstein Watch · expires ${esc(alert.expiresAt || 'soon')}</span><h3>${esc(alert.title)}</h3><p>${esc(alert.summary || '')}</p><p><strong>Evidence class:</strong> ${esc(alert.evidenceClass || 'Public-record update')}</p><a class="btn" href="${esc(alert.route)}">Open Update</a></article>`).join('');
    const section = `<section id="homepage-alerts" class="section wrap"><h2>Breaking Signal Board</h2><p class="lead">Only risk clocks at 90% or above and active high-value Epstein public-record alerts appear here.</p><div class="grid">${clockCards}${epsteinCards}</div></section>`;
    html = html.replace('</main>', `${section}</main>`);
  }
  fs.writeFileSync(indexPath, html);
  console.log(`Homepage alerts patched: ${hotClocks.length} hot clocks, ${activeAlerts.length} Epstein alerts.`);
}
console.log('Timers page patched from Global Risk Clocks data.');
