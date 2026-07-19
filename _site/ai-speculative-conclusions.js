(() => {
  const DATA_URL = 'data/ai-speculative-conclusions.json';
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
