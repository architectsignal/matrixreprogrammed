(() => {
  'use strict';

  const VIS_VERSION = '7.7.3';
  const VIS_JS = `https://cdn.jsdelivr.net/npm/vis-timeline@${VIS_VERSION}/standalone/umd/vis-timeline-graph2d.min.js`;
  const VIS_CSS = `https://cdn.jsdelivr.net/npm/vis-timeline@${VIS_VERSION}/styles/vis-timeline-graph2d.min.css`;
  const lowPower = Boolean(
    window.matchMedia('(max-width: 760px)').matches ||
    (navigator.connection && navigator.connection.saveData) ||
    Number(navigator.deviceMemory || 8) <= 4 ||
    Number(navigator.hardwareConcurrency || 8) <= 4
  );
  const MAX_TIMELINE_ITEMS = lowPower ? 140 : 320;
  const MAX_LIST_ITEMS = lowPower ? 120 : 220;

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
  if (Object.values(elements).some(element => !element)) return;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const normalize = value => String(value || '').toLowerCase().trim();
  const scheduleIdle = callback => window.requestIdleCallback
    ? window.requestIdleCallback(callback, { timeout: 1200 })
    : window.setTimeout(callback, 120);

  let payload = { events: [] };
  let filtered = [];
  let visibleTimelineEvents = [];
  let timeline = null;
  let dataset = null;
  let visLoading = null;
  let filterTimer = 0;

  function loadCss() {
    if (document.querySelector(`link[href="${VIS_CSS}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = VIS_CSS;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }

  function loadScript() {
    if (window.vis?.Timeline && window.vis?.DataSet) return Promise.resolve(window.vis);
    if (visLoading) return visLoading;
    visLoading = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${VIS_JS}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(window.vis), { once: true });
        existing.addEventListener('error', () => reject(new Error('vis-timeline module could not be loaded')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = VIS_JS;
      script.crossOrigin = 'anonymous';
      script.async = true;
      script.onload = () => resolve(window.vis);
      script.onerror = () => reject(new Error('vis-timeline module could not be loaded'));
      document.head.appendChild(script);
    });
    return visLoading;
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
    const haystack = normalize([
      event.title, event.summary, event.entity, event.relatedEntity,
      event.type, event.source, event.factualStatus
    ].join(' '));
    return (!query || haystack.includes(query)) &&
      (!grade || event.evidenceGrade === grade) &&
      (!type || event.type === type) &&
      (!year || String(event.date || '').startsWith(year));
  }

  function eventById(id) {
    return filtered.find(item => String(item.id) === String(id));
  }

  function showDetail(event) {
    if (!event) return;
    elements.detail.innerHTML = `<span class="label">GRADE ${escapeHtml(event.evidenceGrade || '—')} · ${escapeHtml(event.factualStatus || 'Status not stated')}</span><h2>${escapeHtml(event.title || 'Untitled event')}</h2><p><strong>Date:</strong> ${escapeHtml(event.date || '—')}${event.endDate ? ` to ${escapeHtml(event.endDate)}` : ''}</p><p><strong>Entity:</strong> ${escapeHtml(event.entity || '—')}${event.relatedEntity ? ` · <strong>Related:</strong> ${escapeHtml(event.relatedEntity)}` : ''}</p><p>${escapeHtml(event.summary || '')}</p><p><strong>Established:</strong> ${escapeHtml(event.established || 'Open the source record.')}</p><p><strong>Not established:</strong> ${escapeHtml(event.notEstablished || 'No claim beyond the cited record.')}</p><p><strong>Source:</strong> ${escapeHtml(event.source || 'Public record')}</p><div class="cta-row small">${event.sourceUrl ? `<a class="btn" href="${escapeHtml(event.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open Source</a>` : ''}<a class="btn alt" href="search.html?q=${encodeURIComponent(event.entity || event.title || '')}">Search Connections</a></div>`;
  }

  function renderList() {
    const visible = filtered.slice(0, MAX_LIST_ITEMS);
    elements.list.innerHTML = visible.length
      ? visible.map(event => `<button type="button" class="timeline-event card" data-event-id="${escapeHtml(event.id)}"><span class="label">${escapeHtml(event.date || 'Undated')} · GRADE ${escapeHtml(event.evidenceGrade || '—')}</span><strong>${escapeHtml(event.title || 'Untitled event')}</strong><br/><small>${escapeHtml(event.type || 'Record')} · ${escapeHtml(event.source || 'Public record')}</small></button>`).join('')
      : '<p>No events match the current filters.</p>';
    if (filtered.length > visible.length) {
      elements.list.insertAdjacentHTML('beforeend', `<p class="figure-caption">Showing the first ${visible.length} list entries. Refine the filters to reach the remaining ${filtered.length - visible.length} events.</p>`);
    }
  }

  function timelineItems() {
    visibleTimelineEvents = filtered.slice(0, MAX_TIMELINE_ITEMS);
    return visibleTimelineEvents.map(event => ({
      id: String(event.id),
      content: `<strong>${escapeHtml(event.entity || event.title || 'Record')}</strong><br/><small>Grade ${escapeHtml(event.evidenceGrade || '—')} · ${escapeHtml(event.type || 'Record')}</small>`,
      title: `${escapeHtml(event.title || 'Untitled event')} — ${escapeHtml(event.established || '')}`,
      start: event.date,
      end: event.endDate || undefined,
      type: event.endDate ? 'range' : 'box',
      className: `timeline-grade-${String(event.evidenceGrade || 'd').toLowerCase()}`
    })).filter(item => item.start);
  }

  function renderTimeline() {
    if (!window.vis?.Timeline || !window.vis?.DataSet) {
      elements.stage.innerHTML = '<p>The interactive timeline is unavailable. The accessible event list remains fully usable.</p>';
      return;
    }
    const items = timelineItems();
    if (!dataset) dataset = new window.vis.DataSet();
    dataset.clear();
    if (items.length) dataset.add(items);
    if (!timeline) {
      timeline = new window.vis.Timeline(elements.stage, dataset, {
        stack: false,
        horizontalScroll: true,
        verticalScroll: false,
        zoomKey: 'ctrlKey',
        maxHeight: '650px',
        minHeight: lowPower ? '350px' : '460px',
        margin: { item: 8, axis: 6 },
        orientation: { axis: 'bottom' },
        tooltip: { followMouse: false, overflowMethod: 'cap' },
        zoomMin: 1000 * 60 * 60 * 24 * 7,
        zoomMax: 1000 * 60 * 60 * 24 * 365 * 250
      });
      timeline.on('select', properties => {
        const event = eventById(properties.items?.[0]);
        if (event) showDetail(event);
      });
    } else {
      timeline.setItems(dataset);
    }
    if (items.length) timeline.fit({ animation: false });
    else elements.stage.innerHTML = '<p>No dated events match the current filters. The accessible event list remains available.</p>';
  }

  function updateStatus() {
    const total = (payload.events || []).length;
    const capNote = filtered.length > MAX_TIMELINE_ITEMS
      ? ` Interactive view safely limits rendering to ${MAX_TIMELINE_ITEMS} items; refine the filters for a narrower sequence.`
      : '';
    elements.status.textContent = `Showing ${filtered.length} of ${total} evidence-led events.${capNote}`;
  }

  function applyFilters(options = {}) {
    filtered = (payload.events || []).filter(matchEvent);
    updateStatus();
    renderList();
    if (window.vis?.Timeline) renderTimeline();
    else elements.stage.innerHTML = '<p>Interactive timeline preparing. The accessible event list is ready now.</p>';
    if (options.updateUrl !== false) applyUrl();
    if (filtered.length) showDetail(filtered[0]);
  }

  function queueFilters() {
    window.clearTimeout(filterTimer);
    filterTimer = window.setTimeout(() => applyFilters(), 180);
  }

  function populateFilters() {
    const events = payload.events || [];
    const types = [...new Set(events.map(event => event.type).filter(Boolean))].sort();
    const years = [...new Set(events.map(event => String(event.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
    elements.type.innerHTML = '<option value="">All event types</option>' + types.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('');
    elements.year.innerHTML = '<option value="">All years</option>' + years.map(year => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`).join('');
    const params = new URLSearchParams(location.search);
    elements.q.value = params.get('q') || '';
    elements.grade.value = params.get('grade') || '';
    elements.type.value = params.get('type') || '';
    elements.year.value = params.get('year') || '';
  }

  async function fetchTimelineData() {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('data/evidence-timeline.json', {
        cache: 'default',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Timeline HTTP ${response.status}`);
      return await response.json();
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function init() {
    try {
      payload = await fetchTimelineData();
      if (!Array.isArray(payload.events)) payload.events = [];
      populateFilters();
      applyFilters({ updateUrl: false });
      scheduleIdle(async () => {
        loadCss();
        try {
          await loadScript();
          renderTimeline();
          updateStatus();
        } catch (error) {
          console.warn(error);
          elements.stage.innerHTML = '<p>The interactive timeline library could not be loaded. The accessible event list remains fully usable.</p>';
        }
      });
    } catch (error) {
      const message = error.name === 'AbortError' ? 'request timed out' : error.message;
      elements.status.textContent = `Timeline data unavailable: ${message}`;
      elements.stage.innerHTML = '<p>No public timeline data could be loaded. The accessible event list remains available when cached data returns. Use the Evidence Vault or Search while this feed recovers.</p>';
    }
  }

  elements.list.addEventListener('click', event => {
    const button = event.target.closest('[data-event-id]');
    if (!button) return;
    const selected = eventById(button.dataset.eventId);
    showDetail(selected);
    if (timeline && selected && visibleTimelineEvents.some(item => String(item.id) === String(selected.id))) {
      timeline.setSelection([String(selected.id)], { focus: true });
      timeline.focus(String(selected.id), { animation: false, zoom: false });
    }
  });

  elements.q.addEventListener('input', queueFilters);
  [elements.grade, elements.type, elements.year].forEach(control => control.addEventListener('change', () => applyFilters()));
  window.addEventListener('pagehide', () => {
    window.clearTimeout(filterTimer);
    if (timeline) timeline.destroy();
    timeline = null;
    dataset = null;
  }, { once: true });

  init();
})();
