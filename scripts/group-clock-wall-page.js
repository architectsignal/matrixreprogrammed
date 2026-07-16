'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const htmlPath = path.join(root, 'timers.html');
const wallPath = path.join(root, 'data', 'clock-wall.json');
if (!fs.existsSync(htmlPath) || !fs.existsSync(wallPath)) throw new Error('Clock page or clock wall missing.');

const wall = JSON.parse(fs.readFileSync(wallPath, 'utf8'));
let html = fs.readFileSync(htmlPath, 'utf8');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

const legacyCategories = {
  'wwiii-escalation': 'Global Watch',
  'ai-breakout': 'Global Watch',
  'surveillance-state': 'Your Freedom',
  'financial-reset': 'Your Money',
  'cbdc-rollout': 'Your Money',
  'cyber-blackout': 'Global Watch',
  'alien-disclosure': 'Speculative Watch',
  'pandemic-biosecurity': 'Global Watch',
  'civil-unrest': 'Your Government',
  'food-system-stress': 'Your Essential Services',
  'energy-shock': 'Your Essential Services',
  'machine-convergence': 'Global Watch'
};
const order = ['Your Freedom', 'Your Money', 'Your Essential Services', 'Your Government', 'Global Watch', 'Speculative Watch'];
const descriptions = {
  'Your Freedom': 'Speech, identity, privacy, access and emergency powers that affect individual autonomy.',
  'Your Money': 'Household survival, housing, work, payments, debt and financial-system pressure.',
  'Your Essential Services': 'Food, water, energy, healthcare, infrastructure and supply resilience.',
  'Your Government': 'Transparency, accountability, elections, rule of law and public-private authority.',
  'Global Watch': 'War, pandemic, AI, cyber and system-convergence lanes with international consequences.',
  'Speculative Watch': 'Contested or emerging disclosure questions kept separate from practical rights and household risks.'
};
const categoryBySlug = new Map((wall.clocks || []).map(clock => [clock.slug, clock.category || legacyCategories[clock.slug] || 'Global Watch']));
const cards = [...html.matchAll(/<article class="clock-card" id="([^"]+)"[\s\S]*?<\/article>/g)].map(match => ({ slug: match[1], html: match[0] }));
if (!cards.length) throw new Error('No clock cards found to group.');

const grouped = new Map(order.map(category => [category, []]));
for (const card of cards) {
  const category = categoryBySlug.get(card.slug) || 'Global Watch';
  if (!grouped.has(category)) grouped.set(category, []);
  grouped.get(category).push(card.html);
}
const nav = order.filter(category => grouped.get(category)?.length).map(category => `<a href="#clock-group-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}">${escapeHtml(category)}</a>`).join('');
const sections = order.filter(category => grouped.get(category)?.length).map(category => {
  const id = `clock-group-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return `<section class="section wrap clock-category" id="${id}"><div class="clock-category-heading"><div><div class="eyebrow">Reader early-warning dashboard</div><h2>${escapeHtml(category)}</h2><p>${escapeHtml(descriptions[category] || '')}</p></div><span>${grouped.get(category).length} clocks</span></div><div class="timer-grid">${grouped.get(category).join('')}</div></section>`;
}).join('');

const startMarker = '<section class="section wrap"><h2>Current visual synthesis</h2><div class="timer-grid">';
const start = html.indexOf(startMarker);
const endMarker = '</div></section></main>';
const end = start >= 0 ? html.indexOf(endMarker, start) : -1;
if (start < 0 || end < 0) throw new Error('Current visual synthesis container not found.');
const replacement = `<section class="section wrap clock-directory"><div class="eyebrow">Choose what affects you</div><h2>Reader early-warning dashboard</h2><p>Open a category, then open any clock for evidence, movement rules, counter-signals and source routes.</p><nav class="clock-category-nav">${nav}</nav></section>${sections}`;
html = `${html.slice(0, start)}${replacement}</main>${html.slice(end + endMarker.length)}`;
html = html.replace('</style>', '.clock-directory{padding-bottom:.5rem}.clock-category-nav{display:flex;flex-wrap:wrap;gap:.55rem}.clock-category-nav a,.clock-category-heading>span{border:1px solid rgba(216,181,106,.35);border-radius:999px;padding:.4rem .7rem}.clock-category{scroll-margin-top:1rem}.clock-category-heading{display:flex;justify-content:space-between;align-items:end;gap:1rem;margin-bottom:1rem}.clock-category-heading h2{margin:.25rem 0}.clock-category-heading p{margin:0;max-width:760px}@media(max-width:680px){.clock-category-heading{align-items:start;flex-direction:column}}</style>');
fs.writeFileSync(htmlPath, html);
console.log(`Clock page grouped: ${cards.length} clocks across ${order.filter(category => grouped.get(category)?.length).length} reader categories.`);
