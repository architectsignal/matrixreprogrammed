(() => {
  const VIS_VERSION = '7.7.3';
  const VIS_JS = `https://cdn.jsdelivr.net/npm/vis-timeline@${VIS_VERSION}/standalone/umd/vis-timeline-graph2d.min.js`;
  const VIS_CSS = `https://cdn.jsdelivr.net/npm/vis-timeline@${VIS_VERSION}/styles/vis-timeline-graph2d.min.css`;
  const elements = {
    stage: document.querySelector('#evidence-timeline-stage'),
    list: document.querySelector('#timeline-list'),
    detail: document.querySelector('#timeline-detail'),
    status: document.querySelector('#timeline-status'),
    q: document.querySelector('#timeline-q'),
    grade: document.querySelector('#timeline-grade'),
    type: document.querySelector('#timeline-type'),
    year: document.querySelector('#timeline-year')
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const normalize = value => String(value || '').toLowerCase().trim();
  let payload = { events: [] };
  let filtered = [];
  let timeline = null;
  let dataset = null;

  function loadCss() {
    if (document.querySelector(`link[href="${VIS_CSS}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = VIS_CSS;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }

  function loadScript() {
    return new Promise((resolve, reject) => {
      if (window.vis?.Timeline && window.vis?.DataSet) return resolve(window.vis);
      const existing = document.querySelector(`script[src="${VIS_JS}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(window.vis), { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = VIS_JS;
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve(window.vis);
      script.onerror = () => reject(new Error('vis-timeline module could not be loaded'));
      document.head.appendChild(script);
    });
  }

  function activeParams() {
    const params = new URLSearchParams();
    if (elements.q.value) params.set('q', elements.q.value);
    if (elements.grade.value) params.set('grade', elements.grade.value);
    if (elements.type.value) params.set('type', elements.type.value);
    if (elements.year.value) params.set('year', elements.year.value);
    return params;
  }

  function applyUrl() {
    const params = activeParams();
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
  }

  function matchEvent(event) {
    const query = normalize(elements.q.value);
    const grade = elements.grade.value;
    const type = elements.type.value;
    const year = elements.year.value;
    const haystack = normalize([event.title, event.summary, event.entity, event.relatedEntity, event.type, event.source, event.factualStatus].join(' '));
    return (!query || haystack.includes(query)) && (!grade || event.evidenceGrade === grade) && (!type || event.type === type) && (!year || event.date.startsWith(year));
  }

  function showDetail(event) {
    if (!event) return;
    elements.detail.innerHTML = `<span class="label">GRADE ${escapeHtml(event.evidenceGrade)} · ${escapeHtml(event.factualStatus)}</span><h2>${escapeHtml(event.title)}</h2><p><strong>Date:</strong> ${escapeHtml(event.date)}${event.endDate ? ` to ${escapeHtml(event.endDate)}` : ''}</p><p><strong>Entity:</strong> ${escapeHtml(event.entity || '—')}${event.relatedEntity ? ` · <strong>Related:</strong> ${escapeHtml(event.relatedEntity)}` : ''}</p><p>${escapeHtml(event.summary || '')}</p><p><strong>Established:</strong> ${escapeHtml(event.established)}</p><p><strong>Not established:</strong> ${escapeHtml(event.notEstablished)}</p><p><strong>Source:</strong> ${escapeHtml(event.source || 'Public record')}</p><div class="cta-row small">${event.sourceUrl ? `<a class="btn" href="${escapeHtml(event.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open Source</a>` : ''}<a class="btn alt" href="search.html?q=${encodeURIComponent(event.entity || event.title)}">Search Connections</a></div>`;
  }

  function renderList() {
    elements.list.innerHTML = filtered.length ? filtered.slice(0, 500).map(event => `<button type="button" class="timeline-event card" data-event-id="${escapeHtml(event.id)}"><span class="label">${escapeHtml(event.date)} · GRADE ${escapeHtml(event.evidenceGrade)}</span><strong>${escapeHtml(event.title)}</strong><br/><small>${escapeHtml(event.type)} · ${escapeHtml(event.source || 'Public record')}</small></button>`).join('') : '<p>No events match the current filters.</p>';
    elements.list.querySelectorAll('[data-event-id]').forEach(button => button.addEventListener('click', () => {
      const event = filtered.find(item => item.id === button.dataset.eventId);
      showDetail(event);
      if (timeline && event) {
        timeline.setSelection([event.id], { focus: true });
        timeline.focus(event.id, { animation: true, zoom: false });
      }
    }));
  }

  function timelineItems() {
    return filtered.map(event => ({
      id: event.id,
      content: `<strong>${escapeHtml(event.entity || event.title)}</strong><br/><small>Grade ${escapeHtml(event.evidenceGrade)} · ${escapeHtml(event.type)}</small>`,
      title: `${escapeHtml(event.title)} — ${escapeHtml(event.established)}`,
      start: event.date,
      end: event.endDate || undefined,
      type: event.endDate ? 'range' : 'box',
      className: `timeline-grade-${event.evidenceGrade.toLowerCase()}`
    }));
  }

  function renderTimeline() {
    if (!window.vis?.Timeline || !window.vis?.DataSet) {
      elements.stage.innerHTML = '<p>The interactive timeline library is unavailable. The accessible event list remains fully usable.</p>';
      return;
    }
    if (timeline) timeline.destroy();
    dataset = new window.vis.DataSet(timelineItems());
    timeline = new window.vis.Timeline(elements.stage, dataset, {
      stack: true,
      horizontalScroll: true,
      zoomKey: 'ctrlKey',
      maxHeight: '650px',
      minHeight: '460px',
      margin: { item: 10, axis: 8 },
      orientation: { axis: 'both' },
      tooltip: { followMouse: true, overflowMethod: 'cap' }
    });
    timeline.on('select', properties => {
      const event = filtered.find(item => item.id === properties.items?.[0]);
      if (event) showDetail(event);
    });
    if (filtered.length) timeline.fit({ animation: false });
  }

  function applyFilters() {
    filtered = (payload.events || []).filter(matchEvent);
    elements.status.textContent = `Showing ${filtered.length} of ${(payload.events || []).length} evidence-led events. Interactive engine: ${window.vis?.Timeline ? `vis-timeline ${VIS_VERSION}` : 'accessible list fallback'}.`;
    renderList();
    renderTimeline();
    applyUrl();
    if (filtered.length) showDetail(filtered[0]);
  }

  function populateFilters() {
    const types = [...new Set((payload.events || []).map(event => event.type).filter(Boolean))].sort();
    const years = [...new Set((payload.events || []).map(event => event.date?.slice(0, 4)).filter(Boolean))].sort().reverse();
    elements.type.innerHTML = '<option value="">All event types</option>' + types.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('');
    elements.year.innerHTML = '<option value="">All years</option>' + years.map(year => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`).join('');
    const params = new URLSearchParams(location.search);
    elements.q.value = params.get('q') || '';
    elements.grade.value = params.get('grade') || '';
    elements.type.value = params.get('type') || '';
    elements.year.value = params.get('year') || '';
  }

  async function init() {
    try {
      const response = await fetch('data/evidence-timeline.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Timeline HTTP ${response.status}`);
      payload = await response.json();
      populateFilters();
      loadCss();
      try { await loadScript(); } catch (error) { console.warn(error); }
      applyFilters();
    } catch (error) {
      elements.status.textContent = `Timeline data unavailable: ${error.message}`;
      elements.stage.innerHTML = '<p>No public timeline data could be loaded.</p>';
    }
  }

  [elements.q, elements.grade, elements.type, elements.year].forEach(control => control.addEventListener(control === elements.q ? 'input' : 'change', applyFilters));
  init();
})();
