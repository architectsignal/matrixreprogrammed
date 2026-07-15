(() => {
  'use strict';
  document.documentElement.dataset.readerExperience = 'ready';
  document.querySelectorAll('a[target="_blank"]').forEach(link => {
    const rel = new Set(String(link.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
    rel.add('noopener');
    rel.add('noreferrer');
    link.setAttribute('rel', [...rel].join(' '));
  });
  window.dispatchEvent(new CustomEvent('matrix:reader-experience-ready'));
})();
