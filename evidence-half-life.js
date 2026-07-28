(() => {
  'use strict';

  const form = document.querySelector('[data-half-life-search]');
  const input = form?.querySelector('input[type="search"]');
  const filter = document.querySelector('[data-half-life-filter]');
  const results = document.querySelector('[data-half-life-results]');
  const status = document.querySelector('[data-half-life-status]');
  if (!form || !input || !filter || !results || !status) return;

  let entries = [];
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  const normalise = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

  function entryMarkup(entry) {
    const recall = entry.recallNotice ? `<div class="half-life-recall"><strong>Evidence recall notice</strong><p>${escapeHtml(entry.recallNotice)}</p></div>` : '';
    const questions = Array.isArray(entry.reviewQuestions) ? entry.reviewQuestions : [];
    const sourceUrl = entry.source?.url || '';
    return `<article class="half-life-card state-${escapeHtml(entry.freshnessState || '')}" id="${escapeHtml(entry.id)}">
      <div class="half-life-card-meta"><span>${escapeHtml(entry.laneTitle || entry.lane || 'Public accountability')}</span><strong>${escapeHtml(String(entry.freshnessState || '').replace(/-/g, ' '))}</strong></div>
      <h2>${escapeHtml(entry.title)}</h2>
      ${recall}
      <div class="half-life-metrics">
        <div><span>Baseline</span><strong>${escapeHtml(String(entry.baselineAt || '').slice(0, 10))}</strong><small>${escapeHtml(String(entry.baselineType || '').replace(/-/g, ' '))}</small></div>
        <div><span>Review interval</span><strong>${escapeHtml(entry.reviewIntervalDays)} days</strong><small>${escapeHtml(String(entry.reviewClass || '').replace(/-/g, ' '))}</small></div>
        <div><span>Next review</span><strong>${escapeHtml(String(entry.nextReviewAt || '').slice(0, 10))}</strong><small>${Number(entry.daysUntilReview) < 0 ? `${Math.abs(Number(entry.daysUntilReview))} days overdue` : `${escapeHtml(entry.daysUntilReview)} days remaining`}</small></div>
        <div><span>Source availability</span><strong>${escapeHtml(String(entry.sourceAvailability || '').replace(/-/g, ' '))}</strong><small>${escapeHtml(String(entry.currentApplicability || '').replace(/-/g, ' '))}</small></div>
      </div>
      <section class="half-life-questions"><h3>Re-verification questions</h3><ul>${questions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>
      <p class="half-life-card-boundary"><strong>Boundary:</strong> ${escapeHtml(entry.evidenceBoundary || '')}</p>
      <div class="half-life-actions">
        <a class="primary" href="${escapeHtml(entry.accountabilityRoute || 'public-consequence-contracts.html')}">Open accountability record</a>
        <a href="${escapeHtml(entry.powerSupplyChainRoute || 'power-supply-chain.html')}">Open Power Supply Chain</a>
        ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" rel="noopener noreferrer">Check original source</a>` : ''}
        <a href="contact-the-machine.html?type=correction">Submit updated evidence</a>
      </div>
    </article>`;
  }

  function render(updateUrl = true) {
    const query = String(input.value || '').trim();
    const state = String(filter.value || 'all');
    const words = normalise(query).split(' ').filter(word => word.length > 1);
    const selected = entries.filter(entry => {
      if (state !== 'all' && entry.freshnessState !== state) return false;
      if (!words.length) return true;
      const haystack = normalise([entry.title, entry.laneTitle, entry.source?.label, entry.source?.classification, entry.reviewClass, ...(entry.reviewQuestions || [])].join(' '));
      return words.every(word => haystack.includes(word));
    });

    if (updateUrl) {
      const url = new URL(location.href);
      if (query) url.searchParams.set('q', query); else url.searchParams.delete('q');
      if (state !== 'all') url.searchParams.set('state', state); else url.searchParams.delete('state');
      history.replaceState(null, '', url);
    }

    if (!selected.length) {
      results.innerHTML = '<div class="half-life-empty"><h2>No evidence review record matched</h2><p>Try a broader search or remove the review-state filter.</p></div>';
      status.textContent = 'No matching review records. No freshness conclusion has been invented.';
      return;
    }

    results.innerHTML = selected.slice(0, 40).map(entryMarkup).join('');
    const recalls = selected.filter(item => item.recallNotice).length;
    status.textContent = `${selected.length} evidence review record${selected.length === 1 ? '' : 's'} shown; ${recalls} active recall notice${recalls === 1 ? '' : 's'}.`;
    const hash = location.hash.slice(1);
    if (hash) document.getElementById(hash)?.scrollIntoView({ block: 'start' });
  }

  async function load() {
    try {
      const response = await fetch('data/evidence-half-life.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Evidence Half-Life returned ${response.status}`);
      const payload = await response.json();
      entries = Array.isArray(payload.entries) ? payload.entries : [];
      const url = new URL(location.href);
      input.value = url.searchParams.get('q') || '';
      filter.value = url.searchParams.get('state') || 'all';
      render(false);
    } catch (error) {
      status.textContent = 'Evidence Half-Life is temporarily unavailable. No source has been declared stale or false.';
      results.innerHTML = '<div class="half-life-empty"><h2>Review ledger unavailable</h2><p>Open the Evidence Vault while the time-aware review ledger is rebuilt.</p><a href="evidence-vault.html">Open Evidence Vault</a></div>';
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    render();
  });
  filter.addEventListener('change', () => render());
  load();
})();
