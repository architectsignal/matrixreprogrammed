(() => {
  'use strict';

  const form = document.querySelector('[data-red-team-search]');
  const input = form?.querySelector('input[type="search"]');
  const results = document.querySelector('[data-red-team-results]');
  const status = document.querySelector('[data-red-team-status]');
  if (!form || !input || !results || !status) return;

  let mirrors = [];
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  const normalise = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

  function supportPoint(item) {
    return `<li><strong>${escapeHtml(item.statement || '')}</strong><span>${escapeHtml(String(item.classification || '').replace(/-/g, ' '))}</span><p><b>Establishes:</b> ${escapeHtml(item.establishes || '')}</p><p><b>Does not establish:</b> ${escapeHtml(item.doesNotEstablish || '')}</p></li>`;
  }

  function challengePoint(item) {
    return `<li><strong>${escapeHtml(item.statement || '')}</strong><span>${escapeHtml(String(item.classification || '').replace(/-/g, ' '))}</span><p><b>Why it matters:</b> ${escapeHtml(item.significance || '')}</p></li>`;
  }

  function mirrorMarkup(mirror) {
    const support = mirror.supportingCase?.points || [];
    const challenge = mirror.challengingCase?.points || [];
    const changeEvidence = Array.isArray(mirror.whatWouldChangeTheAssessment) ? mirror.whatWouldChangeTheAssessment : [];
    const sourceUrl = mirror.source?.url || '';
    return `<article class="red-team-card" id="${escapeHtml(mirror.id)}">
      <div class="red-team-card-meta"><span>${escapeHtml(mirror.laneTitle || mirror.lane || 'Public accountability')}</span><strong>${escapeHtml(String(mirror.balanceStatus || '').replace(/-/g, ' '))}</strong></div>
      <h2>${escapeHtml(mirror.title)}</h2>
      <p class="red-team-proposition"><strong>Proposition under test:</strong> ${escapeHtml(mirror.propositionUnderTest || mirror.title)}</p>
      <div class="red-team-columns">
        <section class="red-team-support"><div class="red-team-column-head"><span>Support</span><h3>What the attached record supports</h3></div>${support.length ? `<ul>${support.map(supportPoint).join('')}</ul>` : '<p>No supporting evidence is attached.</p>'}</section>
        <section class="red-team-challenge"><div class="red-team-column-head"><span>Challenge</span><h3>What weakens, limits or could falsify it</h3></div>${challenge.length ? `<ul>${challenge.map(challengePoint).join('')}</ul>` : '<p>No accepted counter-evidence is attached. This is not proof that none exists.</p>'}</section>
      </div>
      <section class="red-team-alternative"><h3>Strongest responsible alternative</h3><p>${escapeHtml(mirror.strongestAlternativeExplanation || '')}</p></section>
      <details class="red-team-change"><summary>What evidence would change the assessment?</summary><ul>${changeEvidence.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details>
      <p class="red-team-card-boundary"><strong>Boundary:</strong> ${escapeHtml(mirror.evidenceBoundary || '')}</p>
      <div class="red-team-actions">
        <a class="primary" href="${escapeHtml(mirror.accountabilityRoute || 'public-consequence-contracts.html')}">Open accountability record</a>
        <a href="${escapeHtml(mirror.powerSupplyChainRoute || 'power-supply-chain.html')}">Open Power Supply Chain</a>
        <a href="${escapeHtml(mirror.evidenceHalfLifeRoute || 'evidence-half-life.html')}">Open Evidence Half-Life</a>
        <a href="${escapeHtml(mirror.powerDiffRoute || 'power-diff.html')}">Open Power Diff</a>
        ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" rel="noopener noreferrer">Open original source</a>` : ''}
        <a href="contact-the-machine.html?type=correction">Submit counter-evidence</a>
      </div>
    </article>`;
  }

  function render(updateUrl = true) {
    const query = String(input.value || '').trim();
    const words = normalise(query).split(' ').filter(word => word.length > 1);
    const selected = mirrors.filter(mirror => {
      if (!words.length) return true;
      const haystack = normalise([
        mirror.title, mirror.laneTitle, mirror.propositionUnderTest, mirror.strongestAlternativeExplanation,
        ...(mirror.supportingCase?.points || []).map(item => `${item.statement} ${item.establishes} ${item.doesNotEstablish}`),
        ...(mirror.challengingCase?.points || []).map(item => `${item.statement} ${item.significance}`),
        ...(mirror.whatWouldChangeTheAssessment || [])
      ].join(' '));
      return words.every(word => haystack.includes(word));
    });

    if (updateUrl) {
      const url = new URL(location.href);
      if (query) url.searchParams.set('q', query); else url.searchParams.delete('q');
      history.replaceState(null, '', url);
    }

    if (!selected.length) {
      results.innerHTML = '<div class="red-team-empty"><h2>No mirror matched</h2><p>Try a broader proposition, subject or evidence term.</p></div>';
      status.textContent = 'No matching Red-Team Mirror record. No counter-case has been invented.';
      return;
    }

    results.innerHTML = selected.slice(0, 30).map(mirrorMarkup).join('');
    const challengeCount = selected.filter(item => item.challengingCase?.status === 'structured-challenges-present').length;
    status.textContent = `${selected.length} evidence-bounded mirror${selected.length === 1 ? '' : 's'} shown; ${challengeCount} contain structured challenges or falsifiers.`;
    const hash = location.hash.slice(1);
    if (hash) document.getElementById(hash)?.scrollIntoView({ block: 'start' });
  }

  async function load() {
    try {
      const response = await fetch('data/red-team-mirror.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Red-Team Mirror returned ${response.status}`);
      const payload = await response.json();
      mirrors = Array.isArray(payload.mirrors) ? payload.mirrors : [];
      const query = new URL(location.href).searchParams.get('q') || '';
      input.value = query;
      render(false);
    } catch (error) {
      status.textContent = 'Red-Team Mirror is temporarily unavailable. No challenge or counter-evidence has been invented.';
      results.innerHTML = '<div class="red-team-empty"><h2>Mirror ledger unavailable</h2><p>Open the accountability record and evidence boundaries directly.</p><a href="public-consequence-contracts.html">Open Accountability Twins</a></div>';
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    render();
  });
  load();
})();
