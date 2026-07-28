(() => {
  'use strict';

  const form = document.querySelector('[data-power-chain-search]');
  const input = form?.querySelector('input[type="search"]');
  const results = document.querySelector('[data-power-chain-results]');
  const status = document.querySelector('[data-power-chain-status]');
  if (!form || !input || !results || !status) return;

  let chains = [];
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  const normalise = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

  function stageMarkup(stage, index) {
    const state = String(stage.state || 'unresolved');
    const source = stage.sourceUrl ? `<a href="${escapeHtml(stage.sourceUrl)}" rel="noopener noreferrer">${escapeHtml(stage.sourceLabel || 'Open source')}</a>` : '<span>No stage-specific source attached</span>';
    return `<li class="power-chain-stage is-${escapeHtml(state)}">
      <div class="power-chain-stage-number">${String(index + 1).padStart(2, '0')}</div>
      <div class="power-chain-stage-body">
        <div class="power-chain-stage-head"><div><span>${escapeHtml(stage.role || '')}</span><h3>${escapeHtml(stage.label || '')}</h3></div><strong>${escapeHtml(state.replace(/-/g, ' '))}</strong></div>
        <p>${escapeHtml(stage.value || 'No evidence-classified record has yet been attached.')}</p>
        <div class="power-chain-stage-meta"><span>${escapeHtml(stage.evidenceClassification || 'missing record')}</span>${source}</div>
        <small>${escapeHtml(stage.rule || '')}</small>
      </div>
    </li>`;
  }

  function chainMarkup(chain) {
    const questions = Array.isArray(chain.unansweredQuestions) ? chain.unansweredQuestions : [];
    const sourceUrl = chain.source?.url || '';
    return `<article class="power-chain-card" id="${escapeHtml(chain.id)}">
      <div class="power-chain-card-meta"><span>${escapeHtml(chain.laneTitle || chain.lane || 'Public accountability')}</span><span>${escapeHtml(chain.source?.classification || 'public-source lead')}</span></div>
      <h2>${escapeHtml(chain.title)}</h2>
      <p class="power-chain-consequence"><strong>Consequence being traced:</strong> ${escapeHtml(chain.consequenceSummary || chain.title)}</p>
      <ol class="power-chain-stages">${(chain.stages || []).map(stageMarkup).join('')}</ol>
      <div class="power-chain-bottom-grid">
        <section><h3>Unanswered questions</h3>${questions.length ? `<ul>${questions.slice(0, 6).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p>No structured unanswered question is attached yet.</p>'}</section>
        <section><h3>Operating rule</h3><p>${escapeHtml(chain.operatingRule || '')}</p><p class="power-chain-card-boundary"><strong>Evidence boundary:</strong> ${escapeHtml(chain.evidenceBoundary || '')}</p></section>
      </div>
      <div class="power-chain-actions">
        <a class="primary" href="${escapeHtml(chain.accountabilityRoute || 'public-consequence-contracts.html')}">Open accountability record</a>
        <a href="${escapeHtml(chain.reverseSearchRoute || 'reverse-accountability-search.html')}">Open reverse search</a>
        ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" rel="noopener noreferrer">Open original source</a>` : ''}
        <a href="contact-the-machine.html?type=evidence">Help resolve a missing stage</a>
      </div>
    </article>`;
  }

  function runSearch(query, updateUrl = true) {
    const cleanQuery = String(query || '').trim();
    const words = normalise(cleanQuery).split(' ').filter(word => word.length > 1);
    const ranked = cleanQuery
      ? chains.map(chain => {
          const haystack = normalise([chain.title, chain.laneTitle, chain.consequenceSummary, ...(chain.stages || []).map(stage => `${stage.label} ${stage.role} ${stage.value}`), ...(chain.unansweredQuestions || [])].join(' '));
          const score = words.reduce((total, word) => total + (haystack.includes(word) ? 1 : 0), 0);
          return { chain, score };
        }).filter(item => item.score > 0).sort((a, b) => b.score - a.score).map(item => item.chain)
      : chains.slice(0, 12);

    if (updateUrl) {
      const url = new URL(location.href);
      if (cleanQuery) url.searchParams.set('q', cleanQuery); else url.searchParams.delete('q');
      history.replaceState(null, '', url);
    }

    if (!ranked.length) {
      results.innerHTML = '<div class="power-chain-empty"><h2>No responsibility chain matched</h2><p>This may be a genuine missing-record mission. Submit the consequence without naming an unverified responsible party.</p><a href="contact-the-machine.html?type=evidence">Submit the missing chain</a></div>';
      status.textContent = 'No chain matched. This is not evidence that no decision-maker, authority or money route exists.';
      return;
    }

    results.innerHTML = ranked.slice(0, 12).map(chainMarkup).join('');
    status.textContent = `${Math.min(ranked.length, 12)} evidence-classified responsibility chain${ranked.length === 1 ? '' : 's'} shown. Unknown stages remain unresolved.`;
    const hash = location.hash.slice(1);
    if (hash) document.getElementById(hash)?.scrollIntoView({ block: 'start' });
  }

  async function load() {
    try {
      const response = await fetch('data/power-supply-chain.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Power Supply Chain returned ${response.status}`);
      const payload = await response.json();
      chains = Array.isArray(payload.chains) ? payload.chains : [];
      const query = new URL(location.href).searchParams.get('q') || '';
      input.value = query;
      runSearch(query, false);
    } catch (error) {
      status.textContent = 'Power Supply Chain is temporarily unavailable. No missing role has been invented.';
      results.innerHTML = '<div class="power-chain-empty"><h2>Chain index unavailable</h2><p>Use Reverse Accountability Search while the evidence-classified chain is rebuilt.</p><a href="reverse-accountability-search.html">Open Reverse Accountability Search</a></div>';
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    runSearch(input.value);
  });

  load();
})();
