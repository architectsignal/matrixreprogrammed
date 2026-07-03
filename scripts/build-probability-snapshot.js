const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });

const updated = new Date().toISOString();
function readJson(file, fallback) {
  try {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) return fallback;
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch {
    return fallback;
  }
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function confidenceFromSignals(count, totalWeight) {
  if (count >= 6 && totalWeight >= 18) return 'high';
  if (count >= 5 && totalWeight >= 14) return 'medium-high';
  if (count >= 3 && totalWeight >= 8) return 'medium';
  if (count >= 2) return 'low-medium';
  return 'low';
}
function band(probability) {
  if (probability <= 20) return 'low probability';
  if (probability <= 40) return 'emerging possibility';
  if (probability <= 60) return 'live contest';
  if (probability <= 80) return 'probable direction';
  if (probability <= 95) return 'strongly indicated';
  return 'near certain only after confirmation';
}
const scenarioFiles = [
  'data/probability-lab-core.json',
  'data/probability-scenarios-batch-002.json'
];
const signalFiles = [
  'data/probability-signal-feed-001.json',
  'data/probability-signal-feed-002.json'
];
function loadScenarios() {
  const out = [];
  for (const file of scenarioFiles) {
    const json = readJson(file, {});
    const list = Array.isArray(json.initialScenarios) ? json.initialScenarios : Array.isArray(json.scenarios) ? json.scenarios : [];
    for (const scenario of list) out.push({ ...scenario, sourceFile: file });
  }
  return out;
}
function loadSignals() {
  const out = [];
  for (const file of signalFiles) {
    const json = readJson(file, {});
    for (const signal of json.signals || []) out.push({ ...signal, sourceFile: file });
  }
  return out;
}
function compute() {
  const baseScenarios = loadScenarios();
  const allSignals = loadSignals();
  const scenarios = baseScenarios.map(s => {
    const signals = [];
    let delta = 0;
    let totalWeight = 0;
    for (const sig of allSignals) {
      for (const impact of sig.affectedScenarios || []) {
        if (impact.scenarioId === s.scenarioId) {
          const weight = Number(sig.weight || 1);
          const value = Number(impact.impact || 0);
          delta += value;
          totalWeight += weight;
          signals.push({ signalId: sig.signalId, title: sig.title, weight, impact: value, lane: sig.lane, sourceStatus: sig.sourceStatus, sourceFile: sig.sourceFile });
        }
      }
    }
    const base = Number(s.currentProbability || 0);
    const adjusted = clamp(base + delta, 1, 95);
    return {
      scenarioId: s.scenarioId,
      title: s.title,
      topic: s.topic,
      timeHorizon: s.timeHorizon,
      baseProbability: base,
      computedProbability: adjusted,
      probabilityDelta: adjusted - base,
      band: band(adjusted),
      confidence: confidenceFromSignals(signals.length, totalWeight),
      status: s.status,
      supportSignalCount: signals.length,
      totalSignalWeight: totalWeight,
      scenarioSourceFile: s.sourceFile,
      signals,
      supportingSignals: s.supportingSignals || [],
      counterSignals: s.counterSignals || [],
      triggerEvents: s.triggerEvents || [],
      recordsNeeded: s.recordsNeeded || [],
      lastComputed: updated,
      nextAction: 'Review new signals, pull listed records, and update scenario probability when records change.'
    };
  });
  return {
    updated,
    title: 'Probability Snapshot',
    purpose: 'Computed scenario snapshot from multiple scenario feeds plus weighted signal feeds.',
    boundary: 'This snapshot is a forecast model, not a fact claim. Probabilities are provisional and must change when records or signals change.',
    inputFiles: [...scenarioFiles, ...signalFiles],
    scenarios,
    summary: {
      scenarioCount: scenarios.length,
      signalCount: allSignals.length,
      averageProbability: scenarios.length ? Math.round(scenarios.reduce((a, s) => a + s.computedProbability, 0) / scenarios.length) : 0,
      highestScenario: scenarios.slice().sort((a, b) => b.computedProbability - a.computedProbability)[0] || null,
      updated
    }
  };
}
function html(snapshot) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Probability Snapshot | Matrix Reprogrammed</title><meta name="description" content="Computed probability snapshot from scenario priors and weighted signals."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="fixes.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="probability-lab.html">Probability Lab</a><a href="prediction-engine.html">Prediction Engine</a><a href="system-feed-index.html">System Feed</a><a href="record-intake-queue.html">Intake</a><a href="findings-dashboard.html">Findings</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Computed Forecast</div><h1>PROBABILITY SNAPSHOT.</h1><p class="lead">Computed scenario probabilities from multiple scenario feeds and weighted signal feeds. Forecasts are provisional and change when records change.</p><div class="cta-row"><a class="btn" href="data/probability-snapshot.json">Open JSON</a><a class="btn alt" href="downloads/probability-snapshot.md">Download Markdown</a><a class="btn alt" href="probability-lab.html">Probability Lab</a><a class="btn alt" href="prediction-engine.html">Prediction Engine</a></div></section><section class="section wrap split"><div class="terminal">PROBABILITY SNAPSHOT\n&gt; Updated: ${snapshot.updated}\n&gt; Scenarios: ${snapshot.summary.scenarioCount}\n&gt; Signals: ${snapshot.summary.signalCount}\n&gt; Average: ${snapshot.summary.averageProbability}%\n&gt; Model: scenario feeds + weighted signals</div><aside class="card redline"><h2>Boundary</h2><p>${snapshot.boundary}</p></aside></section><section class="section wrap"><h2>Computed Scenarios</h2><div class="grid">${snapshot.scenarios.map(s => `<article class="card redline"><span class="label">${s.scenarioId} · ${s.computedProbability}% · ${s.band}</span><h3>${s.title}</h3><p><strong>Topic:</strong> ${s.topic}</p><p><strong>Base:</strong> ${s.baseProbability}%</p><p><strong>Delta:</strong> ${s.probabilityDelta > 0 ? '+' : ''}${s.probabilityDelta}</p><p><strong>Confidence:</strong> ${s.confidence}</p><p><strong>Signals:</strong> ${s.supportSignalCount}</p><p><strong>Records needed:</strong> ${(s.recordsNeeded || []).join('; ')}</p><p><strong>Next:</strong> ${s.nextAction}</p></article>`).join('')}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — forecast, test, update.</p></footer></div><script src="matrix.js"></script></body></html>`;
}
function md(snapshot) {
  const lines = ['# Probability Snapshot', '', `Updated: ${snapshot.updated}`, '', snapshot.boundary, '', '## Summary', '', `- Scenarios: ${snapshot.summary.scenarioCount}`, `- Signals: ${snapshot.summary.signalCount}`, `- Average probability: ${snapshot.summary.averageProbability}%`, '', '## Scenarios', ''];
  for (const s of snapshot.scenarios) {
    lines.push(`### ${s.scenarioId} — ${s.title}`, '', `- Computed probability: ${s.computedProbability}%`, `- Base probability: ${s.baseProbability}%`, `- Delta: ${s.probabilityDelta > 0 ? '+' : ''}${s.probabilityDelta}`, `- Band: ${s.band}`, `- Confidence: ${s.confidence}`, `- Signals: ${s.supportSignalCount}`, `- Records needed: ${(s.recordsNeeded || []).join('; ')}`, '');
  }
  return lines.join('\n');
}
const snapshot = compute();
fs.writeFileSync(path.join(dataDir, 'probability-snapshot.json'), JSON.stringify(snapshot, null, 2));
fs.writeFileSync(path.join(downloadsDir, 'probability-snapshot.md'), md(snapshot));
fs.writeFileSync(path.join(root, 'probability-snapshot.html'), html(snapshot));
console.log(`Probability snapshot generated: ${snapshot.summary.scenarioCount} scenarios, ${snapshot.summary.signalCount} signals.`);
