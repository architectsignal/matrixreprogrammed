const fs = require('fs');
const path = require('path');

const root = process.cwd();
const indexPath = path.join(root, 'index.html');
const clocksPath = path.join(root, 'data', 'global-risk-clocks.json');
const epsteinPath = path.join(root, 'data', 'epstein-homepage-alerts.json');
if (!fs.existsSync(indexPath)) process.exit(0);
const today = new Date().toISOString().slice(0, 10);
function esc(s = '') { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function readJson(file, fallback) { try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback; } catch { return fallback; } }
function activeEpstein(alert) {
  return alert && alert.active === true && (!alert.expiresAt || alert.expiresAt >= today) && alert.title && alert.route;
}
const clocks = readJson(clocksPath, { clocks: [] });
const epstein = readJson(epsteinPath, { alerts: [] });
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
