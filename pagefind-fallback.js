(() => {
  const state = { pagefind: null, ready: false };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const initialQuery = new URLSearchParams(location.search).get('q') || '';

  function mount() {
    if (document.querySelector('#pagefind-fallback')) return document.querySelector('#pagefind-fallback');
    const section = document.createElement('section');
    section.id = 'pagefind-fallback';
    section.className = 'section wrap';
    section.hidden = true;
    section.innerHTML = `<div class="eyebrow">Independent static fallback index</div><h2>PAGEFIND FALLBACK SEARCH</h2><p class="figure-caption">This browser-side index is separate from Search V3. It appears only when generated Pagefind assets are available.</p><div style="display:flex;gap:.6rem;flex-wrap:wrap"><input id="pagefind-fallback-input" type="search" placeholder="Search the complete public build" style="flex:1;min-width:220px;padding:.75rem;background:#090806;color:#f3e6bd;border:1px solid rgba(216,181,106,.35);border-radius:8px"/><button id="pagefind-fallback-button" class="btn alt" type="button">Search fallback</button></div><p id="pagefind-fallback-status" class="figure-caption"></p><div id="pagefind-fallback-results" class="grid"></div>`;
    const main = document.querySelector('main') || document.body;
    main.appendChild(section);
    const input = section.querySelector('#pagefind-fallback-input');
    input.value = initialQuery;
    section.querySelector('#pagefind-fallback-button').addEventListener('click', () => run(input.value));
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); run(input.value); } });
    return section;
  }

  async function loadPagefind() {
    if (state.ready) return state.pagefind;
    const response = await fetch('/pagefind/pagefind.js', { method: 'HEAD', cache: 'no-store' });
    if (!response.ok) throw new Error('Pagefind index is not generated on this deployment');
    state.pagefind = await import('/pagefind/pagefind.js');
    if (typeof state.pagefind.options === 'function') await state.pagefind.options({ excerptLength: 35 });
    state.ready = true;
    return state.pagefind;
  }

  async function run(query) {
    const section = mount();
    const status = section.querySelector('#pagefind-fallback-status');
    const resultsNode = section.querySelector('#pagefind-fallback-results');
    const term = String(query || '').trim();
    if (!term) {
      status.textContent = 'Enter a search term.';
      resultsNode.innerHTML = '';
      return;
    }
    status.textContent = `Searching the independent static index for “${term}”…`;
    try {
      const pagefind = await loadPagefind();
      const search = await pagefind.search(term);
      const rows = await Promise.all((search.results || []).slice(0, 20).map(result => result.data()));
      section.hidden = false;
      status.textContent = `${search.results?.length || 0} Pagefind results; showing ${rows.length}. Search V3 remains the primary evidence-aware index.`;
      resultsNode.innerHTML = rows.length ? rows.map(row => `<article class="card"><span class="label">PAGEFIND FALLBACK</span><h3><a href="${escapeHtml(row.url)}">${escapeHtml(row.meta?.title || row.url)}</a></h3><p>${row.excerpt || ''}</p><p class="figure-caption">${escapeHtml(row.meta?.description || '')}</p></article>`).join('') : '<article class="card"><p>No fallback results found.</p></article>';
    } catch (error) {
      section.hidden = true;
      console.info(`Pagefind fallback inactive: ${error.message}`);
    }
  }

  async function init() {
    const section = mount();
    try {
      await loadPagefind();
      section.hidden = false;
      section.querySelector('#pagefind-fallback-status').textContent = 'Independent Pagefind index available.';
      if (initialQuery) await run(initialQuery);
    } catch (error) {
      section.hidden = true;
      console.info(`Pagefind fallback inactive: ${error.message}`);
    }
  }

  init();
})();
