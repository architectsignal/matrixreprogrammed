(() => {
  'use strict';

  const TIER_RANK = {
    free: 0,
    supporter: 1,
    matrix_supporter: 1,
    intelligence: 2,
    intelligence_member: 2,
    matrix_intelligence_member: 2,
    research: 3,
    research_pro: 3,
    matrix_research_pro: 3
  };

  const normaliseTier = value => String(value || 'free').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const tierRank = value => TIER_RANK[normaliseTier(value)] || 0;
  const byId = (root, id) => root.querySelector(`#${CSS.escape(id)}`);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));

  async function resolveMemberRank() {
    try {
      const response = await fetch('/api/member/me', {
        headers: { accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin'
      });
      if (!response.ok) return 0;
      const data = await response.json();
      if (!data.authenticated || data.paidAccessEnabled !== true) return 0;
      return tierRank(data.subscription?.tier || data.member?.tier || 'free');
    } catch (_) {
      return 0;
    }
  }

  function graphStyle() {
    return [
      {
        selector: 'node',
        style: {
          label: 'data(label)',
          'font-size': 10,
          'font-weight': 700,
          color: '#f7efdb',
          'text-wrap': 'wrap',
          'text-max-width': 105,
          'text-valign': 'center',
          'text-halign': 'center',
          'background-color': '#4d1111',
          'border-width': 1.5,
          'border-color': '#d8b56a',
          width: 58,
          height: 58,
          'overlay-opacity': 0
        }
      },
      { selector: 'node[group="map"]', style: { 'background-color': '#8b1f1f', width: 84, height: 84, 'font-size': 12 } },
      { selector: 'node[group="atlas"]', style: { 'background-color': '#64310b' } },
      { selector: 'node[group="evidence"]', style: { 'background-color': '#123d3a' } },
      { selector: 'node[group="book"]', style: { 'background-color': '#33225f' } },
      { selector: 'node[group="answer"]', style: { 'background-color': '#1f3a62' } },
      { selector: 'node[group="relationship"]', style: { 'background-color': '#343434' } },
      {
        selector: 'edge',
        style: {
          width: 1.7,
          'line-color': '#806b3c',
          'target-arrow-color': '#806b3c',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          label: 'data(type)',
          'font-size': 8,
          color: '#d5c7a3',
          'text-background-color': '#080808',
          'text-background-opacity': 0.78,
          'text-background-padding': 2,
          'text-rotation': 'autorotate',
          'overlay-opacity': 0
        }
      },
      { selector: 'edge[evidenceClass="Confirmed Record"]', style: { width: 2.8, 'line-color': '#b99a4a', 'target-arrow-color': '#b99a4a' } },
      { selector: 'edge[evidenceClass="Court Record"]', style: { width: 2.8, 'line-color': '#a85f45', 'target-arrow-color': '#a85f45' } },
      { selector: 'edge[evidenceClass="Documented Association"]', style: { 'line-style': 'dashed' } },
      { selector: 'edge[evidenceClass="Symbolic Commentary"]', style: { 'line-style': 'dotted', opacity: 0.75 } },
      { selector: '.dimmed', style: { opacity: 0.11, 'text-opacity': 0.08 } },
      { selector: '.matched', style: { 'border-width': 4, 'border-color': '#fff2b4', 'z-index': 999 } },
      { selector: '.path-highlight', style: { opacity: 1, 'z-index': 1000, 'line-color': '#f1d070', 'target-arrow-color': '#f1d070', 'border-color': '#f1d070', 'border-width': 4, width: 4 } },
      { selector: ':selected', style: { 'border-width': 4, 'border-color': '#ffffff' } }
    ];
  }

  function renderDetails(root, node) {
    const panel = root.querySelector('[data-map-details]');
    if (!panel || !node) return;
    const data = node.data();
    const route = data.route
      ? `<a class="btn" href="${escapeHtml(data.route)}">Open evidence route</a>`
      : '<span class="label">No direct route assigned</span>';
    panel.innerHTML = `
      <span class="label">${escapeHtml(data.group || 'node')} · ${escapeHtml(data.evidenceClass || 'route')}</span>
      <h3>${escapeHtml(data.label || data.id)}</h3>
      <p>${escapeHtml(data.notes || 'Select connected records and relationship lines to inspect the route.')}</p>
      ${route}
    `;
  }

  function publicControls(root, cy) {
    const search = root.querySelector('[data-map-search]');
    const layoutSelect = root.querySelector('[data-map-layout]');
    const fitButton = root.querySelector('[data-map-fit]');
    const resetButton = root.querySelector('[data-map-reset]');

    const runLayout = name => {
      const allowed = new Set(['cose', 'concentric', 'circle', 'grid', 'breadthfirst']);
      const layoutName = allowed.has(name) ? name : 'cose';
      const options = {
        name: layoutName,
        animate: true,
        animationDuration: 450,
        fit: true,
        padding: 35,
        nodeDimensionsIncludeLabels: true
      };
      if (layoutName === 'cose') {
        options.idealEdgeLength = 130;
        options.nodeRepulsion = 600000;
        options.gravity = 0.3;
        options.numIter = 850;
      }
      if (layoutName === 'breadthfirst') {
        options.directed = true;
        options.spacingFactor = 1.3;
      }
      cy.layout(options).run();
    };

    search?.addEventListener('input', () => {
      const query = search.value.trim().toLowerCase();
      cy.elements().removeClass('dimmed matched');
      if (!query) return;
      const matches = cy.nodes().filter(node => {
        const data = node.data();
        return [data.label, data.group, data.notes, data.evidenceClass]
          .some(value => String(value || '').toLowerCase().includes(query));
      });
      cy.elements().addClass('dimmed');
      matches.removeClass('dimmed').addClass('matched');
      matches.connectedEdges().removeClass('dimmed');
      matches.connectedEdges().connectedNodes().removeClass('dimmed');
      if (matches.length) cy.animate({ fit: { eles: matches, padding: 70 }, duration: 350 });
    });

    layoutSelect?.addEventListener('change', () => runLayout(layoutSelect.value));
    fitButton?.addEventListener('click', () => cy.animate({ fit: { eles: cy.elements(':visible'), padding: 35 }, duration: 300 }));
    resetButton?.addEventListener('click', () => {
      if (search) search.value = '';
      cy.elements().removeClass('dimmed matched path-highlight');
      cy.nodes().show();
      cy.edges().show();
      runLayout(layoutSelect?.value || 'cose');
    });

    return runLayout;
  }

  function fillNodeSelect(select, cy) {
    if (!select) return;
    select.innerHTML = '<option value="">Select node</option>' + cy.nodes()
      .sort((a, b) => String(a.data('label')).localeCompare(String(b.data('label'))))
      .map(node => `<option value="${escapeHtml(node.id())}">${escapeHtml(node.data('label'))}</option>`)
      .join('');
  }

  function enableIntelligenceControls(root, cy) {
    root.querySelectorAll('[data-member-level="intelligence"]').forEach(element => { element.hidden = false; });
    const evidenceFilter = root.querySelector('[data-evidence-filter]');
    const sourceSelect = root.querySelector('[data-path-source]');
    const targetSelect = root.querySelector('[data-path-target]');
    const pathButton = root.querySelector('[data-find-path]');
    const pathStatus = root.querySelector('[data-path-status]');

    const evidenceClasses = [...new Set(cy.edges().map(edge => edge.data('evidenceClass')).filter(Boolean))].sort();
    if (evidenceFilter) {
      evidenceFilter.innerHTML = '<option value="">All evidence classes</option>' + evidenceClasses
        .map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
      evidenceFilter.addEventListener('change', () => {
        const selected = evidenceFilter.value;
        cy.elements().removeClass('dimmed matched path-highlight');
        if (!selected) return;
        const edges = cy.edges().filter(edge => edge.data('evidenceClass') === selected);
        cy.elements().addClass('dimmed');
        edges.removeClass('dimmed');
        edges.connectedNodes().removeClass('dimmed');
      });
    }

    fillNodeSelect(sourceSelect, cy);
    fillNodeSelect(targetSelect, cy);
    pathButton?.addEventListener('click', () => {
      cy.elements().removeClass('path-highlight dimmed');
      const source = sourceSelect?.value;
      const target = targetSelect?.value;
      if (!source || !target || source === target) {
        if (pathStatus) pathStatus.textContent = 'Choose two different nodes.';
        return;
      }
      const result = cy.elements().aStar({
        root: cy.getElementById(source),
        goal: cy.getElementById(target),
        directed: false,
        weight: edge => Number(edge.data('weight') || 1)
      });
      if (!result.found || !result.path?.length) {
        if (pathStatus) pathStatus.textContent = 'No documented route connects those nodes in this map.';
        return;
      }
      cy.elements().addClass('dimmed');
      result.path.removeClass('dimmed').addClass('path-highlight');
      result.path.connectedNodes().removeClass('dimmed').addClass('path-highlight');
      cy.animate({ fit: { eles: result.path, padding: 75 }, duration: 350 });
      if (pathStatus) pathStatus.textContent = `Documented path found across ${Math.max(0, Math.floor(result.path.length / 2))} relationship line(s).`;
    });
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function enableResearchControls(root, cy, mapData) {
    root.querySelectorAll('[data-member-level="research"]').forEach(element => { element.hidden = false; });
    root.querySelector('[data-export-png]')?.addEventListener('click', () => {
      const uri = cy.png({ full: true, scale: 2, bg: '#050505' });
      const anchor = document.createElement('a');
      anchor.href = uri;
      anchor.download = `${mapData.slug || 'network-map'}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    });
    root.querySelector('[data-export-json]')?.addEventListener('click', () => {
      download(`${mapData.slug || 'network-map'}.json`, JSON.stringify(mapData, null, 2), 'application/json');
    });
  }

  async function initMap(root) {
    const graph = root.querySelector('[data-map-canvas]');
    const dataScript = root.querySelector('script[type="application/json"][data-map-data]');
    if (!graph || !dataScript) return;

    let mapData;
    try {
      mapData = JSON.parse(dataScript.textContent || '{}');
    } catch (_) {
      graph.innerHTML = '<p class="warning">The relationship map data could not be read.</p>';
      return;
    }

    if (typeof window.cytoscape !== 'function') {
      graph.innerHTML = '<p class="warning">Interactive view unavailable. The evidence cards below remain available.</p>';
      return;
    }

    const cy = window.cytoscape({
      container: graph,
      elements: mapData.elements || [],
      style: graphStyle(),
      minZoom: 0.18,
      maxZoom: 3.5,
      wheelSensitivity: 0.22,
      selectionType: 'single',
      boxSelectionEnabled: true,
      layout: {
        name: 'cose',
        animate: false,
        fit: true,
        padding: 35,
        idealEdgeLength: 130,
        nodeRepulsion: 600000,
        gravity: 0.3,
        numIter: 850,
        nodeDimensionsIncludeLabels: true
      }
    });

    root._matrixCytoscape = cy;
    const runLayout = publicControls(root, cy);
    cy.on('tap', 'node', event => renderDetails(root, event.target));
    cy.on('dbltap', 'node', event => {
      const route = event.target.data('route');
      if (route) window.location.href = route;
    });
    const centre = cy.getElementById(mapData.centreId || '');
    renderDetails(root, centre.length ? centre : cy.nodes()[0]);

    const rank = await resolveMemberRank();
    if (rank >= 2) enableIntelligenceControls(root, cy);
    if (rank >= 3) enableResearchControls(root, cy, mapData);

    window.addEventListener('resize', () => {
      cy.resize();
      cy.fit(cy.elements(':visible'), 35);
    }, { passive: true });

    root.querySelector('[data-map-layout]')?.dispatchEvent(new Event('change'));
    return runLayout;
  }

  document.querySelectorAll('[data-cytoscape-map]').forEach(root => initMap(root));
})();
