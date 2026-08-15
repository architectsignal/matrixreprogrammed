(function () {
  'use strict';

  const dockId = 'matrix-access-dock';
  if (document.getElementById(dockId)) return;

  const destinations = [
    ['Start here', '/start-here.html'],
    ['Search', '/search.html'],
    ['Today', '/daily-command-brief.html'],
    ['Evidence', '/evidence-vault.html'],
    ['Investigations', '/investigation-machine.html'],
    ['Signal board', '/forum.html']
  ];

  function routeKey(pathname) {
    const value = String(pathname || '/').replace(/\/index(?:\.html)?$/i, '/').replace(/\.html$/i, '');
    return value.length > 1 ? value.replace(/\/$/, '') : '/';
  }

  function link(label, href, className) {
    const anchor = document.createElement('a');
    anchor.textContent = label;
    anchor.href = href;
    if (className) anchor.className = className;
    if (routeKey(location.pathname) === routeKey(new URL(anchor.href).pathname)) {
      anchor.setAttribute('aria-current', 'page');
    }
    return anchor;
  }

  function mount() {
    if (document.getElementById(dockId) || !document.body) return;

    const dock = document.createElement('nav');
    dock.id = dockId;
    dock.className = 'matrix-access-dock';
    dock.setAttribute('aria-label', 'Matrix quick access');

    const explore = document.createElement('details');
    explore.className = 'matrix-access-dock__explore';
    const summary = document.createElement('summary');
    summary.textContent = 'Explore';
    summary.setAttribute('aria-label', 'Open Matrix navigation');
    const drawer = document.createElement('div');
    drawer.className = 'matrix-access-dock__drawer';
    drawer.setAttribute('aria-label', 'Explore Matrix');

    destinations.forEach(function (destination) {
      const anchor = link(destination[0], destination[1]);
      anchor.addEventListener('click', function () { explore.open = false; });
      drawer.appendChild(anchor);
    });

    explore.append(summary, drawer);
    dock.append(
      explore,
      link('Log in', '/member-login.html', 'matrix-access-dock__login'),
      link('Subscribe', '/newsletter.html#newsletter-form', 'matrix-access-dock__subscribe')
    );
    document.body.appendChild(dock);

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && explore.open) {
        explore.open = false;
        summary.focus();
      }
    });
    document.addEventListener('pointerdown', function (event) {
      if (explore.open && !dock.contains(event.target)) explore.open = false;
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
