(() => {
  'use strict';

  const DATA_URL = 'data/behind-the-curtain.json';
  const classificationOrder = {
    documented_fact: 1,
    official_allegation: 2,
    strongly_supported_assessment: 3,
    plausible_structural_inference: 4,
    speculative_hypothesis: 5,
    disputed: 6,
    unsupported: 7,
    rejected: 8
  };
  const modeMaximum = { evidence: 2, analysis: 4, curtain: 8 };
  const state = { mode: 'analysis', layer: 'all', confidence: 'all', query: '', selectedNode: null };
  let model = null;

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  const slugLabel = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  const list = items => Array.isArray(items) && items.length ? `<ul>${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : '<p class="muted">No current record.</p>';
  const scoreTone = score => score >= 85 ? 'critical' : score >= 75 ? 'high' : score >= 60 ? 'medium' : 'low';
  const classificationVisible = classification => (classificationOrder[classification] || 99) <= modeMaximum[state.mode];

  function badge(classification) {
    const label = model?.classificationLabels?.[classification]?.label || slugLabel(classification);
    return `<span class="evidence-badge evidence-${esc(classification)}">${esc(label)}</span>`;
  }

  function sourceLinks(ids) {
    const index = new Map((model.sources || []).map(source => [source.id, source]));
    const found = (ids || []).map(id => index.get(id)).filter(Boolean);
    if (!found.length) return '<span class="muted">Source resolution pending</span>';
    return found.map(source => `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.publisher)}: ${esc(source.title)}</a>`).join('<br>');
  }

  function setupModeControls() {
    document.querySelectorAll('[data-mode]').forEach(button => {
      button.addEventListener('click', () => {
        state.mode = button.dataset.mode;
        document.querySelectorAll('[data-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        renderAll();
      });
    });
    const layer = $('#btc-layer');
    const confidence = $('#btc-confidence');
    const search = $('#btc-search');
    layer?.addEventListener('change', event => { state.layer = event.target.value; renderRanking(); renderMap(); });
    confidence?.addEventListener('change', event => { state.confidence = event.target.value; renderRanking(); renderMap(); });
    search?.addEventListener('input', event => { state.query = event.target.value.trim().toLowerCase(); renderRanking(); renderMap(); });
  }

  function filteredCenters() {
    return (model.powerCenters || []).filter(center => {
      if (!classificationVisible(center.classification)) return false;
      if (state.layer !== 'all' && center.layer !== state.layer) return false;
      if (state.confidence !== 'all' && center.confidence !== state.confidence) return false;
      if (!state.query) return true;
      const haystack = [center.name, center.shortName, center.entityType, ...(center.jurisdictions || []), ...(center.mechanisms || []), ...(center.chokepoints || [])].join(' ').toLowerCase();
      return haystack.includes(state.query);
    });
  }

  function populateFilters() {
    const layers = [...new Set((model.powerCenters || []).map(center => center.layer))].sort();
    const confidence = [...new Set((model.powerCenters || []).map(center => center.confidence))].sort();
    const layerSelect = $('#btc-layer');
    const confidenceSelect = $('#btc-confidence');
    if (layerSelect) layerSelect.innerHTML = '<option value="all">All layers</option>' + layers.map(value => `<option value="${esc(value)}">${esc(slugLabel(value))}</option>`).join('');
    if (confidenceSelect) confidenceSelect.innerHTML = '<option value="all">All confidence levels</option>' + confidence.map(value => `<option value="${esc(value)}">${esc(slugLabel(value))}</option>`).join('');
  }

  function renderHeader() {
    $('#btc-opening').textContent = model.opening || '';
    $('#btc-method').textContent = model.methodStatement || '';
    $('#btc-boundary-copy').textContent = model.editorialBoundary || '';
    $('#btc-count-centers').textContent = String((model.powerCenters || []).length);
    $('#btc-count-sources').textContent = String((model.sources || []).length);
    $('#btc-count-links').textContent = String((model.relationships || []).length);
    $('#btc-asof').textContent = model.asOf || '—';
    $('#btc-executive').innerHTML = `<p>${esc(model.executiveAssessment || '')}</p>`;
    $('#btc-editorial-boundary').innerHTML = `<p>${esc(model.editorialBoundary || '')}</p>`;
  }

  function movement(center) {
    if (center.movement === 'new') return '<span class="rank-move new">NEW</span>';
    if (center.previousRank == null || center.previousRank === center.rank) return '<span class="rank-move stable">—</span>';
    const delta = center.previousRank - center.rank;
    return `<span class="rank-move ${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}</span>`;
  }

  function renderRanking() {
    const target = $('#btc-ranking');
    if (!target) return;
    const centers = filteredCenters();
    if (!centers.length) {
      target.innerHTML = '<article class="card"><h3>No matching power centers</h3><p>Change the mode or filters. Evidence Mode intentionally excludes analytic and speculative records.</p></article>';
      return;
    }
    target.innerHTML = centers.map(center => {
      const dimensions = Object.entries(center.dimensions || {}).map(([key, value]) => `<div class="dimension"><span>${esc(slugLabel(key))}</span><strong>${Number(value).toFixed(0)}</strong><i style="--score:${Math.max(0, Math.min(100, Number(value)))}%"></i></div>`).join('');
      return `<article class="power-card card redline" data-center="${esc(center.id)}">
        <div class="rank-line"><span class="rank-number">#${esc(center.rank)}</span>${movement(center)}${badge(center.classification)}</div>
        <div class="power-head"><div><span class="label">${esc(center.entityType)} · ${esc(center.confidence)} confidence</span><h3>${esc(center.name)}</h3></div><div class="power-score score-${scoreTone(center.structuralPowerScore)}"><strong>${Number(center.structuralPowerScore).toFixed(1)}</strong><span>/ 100</span></div></div>
        <p><strong>Why it ranks:</strong> ${esc((center.mechanisms || []).slice(0, 3).join(' · '))}</p>
        <div class="score-track"><i style="width:${Math.max(0, Math.min(100, Number(center.structuralPowerScore)))}%"></i></div>
        <div class="dimensions">${dimensions}</div>
        <div class="indicator-row"><span>Veto ${esc(center.indicators?.vetoCapacity ?? '—')}</span><span>Opacity ${esc(center.indicators?.opacity ?? '—')}</span><span>Replaceability ${esc(center.indicators?.replaceability ?? '—')}</span><span>Permanence ${esc(center.indicators?.institutionalPermanence ?? '—')}</span></div>
        <details><summary>Open full assessment</summary>
          <div class="assessment-grid">
            <section><h4>Mechanisms of power</h4>${list(center.mechanisms)}</section>
            <section><h4>What it can stop</h4>${list(center.canStop)}</section>
            <section><h4>Dependencies</h4>${list(center.dependencies)}</section>
            <section><h4>Constraints</h4>${list(center.constraints)}</section>
            <section><h4>Replacement test</h4><p>${esc(center.replacementTest)}</p></section>
            <section><h4>Strongest counterargument</h4><p>${esc(center.strongestCounterargument)}</p></section>
            <section><h4>Evidence that could raise rank</h4>${list(center.raiseEvidence)}</section>
            <section><h4>Evidence that could lower rank</h4>${list(center.lowerEvidence)}</section>
          </div>
          <div class="source-strip"><strong>Source ledger</strong><br>${sourceLinks(center.sourceIds)}</div>
        </details>
      </article>`;
    }).join('');
  }

  function renderMap() {
    const host = $('#btc-map');
    const detail = $('#btc-map-detail');
    if (!host || !detail) return;
    const centers = filteredCenters();
    const allowed = new Set(centers.map(center => center.id));
    const relations = (model.relationships || []).filter(edge => allowed.has(edge.source) && allowed.has(edge.target) && classificationVisible(edge.classification));
    if (!centers.length) { host.innerHTML = '<p>No nodes match the current filters.</p>'; detail.innerHTML = ''; return; }

    const width = 980, height = 610, cx = width / 2, cy = height / 2;
    const radius = Math.min(width, height) * .39;
    const positions = new Map();
    centers.forEach((center, index) => {
      const angle = (-Math.PI / 2) + (index / centers.length) * Math.PI * 2;
      positions.set(center.id, { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
    });
    const edgeMarkup = relations.map(edge => {
      const a = positions.get(edge.source), b = positions.get(edge.target);
      const dash = edge.classification === 'documented_fact' || edge.classification === 'official_allegation' ? '' : edge.classification === 'speculative_hypothesis' ? '2 10' : '10 7';
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke-width="${1 + Number(edge.strength || 50) / 50}" stroke-dasharray="${dash}" data-edge="${esc(edge.source)}:${esc(edge.target)}"><title>${esc(edge.type)} — ${esc(edge.description)}</title></line>`;
    }).join('');
    const nodeMarkup = centers.map(center => {
      const point = positions.get(center.id);
      const size = 23 + Number(center.structuralPowerScore || 0) / 7;
      return `<g class="map-node${state.selectedNode === center.id ? ' selected' : ''}" data-node="${esc(center.id)}" transform="translate(${point.x} ${point.y})" tabindex="0" role="button" aria-label="Open ${esc(center.name)}">
        <circle r="${size}"/><text y="4" text-anchor="middle">${esc(center.rank)}</text><text class="node-label" y="${size + 18}" text-anchor="middle">${esc(center.shortName)}</text>
      </g>`;
    }).join('');
    host.innerHTML = `<svg class="curtain-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Structural power relationship map"><g class="map-edges">${edgeMarkup}</g><g class="map-nodes">${nodeMarkup}</g></svg><p class="map-legend"><span class="solid">Documented</span><span class="dashed">Supported inference</span><span class="dotted">Speculation</span></p>`;

    const activate = id => {
      state.selectedNode = id;
      const center = (model.powerCenters || []).find(item => item.id === id);
      if (!center) return;
      detail.innerHTML = `<span class="label">Selected power center</span><h3>#${center.rank} ${esc(center.name)}</h3>${badge(center.classification)}<p><strong>Score:</strong> ${Number(center.structuralPowerScore).toFixed(1)} · <strong>Confidence:</strong> ${esc(center.confidence)}</p><p>${esc(center.replacementTest)}</p><p><strong>Primary chokepoints:</strong> ${esc((center.chokepoints || []).join(' · '))}</p><p><strong>Counterargument:</strong> ${esc(center.strongestCounterargument)}</p>`;
      renderMap();
    };
    host.querySelectorAll('[data-node]').forEach(node => {
      node.addEventListener('click', () => activate(node.dataset.node));
      node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(node.dataset.node); } });
    });
  }

  function renderChokepoints() {
    const target = $('#btc-chokepoints');
    if (!target) return;
    const items = (model.chokepoints || []).filter(item => classificationVisible(item.classification));
    target.innerHTML = items.map(item => `<article class="card redline"><div class="eyebrow">Chokepoint</div><h3>${esc(item.name)}</h3>${badge(item.classification)}<p><strong>Concentration:</strong> ${esc(item.concentration)}</p><p><strong>Owners / power centers:</strong> ${esc((item.owners || []).map(id => model.powerCenters.find(center => center.id === id)?.shortName || id).join(', '))}</p><p><strong>Operators:</strong> ${esc((item.operators || []).join(', '))}</p><p><strong>Regulators:</strong> ${esc((item.regulators || []).join(', '))}</p><p><strong>Alternatives:</strong> ${esc(item.alternatives)}</p><div class="source-strip">${sourceLinks(item.sourceIds)}</div></article>`).join('');
  }

  function renderVetoTable() {
    const target = $('#btc-veto-body');
    if (!target) return;
    target.innerHTML = filteredCenters().map(center => `<tr><td><strong>#${center.rank} ${esc(center.shortName)}</strong></td><td>${esc((center.canStop || []).slice(0, 3).join('; '))}</td><td>${esc(center.replacementTest)}</td><td>${esc((center.constraints || []).slice(0, 3).join('; '))}</td></tr>`).join('');
  }

  function renderHypotheses() {
    const target = $('#btc-hypotheses');
    if (!target) return;
    const hypotheses = (model.hypotheses || []).filter(item => classificationVisible(item.classification));
    target.innerHTML = hypotheses.map(item => `<article class="card redline"><h3>${esc(item.title)}</h3>${badge(item.classification)} <span class="pill">${esc(item.confidence)} confidence</span><p>${esc(item.claim)}</p><div class="assessment-grid"><section><h4>Supporting evidence</h4>${list(item.supportingEvidence)}</section><section><h4>Strongest contrary evidence</h4>${list(item.contraryEvidence)}</section><section><h4>Alternative explanations</h4>${list(item.alternatives)}</section><section><h4>What would confirm it</h4>${list(item.confirmTests)}</section><section><h4>What would weaken it</h4>${list(item.weakenTests)}</section></div><div class="source-strip">${sourceLinks(item.sourceIds)}</div></article>`).join('') || '<p>No hypotheses are visible in this mode.</p>';
  }

  function renderUnsupported() {
    const target = $('#btc-unsupported');
    if (!target) return;
    target.innerHTML = (model.unsupportedClaims || []).filter(item => classificationVisible(item.classification)).map(item => `<article class="card"><h3>${esc(item.claim)}</h3>${badge(item.classification)}<p><strong>Current assessment:</strong> ${esc(item.reason)}</p><p><strong>What could change it:</strong> ${esc(item.whatWouldChange)}</p></article>`).join('') || '<p>Unsupported and rejected claims are hidden in this viewing mode.</p>';
  }

  function renderMissing() {
    const target = $('#btc-missing');
    if (!target) return;
    target.innerHTML = (model.missingRecords || []).map(item => `<article class="card"><span class="label">${esc(item.priority)} priority</span><h3>${esc(item.record)}</h3><p>${esc(item.why)}</p></article>`).join('');
  }

  function renderSources() {
    const target = $('#btc-sources');
    if (!target) return;
    target.innerHTML = (model.sources || []).map(source => `<article class="source-card"><span class="label">Tier ${esc(source.tier)} · ${esc(source.date || 'undated')}</span><h3><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a></h3><p><strong>${esc(source.publisher)}</strong></p><p><strong>Establishes:</strong> ${esc(source.establishes)}</p><p><strong>Does not establish:</strong> ${esc(source.doesNotEstablish)}</p></article>`).join('');
  }

  function renderChangeLog() {
    const target = $('#btc-changelog');
    if (!target) return;
    target.innerHTML = (model.changeLog || []).map(item => `<article class="card"><span class="label">${esc(item.date)} · ${esc(slugLabel(item.type))}</span><p>${esc(item.summary)}</p></article>`).join('');
  }

  function renderAll() {
    renderRanking();
    renderMap();
    renderChokepoints();
    renderVetoTable();
    renderHypotheses();
    renderUnsupported();
  }

  async function init() {
    setupModeControls();
    try {
      const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      model = await response.json();
      populateFilters();
      renderHeader();
      renderAll();
      renderMissing();
      renderSources();
      renderChangeLog();
    } catch (error) {
      const ranking = $('#btc-ranking');
      if (ranking) ranking.innerHTML = `<article class="card redline"><h3>Structural power data unavailable</h3><p>${esc(error.message)}</p><p>The page fails closed rather than inventing a ranking without its evidence package.</p></article>`;
      console.error('Behind the Curtain failed to load', error);
    }
  }

  init();
})();
