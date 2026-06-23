document.addEventListener('DOMContentLoaded', () => {
  const buttons = Array.from(document.querySelectorAll('[data-filter]'));
  const cards = Array.from(document.querySelectorAll('[data-category]'));
  const count = document.querySelector('[data-filter-count]');
  if (!buttons.length || !cards.length) return;

  function applyFilter(filter) {
    let shown = 0;
    cards.forEach((card) => {
      const category = card.getAttribute('data-category') || '';
      const visible = filter === 'all' || category === filter;
      card.style.display = visible ? '' : 'none';
      if (visible) shown += 1;
    });
    buttons.forEach((button) => button.classList.toggle('active', button.getAttribute('data-filter') === filter));
    if (count) count.textContent = `${shown} signal${shown === 1 ? '' : 's'} shown`;
  }

  buttons.forEach((button) => button.addEventListener('click', () => applyFilter(button.getAttribute('data-filter'))));
  applyFilter('all');
});
