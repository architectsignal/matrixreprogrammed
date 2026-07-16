'use strict';

const fs = require('fs');
const path = require('path');
const registry = require('./public-usefulness-clocks.js');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const wallPath = path.join(dataDir, 'clock-wall.json');
const standardPath = path.join(dataDir, 'reader-interpretation-standard.json');

function read(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function clean(value, max = 1600) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function safeRoute(value) {
  const result = clean(value, 1000);
  if (!result || /\s/.test(result) || /^javascript:/i.test(result)) return '';
  return result;
}
function unique(values) {
  return [...new Set((values || []).map(value => clean(value, 1000)).filter(Boolean))];
}
function extract(value, sourceFile, output, depth = 0) {
  if (depth > 4 || output.length >= 8000 || value == null) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 600)) extract(item, sourceFile, output, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  const title = clean(value.title || value.headline || value.name || value.label || value.claim || value.scenario || '', 400);
  const summary = clean(value.summary || value.description || value.whyItMatters || value.conclusion || value.signals || value.reason || '', 1400);
  const route = safeRoute(value.route || value.url || value.sourceRoute || value.evidenceRoute || value.nextRoute || '');
  if (title && (summary || route)) output.push({
    title,
    summary,
    route,
    published: clean(value.published || value.updated || value.date || value.createdAt || value.lastComputed || '', 80),
    evidenceLevel: clean(value.evidenceLevel || value.evidenceGrade || value.sourceStatus || value.claimClass || '', 180),
    confidence: clean(value.confidence || value.risk || value.status || '', 80),
    sourceFile: path.relative(root, sourceFile).replace(/\\/g, '/')
  });
  for (const [key, child] of Object.entries(value)) {
    if (['html', 'content', 'body', 'raw', 'payload', 'result_json'].includes(key)) continue;
    extract(child, sourceFile, output, depth + 1);
  }
}
function collect() {
  const wanted = /(live|intel|probability|outcome|brief|finding|conclusion|tracker|policy|market|risk|evidence|entity|relationship|source|investigation)/i;
  const excluded = new Set(['global-risk-clocks.json', 'clock-wall.json', 'reader-interpretation-standard.json']);
  const output = [];
  for (const name of fs.readdirSync(dataDir)) {
    if (!name.endsWith('.json') || excluded.has(name) || !wanted.test(name)) continue;
    const file = path.join(dataDir, name);
    try {
      if (fs.statSync(file).size > 4 * 1024 * 1024) continue;
      extract(read(file, {}), file, output);
    } catch (_) {}
  }
  const seen = new Set();
  return output.filter(item => {
    const key = `${item.title.toLowerCase()}|${item.route}|${item.sourceFile}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function match(signal, definition) {
  const haystack = `${signal.title} ${signal.summary} ${signal.sourceFile}`.toLowerCase();
  let score = 0;
  for (const keyword of definition.keywords || []) {
    const needle = String(keyword).toLowerCase();
    if (needle && haystack.includes(needle)) score += needle.includes(' ') ? 4 : 2;
  }
  const titleWords = definition.title.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 4 && !['clock', 'access'].includes(word));
  for (const word of titleWords) if (haystack.includes(word)) score += 1;
  if (/official|court|regulator|primary|audited|legislation|judgment|filing|government/i.test(signal.evidenceLevel)) score += 1;
  return score;
}

const wall = read(wallPath, { clocks: [] });
const standard = read(standardPath, { missionThemes: [] });
const themeLookup = new Map((standard.missionThemes || []).map(theme => [theme.id, theme]));
const definitionLookup = new Map(registry.map(item => [item.slug, item]));
const signals = collect();
let enriched = 0;

wall.clocks = (wall.clocks || []).map(clock => {
  const definition = definitionLookup.get(clock.slug);
  if (!definition) return clock;
  const evidenceInputs = signals
    .map(signal => ({ ...signal, matchScore: match(signal, definition) }))
    .filter(signal => signal.matchScore >= 4)
    .sort((a, b) => b.matchScore - a.matchScore || String(b.published).localeCompare(String(a.published)))
    .slice(0, 16);
  const themes = (definition.missionThemeIds || []).map(id => themeLookup.get(id)).filter(Boolean);
  const sourceRoutes = unique([clock.nextRoute, clock.secondaryRoute, ...(clock.policyConvergenceLinks || []).map(item => item.trackerRoute), ...evidenceInputs.map(item => item.route), 'evidence-vault.html', 'search.html']);
  const primaryCount = evidenceInputs.filter(item => /official|court|regulator|primary|audited|legislation|judgment|filing|government/i.test(item.evidenceLevel)).length;
  enriched += 1;
  return {
    ...clock,
    category: definition.category,
    readerQuestion: definition.readerQuestion,
    missionThemes: themes.map(theme => ({ id: theme.id, label: theme.label, question: theme.question })),
    evidenceInputs,
    sourceRoutes,
    evidenceStatus: evidenceInputs.length ? 'Source-linked watch lane' : 'Editorial watch lane awaiting fresh direct evidence',
    calculationBasis: `${evidenceInputs.length} distinct matching evidence/feed records, including ${primaryCount} primary-or-official indicators. The score is governed by evidence fingerprints, freshness, counter-signals and capped movement; repetition alone cannot raise it.`,
    automaticUpdateEnabled: true
  };
});
wall.publicUsefulnessClockCount = registry.length;
wall.publicUsefulnessCategories = [...new Set(registry.map(item => item.category))];
wall.candidateSignalCount = signals.length;
wall.updated = new Date().toISOString();
fs.writeFileSync(wallPath, JSON.stringify(wall, null, 2));
console.log(`Public usefulness evidence enrichment complete: ${enriched} clocks, ${signals.length} candidate records.`);
