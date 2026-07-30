(() => {
  'use strict';

  const form = document.querySelector('[data-reverse-search-form]');
  const input = document.querySelector('[data-reverse-search-input]');
  const results = document.querySelector('[data-reverse-search-results]');
  const status = document.querySelector('[data-reverse-search-status]');
  const examples = document.querySelectorAll('[data-reverse-example]');
  if (!form || !input || !results || !status) return;

  const SYNONYMS = {
    bill: ['bill', 'price', 'cost', 'tariff', 'fee', 'charge', 'rate', 'expensive', 'increase'],
    energy: ['energy', 'electricity', 'gas', 'fuel', 'power', 'utility'],
    closure: ['closed', 'closure', 'shut', 'withdrawn', 'removed', 'cancelled', 'ended'],
    health: ['hospital', 'clinic', 'health', 'care', 'medicine', 'treatment'],
    surveillance: ['surveillance', 'monitoring', 'tracking', 'camera', 'biometric', 'privacy'],
    identity: ['identity', 'digital id', 'credential', 'verification', 'biometric'],
    contract: ['contract', 'procurement', 'tender', 'grant', 'subsidy', 'payment', 'funding'],
    housing: ['housing', 'rent', 'mortgage', 'property', 'home', 'eviction'],
    work: ['job', 'employment', 'wage', 'salary', 'work', 'redundancy'],
    restriction: ['restriction', 'ban', 'limit', 'mandate', 'rule', 'requirement'],
    tax: ['tax', 'levy', 'duty', 'revenue', 'charge'],
    war: ['war', 'conflict', 'weapons', 'military', 'sanction', 'defence']
  };

  let records = [];

  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const normalise = value => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function expandTerms(query) {
    const base = new Set(normalise(query).split(' ').filter(term => term.length > 1));
    const normalisedQuery = normalise(query);
    Object.values(SYNONYMS).forEach(group => {
      if (group.some(term => normalisedQuery.includes(normalise(term)))) {
        group.forEach(term => normalise(term).split(' ').forEach(token => base.add(token)));
      }
    });
    return [...base];
  }

  function score(record, query, terms) {
    const phrase = normalise(query);
    const title = normalise(record.title);
    const consequence = normalise(record.consequenceSummary);
    const haystack = normalise(record.searchableText);
    let value = 0;
    if (phrase && title.includes(phrase)) value += 90;
    if (phrase && consequence.includes(phrase)) value += 70;
    if (phrase && haystack.includes(phrase)) value += 45;
    terms.forEach(term => {
      if (title.includes(term)) value += 18;
      if (consequence.includes(term)) value += 12;
      if (haystack.includes(term)) value += 4;
    });
    if (record.source && record.source.classification && /official|primary/.test(record.source.classification)) value += 4;
    return value;
  }

  function pathStep(step, index) {
    return `<li class="reverse-path-step"><span>${index + 1}</span><div><strong>${escapeHtml(step.label)}</strong><p>${escapeHtml(step.value || 'Not yet resolved')}</p>${step.status ? `<small>${escapeHtml(step.status)}</small>` : ''}</div></li>`;
  }

  function renderRecord(record, rank) {
    const questions = Array.isArray(record.unansweredQuestions) ? record.unansweredQuestions : [];
    const checkpoints = Array.isArray(record.checkpoints) ? record.checkpoints : [];
    const nextCheckpoint = checkpoints.find(item => item.status === 'due-now' || item.status === 'overdue-for-review') || checkpoints[0];
    const sourceUrl = record.source && record.source.url ? record.source.url : '';
    const evidenceRoute = record.source && record.source.evidenceRoute ? record.source.evidenceRoute : 'evidence-vault.html';
    const contractRoute = record.route || 'public-consequence-contracts.html';
    const powerChainRoute = record.powerSupplyChainRoute || `power-supply-chain.html#power-chain-${encodeURIComponent(record.id || '')}`;
    const evidenceHalfLifeRoute = record.evidenceHalfLifeRoute || `evidence-half-life.html#half-life-${encodeURIComponent(record.id || '')}`;
    const powerDiffRoute = record.powerDiffRoute || `power-diff.html#diff-${encodeURIComponent(record.id || '')}`;
    const redTeamRoute = record.redTeamMirrorRoute || `red-team-mirror.html#red-team-${encodeURIComponent(record.id || '')}`;
    const answerClockRoute = record.publicAnswerClockRoute || `public-answer-clock.html#answer-clock-${encodeURIComponent(record.id || '')}`;
    const missingMissionRoute = record.missingRecordMissionsRoute || 'missing-record-missions.html';
    const livedReceiptRoute = record.livedConsequenceReceiptsRoute || `lived-consequence-receipts.html?record=${encodeURIComponent(record.id || '')}#submit`;
    return `<article class="reverse-result-card" id="${escapeHtml(record.id)}">
      <div class="reverse-result-meta"><span>Path ${rank}</span><span>${escapeHtml(record.laneTitle || record.lane || 'Public accountability')}</span></div>
      <h2>${escapeHtml(record.title)}</h2>
      <p class="reverse-consequence"><strong>Matched consequence:</strong> ${escapeHtml(record.consequenceSummary || record.title)}</p>
      <ol class="reverse-path">${(record.path || []).map(pathStep).join('')}</ol>
      <div class="reverse-result-grid">
        <section><h3>Unanswered questions</h3>${questions.length ? `<ul>${questions.slice(0, 5).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p>No structured question has yet been attached.</p>'}</section>
        <section><h3>Next outcome check</h3>${nextCheckpoint ? `<p><strong>${escapeHtml(nextCheckpoint.label)}</strong><br>${escapeHtml(String(nextCheckpoint.dueAt || '').slice(0, 10))} · ${escapeHtml(String(nextCheckpoint.status || '').replace(/-/g, ' '))}</p><small>${escapeHtml(nextCheckpoint.reviewQuestion || '')}</small>` : '<p>No dated checkpoint has yet been created.</p>'}</section>
      </div>
      <p class="reverse-boundary"><strong>Evidence boundary:</strong> ${escapeHtml(record.evidenceBoundary || 'This result is a route into the public record, not proof of wrongdoing or causation.')}</p>
      <div class="reverse-actions">
        <a class="primary" href="${escapeHtml(contractRoute)}">Open accountability record</a>
        <a href="${escapeHtml(powerChainRoute)}">Trace responsibility chain</a>
        <a href="${escapeHtml(evidenceHalfLifeRoute)}">Review evidence freshness</a>
        <a href="${escapeHtml(powerDiffRoute)}">See what changed</a>
        <a href="${escapeHtml(redTeamRoute)}">Challenge the case</a>
        <a href="${escapeHtml(answerClockRoute)}">Open answer clock</a>
        <a href="${escapeHtml(missingMissionRoute)}">Solve missing records</a>
        <a href="${escapeHtml(livedReceiptRoute)}">Submit a lived receipt</a>
        ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" rel="noopener noreferrer">Open original source</a>` : ''}
        <a href="${escapeHtml(evidenceRoute)}">Inspect evidence</a>
        <a href="member-login.html?return=${encodeURIComponent('/member-dashboard.html#follows')}">Follow the outcome</a>
      </div>
    </article>`;
  }

  function runSearch(query, updateUrl = true) {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) {
      results.innerHTML = '';
      status.textContent = 'Describe a consequence, cost, closure, restriction, decision or public outcome.';
      return;
    }
    const terms = expandTerms(cleanQuery);
    const ranked = records
      .map(record => ({ record, score: score(record, cleanQuery, terms) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set('q', cleanQuery);
      history.replaceState(null, '', url);
    }

    if (!ranked.length) {
      results.innerHTML = `<div class="reverse-empty"><h2>No direct path found yet</h2><p>The consequence is now a useful missing-record question. Try a broader phrase or submit it as an investigation request.</p><a href="contact-the-machine.html?type=evidence">Submit this consequence</a></div>`;
      status.textContent = 'No direct evidence path matched. This is not evidence that no responsible decision or money route exists.';
      return;
    }

    results.innerHTML = ranked.map((item, index) => renderRecord(item.record, index + 1)).join('');
    status.textContent = `${ranked.length} possible accountability path${ranked.length === 1 ? '' : 's'} found. Relevance is not proof of responsibility or causation.`;
    document.dispatchEvent(new CustomEvent('matrix:reverse-accountability-search', { detail: { query: cleanQuery, resultCount: ranked.length } }));
  }

  async function load() {
    status.textContent = 'Loading consequence and accountability records…';
    try {
      const response = await fetch('data/reverse-accountability-index.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Index returned ${response.status}`);
      const payload = await response.json();
      records = Array.isArray(payload.records) ? payload.records : [];
      status.textContent = `${records.length} accountability paths available. Describe what happened.`;
      const query = new URL(location.href).searchParams.get('q');
      if (query) {
        input.value = query;
        runSearch(query, false);
      }
    } catch (error) {
      status.textContent = 'The reverse accountability index is temporarily unavailable. No result has been invented.';
      results.innerHTML = '<div class="reverse-empty"><h2>Index unavailable</h2><p>Open the standard evidence search or try again after the next intelligence build.</p><a href="search.html">Open standard search</a></div>';
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    runSearch(input.value);
  });

  examples.forEach(button => button.addEventListener('click', () => {
    input.value = button.dataset.reverseExample || button.textContent || '';
    runSearch(input.value);
  }));

  load();
})();
