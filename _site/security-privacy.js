(() => {
  'use strict';

  const search = document.querySelector('#security-tool-search');
  const category = document.querySelector('#security-category-filter');
  const level = document.querySelector('#security-level-filter');
  const clear = document.querySelector('#security-clear-filters');
  const count = document.querySelector('#security-result-count');
  const status = document.querySelector('#security-system-status');
  const cards = [...document.querySelectorAll('[data-security-tool]')];
  const sections = [...document.querySelectorAll('[data-security-category]')];
  const systemButtons = [...document.querySelectorAll('[data-security-system]')];
  const normalize = value => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  let activeSystem = new Set();

  function applyFilters() {
    const query = normalize(search?.value);
    const categoryValue = category?.value || 'all';
    const levelValue = level?.value || 'all';
    let visible = 0;

    cards.forEach(card => {
      const matchesQuery = !query || normalize(card.dataset.search).includes(query);
      const matchesCategory = categoryValue === 'all' || card.dataset.category === categoryValue;
      const matchesLevel = levelValue === 'all' || normalize(card.dataset.level).includes(normalize(levelValue));
      const matches = matchesQuery && matchesCategory && matchesLevel;
      card.hidden = !matches;
      card.classList.toggle('system-recommended', activeSystem.has(card.dataset.toolId));
      if (matches) visible += 1;
    });

    sections.forEach(section => {
      const sectionCards = [...section.querySelectorAll('[data-security-tool]')];
      section.hidden = !sectionCards.some(card => !card.hidden);
    });

    if (count) count.textContent = `${visible} vetted tool${visible === 1 ? '' : 's'} shown`;
  }

  function selectSystem(button) {
    const ids = JSON.parse(button.dataset.toolIds || '[]');
    const alreadyActive = button.getAttribute('aria-pressed') === 'true';
    systemButtons.forEach(item => item.setAttribute('aria-pressed', 'false'));
    activeSystem = alreadyActive ? new Set() : new Set(ids);
    if (!alreadyActive) button.setAttribute('aria-pressed', 'true');
    if (search) search.value = '';
    if (category) category.value = 'all';
    if (level) level.value = 'all';
    applyFilters();
    if (status) {
      status.textContent = alreadyActive
        ? 'System highlighting cleared.'
        : `${button.dataset.systemTitle}: ${ids.length} recommended components are highlighted below. Read every limitation before adopting the stack.`;
    }
    if (!alreadyActive) document.querySelector('#tool-registry')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  search?.addEventListener('input', applyFilters);
  category?.addEventListener('change', applyFilters);
  level?.addEventListener('change', applyFilters);
  clear?.addEventListener('click', () => {
    if (search) search.value = '';
    if (category) category.value = 'all';
    if (level) level.value = 'all';
    activeSystem.clear();
    systemButtons.forEach(item => item.setAttribute('aria-pressed', 'false'));
    if (status) status.textContent = 'Filters and system highlighting cleared.';
    applyFilters();
  });
  systemButtons.forEach(button => button.addEventListener('click', () => selectSystem(button)));
  document.querySelector('#security-print')?.addEventListener('click', () => window.print());

  applyFilters();
})();
