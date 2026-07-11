(() => {
  const $ = selector => document.querySelector(selector);
  const mapElement = $('#evidence-network-map');
  const statusElement = $('#map-status');
  const detailsElement = $('#map-details');
  const searchInput = $('#map-search');
  const laneSelect = $('#map-lane');
  const gradeSelect = $('#map-grade');
  const statusSelect = $('#map-record-status');
  const resetButton = $('#map-reset');
  const fitButton = $('#map-fit');
  const layoutButton = $('#map-layout');
  const saveButton = $('#map-save-view');
  const savedViews = $('#saved-views');
  let graph = null;
  let cy = null;
  let layoutIndex = 0;
  const layoutNames = ['cose', 'concentric', 'breadthfirst', 'circle'];
  const STORAGE_KEY = 'matrix-evidence-map-views-v1';

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function setStatus(message, type = '') {
    statusElement.textContent = message;
    statusElement.className = `map-status ${type}`.trim();
  }

  function labelStatus(value) {
    return String(value || 'record-update').replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  }

  function option(select, value, label) {
    const item = document.createElement('option');
    item.value = value;
    item.textContent = label;
    select.appendChild(item);
  }

  function populateFilters() {
    for (const lane of graph.filters?.lanes || []) option(laneSelect, lane, labelStatus(lane));
    for (const grade of graph.filters?.grades || []) option(gradeSelect, grade, `Grade ${grade}`);
    for (const item of graph.filters?.statuses || []) option(statusSelect, item, labelStatus(item));
  }

  function nodeMatches(node) {
    const data = node.data();
    if (data.type !== 'finding') {
      const lane = laneSelect.value;
      if (lane && data.type === 'source' && data.lane !== lane) return false;
      if (lane && data.type === 'lane' && data.rawId !== lane) return false;
      return true;
    }
    const query = searchInput.value.trim().toLowerCase();
    const lane = laneSelect.value;
    const grade = gradeSelect.value;
    const status = statusSelect.value;
    if (lane && data.lane !== lane) return false;
    if (grade && data.grade !== grade) return false;
    if (status && data.status !== status) return false;
    if (query) {
      const haystack = [data.label, data.description, data.summary, data.mechanism, data.implication, data.sourceLabel, (data.indicators || []).join(' ')].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  }

  function applyFilters() {
    if (!cy) return;
    const visibleFindings = new Set();
    cy.nodes().forEach(node => {
      const visible = nodeMatches(node);
      node.style('display', visible ? 'element' : 'none');
      if (visible && node.data('type') === 'finding') visibleFindings.add(node.id());
    });

    cy.edges().forEach(edge => {
      const sourceVisible = edge.source().style('display') !== 'none';
      const targetVisible = edge.target().style('display') !== 'none';
      edge.style('display', sourceVisible && targetVisible ? 'element' : 'none');
    });

    // Hide source and lane nodes that no longer connect to a visible finding.
    for (const type of ['source', 'lane']) {
      cy.nodes(`[type = "${type}"]`).forEach(node => {
        const connectedVisible = node.connectedEdges().some(edge => edge.style('display') !== 'none');
        const directLaneSelection = type === 'lane' && laneSelect.value === node.data('rawId');
        node.style('display', connectedVisible || directLaneSelection || (!laneSelect.value && !gradeSelect.value && !statusSelect.value && !searchInput.value.trim()) ? 'element' : 'none');
      });
    }

    cy.edges().forEach(edge => {
      edge.style('display', edge.source().style('display') !== 'none' && edge.target().style('display') !== 'none' ? 'element' : 'none');
    });

    const count = cy.nodes('[type = "finding"]').filter(node => node.style('display') !== 'none').length;
    setStatus(`${count} evidence finding${count === 1 ? '' : 's'} shown. Select a node to inspect its source, conclusion and boundary.`, 'ok');
  }

  function detailHtml(data) {
    const route = data.route ? `<a class="btn" href="${escapeHtml(data.route)}" rel="noopener">Open source or record</a>` : '';
    const nextRecords = Array.isArray(data.nextRecords) && data.nextRecords.length
      ? `<h4>Next records</h4><ul>${data.nextRecords.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      : '';
    const indicators = Array.isArray(data.indicators) && data.indicators.length
      ? `<p><strong>Indicators:</strong> ${escapeHtml(data.indicators.join(', '))}</p>`
      : '';
    return `<span class="label">${escapeHtml(labelStatus(data.type))}${data.grade ? ` · Grade ${escapeHtml(data.grade)}` : ''}${data.status ? ` · ${escapeHtml(labelStatus(data.status))}` : ''}</span>
      <h3>${escapeHtml(data.label || data.rawId || 'Evidence node')}</h3>
      ${data.sourceLabel ? `<p><strong>Source:</strong> ${escapeHtml(data.sourceLabel)}</p>` : ''}
      ${data.published ? `<p><strong>Published:</strong> ${escapeHtml(new Date(data.published).toLocaleString())}</p>` : ''}
      ${data.description ? `<p><strong>Conclusion:</strong> ${escapeHtml(data.description)}</p>` : ''}
      ${data.mechanism ? `<p><strong>Mechanism:</strong> ${escapeHtml(data.mechanism)}</p>` : ''}
      ${data.implication ? `<p><strong>Implication:</strong> ${escapeHtml(data.implication)}</p>` : ''}
      ${data.boundary ? `<p><strong>Evidence boundary:</strong> ${escapeHtml(data.boundary)}</p>` : ''}
      ${indicators}${nextRecords}<div class="cta-row small">${route}<a class="btn alt" href="search.html?q=${encodeURIComponent(data.label || '')}">Search connections</a></div>`;
  }

  function renderSavedViews() {
    let views = [];
    try { views = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { views = []; }
    savedViews.innerHTML = '';
    if (!views.length) {
      savedViews.innerHTML = '<p class="mini">No saved views on this device.</p>';
      return;
    }
    for (const view of views.slice(0, 12)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn alt saved-view';
      button.textContent = view.name;
      button.addEventListener('click', () => {
        searchInput.value = view.query || '';
        laneSelect.value = view.lane || '';
        gradeSelect.value = view.grade || '';
        statusSelect.value = view.status || '';
        applyFilters();
        cy.fit(cy.elements(':visible'), 40);
      });
      savedViews.appendChild(button);
    }
  }

  function saveView() {
    const name = prompt('Name this evidence-map view:');
    if (!name) return;
    let views = [];
    try { views = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { views = []; }
    views.unshift({
      name: name.trim().slice(0, 60),
      query: searchInput.value.trim(),
      lane: laneSelect.value,
      grade: gradeSelect.value,
      status: statusSelect.value,
      savedAt: new Date().toISOString()
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views.slice(0, 12)));
    renderSavedViews();
    setStatus('View saved on this device.', 'ok');
  }

  function initialiseMap() {
    if (typeof window.cytoscape !== 'function') {
      setStatus('The interactive map library could not be loaded. The evidence data and source ledger remain available below.', 'error');
      mapElement.innerHTML = '<div class="map-fallback"><h3>Interactive map unavailable</h3><p>Open the source ledger or download the evidence CSV instead.</p><div class="cta-row"><a class="btn" href="investigation-source-ledger.html">Source Ledger</a><a class="btn alt" href="downloads/evidence-network-map.csv">Download CSV</a></div></div>';
      return;
    }

    cy = window.cytoscape({
      container: mapElement,
      elements: [...(graph.elements?.nodes || []), ...(graph.elements?.edges || [])],
      minZoom: 0.15,
      maxZoom: 3.5,
      wheelSensitivity: 0.17,
      style: [
        { selector: 'node', style: { 'label': 'data(label)', 'font-size': 10, 'text-wrap': 'wrap', 'text-max-width': 120, 'text-valign': 'bottom', 'text-margin-y': 8, 'color': '#f3e6bd', 'background-color': '#6f5826', 'border-color': '#d8b56a', 'border-width': 1.5, 'width': 'mapData(weight, 20, 90, 24, 64)', 'height': 'mapData(weight, 20, 90, 24, 64)' } },
        { selector: 'node[type = "lane"]', style: { 'shape': 'round-rectangle', 'background-color': '#8b1e1e', 'border-color': '#ffb0a5', 'font-size': 12, 'font-weight': 'bold', 'width': 76, 'height': 50 } },
        { selector: 'node[type = "source"]', style: { 'shape': 'diamond', 'background-color': '#2e4f78', 'border-color': '#9bc9ff', 'width': 42, 'height': 42 } },
        { selector: 'node[grade = "A"]', style: { 'background-color': '#856b2f', 'border-width': 3 } },
        { selector: 'node[status = "established-wrongdoing"]', style: { 'background-color': '#9d2323', 'border-color': '#ffd0c8', 'border-width': 4 } },
        { selector: 'node[status = "official-enforcement"]', style: { 'background-color': '#7c3f16', 'border-color': '#ffd38e', 'border-width': 3 } },
        { selector: 'edge', style: { 'curve-style': 'bezier', 'line-color': '#665b42', 'target-arrow-color': '#665b42', 'target-arrow-shape': 'triangle', 'width': 1.2, 'opacity': 0.75 } },
        { selector: 'edge[type = "supports"]', style: { 'line-color': '#b28b3c', 'target-arrow-color': '#b28b3c', 'width': 1.8 } },
        { selector: ':selected', style: { 'overlay-color': '#d8b56a', 'overlay-opacity': 0.18, 'border-color': '#ffffff', 'border-width': 4 } }
      ],
      layout: { name: 'cose', animate: false, randomize: true, nodeRepulsion: 140000, idealEdgeLength: 95, edgeElasticity: 120, gravity: 0.45, numIter: 900 }
    });

    cy.on('tap', 'node', event => {
      detailsElement.innerHTML = detailHtml(event.target.data());
    });
    cy.on('tap', event => {
      if (event.target === cy) detailsElement.innerHTML = '<span class="label">Evidence boundary</span><h3>Select a node</h3><p>A line identifies a defined source or classification relationship. It does not prove guilt or hidden coordination.</p>';
    });

    applyFilters();
    cy.fit(undefined, 35);
  }

  async function load() {
    setStatus('Loading evidence map…', 'pending');
    try {
      const response = await fetch('/data/evidence-network-map.json', { cache: 'no-store', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      graph = await response.json();
      if (!graph?.elements?.nodes?.length) throw new Error('No evidence nodes were generated.');
      populateFilters();
      initialiseMap();
      $('#map-generated').textContent = graph.generatedAt ? new Date(graph.generatedAt).toLocaleString() : 'Unknown';
      $('#map-total-findings').textContent = graph.totals?.findings ?? 0;
      $('#map-total-sources').textContent = graph.totals?.sources ?? 0;
      $('#map-total-lanes').textContent = graph.totals?.lanes ?? 0;
    } catch (error) {
      setStatus(`Evidence map could not be loaded: ${error.message}`, 'error');
      mapElement.innerHTML = '<div class="map-fallback"><h3>Map data unavailable</h3><p>The source ledger and investigation conclusions are still available.</p><div class="cta-row"><a class="btn" href="investigation-source-ledger.html">Source Ledger</a><a class="btn alt" href="daily-investigation-conclusions.html">Daily Conclusions</a></div></div>';
    }
  }

  for (const control of [searchInput, laneSelect, gradeSelect, statusSelect]) {
    control.addEventListener(control === searchInput ? 'input' : 'change', applyFilters);
  }
  resetButton.addEventListener('click', () => {
    searchInput.value = '';
    laneSelect.value = '';
    gradeSelect.value = '';
    statusSelect.value = '';
    applyFilters();
    if (cy) cy.fit(cy.elements(':visible'), 40);
  });
  fitButton.addEventListener('click', () => cy && cy.fit(cy.elements(':visible'), 40));
  layoutButton.addEventListener('click', () => {
    if (!cy) return;
    layoutIndex = (layoutIndex + 1) % layoutNames.length;
    const name = layoutNames[layoutIndex];
    cy.layout({ name, animate: name !== 'cose', fit: true, padding: 35 }).run();
    layoutButton.textContent = `Layout: ${labelStatus(name)}`;
  });
  saveButton.addEventListener('click', saveView);
  renderSavedViews();
  load();
})();
