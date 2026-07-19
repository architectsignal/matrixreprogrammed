(() => {
  'use strict';

  const pageMatch = location.pathname.match(/\/dossier-([^/]+?)(?:\.html)?$/i);
  if (!pageMatch) return;
  const slug = decodeURIComponent(pageMatch[1]);
  const nameNode = document.getElementById('name');
  const headlineNode = document.getElementById('headline');
  const boundaryNode = document.getElementById('boundary');
  const contentNode = document.getElementById('content');
  if (!nameNode || !headlineNode || !boundaryNode || !contentNode) return;

  const text = (tag, value, className = '') => {
    const node = document.createElement(tag);
    node.textContent = String(value ?? '');
    if (className) node.className = className;
    return node;
  };
  const paragraph = (parent, label, value) => {
    const node = document.createElement('p');
    node.appendChild(text('strong', label));
    node.appendChild(document.createTextNode(` ${String(value || 'Not recorded.')}`));
    parent.appendChild(node);
  };
  const listCard = (title, items) => {
    const card = text('article', '', 'card redline');
    card.appendChild(text('h3', title));
    const list = document.createElement('ul');
    const values = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!values.length) list.appendChild(text('li', 'No reviewed entry is currently recorded.'));
    else values.forEach(item => list.appendChild(text('li', item)));
    card.appendChild(list);
    return card;
  };
  const render = (payload, dossier) => {
    nameNode.textContent = dossier.name || 'Power Dossier';
    headlineNode.textContent = dossier.headline || 'Public-record accountability dossier.';
    boundaryNode.textContent = payload.boundary || 'This is an accountability dossier, not a verdict page.';
    contentNode.textContent = '';
    const core = text('article', '', 'card redline');
    core.appendChild(text('span', dossier.rank ? `#${dossier.rank}` : 'Power dossier', 'label'));
    core.appendChild(text('h2', dossier.name || 'Power Dossier'));
    paragraph(core, 'Core power:', dossier.corePower);
    paragraph(core, 'Next pull:', dossier.nextPull);
    contentNode.appendChild(core);
    contentNode.appendChild(listCard('Confirmed rails', dossier.confirmedRails));
    contentNode.appendChild(listCard('Public questions', dossier.publicQuestions));
    contentNode.appendChild(listCard('Missing records', dossier.missingRecords));
    contentNode.appendChild(listCard('Source routes', dossier.sourceRoutes));
    document.documentElement.dataset.dossierState = 'ready';
  };
  const renderError = error => {
    nameNode.textContent = 'DOSSIER TEMPORARILY UNAVAILABLE';
    headlineNode.textContent = 'The public dossier data could not be loaded. No replacement claims have been invented.';
    boundaryNode.textContent = 'Use the dossier index, evidence vault and search routes while this data route is unavailable.';
    contentNode.textContent = '';
    const card = text('article', '', 'card redline');
    card.appendChild(text('h2', 'Open the source routes instead'));
    card.appendChild(text('p', error?.message || 'Dossier data unavailable.'));
    const actions = text('div', '', 'cta-row');
    const routes = [
      ['All Dossiers', 'power-dossiers.html'],
      ['Evidence Vault', 'evidence-vault.html'],
      ['Search', `search.html?q=${encodeURIComponent(slug.replace(/-/g, ' '))}`]
    ];
    routes.forEach(([label, href], index) => {
      const link = text('a', label, index ? 'btn alt' : 'btn');
      link.href = href;
      actions.appendChild(link);
    });
    card.appendChild(actions);
    contentNode.appendChild(card);
    document.documentElement.dataset.dossierState = 'error';
  };

  fetch('data/power-dossiers.json', { cache: 'no-store', headers: { accept: 'application/json' } })
    .then(response => {
      if (!response.ok) throw new Error(`Dossier data returned HTTP ${response.status}.`);
      return response.json();
    })
    .then(payload => {
      const dossier = (payload.dossiers || []).find(item => item && item.slug === slug);
      if (!dossier) throw new Error('This dossier is not present in the current public registry.');
      render(payload, dossier);
    })
    .catch(renderError);
})();
