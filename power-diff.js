(() => {
  'use strict';

  const form = document.querySelector('[data-power-diff-search]');
  const input = form?.querySelector('input[type="search"]');
  const filter = document.querySelector('[data-power-diff-filter]');
  const results = document.querySelector('[data-power-diff-results]');
  const status = document.querySelector('[data-power-diff-status]');
  if (!form || !input || !filter || !results || !status) return;

  let entries = [];
  let baselineAvailable = false;
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  const normalise = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const formatValue = value => {
    if (value == null || value === '') return 'Not present';
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  };

  function changeMarkup(change) {
    return `<li class="power-diff-change type-${escapeHtml(change.type || 'changed')}">
      <div class="power-diff-change-head"><strong>${escapeHtml(String(change.type || 'changed').toUpperCase())}</strong><span>${escapeHtml(change.field || 'record')}</span></div>
      <div class="power-diff-before-after"><section><h4>Previous</h4><pre>${escapeHtml(formatValue(change.previous))}</pre></section><section><h4>Current</h4><pre>${escapeHtml(formatValue(change.current))}</pre></section></div>
    </li>`;
  }

  function entryMarkup(entry) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    const isHistoricalOnly = entry.status === 'record-ended-or-removed';
    const recordId = encodeURIComponent(entry.sourceRecordId || '');
    const redTeamAction = isHistoricalOnly ? '' : `<a href="${escapeHtml(entry.redTeamMirrorRoute || `red-team-mirror.html#red-team-${recordId}`)}">Challenge the case</a>`;
    const answerClockAction = isHistoricalOnly ? '' : `<a href="${escapeHtml(entry.publicAnswerClockRoute || `public-answer-clock.html#answer-clock-${recordId}`)}">Open answer clock</a>`;
    const missingMissionAction = isHistoricalOnly ? '' : `<a href="${escapeHtml(entry.missingRecordMissionsRoute || 'missing-record-missions.html')}">Solve missing records</a>`;
    const livedReceiptAction = isHistoricalOnly ? '' : `<a href="${escapeHtml(entry.livedConsequenceReceiptsRoute || `lived-consequence-receipts.html?record=${recordId}#submit`)}">Submit a lived receipt</a>`;
    const changeBlock = changes.length
      ? `<ol class="power-diff-changes">${changes.map(changeMarkup).join('')}</ol>`
      : `<div class="power-diff-no-change"><strong>${entry.status === 'baseline-established' ? 'BASELINE ESTABLISHED' : 'NO MATERIAL CHANGE'}</strong><p>${escapeHtml(entry.summary || '')}</p></div>`;
    return `<article class="power-diff-card status-${escapeHtml(entry.status || '')}" id="${escapeHtml(entry.id)}">
      <div class="power-diff-card-meta"><span>${escapeHtml(entry.laneTitle || entry.lane || 'Public accountability')}</span><strong>${escapeHtml(String(entry.status || '').replace(/-/g, ' '))}</strong></div>
      <h2>${escapeHtml(entry.title)}</h2>
      <p>${escapeHtml(entry.summary || '')}</p>
      ${changeBlock}
      <p class="power-diff-card-boundary"><strong>Evidence boundary:</strong> ${escapeHtml(entry.evidenceBoundary || '')}</p>
      <div class="power-diff-actions">
        <a class="primary" href="${escapeHtml(entry.accountabilityRoute || 'public-consequence-contracts.html')}">Open accountability record</a>
        <a href="${escapeHtml(entry.powerSupplyChainRoute || 'power-supply-chain.html')}">Open Power Supply Chain</a>
        <a href="${escapeHtml(entry.evidenceHalfLifeRoute || 'evidence-half-life.html')}">Open Evidence Half-Life</a>
        ${redTeamAction}
        ${answerClockAction}
        ${missingMissionAction}
        ${livedReceiptAction}
        <a href="contact-the-machine.html?type=correction">Challenge or correct this diff</a>
      </div>
    </article>`;
  }

  function render(updateUrl = true) {
    const query = String(input.value || '').trim();
    const state = String(filter.value || 'all');
    const words = normalise(query).split(' ').filter(word => word.length > 1);
    const selected = entries.filter(entry => {
      if (state !== 'all' && entry.status !== state) return false;
      if (!words.length) return true;
      const haystack = normalise([entry.title, entry.laneTitle, entry.summary, ...(entry.changes || []).map(change => `${change.type} ${change.field} ${formatValue(change.previous)} ${formatValue(change.current)}`)].join(' '));
      return words.every(word => haystack.includes(word));
    });

    if (updateUrl) {
      const url = new URL(location.href);
      if (query) url.searchParams.set('q', query); else url.searchParams.delete('q');
      if (state !== 'all') url.searchParams.set('status', state); else url.searchParams.delete('status');
      history.replaceState(null, '', url);
    }

    if (!selected.length) {
      results.innerHTML = '<div class="power-diff-empty"><h2>No diff record matched</h2><p>Try a broader query or remove the status filter.</p></div>';
      status.textContent = 'No matching Power Diff record. No historical change has been invented.';
      return;
    }

    results.innerHTML = selected.slice(0, 40).map(entryMarkup).join('');
    const material = selected.filter(item => ['material-diff','record-ended-or-removed'].includes(item.status)).length;
    status.textContent = baselineAvailable
      ? `${selected.length} diff record${selected.length === 1 ? '' : 's'} shown; ${material} material change set${material === 1 ? '' : 's'}.`
      : `${selected.length} baseline record${selected.length === 1 ? '' : 's'} shown. No historical change is claimed until a genuine prior snapshot exists.`;
    const hash = location.hash.slice(1);
    if (hash) document.getElementById(hash)?.scrollIntoView({ block: 'start' });
  }

  async function load() {
    try {
      const response = await fetch('data/power-diff.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Power Diff returned ${response.status}`);
      const payload = await response.json();
      entries = Array.isArray(payload.entries) ? payload.entries : [];
      baselineAvailable = payload.baselineAvailable === true;
      const url = new URL(location.href);
      input.value = url.searchParams.get('q') || '';
      filter.value = url.searchParams.get('status') || 'all';
      render(false);
    } catch (error) {
      status.textContent = 'Power Diff is temporarily unavailable. No historical change has been invented.';
      results.innerHTML = '<div class="power-diff-empty"><h2>Diff ledger unavailable</h2><p>Open the accountability record directly while the normalized snapshots are rebuilt.</p><a href="public-consequence-contracts.html">Open Accountability Twins</a></div>';
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    render();
  });
  filter.addEventListener('change', () => render());
  load();
})();
