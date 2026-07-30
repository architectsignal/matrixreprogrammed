(() => {
  'use strict';

  const form = document.querySelector('[data-answer-clock-search]');
  const input = form?.querySelector('input[type="search"]');
  const filter = document.querySelector('[data-answer-clock-filter]');
  const results = document.querySelector('[data-answer-clock-results]');
  const status = document.querySelector('[data-answer-clock-status]');
  if (!form || !input || !filter || !results || !status) return;

  let clocks = [];
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  const normalise = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

  function eventMarkup(event) {
    return `<li><span>${escapeHtml(String(event.occurredAt || '').slice(0, 10))}</span><strong>${escapeHtml(String(event.type || '').replace(/-/g, ' '))}</strong><p>${escapeHtml(event.summary || event.verificationReference || '')}</p><small>${escapeHtml(event.verifiedBy ? `Verified by ${event.verifiedBy}` : 'Verification not attached')}</small></li>`;
  }

  function clockMarkup(clock) {
    const events = Array.isArray(clock.events) ? clock.events : [];
    const missingMissionRoute = clock.missingRecordMissionsRoute || 'missing-record-missions.html';
    const livedReceiptRoute = clock.livedConsequenceReceiptsRoute || `lived-consequence-receipts.html?record=${encodeURIComponent(clock.sourceRecordId || '')}#submit`;
    const running = clock.clockRunning === true;
    const clockText = running ? `${clock.elapsedDays} day${Number(clock.elapsedDays) === 1 ? '' : 's'} since verified delivery` : 'Clock not running';
    const proof = clock.deliveryProof ? `<div class="answer-clock-proof"><strong>Verified delivery</strong><p>${escapeHtml(clock.deliveryProof.target || clock.target)} · ${escapeHtml(clock.deliveryProof.channel || 'channel not stated')}</p><small>${escapeHtml(clock.deliveryProof.verificationReference || '')}</small></div>` : '<div class="answer-clock-proof is-empty"><strong>No verified delivery</strong><p>The public clock remains stopped.</p></div>';
    return `<article class="answer-clock-card status-${escapeHtml(clock.status || '')}" id="${escapeHtml(clock.id)}">
      <div class="answer-clock-card-meta"><span>${escapeHtml(clock.laneTitle || clock.lane || 'Public accountability')}</span><strong>${escapeHtml(String(clock.status || '').replace(/-/g, ' '))}</strong></div>
      <h2>${escapeHtml(clock.title)}</h2>
      <blockquote>${escapeHtml(clock.question)}</blockquote>
      <div class="answer-clock-summary">
        <div><span>Target</span><strong>${escapeHtml(clock.target)}</strong><small>${escapeHtml(String(clock.targetStatus || '').replace(/-/g, ' '))}</small></div>
        <div><span>Clock</span><strong>${escapeHtml(clockText)}</strong><small>${clock.startedAt ? escapeHtml(String(clock.startedAt).slice(0, 10)) : 'No verified start time'}</small></div>
        <div><span>Editorial review</span><strong>${clock.followUpReviewAt ? escapeHtml(String(clock.followUpReviewAt).slice(0, 10)) : 'Not scheduled'}</strong><small>${escapeHtml(clock.followUpBoundary || '')}</small></div>
      </div>
      ${proof}
      ${events.length ? `<details class="answer-clock-events"><summary>Verified communication history (${events.length})</summary><ol>${events.map(eventMarkup).join('')}</ol></details>` : '<p class="answer-clock-no-events">No verified communication event is attached.</p>'}
      ${clock.responseSummary ? `<section class="answer-clock-response"><h3>Response under review</h3><p>${escapeHtml(clock.responseSummary)}</p></section>` : ''}
      <p class="answer-clock-nonresponse"><strong>Non-response boundary:</strong> ${escapeHtml(clock.nonResponseBoundary || '')}</p>
      <p class="answer-clock-card-boundary"><strong>Evidence boundary:</strong> ${escapeHtml(clock.evidenceBoundary || '')}</p>
      <div class="answer-clock-actions">
        <a class="primary" href="${escapeHtml(clock.accountabilityRoute || 'public-consequence-contracts.html')}">Open accountability record</a>
        <a href="${escapeHtml(clock.powerSupplyChainRoute || 'power-supply-chain.html')}">Open Power Supply Chain</a>
        <a href="${escapeHtml(clock.redTeamMirrorRoute || 'red-team-mirror.html')}">Open Red-Team Mirror</a>
        <a href="accountability-review-inbox.html">Open human review inbox</a>
        <a href="${escapeHtml(missingMissionRoute)}">Solve missing records</a>
        <a href="${escapeHtml(livedReceiptRoute)}">Submit a lived receipt</a>
        <a href="contact-the-machine.html?type=reply">Submit a verified response</a>
      </div>
    </article>`;
  }

  function render(updateUrl = true) {
    const query = String(input.value || '').trim();
    const selectedStatus = String(filter.value || 'all');
    const words = normalise(query).split(' ').filter(word => word.length > 1);
    const selected = clocks.filter(clock => {
      if (selectedStatus !== 'all' && clock.status !== selectedStatus) return false;
      if (!words.length) return true;
      const haystack = normalise([clock.title, clock.question, clock.target, clock.status, clock.responseSummary, ...(clock.events || []).map(event => `${event.type} ${event.summary} ${event.target}`)].join(' '));
      return words.every(word => haystack.includes(word));
    });

    if (updateUrl) {
      const url = new URL(location.href);
      if (query) url.searchParams.set('q', query); else url.searchParams.delete('q');
      if (selectedStatus !== 'all') url.searchParams.set('status', selectedStatus); else url.searchParams.delete('status');
      history.replaceState(null, '', url);
    }

    if (!selected.length) {
      results.innerHTML = '<div class="answer-clock-empty"><h2>No answer clock matched</h2><p>Try a broader question, target or status.</p></div>';
      status.textContent = 'No matching clock. No delivery or non-response status has been invented.';
      return;
    }

    results.innerHTML = selected.slice(0, 40).map(clockMarkup).join('');
    const running = selected.filter(item => item.clockRunning).length;
    status.textContent = `${selected.length} public question record${selected.length === 1 ? '' : 's'} shown; ${running} verified running clock${running === 1 ? '' : 's'}.`;
    const hash = location.hash.slice(1);
    if (hash) document.getElementById(hash)?.scrollIntoView({ block: 'start' });
  }

  async function load() {
    try {
      const response = await fetch('data/public-answer-clocks.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Public Answer Clock returned ${response.status}`);
      const payload = await response.json();
      clocks = Array.isArray(payload.clocks) ? payload.clocks : [];
      const url = new URL(location.href);
      input.value = url.searchParams.get('q') || '';
      filter.value = url.searchParams.get('status') || 'all';
      render(false);
    } catch (error) {
      status.textContent = 'Public Answer Clock is temporarily unavailable. No delivery, silence or response status has been invented.';
      results.innerHTML = '<div class="answer-clock-empty"><h2>Answer-clock ledger unavailable</h2><p>Open the Open Question Ledger while verified communication history is rebuilt.</p><a href="data/accountability-question-ledger.json">Open Question Ledger</a></div>';
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    render();
  });
  filter.addEventListener('change', () => render());
  load();
})();
