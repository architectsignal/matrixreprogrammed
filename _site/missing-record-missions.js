(() => {
  'use strict';

  const form = document.querySelector('[data-missing-missions-search]');
  const input = form?.querySelector('input[type="search"]');
  const filter = document.querySelector('[data-missing-missions-filter]');
  const results = document.querySelector('[data-missing-missions-results]');
  const status = document.querySelector('[data-missing-missions-status]');
  if (!form || !input || !filter || !results || !status) return;

  let missions = [];
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  const normalise = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

  function missionMarkup(mission) {
    const terms = Array.isArray(mission.searchTerms) ? mission.searchTerms : [];
    const preparation = Array.isArray(mission.requestPreparation) ? mission.requestPreparation : [];
    const accepted = Array.isArray(mission.submissionsAccepted) ? mission.submissionsAccepted : [];
    const livedReceiptRoute = mission.livedConsequenceReceiptsRoute || `lived-consequence-receipts.html?record=${encodeURIComponent(mission.sourceRecordId || '')}#submit`;
    return `<article class="missing-mission-card" id="${escapeHtml(mission.id)}">
      <div class="missing-mission-meta"><span>${escapeHtml(mission.laneTitle || mission.lane || 'Public accountability')}</span><strong>${escapeHtml(String(mission.status || '').replace(/-/g, ' '))}</strong></div>
      <h2>${escapeHtml(mission.title)}</h2>
      <p class="missing-mission-question"><strong>Question:</strong> ${escapeHtml(mission.question)}</p>
      <div class="missing-mission-grid">
        <section><span>Record needed</span><p>${escapeHtml(mission.recordNeeded)}</p></section>
        <section><span>Likely custodian</span><p>${escapeHtml(mission.likelyCustodian)}</p><small>${escapeHtml(String(mission.custodianStatus || '').replace(/-/g, ' '))}</small></section>
        <section><span>Jurisdiction</span><p>${escapeHtml(String(mission.jurisdiction || '').replace(/-/g, ' '))}</p></section>
        <section><span>Gap type</span><p>${escapeHtml(String(mission.gapType || '').replace(/-/g, ' '))}</p></section>
      </div>
      <section class="missing-mission-terms"><h3>Suggested search terms</h3><div>${terms.map(item => `<code>${escapeHtml(item)}</code>`).join('')}</div></section>
      <details class="missing-mission-preparation"><summary>Prepare a lawful, precise request</summary><ol>${preparation.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol></details>
      <details class="missing-mission-accepted"><summary>Useful submissions</summary><ul>${accepted.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details>
      <p class="missing-mission-boundary"><strong>Evidence boundary:</strong> ${escapeHtml(mission.evidenceBoundary || '')}</p>
      <div class="missing-mission-actions">
        <a class="primary" href="${escapeHtml(mission.submissionRoute || 'contact-the-machine.html?type=evidence')}">Submit a record</a>
        <a href="${escapeHtml(mission.accountabilityRoute || 'public-consequence-contracts.html')}">Open accountability record</a>
        <a href="${escapeHtml(mission.powerSupplyChainRoute || 'power-supply-chain.html')}">Open Power Supply Chain</a>
        <a href="${escapeHtml(mission.redTeamMirrorRoute || 'red-team-mirror.html')}">Open Red-Team Mirror</a>
        <a href="${escapeHtml(mission.publicAnswerClockRoute || 'public-answer-clock.html')}">Open answer clock</a>
        <a href="${escapeHtml(livedReceiptRoute)}">Submit a lived receipt</a>
      </div>
    </article>`;
  }

  function render(updateUrl = true) {
    const query = String(input.value || '').trim();
    const missionType = String(filter.value || 'all');
    const words = normalise(query).split(' ').filter(word => word.length > 1);
    const selected = missions.filter(mission => {
      if (missionType !== 'all' && mission.gapType !== missionType) return false;
      if (!words.length) return true;
      const haystack = normalise([mission.title, mission.question, mission.recordNeeded, mission.likelyCustodian, mission.gapLabel, ...(mission.searchTerms || [])].join(' '));
      return words.every(word => haystack.includes(word));
    });

    if (updateUrl) {
      const url = new URL(location.href);
      if (query) url.searchParams.set('q', query); else url.searchParams.delete('q');
      if (missionType !== 'all') url.searchParams.set('type', missionType); else url.searchParams.delete('type');
      history.replaceState(null, '', url);
    }

    if (!selected.length) {
      results.innerHTML = '<div class="missing-missions-empty"><h2>No mission matched</h2><p>Try a broader record, institution, stage or unanswered question.</p></div>';
      status.textContent = 'No matching mission. No custodian or concealment claim has been invented.';
      return;
    }

    results.innerHTML = selected.slice(0, 60).map(missionMarkup).join('');
    status.textContent = `${selected.length} structured missing-record mission${selected.length === 1 ? '' : 's'} shown. Custodians and jurisdictions remain unverified until confirmed.`;
    const hash = location.hash.slice(1);
    if (hash) document.getElementById(hash)?.scrollIntoView({ block: 'start' });
  }

  async function load() {
    try {
      const response = await fetch('data/missing-record-missions.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Missing Record Missions returned ${response.status}`);
      const payload = await response.json();
      missions = Array.isArray(payload.missions) ? payload.missions : [];
      const url = new URL(location.href);
      input.value = url.searchParams.get('q') || '';
      filter.value = url.searchParams.get('type') || 'all';
      render(false);
    } catch (error) {
      status.textContent = 'Missing Record Missions are temporarily unavailable. No custodian, jurisdiction or concealment claim has been invented.';
      results.innerHTML = '<div class="missing-missions-empty"><h2>Mission ledger unavailable</h2><p>Open the existing Missing Records page while the structured mission ledger is rebuilt.</p><a href="daily-missing-records.html">Open Missing Records</a></div>';
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    render();
  });
  filter.addEventListener('change', () => render());
  load();
})();
