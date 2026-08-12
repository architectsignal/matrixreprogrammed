(function () {
  'use strict';

  const form = document.getElementById('ask-matrix-form');
  const question = document.getElementById('ask-matrix-question');
  const submit = document.getElementById('ask-matrix-submit');
  const state = document.getElementById('ask-matrix-state');
  const output = document.getElementById('ask-matrix-output');
  if (!form || !question || !submit || !state || !output) return;

  const safeRoute = value => {
    try {
      const url = new URL(String(value || ''), window.location.origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  };

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function setState(label, detail) {
    state.replaceChildren(
      element('strong', '', label),
      element('span', '', detail || '')
    );
  }

  function claimSection(title, items, className) {
    const section = element('section', `ask-result-section ${className || ''}`);
    section.append(element('h3', '', title));
    if (!Array.isArray(items) || !items.length) {
      section.append(element('p', 'ask-empty', 'No material in this category.'));
      return section;
    }
    const list = element('ul', 'ask-claim-list');
    for (const item of items) {
      const entry = element('li');
      entry.append(element('span', '', item && typeof item === 'object' ? item.text : item));
      const ids = item && typeof item === 'object' && Array.isArray(item.evidence_ids) ? item.evidence_ids : [];
      if (ids.length) entry.append(element('small', 'ask-citation-ids', `Evidence: ${ids.join(', ')}`));
      list.append(entry);
    }
    section.append(list);
    return section;
  }

  function renderEvidence(records) {
    const section = element('section', 'ask-result-section ask-evidence');
    section.append(element('h3', '', 'Evidence used'));
    const grid = element('div', 'ask-evidence-grid');
    for (const record of Array.isArray(records) ? records : []) {
      const card = element('article', 'ask-evidence-card');
      card.append(element('strong', '', record.title || record.evidence_id));
      card.append(element('span', 'ask-evidence-meta', [record.evidence_grade, record.factual_status, record.source_publisher].filter(Boolean).join(' · ')));
      if (record.summary || record.establishes) card.append(element('p', '', record.summary || record.establishes));
      if (record.evidence_boundary || record.does_not_establish) card.append(element('p', 'ask-boundary-small', record.evidence_boundary || record.does_not_establish));
      card.append(element('code', '', record.evidence_id || ''));
      const actions = element('div', 'cta-row small');
      const source = safeRoute(record.source_route);
      if (source) {
        const link = element('a', 'btn', 'Open source');
        link.href = source;
        if (new URL(source).origin !== window.location.origin) {
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        }
        actions.append(link);
      }
      const matrix = safeRoute(record.matrix_route);
      if (matrix) {
        const link = element('a', 'btn alt', 'Open Matrix route');
        link.href = matrix;
        actions.append(link);
      }
      card.append(actions);
      grid.append(card);
    }
    if (!grid.childElementCount) grid.append(element('p', 'ask-empty', 'No evidence record was selected.'));
    section.append(grid);
    return section;
  }

  function render(payload) {
    const result = payload && payload.result;
    output.replaceChildren();
    if (!result) {
      output.append(element('div', 'card redline', payload && payload.error ? payload.error : 'No validated result is available.'));
      return;
    }

    const header = element('section', 'ask-answer-lead card redline');
    header.append(element('span', 'label', payload.fallback_used ? 'Evidence-only answer' : 'Validated investigator answer'));
    header.append(element('h2', '', 'Matrix answer'));
    header.append(element('p', 'ask-answer-text', result.answer));
    header.append(element('p', 'ask-confidence', `Confidence: ${Math.round(Number(result.confidence || 0) * 100)}% · Investigation ${payload.investigation_id}`));
    if (payload.synthesis_pending) header.append(element('p', 'ask-pending-note', 'A zero-cost owner-local investigator is eligible and may enrich this result. The evidence-only answer remains usable while that bounded job runs.'));
    output.append(header);

    const categories = element('div', 'ask-result-grid');
    categories.append(
      claimSection('Known facts', result.facts, 'ask-facts'),
      claimSection('Allegations / disputed material', result.allegations_or_disputed_claims, 'ask-disputed'),
      claimSection('Inferences', result.inferences, 'ask-inferences'),
      claimSection('Unknowns / open questions', result.unknowns, 'ask-unknowns')
    );
    output.append(categories);

    const context = element('section', 'ask-result-section ask-context');
    context.append(element('h3', '', 'Evidence boundary'));
    context.append(element('p', '', result.evidence_boundary));
    if (Array.isArray(result.related_entities) && result.related_entities.length) context.append(element('p', '', `Related entities: ${result.related_entities.join(' · ')}`));
    const related = element('div', 'cta-row small');
    for (const route of Array.isArray(result.related_investigations) ? result.related_investigations.slice(0, 8) : []) {
      const href = safeRoute(route);
      if (!href) continue;
      const link = element('a', 'btn alt', 'Related investigation');
      link.href = href;
      related.append(link);
    }
    context.append(related);
    output.append(context, renderEvidence(payload.evidence_used));
  }

  async function readJson(response) {
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { throw new Error('Matrix returned malformed JSON.'); }
    if (!response.ok) throw new Error(data.error || data.reason || `Matrix returned HTTP ${response.status}.`);
    return data;
  }

  async function poll(investigationId) {
    const started = Date.now();
    while (Date.now() - started < 120000) {
      await new Promise(resolve => setTimeout(resolve, 2500));
      const payload = await readJson(await fetch(`/api/investigate/${encodeURIComponent(investigationId)}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      }));
      render(payload);
      setState(payload.status === 'complete' ? 'Investigation complete' : 'Evidence answer ready', payload.synthesis_pending ? 'Owner-local synthesis is still pending; the answer below remains valid.' : 'Citations and evidence boundaries were validated.');
      if (payload.status === 'complete' || payload.status === 'failed' || payload.status === 'blocked') return;
    }
    setState('Evidence answer retained', 'Local synthesis did not finish in this browser window. You can reopen the investigation later; there is no endless spinner.');
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const value = question.value.trim();
    if (value.length < 8) {
      setState('Question needed', 'Enter at least 8 characters so Matrix can retrieve evidence responsibly.');
      question.focus();
      return;
    }
    submit.disabled = true;
    output.replaceChildren();
    setState('Retrieving evidence', 'Matrix is classifying the question and searching the current public evidence corpus.');
    try {
      const payload = await readJson(await fetch('/api/investigate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ question: value, mode: 'standard' })
      }));
      render(payload);
      setState(payload.synthesis_pending ? 'Evidence answer ready' : 'Investigation complete', payload.synthesis_pending ? 'A validated evidence-only answer is visible while local synthesis remains pending.' : 'The result, citations, persistence and learning event completed.');
      if (payload.synthesis_pending) poll(payload.investigation_id).catch(error => setState('Evidence answer retained', error.message));
    } catch (error) {
      output.append(element('div', 'card redline', `${error.message} Try again in a moment; Matrix did not fabricate a fallback citation.`));
      setState('Recoverable error', 'The investigation stopped safely.');
    } finally {
      submit.disabled = false;
    }
  });
}());
