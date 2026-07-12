(() => {
  'use strict';
  const q = selector => document.querySelector(selector);
  const qa = selector => [...document.querySelectorAll(selector)];
  const search = q('#dark-risk-search');
  const filter = q('#dark-risk-filter');
  const count = q('#dark-risk-count');
  const cards = qa('[data-dark-risk]');

  function applyRiskFilters() {
    const term = String(search?.value || '').toLowerCase().trim();
    const risk = String(filter?.value || 'all');
    let visible = 0;
    cards.forEach(card => {
      const text = String(card.dataset.search || '').toLowerCase();
      const matches = (!term || text.includes(term)) && (risk === 'all' || card.dataset.risk === risk);
      card.hidden = !matches;
      if (matches) visible += 1;
    });
    if (count) count.textContent = `${visible} danger categor${visible === 1 ? 'y' : 'ies'} shown`;
  }

  async function copy(value, button) {
    try {
      await navigator.clipboard.writeText(value);
      const original = button.textContent;
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = original; }, 1600);
    } catch {
      window.prompt('Copy the verified onion address:', value);
    }
  }

  qa('[data-copy-onion]').forEach(button => button.addEventListener('click', () => copy(button.dataset.copyOnion, button)));
  search?.addEventListener('input', applyRiskFilters);
  filter?.addEventListener('change', applyRiskFilters);
  q('#dark-risk-clear')?.addEventListener('click', () => {
    if (search) search.value = '';
    if (filter) filter.value = 'all';
    applyRiskFilters();
  });
  q('#dark-print')?.addEventListener('click', () => window.print());
  applyRiskFilters();
})();
