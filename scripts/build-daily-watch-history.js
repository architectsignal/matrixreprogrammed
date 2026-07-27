'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const at = value => path.join(root, value);
const exists = value => fs.existsSync(at(value));
const readJson = (value, fallback = {}) => { try { return JSON.parse(fs.readFileSync(at(value), 'utf8')); } catch { return fallback; } };
const write = (value, content) => { fs.mkdirSync(path.dirname(at(value)), { recursive: true }); fs.writeFileSync(at(value), content); };
const writeJson = (value, content) => write(value, JSON.stringify(content, null, 2));
const clean = (value, max = 1400) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[character]);
const array = value => Array.isArray(value) ? value : [];

const watch = readJson('data/daily-watch.json', {});
if (!watch.ok || !watch.date) throw new Error('Daily watch history requires a completed data/daily-watch.json.');
const history = readJson('data/daily-watch-history.json', { entries: [] });
const compactSlot = item => ({
  name: clean(item?.name, 220),
  selectionBasis: clean(item?.selectionBasis, 700),
  effectOnLane: clean(item?.effectOnLane, 120),
  investigativeLanes: array(item?.investigativeLanes).map(value => clean(value, 180)).filter(Boolean),
  whyItMatters: clean(item?.whyItMatters, 900),
  whatItPointsToward: clean(item?.whatItPointsToward, 900),
  whatItDoesNotProve: clean(item?.whatItDoesNotProve, 700),
  evidenceStrength: clean(item?.evidenceStrength, 240),
  confidence: clean(item?.confidence, 120),
  sourceRoutes: array(item?.sourceRoutes).slice(0, 12)
});
const entry = {
  date: watch.date,
  updated: watch.updated,
  leadingEvidenceConclusion: clean(watch.leadingEvidenceConclusion, 1600),
  person: compactSlot(watch.person),
  institution: compactSlot(watch.institution),
  family: compactSlot(watch.family),
  boundary: clean(watch.boundary, 900)
};
const entries = array(history.entries).filter(item => item.date !== entry.date);
entries.push(entry);
entries.sort((a, b) => String(a.date).localeCompare(String(b.date)));
const retained = entries.slice(-365);
const historyProduct = {
  ok: true,
  schemaVersion: '1.0.0',
  updated: new Date().toISOString(),
  title: 'Daily Mission Watch History',
  retentionDays: 365,
  entries: retained,
  boundary: 'Repeated appearance means repeated research priority under the stated selection method. It is not cumulative proof of guilt, hidden control or wrongdoing.'
};
writeJson('data/daily-watch-history.json', historyProduct);

const cutoff = new Date(`${watch.date}T00:00:00Z`).getTime() - 6 * 86400000;
const week = retained.filter(item => Date.parse(`${item.date}T00:00:00Z`) >= cutoff);
function slotSummary(slot) {
  const rows = week.map(item => ({ date: item.date, ...item[slot] })).filter(item => item.name);
  const counts = new Map();
  for (const row of rows) counts.set(row.name, (counts.get(row.name) || 0) + 1);
  const repeated = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const latest = rows[rows.length - 1] || null;
  const previous = rows.length > 1 ? rows[rows.length - 2] : null;
  const change = !previous ? 'first-recorded-watch' : previous.name !== latest.name ? 'entity-changed' : previous.effectOnLane !== latest.effectOnLane ? 'assessment-changed' : 'continued-watch';
  return {
    slot,
    latest,
    previous,
    change,
    repeatedEntities: repeated.map(([name, days]) => ({ name, days })),
    strengthened: rows.filter(item => /strengthens/.test(item.effectOnLane || '')),
    weakened: rows.filter(item => /weakens|contradicts/.test(item.effectOnLane || '')),
    insufficient: rows.filter(item => /insufficient/.test(item.effectOnLane || ''))
  };
}
const summaries = ['person','institution','family'].map(slotSummary);
const delta = {
  ok: true,
  schemaVersion: '1.0.0',
  updated: new Date().toISOString(),
  periodStart: week[0]?.date || watch.date,
  periodEnd: watch.date,
  daysAvailable: week.length,
  title: 'Weekly Mission Watch Delta',
  summaries,
  keyConclusion: summaries.map(summary => {
    const latest = summary.latest;
    if (!latest) return `No qualifying ${summary.slot} watch was recorded.`;
    const repeat = summary.repeatedEntities.find(item => item.name === latest.name)?.days || 1;
    return `${latest.name} is the latest ${summary.slot} watch and appeared on ${repeat} recorded day${repeat === 1 ? '' : 's'} during this window. The current lane effect is ${latest.effectOnLane}.`;
  }).join(' '),
  boundary: historyProduct.boundary
};
writeJson('data/weekly-watch-delta.json', delta);

