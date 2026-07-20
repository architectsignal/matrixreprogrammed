(() => {
  const DATA_URL = 'data/ai-speculative-conclusions.json';
  const EPSTEIN_STATUS_URL = 'data/epstein-investigator-status.json';
  const grid = document.getElementById('spec-grid');
  const status = document.getElementById('spec-status');
  const metrics = document.getElementById('spec-metrics');
  const buttons = [...document.querySelectorAll('[data-filter]')];

  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);

  const list = values => {
    const items = Array.isArray(values) ? values.filter(Boolean) : [];
    if (!items.length) return '<p class="spec-boundary">None recorded.</p>';
    return `<ul>${items.map(item => `<li>${esc(typeof item === 'string' ? item : item.text || item.title || JSON.stringify(item))}</li>`).join('')}</ul>`;
  };

  const sourceLinks = sources => {
    const items = Array.isArray(sources) ? sources : [];
    if (!items.length) return '<p class="spec-boundary">No public source route attached. This item should not be upgraded or automatically republished.</p>';
    return items.map(source => {
      const label = source.label || source.title || source.url || 'Source route';
      const locator = source.locator ? ` · ${esc(source.locator)}` : '';
      const evidenceClass = source.evidenceClass ? ` · ${esc(source.evidenceClass)}` : '';
      return `<a class="spec-source" href="${esc(source.url || '#')}"${/^https?:/i.test(source.url || '') ? ' target="_blank" rel="noopener"' : ''}><strong>${esc(label)}</strong>${locator}${evidenceClass}</a>`;
    }).join('');
  };

  const card = item => {
    const statusValue = item.status || 'developing';
    const confidence = item.confidence?.band || item.confidence || 'unrated';
    const score = Number.isFinite(Number(item.confidence?.score)) ? ` · ${Number(item.confidence.score)}/100` : '';
    const reviewed = item.humanReviewed === true ? 'human reviewed' : 'not human reviewed';
    return `<article class="spec-card" data-status="${esc(statusValue)}">
      <div class="spec-badges">
        <span class="spec-badge">${esc(statusValue)}</span>
        <span class="spec-badge">${esc(confidence)}${score}</span>
        <span class="spec-badge">${esc(reviewed)}</span>
      </div>
      <h3>${esc(item.title)}</h3>
      <p><strong>AI hypothesis:</strong> ${esc(item.conclusion)}</p>
      <p class="spec-boundary"><strong>Classification:</strong> ${esc(item.classification || 'ai_speculative_conclusion')}</p>
      <div class="spec-section"><h4>Documented support</h4>${list(item.documentedSupport)}${sourceLinks(item.sources)}</div>
      <div class="spec-section"><h4>Contrary or weakening evidence</h4>${list(item.contraryEvidence)}</div>
      <div class="spec-section"><h4>Missing proof</h4>${list(item.missingRecords)}</div>
      <div class="spec-section"><h4>Alternative explanations</h4>${list(item.alternativeExplanations)}</div>
      <div class="spec-section"><h4>Falsification conditions</h4>${list(item.falsificationTests)}</div>
      <p class="spec-boundary"><strong>Criminal conduct established:</strong> ${item.criminalConductEstablished === true ? 'yes' : 'no'}</p>
      <p class="spec-boundary"><strong>Generated:</strong> ${esc(item.generatedAt || 'unknown')} · <strong>Last reviewed:</strong> ${esc(item.lastReviewedAt || 'not reviewed')}</p>
      <p class="spec-boundary"><strong>Boundary:</strong> ${esc(item.boundary || 'Hypothesis only. Association does not establish wrongdoing, intent or central coordination.')}</p>
    </article>`;
  };

  function ensureEpsteinPanel() {
    let panel = document.getElementById('epstein-investigator-lane');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'epstein-investigator-lane';
    panel.className = 'section wrap';
    panel.innerHTML = `<div class="eyebrow">Dedicated DOJ Epstein / EFTA lane</div>
      <h2>EPSTEIN FILE INVESTIGATOR STATUS</h2>
      <div id="epstein-investigator-status" class="spec-metrics" aria-live="polite">
        <div class="spec-metric"><strong>…</strong><span>Loading lane status</span></div>
      </div>
      <p id="epstein-investigator-boundary" class="spec-boundary">The lane publishes only evidence-bounded system-level hypotheses. File appearance or association never establishes guilt.</p>`;
    const feedSection = metrics?.closest('section');
    if (feedSection?.parentNode) feedSection.parentNode.insertBefore(panel, feedSection);
    return panel;
  }

  function renderEpsteinStatus(data) {
    ensureEpsteinPanel();
    const target = document.getElementById('epstein-investigator-status');
    const boundary = document.getElementById('epstein-investigator-boundary');
    if (!target) return;
    const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
    target.innerHTML = `
      <div class="spec-metric"><strong>${esc(data.status || 'unknown')}</strong><span>Lane status</span></div>
      <div class="spec-metric"><strong>${n(data.corpusDocuments)}</strong><span>Restricted EFTA documents indexed</span></div>
      <div class="spec-metric"><strong>${n(data.eligiblePassages)}</strong><span>Extractable passages eligible for analysis</span></div>
      <div class="spec-metric"><strong>${n(data.completedMissions)}</strong><span>Epstein missions completed</span></div>
      <div class="spec-metric"><strong>${n(data.publishedConclusions)}</strong><span>Public-safe conclusions published</span></div>
      <div class="spec-metric"><strong>${n(data.reviewDrafts)}</strong><span>Held for human review</span></div>`;
    if (boundary) {
      boundary.innerHTML = `<strong>Last cycle:</strong> ${esc(data.updated || 'not run')} · <strong>Dataset lane:</strong> ${esc(data.currentDataset || 'pending')} · <strong>Last result:</strong> ${esc(data.lastMissionStatus || 'pending')}. ${esc(data.boundary || 'System-level hypotheses only. No guilt by association.')}`;
    }
  }

  function render(data, filter = 'all') {
    const items = Array.isArray(data.items) ? data.items : [];
    const visible = filter === 'all' ? items : items.filter(item => item.status === filter);
    const counts = items.reduce((out, item) => {
      out[item.status] = (out[item.status] || 0) + 1;
      return out;
    }, {});
    metrics.innerHTML = `
      <div class="spec-metric"><strong>${items.length}</strong><span>Total hypotheses</span></div>
      <div class="spec-metric"><strong>${counts['evidence-supported'] || 0}</strong><span>Evidence-supported</span></div>
      <div class="spec-metric"><strong>${counts.developing || 0}</strong><span>Developing</span></div>
      <div class="spec-metric"><strong>${(counts.weakened || 0) + (counts.rejected || 0)}</strong><span>Weakened or rejected</span></div>`;
    status.textContent = `Feed updated ${data.updated || 'unknown'} · ${visible.length} item(s) shown · automatic publication scope: ${data.automaticPublicationScope || 'speculation page only'}`;
    grid.innerHTML = visible.length ? visible.map(card).join('') : '<div class="spec-empty">No conclusions match this filter.</div>';
  }

  ensureEpsteinPanel();
  fetch(EPSTEIN_STATUS_URL, { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(renderEpsteinStatus)
    .catch(error => renderEpsteinStatus({
      status: 'status unavailable',
      lastMissionStatus: error.message,
      boundary: 'The page will not invent processing counts or conclusions when the status feed is unavailable.'
    }));

  fetch(DATA_URL, { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      window.__matrixSpeculationFeed = data;
      render(data);
      buttons.forEach(button => button.addEventListener('click', () => {
        buttons.forEach(item => item.setAttribute('aria-pressed', 'false'));
        button.setAttribute('aria-pressed', 'true');
        render(data, button.dataset.filter);
      }));
    })
    .catch(error => {
      status.innerHTML = `<div class="spec-error"><strong>Feed unavailable.</strong> ${esc(error.message)}. The page will not invent replacement conclusions.</div>`;
      grid.innerHTML = '';
      metrics.innerHTML = '';
    });
})();