(() => {
  const DATA_URL = 'data/ai-speculative-conclusions.json';
  const EPSTEIN_STATUS_URL = 'data/epstein-investigator-status.json';
  const grid = document.getElementById('spec-grid');
  const status = document.getElementById('spec-status');
  const metrics = document.getElementById('spec-metrics');
  const buttons = [...document.querySelectorAll('[data-filter]')];

  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);

  const list = values => {
    const items = Array.isArray(values) ? values.filter(Boolean) : [];
    if (!items.length) return '<p class="spec-boundary">None recorded. This absence weakens the hypothesis.</p>';
    return `<ul>${items.map(item => `<li>${esc(typeof item === 'string' ? item : item.text || item.title || JSON.stringify(item))}</li>`).join('')}</ul>`;
  };

  const sourceLinks = sources => {
    const items = Array.isArray(sources) ? sources : [];
    if (!items.length) return '<p class="spec-boundary">No public source route attached. This item cannot be promoted beyond speculation.</p>';
    return items.map(source => {
      const label = source.label || source.title || source.url || 'Source route';
      const locator = source.locator ? ` · ${esc(source.locator)}` : '';
      const evidenceClass = source.evidenceClass ? ` · ${esc(source.evidenceClass)}` : '';
      return `<a class="spec-source" href="${esc(source.url || '#')}"${/^https?:/i.test(source.url || '') ? ' target="_blank" rel="noopener"' : ''}><strong>${esc(label)}</strong>${locator}${evidenceClass}</a>`;
    }).join('');
  };

  const card = item => {
    const statusValue = item.status || 'unverified';
    const confidence = item.confidence?.band || item.confidence || 'unrated';
    const score = Number.isFinite(Number(item.confidence?.score)) ? ` · ${Number(item.confidence.score)}/100` : '';
    const reviewed = item.humanReviewed === true ? 'human reviewed' : 'not human reviewed';
    const imported = item.publicationState === 'auto-published-from-review-queue';
    const origin = item.reviewOrigin || {};
    const reviewBanner = imported ? `<div class="spec-auto-warning"><strong>AUTO-PUBLISHED FROM REVIEW QUEUE — UNVERIFIED SPECULATION</strong><span>This record failed one or more factual-publication gates. It is displayed for transparent research and challenge, not as a finding.</span></div>` : '';
    const originPanel = imported ? `<div class="spec-section"><h4>Review-queue origin</h4><p><strong>Record:</strong> ${esc(origin.recordId || 'unknown')} · <strong>Original state:</strong> ${esc(origin.originalState || 'review')} · <strong>Record type:</strong> ${esc(origin.recordType || 'unknown')}</p><p><strong>Failed factual gates:</strong> ${esc(Array.isArray(origin.failedGates) && origin.failedGates.length ? origin.failedGates.join(', ') : 'not specified')}</p></div>` : '';
    return `<article class="spec-card${imported ? ' spec-auto-published' : ''}" data-status="${esc(statusValue)}" data-publication-state="${esc(item.publicationState || 'curated-speculation')}">
      ${reviewBanner}
      <div class="spec-badges">
        <span class="spec-badge">${esc(statusValue)}</span>
        <span class="spec-badge">${esc(confidence)}${score}</span>
        <span class="spec-badge">${esc(reviewed)}</span>
        ${imported ? '<span class="spec-badge spec-badge-alert">review queue</span>' : ''}
      </div>
      <h3>${esc(item.title)}</h3>
      <p><strong>AI hypothesis:</strong> ${esc(item.conclusion)}</p>
      <p class="spec-boundary"><strong>Classification:</strong> ${esc(item.classification || 'ai_speculative_conclusion')}</p>
      ${originPanel}
      <div class="spec-section"><h4>Documented support or source leads</h4>${list(item.documentedSupport)}${sourceLinks(item.sources)}</div>
      <div class="spec-section"><h4>Contrary or weakening evidence</h4>${list(item.contraryEvidence)}</div>
      <div class="spec-section"><h4>Missing proof</h4>${list(item.missingRecords)}</div>
      <div class="spec-section"><h4>Alternative explanations</h4>${list(item.alternativeExplanations)}</div>
      <div class="spec-section"><h4>Falsification conditions</h4>${list(item.falsificationTests)}</div>
      <p class="spec-boundary"><strong>Criminal conduct established:</strong> ${item.criminalConductEstablished === true ? 'yes' : 'no'}</p>
      <p class="spec-boundary"><strong>Generated:</strong> ${esc(item.generatedAt || 'unknown')} · <strong>Auto-published:</strong> ${esc(item.autoPublishedAt || 'not applicable')} · <strong>Last reviewed:</strong> ${esc(item.lastReviewedAt || 'not reviewed')}</p>
      <p class="spec-boundary"><strong>Boundary:</strong> ${esc(item.boundary || 'Hypothesis only. Association does not establish wrongdoing, intent or central coordination.')}</p>
    </article>`;
  };

  function ensureEpsteinPanel() {
    let panel = document.getElementById('epstein-investigator-lane');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'epstein-investigator-lane';
    panel.className = 'section wrap';
    panel.innerHTML = `<div class="eyebrow">Dedicated Epstein public-record investigation lane</div>
      <h2>AI DETECTIVE — EPSTEIN FILES</h2>
      <p class="lead">The machine rebuilds a bounded investigation docket from the current Daily Epstein public-record window. It tests disclosure, custody, oversight and institutional-mechanism hypotheses without turning association into guilt.</p>
      <div id="epstein-investigator-status" class="spec-metrics" aria-live="polite"><div class="spec-metric"><strong>…</strong><span>Loading investigator status</span></div></div>
      <p id="epstein-investigator-boundary" class="spec-boundary">The lane publishes only evidence-bounded system-level hypotheses. File appearance or association never establishes guilt.</p>
      <div class="cta-row"><a class="btn alt" href="daily-epstein-update.html">Open Current Record Window</a><a class="btn alt" href="epstein-files.html">Verified Epstein File Hub</a></div>
      <div id="epstein-investigator-docket" class="spec-grid" aria-live="polite"></div>`;
    const feedSection = metrics?.closest('section');
    if (feedSection?.parentNode) feedSection.parentNode.insertBefore(panel, feedSection);
    return panel;
  }

  function renderEpsteinStatus(data) {
    ensureEpsteinPanel();
    const target = document.getElementById('epstein-investigator-status');
    const boundary = document.getElementById('epstein-investigator-boundary');
    const docketTarget = document.getElementById('epstein-investigator-docket');
    if (!target) return;
    const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
    target.innerHTML = `
      <div class="spec-metric"><strong>${esc(data.status || 'unknown')}</strong><span>Investigator status</span></div>
      <div class="spec-metric"><strong>${n(data.corpusDocuments)}</strong><span>Current public-record leads indexed</span></div>
      <div class="spec-metric"><strong>${n(data.eligiblePassages)}</strong><span>Source-linked leads eligible for analysis</span></div>
      <div class="spec-metric"><strong>${n(data.completedMissions)}</strong><span>Bounded hypotheses generated</span></div>
      <div class="spec-metric"><strong>${n(data.publishedConclusions)}</strong><span>Public-safe docket items published</span></div>
      <div class="spec-metric"><strong>${n(data.reviewDrafts)}</strong><span>Held for human review</span></div>`;
    if (boundary) boundary.innerHTML = `<strong>Last cycle:</strong> ${esc(data.updated || 'not run')} · <strong>Dataset:</strong> ${esc(data.currentDataset || 'pending')} · <strong>Last result:</strong> ${esc(data.lastMissionStatus || 'pending')}. ${esc(data.boundary || 'System-level hypotheses only. No guilt by association.')}`;
    const docket = Array.isArray(data.docket) ? data.docket : [];
    if (docketTarget) docketTarget.innerHTML = docket.length ? docket.map(card).join('') : '<div class="spec-empty">No Epstein hypotheses were published because the current source window did not meet the minimum input and evidence-boundary requirements.</div>';
  }

  function render(data, filter = 'all') {
    const items = Array.isArray(data.items) ? data.items : [];
    const visible = filter === 'all' ? items : items.filter(item => item.status === filter);
    const counts = items.reduce((out, item) => { out[item.status] = (out[item.status] || 0) + 1; return out; }, {});
    const autoPublished = items.filter(item => item.publicationState === 'auto-published-from-review-queue').length;
    metrics.innerHTML = `
      <div class="spec-metric"><strong>${items.length}</strong><span>General hypotheses</span></div>
      <div class="spec-metric"><strong>${autoPublished}</strong><span>Auto-published review items</span></div>
      <div class="spec-metric"><strong>${counts.unverified || 0}</strong><span>Unverified speculation</span></div>
      <div class="spec-metric"><strong>${counts['evidence-supported'] || 0}</strong><span>Evidence-supported hypotheses</span></div>
      <div class="spec-metric"><strong>${(counts.weakened || 0) + (counts.rejected || 0)}</strong><span>Weakened or rejected</span></div>`;
    const queueRule = data.reviewQueueAutoPublication?.enabled ? ` · review queue auto-publication enabled: ${autoPublished} imported` : '';
    status.textContent = `General feed updated ${data.updated || 'unknown'} · ${visible.length} item(s) shown · scope: ${data.automaticPublicationScope || 'speculation page only'}${queueRule}`;
    grid.innerHTML = visible.length ? visible.map(card).join('') : '<div class="spec-empty">No conclusions match this filter.</div>';
  }

  ensureEpsteinPanel();
  fetch(EPSTEIN_STATUS_URL, { cache: 'no-store' })
    .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
    .then(renderEpsteinStatus)
    .catch(error => renderEpsteinStatus({ status: 'status unavailable', lastMissionStatus: error.message, boundary: 'The page will not invent processing counts or conclusions when the status feed is unavailable.', docket: [] }));

  fetch(DATA_URL, { cache: 'no-store' })
    .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
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