const cards = summaries.map(summary => {
  const latest = summary.latest;
  if (!latest) return `<article class="watch-delta-card"><h2>${esc(summary.slot)}</h2><p>No qualifying watch record.</p></article>`;
  const repeated = summary.repeatedEntities.slice(0, 5).map(item => `<li>${esc(item.name)} — ${item.days} day${item.days === 1 ? '' : 's'}</li>`).join('');
  return `<article class="watch-delta-card"><span class="label">${esc(summary.slot)} · ${esc(summary.change)}</span><h2>${esc(latest.name)}</h2><p><strong>Current effect:</strong> ${esc(latest.effectOnLane)}</p><p><strong>Why it matters:</strong> ${esc(latest.whyItMatters)}</p><p><strong>What it points toward:</strong> ${esc(latest.whatItPointsToward)}</p><p class="boundary"><strong>What it does not prove:</strong> ${esc(latest.whatItDoesNotProve)}</p><details><summary>Most repeated in this window</summary><ul>${repeated}</ul></details></article>`;
}).join('');
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Weekly Mission Watch Delta | Matrix Reprogrammed</title><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="reader-experience.css"><style>.watch-delta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:1rem}.watch-delta-card{border:1px solid rgba(216,181,106,.28);border-radius:18px;padding:1rem;background:rgba(0,0,0,.82)}.boundary{color:#c7b98e}.watch-delta-card details{margin-top:.7rem;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:.6rem}</style></head><body><div class="page"><header class="wrap topbar"><a class="brand" href="index.html">MATRIX REPROGRAMMED</a><nav class="nav"><a href="daily-watch.html">Daily Watch</a><a href="daily-command-brief.html">Daily Brief</a><a href="live-intel.html">Live Intel</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Weekly delta · ${esc(delta.periodStart)} to ${esc(delta.periodEnd)}</div><h1>WHO KEPT RETURNING—AND WHY?</h1><p class="lead">A seven-day record of changing person, institution and family research priorities.</p><p>${esc(delta.keyConclusion)}</p><p class="boundary"><strong>Boundary:</strong> ${esc(delta.boundary)}</p></section><section class="section wrap"><div class="watch-delta-grid">${cards}</div></section></main></div></body></html>`;
write('weekly-watch-delta.html', html);
const markdown = ['# Weekly Mission Watch Delta','',`Period: ${delta.periodStart} to ${delta.periodEnd}`,'',delta.keyConclusion,'',`> ${delta.boundary}`,'',...summaries.flatMap(summary => { const latest = summary.latest; return [`## ${summary.slot[0].toUpperCase()+summary.slot.slice(1)}`, '', latest ? `Latest: **${latest.name}** — ${latest.effectOnLane}` : 'No qualifying record.', '', latest ? `Why it matters: ${latest.whyItMatters}` : '', '', latest ? `What it points toward: ${latest.whatItPointsToward}` : '', '', `Repeated: ${summary.repeatedEntities.map(item => `${item.name} (${item.days})`).join('; ') || 'none'}`, '']; })].join('\n');
write('downloads/weekly-watch-delta.md', markdown);
writeJson('downloads/daily-watch-history-report.json', { ok: true, generatedAt: delta.updated, historyEntries: retained.length, weekEntries: week.length, route: 'weekly-watch-delta.html' });
console.log(`Daily watch history updated: ${retained.length} retained day(s); weekly delta covers ${week.length} day(s).`);

module.exports = delta;
