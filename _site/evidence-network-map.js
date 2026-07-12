(() => {
  const q = selector => document.querySelector(selector);
  const map = q('#evidence-network-map');
  const status = q('#map-status');
  const details = q('#map-details');
  const controls = {
    query: q('#map-search'),
    mode: q('#map-mode'),
    relationship: q('#map-relationship'),
    grade: q('#map-grade'),
    factualStatus: q('#map-factual-status'),
    entityType: q('#map-entity-type'),
    review: q('#map-review'),
    confidence: q('#map-confidence'),
    from: q('#map-date-from'),
    to: q('#map-date-to')
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const human = value => String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const formatDate = value => { const date = new Date(value || 0); return Number.isFinite(date.getTime()) && date.getTime() > 0 ? date.toLocaleString() : 'Date unavailable'; };
  let graph;
  let cy;
  let layoutIndex = 0;
  let pathStart = '';
  let pathEnd = '';
  const layouts = ['cose', 'concentric', 'breadthfirst', 'circle', 'grid'];

  function setStatus(text, kind = '') { status.textContent = text; status.className = `map-status ${kind}`.trim(); }
  function addOption(select, value, label) { const option = document.createElement('option'); option.value = value; option.textContent = label; select.appendChild(option); }
  function populateFilters() {
    (graph.filters?.relationshipTypes || []).forEach(value => addOption(controls.relationship, value, `${human(value)} (${graph.countsByRelationship?.[value] || 0})`));
    (graph.filters?.grades || []).forEach(value => addOption(controls.grade, value, `Grade ${value}`));
    (graph.filters?.factualStatuses || []).forEach(value => addOption(controls.factualStatus, value, human(value)));
    (graph.filters?.entityTypes || []).forEach(value => addOption(controls.entityType, value, `${human(value)} (${graph.countsByEntity?.[value] || 0})`));
    (graph.filters?.reviewStatuses || []).forEach(value => addOption(controls.review, value, human(value)));
  }
  function readUrl() {
    const params = new URLSearchParams(location.search);
    controls.query.value = params.get('q') || '';
    controls.mode.value = params.get('mode') || 'core';
    controls.relationship.value = params.get('relationship') || '';
    controls.grade.value = params.get('grade') || '';
    controls.factualStatus.value = params.get('status') || '';
    controls.entityType.value = params.get('entity') || '';
    controls.review.value = params.get('review') || '';
    controls.confidence.value = params.get('confidence') || '0';
    controls.from.value = params.get('from') || '';
    controls.to.value = params.get('to') || '';
    pathStart = params.get('pathStart') || '';
    pathEnd = params.get('pathEnd') || '';
  }
  function writeUrl() {
    const params = new URLSearchParams();
    const values = {
      q: controls.query.value.trim(), mode: controls.mode.value, relationship: controls.relationship.value,
      grade: controls.grade.value, status: controls.factualStatus.value, entity: controls.entityType.value,
      review: controls.review.value, confidence: controls.confidence.value, from: controls.from.value, to: controls.to.value,
      pathStart, pathEnd
    };
    for (const [key, value] of Object.entries(values)) if (value && !(key === 'mode' && value === 'core') && !(key === 'confidence' && value === '0')) params.set(key, value);
    history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}${location.hash}`);
  }
  function modeMatches(data) {
    const mode = controls.mode.value || 'core';
    if (mode === 'all') return true;
    if (mode === 'official') return Boolean(data.official);
    if (mode === 'reviewed') return Boolean(data.reviewed);
    if (mode === 'mentions') return Boolean(data.weakMention);
    return Boolean(data.core);
  }
  function dateMatches(data) {
    if (!controls.from.value && !controls.to.value) return true;
    const time = new Date(data.date || 0).getTime();
    if (!Number.isFinite(time) || time <= 0) return false;
    if (controls.from.value && time < new Date(`${controls.from.value}T00:00:00Z`).getTime()) return false;
    if (controls.to.value && time > new Date(`${controls.to.value}T23:59:59Z`).getTime()) return false;
    return true;
  }
  function edgeMatches(edge) {
    const data = edge.data();
    if (!modeMatches(data)) return false;
    if (controls.relationship.value && data.relationshipType !== controls.relationship.value) return false;
    if (controls.grade.value && data.grade !== controls.grade.value) return false;
    if (controls.factualStatus.value && data.factualStatus !== controls.factualStatus.value) return false;
    if (controls.review.value && data.reviewStatus !== controls.review.value) return false;
    if (Number(data.confidence || 0) < Number(controls.confidence.value || 0)) return false;
    if (!dateMatches(data)) return false;
    const entityType = controls.entityType.value;
    if (entityType && edge.source().data('entityType') !== entityType && edge.target().data('entityType') !== entityType) return false;
    const term = controls.query.value.trim().toLowerCase();
    if (!term) return true;
    const source = edge.source().data();
    const target = edge.target().data();
    return [source.label,target.label,(source.aliases||[]).join(' '),(target.aliases||[]).join(' '),data.relationshipType,data.label,data.sourceTitle,data.establishes,data.doesNotEstablish,data.factualStatus].join(' ').toLowerCase().includes(term);
  }
  function applyFilters(updateUrl = true) {
    if (!cy) return;
    cy.elements().removeClass('path-highlight path-endpoint');
    cy.edges().forEach(edge => edge.style('display', edgeMatches(edge) ? 'element' : 'none'));
    cy.nodes().forEach(node => {
      const connected = node.connectedEdges().some(edge => edge.style('display') !== 'none');
      node.style('display', connected ? 'element' : 'none');
    });
    const visibleEdges = cy.edges().filter(edge => edge.style('display') !== 'none').length;
    const visibleNodes = cy.nodes().filter(node => node.style('display') !== 'none').length;
    q('#map-visible-relationships').textContent = visibleEdges;
    q('#map-visible-entities').textContent = visibleNodes;
    setStatus(`${visibleEdges} sourced relationship${visibleEdges === 1 ? '' : 's'} across ${visibleNodes} entities. Select a node or line to inspect the evidence.`, 'ok');
    if (updateUrl) writeUrl();
    if (pathStart && pathEnd) findPath(false);
  }
  function nodeDetails(data) {
    const refs = (data.evidenceRefs || []).slice(0, 3).map(ref => `<li><a href="${escapeHtml(ref.sourceUrl)}" rel="noopener">${escapeHtml(ref.sourceTitle)}</a> · Grade ${escapeHtml(ref.evidenceGrade)} · ${escapeHtml(human(ref.factualStatus))}</li>`).join('');
    details.innerHTML = `<span class="label">${escapeHtml(human(data.entityType))} · Grade ${escapeHtml(data.grade || 'C')} · ${escapeHtml(human(data.reviewStatus))}</span>
      <h3>${escapeHtml(data.label || data.rawId)}</h3>
      ${(data.aliases||[]).length ? `<p><strong>Aliases:</strong> ${escapeHtml(data.aliases.join(' · '))}</p>` : ''}
      ${(data.roles||[]).length ? `<p><strong>Roles:</strong> ${escapeHtml(data.roles.join(' · '))}</p>` : ''}
      <p><strong>Connections in registry:</strong> ${escapeHtml(data.connections || 0)} · <strong>Public sources:</strong> ${escapeHtml(data.sourceCount || 0)}</p>
      ${data.firstSeen ? `<p><strong>Observed:</strong> ${escapeHtml(formatDate(data.firstSeen))} to ${escapeHtml(formatDate(data.lastSeen || data.firstSeen))}</p>` : ''}
      ${refs ? `<h4>Evidence references</h4><ul>${refs}</ul>` : ''}
      <p><strong>Evidence boundary:</strong> ${escapeHtml(data.boundary || graph.boundary)}</p>
      <div class="map-path-actions"><button class="btn alt" type="button" data-path-action="start" data-node-id="${escapeHtml(data.id)}">Set path start</button><button class="btn alt" type="button" data-path-action="end" data-node-id="${escapeHtml(data.id)}">Set path end</button></div>
      <div class="cta-row small"><a class="btn" href="${escapeHtml(data.route)}">Open entity record</a><a class="btn alt" href="search.html?q=${encodeURIComponent(data.label || '')}">Search evidence</a></div>`;
  }
  function edgeDetails(data) {
    details.innerHTML = `<span class="label">${escapeHtml(human(data.relationshipType))} · Grade ${escapeHtml(data.grade)} · ${escapeHtml(human(data.factualStatus))}</span>
      <h3>${escapeHtml(cy.getElementById(data.source).data('label'))} → ${escapeHtml(data.label)} → ${escapeHtml(cy.getElementById(data.target).data('label'))}</h3>
      <p><strong>Source:</strong> <a href="${escapeHtml(data.sourceUrl)}" rel="noopener">${escapeHtml(data.sourceTitle)}</a></p>
      <p><strong>Date:</strong> ${escapeHtml(formatDate(data.publicationDate || data.retrievalDate || data.date))}</p>
      <p><strong>What the record establishes:</strong> ${escapeHtml(data.establishes)}</p>
      <p><strong>What it does not establish:</strong> ${escapeHtml(data.doesNotEstablish)}</p>
      <p><strong>Review:</strong> ${escapeHtml(human(data.reviewStatus))} · <strong>Extraction:</strong> ${escapeHtml(human(data.extractionMethod))} · <strong>Confidence:</strong> ${escapeHtml(Number(data.confidence || 0).toFixed(2))}</p>
      <div class="cta-row small"><a class="btn" href="${escapeHtml(data.sourceUrl)}" rel="noopener">Open primary source</a><a class="btn alt" href="${escapeHtml(data.route)}">Open relationship record</a></div>`;
  }
  function renderSelection(element) {
    if (element.isEdge()) edgeDetails(element.data()); else nodeDetails(element.data());
  }
  function findPath(updateUrl = true) {
    if (!cy || !pathStart || !pathEnd || cy.getElementById(pathStart).empty() || cy.getElementById(pathEnd).empty()) return;
    cy.elements().removeClass('path-highlight path-endpoint');
    const visible = cy.elements().filter(element => element.style('display') !== 'none');
    const result = visible.aStar({ root: `#${CSS.escape(pathStart)}`, goal: `#${CSS.escape(pathEnd)}`, directed: false });
    if (!result.found) { setStatus('No documented path is visible under the current filters.', 'error'); return; }
    result.path.addClass('path-highlight');
    cy.getElementById(pathStart).addClass('path-endpoint');
    cy.getElementById(pathEnd).addClass('path-endpoint');
    cy.fit(result.path, 70);
    setStatus(`Documented path highlighted: ${Math.max(0, Math.floor(result.path.length / 2))} relationship step${result.path.length > 3 ? 's' : ''}.`, 'ok');
    if (updateUrl) writeUrl();
  }
  function clearPath() { pathStart = ''; pathEnd = ''; cy?.elements().removeClass('path-highlight path-endpoint'); writeUrl(); applyFilters(false); }
  function init() {
    if (typeof cytoscape !== 'function') throw new Error('Cytoscape.js did not load.');
    cy = cytoscape({
      container: map,
      elements: [...graph.elements.nodes, ...graph.elements.edges],
      minZoom: .08, maxZoom: 4, wheelSensitivity: .16,
      style: [
        { selector: 'node', style: { label: 'data(label)', 'font-size': 9, 'text-wrap': 'wrap', 'text-max-width': 120, 'text-valign': 'bottom', 'text-margin-y': 8, color: '#f3e6bd', 'background-color': '#5f512f', 'border-color': '#d8b56a', 'border-width': 1.5, width: 'mapData(weight,24,94,24,68)', height: 'mapData(weight,24,94,24,68)' } },
        { selector: 'node[entityType = "Person"]', style: { shape: 'ellipse', 'background-color': '#7d642f' } },
        { selector: 'node[entityType = "GovernmentAgency"]', style: { shape: 'round-rectangle', 'background-color': '#315f83', 'border-color': '#9bc9ff' } },
        { selector: 'node[entityType = "Company"], node[entityType = "Contractor"]', style: { shape: 'diamond', 'background-color': '#64517b', 'border-color': '#cbb3ef' } },
        { selector: 'node[entityType = "Document"], node[entityType = "Finding"]', style: { shape: 'rectangle', 'background-color': '#6f3f2a' } },
        { selector: 'node[entityType = "CourtCase"], node[entityType = "Investigation"]', style: { shape: 'hexagon', 'background-color': '#7b3838' } },
        { selector: 'edge', style: { label: 'data(label)', 'font-size': 7, color: '#c8b98c', 'text-background-color': '#050505', 'text-background-opacity': .72, 'text-background-padding': 2, 'curve-style': 'bezier', 'line-color': '#756a50', 'target-arrow-color': '#756a50', 'target-arrow-shape': 'triangle', width: 1.2, opacity: .7 } },
        { selector: 'edge[grade = "A"]', style: { 'line-color': '#e6c45d', 'target-arrow-color': '#e6c45d', width: 3, opacity: .95 } },
        { selector: 'edge[grade = "B"]', style: { 'line-color': '#9cc9e8', 'target-arrow-color': '#9cc9e8', width: 2 } },
        { selector: 'edge[weakMention]', style: { 'line-style': 'dashed', 'line-color': '#777', 'target-arrow-color': '#777', opacity: .42, width: 1 } },
        { selector: '.path-highlight', style: { 'line-color': '#ffdf78', 'target-arrow-color': '#ffdf78', 'background-color': '#b38a24', opacity: 1, width: 5, 'z-index': 9999 } },
        { selector: '.path-endpoint', style: { 'border-color': '#fff', 'border-width': 5 } },
        { selector: ':selected', style: { 'border-color': '#fff', 'border-width': 4 } }
      ],
      layout: { name: 'cose', animate: false, randomize: true, nodeRepulsion: 170000, idealEdgeLength: 110, gravity: .32, numIter: 1100 }
    });
    cy.on('tap', 'node, edge', event => renderSelection(event.target));
    cy.on('tap', event => { if (event.target === cy) details.innerHTML = '<span class="label">Evidence boundary</span><h3>Select an entity or relationship</h3><p>Every visible line keeps its source, date, grade, status, established fact and limitation attached.</p>'; });
    applyFilters(false);
    cy.fit(cy.elements().filter(element => element.style('display') !== 'none'), 45);
  }
  async function load() {
    setStatus('Loading structured evidence graph…', 'pending');
    try {
      const response = await fetch('/data/evidence-network-map.json', { cache: 'no-store', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      graph = await response.json();
      if (!graph?.elements?.nodes?.length || !graph?.elements?.edges?.length) throw new Error('No sourced relationships were generated.');
      populateFilters(); readUrl(); init();
      q('#map-total-relationships').textContent = graph.totals.relationships;
      q('#map-total-entities').textContent = graph.totals.entities;
      q('#map-total-official').textContent = graph.totals.officialRelationships;
      q('#map-generated').textContent = formatDate(graph.generatedAt);
      if (pathStart && pathEnd) findPath(false);
    } catch (error) {
      setStatus(`Evidence map unavailable: ${error.message}`, 'error');
      map.innerHTML = '<div class="map-fallback"><h3>Interactive view unavailable</h3><p>The relationship registry, source links and public CSV remain available.</p><div class="cta-row"><a class="btn" href="relationship-registry.html">Relationship Registry</a><a class="btn alt" href="downloads/evidence-network-map.csv">Public CSV</a></div></div>';
    }
  }

  Object.values(controls).forEach(control => control?.addEventListener(control === controls.query ? 'input' : 'change', () => applyFilters()));
  q('#map-reset').onclick = () => { controls.query.value=''; controls.mode.value='core'; controls.relationship.value=''; controls.grade.value=''; controls.factualStatus.value=''; controls.entityType.value=''; controls.review.value=''; controls.confidence.value='0'; controls.from.value=''; controls.to.value=''; clearPath(); cy?.fit(cy.elements().filter(element => element.style('display') !== 'none'), 45); };
  q('#map-fit').onclick = () => cy?.fit(cy.elements().filter(element => element.style('display') !== 'none'), 45);
  q('#map-layout').onclick = () => { if (!cy) return; layoutIndex = (layoutIndex + 1) % layouts.length; const name = layouts[layoutIndex]; cy.layout({ name, animate: false, fit: true, padding: 45 }).run(); q('#map-layout').textContent = `Layout: ${human(name)}`; };
  q('#map-share').onclick = async () => { writeUrl(); try { await navigator.clipboard.writeText(location.href); setStatus('This evidence-map view was copied as a shareable URL.', 'ok'); } catch { setStatus('The view is encoded in the current URL and can be copied from the address bar.', 'ok'); } };
  q('#map-clear-path').onclick = clearPath;
  details.addEventListener('click', event => { const button = event.target.closest('[data-path-action]'); if (!button) return; if (button.dataset.pathAction === 'start') pathStart = button.dataset.nodeId; else pathEnd = button.dataset.nodeId; writeUrl(); if (pathStart && pathEnd) findPath(); else setStatus(`${button.dataset.pathAction === 'start' ? 'Path start' : 'Path end'} selected. Select the other endpoint.`, 'ok'); });
  load();
})();
