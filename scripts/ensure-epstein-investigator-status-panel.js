const fs = require('fs');
const path = require('path');

const target = path.resolve(__dirname, '..', 'ai-speculative-conclusions.js');
const marker = 'data/epstein-investigator-status.json';

if (!fs.existsSync(target)) {
  throw new Error(`Missing target: ${target}`);
}

const current = fs.readFileSync(target, 'utf8');
if (current.includes(marker)) {
  console.log('Epstein Investigator status panel already protected.');
  process.exit(0);
}

const addon = String.raw`

;(() => {
  const STATUS_URL = 'data/epstein-investigator-status.json';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const ensurePanel = () => {
    let panel = document.getElementById('epstein-investigator-lane');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'epstein-investigator-lane';
    panel.className = 'section wrap';
    panel.innerHTML = '<div class="eyebrow">Dedicated DOJ Epstein / EFTA lane</div>' +
      '<h2>EPSTEIN FILE INVESTIGATOR STATUS</h2>' +
      '<div id="epstein-investigator-status" class="spec-metrics" aria-live="polite">' +
      '<div class="spec-metric"><strong>…</strong><span>Loading lane status</span></div></div>' +
      '<p id="epstein-investigator-boundary" class="spec-boundary">' +
      'The lane publishes only evidence-bounded system-level hypotheses. File appearance or association never establishes guilt.</p>';
    const metrics = document.getElementById('spec-metrics');
    const feedSection = metrics && metrics.closest('section');
    if (feedSection && feedSection.parentNode) feedSection.parentNode.insertBefore(panel, feedSection);
    return panel;
  };
  const render = data => {
    ensurePanel();
    const target = document.getElementById('epstein-investigator-status');
    const boundary = document.getElementById('epstein-investigator-boundary');
    if (!target) return;
    target.innerHTML =
      '<div class="spec-metric"><strong>' + esc(data.status || 'unknown') + '</strong><span>Lane status</span></div>' +
      '<div class="spec-metric"><strong>' + n(data.corpusDocuments) + '</strong><span>Restricted EFTA documents indexed</span></div>' +
      '<div class="spec-metric"><strong>' + n(data.eligiblePassages) + '</strong><span>Extractable passages eligible for analysis</span></div>' +
      '<div class="spec-metric"><strong>' + n(data.completedMissions) + '</strong><span>Epstein missions completed</span></div>' +
      '<div class="spec-metric"><strong>' + n(data.publishedConclusions) + '</strong><span>Public-safe conclusions published</span></div>' +
      '<div class="spec-metric"><strong>' + n(data.reviewDrafts) + '</strong><span>Held for human review</span></div>';
    if (boundary) boundary.innerHTML = '<strong>Last cycle:</strong> ' + esc(data.updated || 'not run') +
      ' · <strong>Dataset lane:</strong> ' + esc(data.currentDataset || 'pending') +
      ' · <strong>Last result:</strong> ' + esc(data.lastMissionStatus || 'pending') + '. ' +
      esc(data.boundary || 'System-level hypotheses only. No guilt by association.');
  };
  ensurePanel();
  fetch(STATUS_URL, { cache: 'no-store' })
    .then(response => { if (!response.ok) throw new Error('HTTP ' + response.status); return response.json(); })
    .then(render)
    .catch(error => render({ status: 'status unavailable', lastMissionStatus: error.message,
      boundary: 'The page will not invent processing counts or conclusions when the status feed is unavailable.' }));
})();
`;

fs.writeFileSync(target, current.trimEnd() + addon + '\n', 'utf8');
console.log('Restored Epstein Investigator status panel.');
