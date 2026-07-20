(() => {
  'use strict';

  if (document.querySelector('[data-investigation-pulse]')) return;

  const cacheKey = 'matrix-investigation-pulse-v1';
  const maxAgeMs = 5 * 60 * 1000;

  function esc(value) {
    return String(value || '').replace(/[&<>]/g, character => character === '&' ? '&amp;' : character === '<' ? '&lt;' : '&gt;');
  }

  function mount(html) {
    if (document.querySelector('[data-investigation-pulse]')) return;
    const box = document.createElement('aside');
    box.setAttribute('data-investigation-pulse', 'true');
    box.className = 'wrap investigation-pulse';
    box.innerHTML = html;
    const footer = document.querySelector('footer');
    if (footer && footer.parentNode) footer.parentNode.insertBefore(box, footer);
    else document.body.appendChild(box);
  }

  function render(status) {
    mount('<strong>Investigation Machine:</strong> last source run ' + esc(status.lastInvestigationRun || 'pending') +
      ' · ' + esc(status.registeredSources) + ' sources registered · ' + esc(status.ledgerFindings) +
      ' evidence findings · <a href="/investigation-machine.html">open machine</a> · ' +
      '<a href="/daily-investigation-conclusions.html">daily conclusions</a> · <a href="/search.html">search</a>');
  }

  function cachedStatus() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
      if (!cached || !cached.savedAt || Date.now() - cached.savedAt > maxAgeMs) return null;
      return cached.status || null;
    } catch {
      return null;
    }
  }

  function store(status) {
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), status })); } catch {}
  }

  async function refresh() {
    try {
      const response = await fetch('/data/investigation-status.json', { cache: 'default', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const status = await response.json();
      store(status);
      if (!document.querySelector('[data-investigation-pulse]')) render(status);
    } catch {
      if (!document.querySelector('[data-investigation-pulse]')) {
        mount('<strong>Investigation Machine:</strong> status feed unavailable · <a href="/investigation-source-ledger.html">check source ledger</a>');
      }
    }
  }

  const cached = cachedStatus();
  if (cached) render(cached);

  const schedule = window.requestIdleCallback
    ? callback => window.requestIdleCallback(callback, { timeout: 1800 })
    : callback => window.setTimeout(callback, 450);
  schedule(refresh);
})();
