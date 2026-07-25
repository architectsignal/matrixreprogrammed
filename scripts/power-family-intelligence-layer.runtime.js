(function () {
  'use strict';

  const URLS = {
    config: 'data/power-family-intelligence-layer.json',
    families: 'data/behind-the-curtain-family-access.json',
    curated: 'data/power-family-curated-people.json',
    core: 'data/behind-the-curtain.json'
  };

  function savedWatchlist() {
    try { return new Set(JSON.parse(localStorage.getItem('pfWatchlist') || '[]')); }
    catch { return new Set(); }
  }

  const state = {
    config: null,
    families: [],
    people: [],
    links: [],
    sources: [],
    sourceById: new Map(),
    core: null,
    watch: savedWatchlist(),
    watchOnly: false,
    filters: { q: '', family: '', vector: '', evidence: '' }
  };

  const $ = (selector, root) => (root || document).querySelector(selector);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const avg = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const pct5 = value => Math.round(clamp(value, 0, 5) * 20);
  const to5 = value => Math.round(clamp((Number(value) || 0) / 20, 0, 5) * 10) / 10;

  function label(classification) {
    const found = (state.config.claimClasses || []).find(item => item.id === classification);
    return found ? found.label : String(classification || 'Unclassified').replace(/_/g, ' ');
  }

  function badge(classification) {
    return `<span class="pf-badge ${esc(slug(classification))}">${esc(label(classification))}</span>`;
  }

  function tier(person, id) {
    const matches = (person.tierAccess || []).filter(item => !id || item.tierId === id);
    return matches.length ? Math.max(...matches.map(item => Number(item.score) || 0)) : 0;
  }

  function vectorFor(person) {
    const vectors = [];
    for (const item of person.tierAccess || []) {
      const id = item.tierId || '';
      if (id.includes('money')) vectors.push('Asset management');
      if (id.includes('ownership')) vectors.push('Corporate control');
      if (id.includes('intelligence')) vectors.push('Intelligence');
      if (id.includes('policy')) vectors.push('Think tanks');
      if (id.includes('technology')) vectors.push('Technology');
      if (id.includes('media')) vectors.push('Media');
      if (id.includes('public')) vectors.push('Government');
      if (id.includes('permanent')) vectors.push('Institutional continuity');
      if (id.includes('connectors')) vectors.push('Network connector');
    }
    return [...new Set(vectors)];
  }

  function linkForPerson(id) {
    return state.links.find(link => link.personId === id);
  }

  function familyForPerson(person) {
    const link = linkForPerson(person.id);
    return link ? state.families.find(family => family.id === link.familyId) : null;
  }

  function scores(person) {
    const family = familyForPerson(person);
    const dimensions = family && family.dimensions || {};
    const link = linkForPerson(person.id);
    return {
      institutionalAuthority: to5(Math.max(tier(person, 'public-stage'), tier(person, 'permanent-system'), person.crossSystemScore || 0)),
      assetControl: to5(Math.max(tier(person, 'money-gatekeepers'), tier(person, 'ownership-infrastructure'), dimensions.votingOrOwnershipControl || 0, dimensions.capitalAccess || 0)),
      governmentAccess: to5(Math.max(tier(person, 'public-stage'), dimensions.formalAuthority || 0, dimensions.appointmentPower || 0)),
      networkCentrality: to5(Math.max(person.crossSystemScore || 0, (person.tierAccess || []).length * 22, dimensions.crossSectorReach || 0)),
      informationAccess: to5(Math.max(tier(person, 'intelligence-security'), tier(person, 'policy-architects'), tier(person, 'technology-data'), tier(person, 'connectors'))),
      intergenerationalPosition: link ? (link.successionStatus === 'active_successor' ? 5 : link.roleType === 'family_controller' ? 4.8 : link.roleType === 'family_successor' ? 4.5 : 2.8) : 0,
      operationalActivity: to5(Math.max(0, ...(person.tierAccess || []).map(item => item.score || 0))),
      evidenceStrength: person.confidence === 'very_high' ? 5 : person.confidence === 'high' ? 4.5 : person.confidence === 'moderate' ? 3.5 : 2.5
    };
  }

  function totalScore(person) {
    const values = Object.values(scores(person));
    return Math.round(avg(values) * 20 * 10) / 10;
  }

  function mechanismCount(person) {
    return new Set((person.tierAccess || []).map(item => item.tierId)).size;
  }

  function roleText(person) {
    return `${person.currentRole || ''} ${person.organization || ''}`.toLowerCase();
  }

  function isGatekeeper(person) {
    const link = linkForPerson(person.id);
    if (link && link.roleType === 'professional_gatekeeper') return true;
    return (state.config.gatekeeperKeywords || []).some(keyword => roleText(person).includes(keyword.toLowerCase())) && tier(person, 'public-stage') < 95;
  }

  function publicScore(person) { return tier(person, 'public-stage'); }
  function operatorScore(person) {
    return Math.max(tier(person, 'money-gatekeepers'), tier(person, 'ownership-infrastructure'), tier(person, 'permanent-system'), tier(person, 'policy-architects'), tier(person, 'intelligence-security'), tier(person, 'technology-data'), tier(person, 'connectors'));
  }

  function matches(person) {
    const q = state.filters.q.toLowerCase();
    const family = familyForPerson(person);
    const vectors = vectorFor(person);
    if (state.watchOnly && !state.watch.has(`person:${person.id}`)) return false;
    if (state.filters.family && (!family || family.id !== state.filters.family)) return false;
    if (state.filters.vector && !vectors.includes(state.filters.vector)) return false;
    if (state.filters.evidence && person.classification !== state.filters.evidence) return false;
    if (q && [person.name, person.currentRole, person.organization, (person.jurisdictions || []).join(' '), family && family.name, vectors.join(' ')].join(' ').toLowerCase().indexOf(q) < 0) return false;
    return true;
  }

  function toast(message) {
    const element = $('#pf-toast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove('show'), 1800);
  }

  function toggleWatch(key) {
    if (state.watch.has(key)) state.watch.delete(key); else state.watch.add(key);
    localStorage.setItem('pfWatchlist', JSON.stringify([...state.watch]));
    toast(state.watch.has(key) ? 'Added to watchlist' : 'Removed from watchlist');
    renderAll();
  }

  function bars(person) {
    const values = scores(person);
    return `<div class="pf-bars">${Object.keys(values).map(key => {
      const dimension = (state.config.scoreDimensions || []).find(item => item.id === key) || { label: key };
      return `<div class="pf-bar">${esc(dimension.label)} · ${values[key]}/5<i style="--v:${pct5(values[key])}%"></i></div>`;
    }).join('')}</div>`;
  }

  function roleTypeTag(person) {
    const link = linkForPerson(person.id);
    return link ? `<span class="pf-tag">${esc(String(link.roleType || 'linked profile').replace(/_/g, ' '))}</span>` : '';
  }

  function personCard(person, rank) {
    const family = familyForPerson(person);
    const vectors = vectorFor(person);
    return `<article class="pf-card" data-person="${esc(person.id)}">
      <div class="pf-card-head">
        <div class="pf-rank">${rank || '◆'}</div>
        <div><div class="pf-meta">${badge(person.classification)}${family ? `<span class="pf-tag">${esc(family.name)}</span>` : ''}${roleTypeTag(person)}</div><h3>${esc(person.name)}</h3><p>${esc(person.currentRole || 'Role under review')}</p></div>
        <div class="pf-score">${totalScore(person)}<small>/100</small></div>
      </div>
      <div class="pf-tags">${vectors.map(vector => `<span class="pf-tag">${esc(vector)}</span>`).join('')}</div>
      ${bars(person)}
      <div class="pf-card-actions"><button type="button" data-open-person="${esc(person.id)}">Open full profile</button><button type="button" data-watch="person:${esc(person.id)}">${state.watch.has(`person:${person.id}`) ? 'Watching' : 'Track person'}</button></div>
    </article>`;
  }

  function familyCard(family) {
    const links = state.links.filter(link => link.familyId === family.id);
    const linked = links.map(link => state.people.find(person => person.id === link.personId)).filter(Boolean);
    const dimensions = family.dimensions || {};
    const operators = linked.filter(person => linkForPerson(person.id).roleType === 'professional_gatekeeper');
    const successors = linked.filter(person => ['active_successor', 'probable_successor'].includes(linkForPerson(person.id).successionStatus));
    return `<article class="pf-family" data-family="${esc(family.id)}">
      <div class="pf-card-head"><div class="pf-rank">${esc(family.rank || '◆')}</div><div><div class="pf-meta">${badge(family.classification)}<span class="pf-tag">${esc(family.type || 'Family network')}</span></div><h3>${esc(family.name)}</h3><p>${esc((family.jurisdictions || []).join(' · '))}</p></div><div class="pf-score">${esc(family.accessScore || '—')}<small>/100</small></div></div>
      <div class="pf-dimensions">${Object.keys(dimensions).map(key => `<div class="pf-dimension">${esc(key.replace(/([A-Z])/g, ' $1'))}<i style="--v:${clamp(dimensions[key], 0, 100)}%"></i></div>`).join('')}</div>
      <p><strong>Coverage:</strong> ${linked.length} verified living profile${linked.length === 1 ? '' : 's'} · ${operators.length} professional gatekeeper${operators.length === 1 ? '' : 's'} · ${successors.length} active successor${successors.length === 1 ? '' : 's'}</p>
      <details><summary>Documented access, constraints and linked people</summary>
        <h4>Documented access</h4><ul>${(family.documentedAccess || []).map(item => `<li>${esc(item)}</li>`).join('') || '<li>Evidence profile under expansion.</li>'}</ul>
        <h4>Structures reached</h4><p>${esc((family.structuresReached || []).join(' · '))}</p>
        <h4>Constraints</h4><ul>${(family.constraints || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul>
        <h4>Not established</h4><p>${esc(family.unsupportedClaim || 'No unsupported claim recorded.')}</p>
        <h4>Living profiles</h4><div class="pf-card-actions">${linked.map(person => `<button data-open-person="${esc(person.id)}">${esc(person.name)}</button>`).join('')}</div>
      </details>
      <div class="pf-card-actions"><button data-watch="family:${esc(family.id)}">${state.watch.has(`family:${family.id}`) ? 'Watching' : 'Track family'}</button></div>
    </article>`;
  }

  function sourceCards(person) {
    return (person.sourceIds || []).map(id => state.sourceById.get(id)).filter(Boolean).map(source => `<article class="pf-profile-block"><h4>${esc(source.publisher)}</h4><p><strong>${esc(source.title)}</strong></p><p><strong>Establishes:</strong> ${esc(source.establishes)}</p><p><strong>Does not establish:</strong> ${esc(source.doesNotEstablish)}</p><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">Open source record</a></article>`).join('');
  }

  function openPerson(id) {
    const person = state.people.find(item => item.id === id);
    if (!person) return;
    const family = familyForPerson(person);
    const link = linkForPerson(person.id);
    $('#pf-modal-content').innerHTML = `<h2 id="pf-modal-title">${esc(person.name)}</h2><p class="muted">${esc(person.currentRole || '')} · ${esc(person.organization || '')}</p>
      <div class="pf-meta">${badge(person.classification)}<span class="pf-tag">${esc(person.confidence || 'confidence not set')}</span>${family ? `<span class="pf-tag">${esc(family.name)}</span>` : ''}${roleTypeTag(person)}</div>
      <div class="pf-profile-grid">
        <section class="pf-profile-block"><h4>Identity and current role</h4><p><strong>Jurisdiction:</strong> ${esc((person.jurisdictions || []).join(', '))}</p><p><strong>Status:</strong> ${esc(person.status || 'under review')}</p><p><strong>Last verified:</strong> ${esc(person.verifiedAt || 'not recorded')}</p><p><strong>Next review:</strong> ${esc(person.nextReviewDue || 'not scheduled')}</p></section>
        <section class="pf-profile-block"><h4>Family or continuity link</h4><p>${esc(link ? link.relationship : 'No family link is asserted by this layer.')}</p><p><strong>Succession status:</strong> ${esc(link && String(link.successionStatus).replace(/_/g, ' ') || 'not applicable')}</p></section>
        <section class="pf-profile-block"><h4>Documented access points</h4><ul>${(person.accessToPower || []).map(item => `<li>${esc(item)}</li>`).join('') || '<li>No access mechanism recorded.</li>'}</ul></section>
        <section class="pf-profile-block"><h4>Documented exercise and role mechanisms</h4><ul>${(person.tierAccess || []).map(item => `<li><strong>${esc(item.mechanism || item.tierId)}:</strong> ${esc(item.basis || '')}</li>`).join('') || '<li>No decision mechanism recorded.</li>'}</ul></section>
        <section class="pf-profile-block"><h4>Constraints and counterweight</h4><ul>${(person.constraints || []).map(item => `<li>${esc(item)}</li>`).join('') || '<li>Constraints not yet recorded.</li>'}</ul></section>
        <section class="pf-profile-block"><h4>Evidence boundary</h4><p>${esc(person.notEstablished || 'No additional boundary statement recorded.')}</p></section>
      </div>
      <h3>Proximity-to-Power Assessment</h3>${bars(person)}
      <h3>Source ledger</h3><div class="pf-profile-grid">${sourceCards(person)}</div>
      <div class="pf-card-actions"><button data-watch="person:${esc(person.id)}">${state.watch.has(`person:${person.id}`) ? 'Remove from watchlist' : 'Track this person'}</button><a href="contact-the-machine.html?topic=correction&subject=${encodeURIComponent(person.name)}">Correction / right of reply</a></div>`;
    $('#pf-modal').classList.add('open');
    $('#pf-modal').setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    $('#pf-modal').classList.remove('open');
    $('#pf-modal').setAttribute('aria-hidden', 'true');
  }

  function renderRanked(selector, list, limit) {
    const element = $(selector);
    const filtered = list.filter(matches).slice(0, limit || 8);
    element.innerHTML = filtered.length ? filtered.map((person, index) => personCard(person, index + 1)).join('') : '<div class="pf-empty">No verified family-linked profiles match the current filter.</div>';
  }

  function renderLanes() {
    $('#pf-lanes').innerHTML = (state.config.lanes || []).map(item => `<article class="pf-lane"><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></article>`).join('');
  }

  function renderDirectory() {
    const q = state.filters.q.toLowerCase();
    const items = state.families.filter(family => {
      if (state.watchOnly && !state.watch.has(`family:${family.id}`)) return false;
      if (state.filters.family && family.id !== state.filters.family) return false;
      if (state.filters.evidence && family.classification !== state.filters.evidence) return false;
      if (q && [family.name, family.type, (family.jurisdictions || []).join(' '), (family.structuresReached || []).join(' ')].join(' ').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    $('#pf-family-directory').innerHTML = items.length ? items.map(familyCard).join('') : '<div class="pf-empty">No family records match the current filter.</div>';
  }

  function renderComparisons() {
    const faces = state.people.slice().sort((a, b) => publicScore(b) - publicScore(a)).filter(matches).slice(0, 5);
    const operators = state.people.slice().sort((a, b) => operatorScore(b) - operatorScore(a)).filter(matches).slice(0, 5);
    $('#pf-faces-operators').innerHTML = `<div class="pf-comparison-col"><h3>Public family faces</h3>${faces.map((person, index) => personCard(person, index + 1)).join('')}</div><div class="pf-versus">VERSUS</div><div class="pf-comparison-col"><h3>Operational controllers and gatekeepers</h3>${operators.map((person, index) => personCard(person, index + 1)).join('')}</div>`;
  }

  function renderGaps() {
    $('#pf-gaps').innerHTML = state.families.map(family => {
      const linked = state.links.filter(link => link.familyId === family.id);
      const gatekeepers = linked.filter(link => link.roleType === 'professional_gatekeeper').length;
      const succession = linked.filter(link => ['active_successor', 'probable_successor'].includes(link.successionStatus)).length;
      const gaps = [];
      if (!gatekeepers) gaps.push('No independently verified professional gatekeeper is yet linked.');
      if (!succession) gaps.push('No active successor is currently scored.');
      gaps.push(...(family.constraints || []).slice(0, 2));
      return `<article class="pf-card"><h3>${esc(family.name)}</h3><p>${esc(gaps.join(' · '))}</p><div class="pf-boundary"><strong>Do not infer:</strong> ${esc(family.unsupportedClaim || 'Opacity is not proof of hidden control.')}</div></article>`;
    }).join('');
  }

  function renderClaims() {
    $('#pf-claims').innerHTML = (state.config.claims || []).map(claim => `<article class="pf-card"><div class="pf-meta">${badge(claim.classification)}<span class="pf-tag">${esc(claim.confidence)} confidence</span></div><h3>${esc(claim.claim)}</h3><details open><summary>Evidence test</summary><p><strong>Supporting evidence:</strong> ${esc(claim.support)}</p><p><strong>Evidence against:</strong> ${esc(claim.against)}</p><p><strong>Missing evidence:</strong> ${esc(claim.missing)}</p><p><strong>Current conclusion:</strong> ${esc(claim.conclusion)}</p></details></article>`).join('');
  }

  function renderQuestions() {
    $('#pf-questions').innerHTML = (state.config.unresolvedQuestions || []).map((question, index) => {
      const key = `question:${index}`;
      return `<article class="pf-question"><strong>Q${index + 1}</strong><p>${esc(question)}</p><div class="pf-card-actions"><button data-watch="${key}">${state.watch.has(key) ? 'Following' : 'Follow question'}</button><a href="contact-the-machine.html?topic=evidence&question=${encodeURIComponent(question)}">Drop evidence</a></div></article>`;
    }).join('');
  }

  function renderMap() {
    const people = state.people.slice().sort((a, b) => totalScore(b) - totalScore(a)).filter(matches).slice(0, 24);
    const families = state.families.filter(family => people.some(person => familyForPerson(person)?.id === family.id));
    const width = 900, height = 640, centerX = width / 2, centerY = height / 2;
    const nodes = [], edges = [];
    families.forEach((family, index) => {
      const angle = Math.PI * 2 * index / Math.max(families.length, 1) - Math.PI / 2;
      nodes.push({ id: `family:${family.id}`, label: family.name, x: centerX + Math.cos(angle) * 285, y: centerY + Math.sin(angle) * 250, type: 'family' });
    });
    people.forEach((person, index) => {
      const family = familyForPerson(person);
      const familyIndex = families.findIndex(item => item.id === family.id);
      const baseAngle = Math.PI * 2 * familyIndex / Math.max(families.length, 1) - Math.PI / 2;
      const offset = (index % 2 ? 0.16 : -0.16) + (index % 3 - 1) * 0.05;
      nodes.push({ id: `person:${person.id}`, label: person.name, x: centerX + Math.cos(baseAngle + offset) * 155, y: centerY + Math.sin(baseAngle + offset) * 145, type: 'person' });
      edges.push({ a: `family:${family.id}`, b: `person:${person.id}`, type: 'documented' });
    });
    const byId = Object.fromEntries(nodes.map(node => [node.id, node]));
    $('#pf-map').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Power-family network map"><g>${edges.map(edge => {
      const a = byId[edge.a], b = byId[edge.b];
      return a && b ? `<line class="pf-edge ${edge.type}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>` : '';
    }).join('')}</g><g>${nodes.map(node => `<g class="pf-node ${node.type}" data-map-node="${esc(node.id)}" transform="translate(${node.x} ${node.y})"><circle r="${node.type === 'family' ? 28 : 20}"></circle><text y="${node.type === 'family' ? 42 : 34}">${esc(node.label.length > 24 ? `${node.label.slice(0, 22)}…` : node.label)}</text></g>`).join('')}</g></svg>`;
  }

  function renderMapDetail(key) {
    const [type, ...rest] = key.split(':');
    const id = rest.join(':');
    if (type === 'person') {
      const person = state.people.find(item => item.id === id);
      if (!person) return;
      $('#pf-map-detail').innerHTML = `<div class="pf-meta">${badge(person.classification)}${roleTypeTag(person)}</div><h3>${esc(person.name)}</h3><p>${esc(person.currentRole || '')}</p>${bars(person)}<div class="pf-card-actions"><button data-open-person="${esc(person.id)}">Open full profile</button></div>`;
      return;
    }
    const family = state.families.find(item => item.id === id);
    if (!family) return;
    $('#pf-map-detail').innerHTML = `<div class="pf-meta">${badge(family.classification)}</div><h3>${esc(family.name)}</h3><p>${esc(family.type || '')}</p><p><strong>Structures reached:</strong> ${esc((family.structuresReached || []).join(' · '))}</p><div class="pf-card-actions"><button data-watch="family:${esc(family.id)}">${state.watch.has(`family:${family.id}`) ? 'Watching' : 'Track family'}</button></div>`;
  }

  function renderFilters() {
    $('#pf-family-filter').innerHTML = '<option value="">All families</option>' + state.families.map(family => `<option value="${esc(family.id)}">${esc(family.name)}</option>`).join('');
    const vectors = [...new Set(state.people.flatMap(vectorFor))].sort();
    $('#pf-vector-filter').innerHTML = '<option value="">All power vectors</option>' + vectors.map(vector => `<option>${esc(vector)}</option>`).join('');
    const evidence = [...new Set(state.people.map(person => person.classification).concat(state.families.map(family => family.classification)))].filter(Boolean);
    $('#pf-evidence-filter').innerHTML = '<option value="">All evidence classes</option>' + evidence.map(value => `<option value="${esc(value)}">${esc(label(value))}</option>`).join('');
  }

  function renderAll() {
    renderRanked('#pf-institutional', state.people.slice().sort((a, b) => Math.max(publicScore(b), tier(b, 'permanent-system')) - Math.max(publicScore(a), tier(a, 'permanent-system'))), 9);
    renderRanked('#pf-capital', state.people.slice().sort((a, b) => Math.max(tier(b, 'money-gatekeepers'), tier(b, 'ownership-infrastructure'), scores(b).assetControl * 20) - Math.max(tier(a, 'money-gatekeepers'), tier(a, 'ownership-infrastructure'), scores(a).assetControl * 20)), 9);
    renderRanked('#pf-connectors', state.people.slice().sort((a, b) => mechanismCount(b) * 20 + (b.crossSystemScore || 0) - (mechanismCount(a) * 20 + (a.crossSystemScore || 0))), 9);
    renderRanked('#pf-gatekeepers', state.people.filter(isGatekeeper).sort((a, b) => operatorScore(b) - operatorScore(a)), 12);
    const successorStatuses = state.config.successorStatuses || ['active_successor', 'probable_successor'];
    renderRanked('#pf-successors', state.people.filter(person => successorStatuses.includes(linkForPerson(person.id)?.successionStatus)).sort((a, b) => totalScore(b) - totalScore(a)), 12);
    renderComparisons();
    renderDirectory();
    renderGaps();
    renderClaims();
    renderQuestions();
    renderMap();
    $('#pf-watchlist-toggle').setAttribute('aria-pressed', String(state.watchOnly));
  }

  function bind() {
    document.addEventListener('click', event => {
      const open = event.target.closest('[data-open-person]');
      if (open) { openPerson(open.getAttribute('data-open-person')); return; }
      const watch = event.target.closest('[data-watch]');
      if (watch) { toggleWatch(watch.getAttribute('data-watch')); return; }
      const node = event.target.closest('[data-map-node]');
      if (node) renderMapDetail(node.getAttribute('data-map-node'));
    });
    $('#pf-modal-close').addEventListener('click', closeModal);
    $('#pf-modal').addEventListener('click', function (event) { if (event.target === this) closeModal(); });
    $('#pf-search').addEventListener('input', function () { state.filters.q = this.value; renderAll(); });
    $('#pf-family-filter').addEventListener('change', function () { state.filters.family = this.value; renderAll(); });
    $('#pf-vector-filter').addEventListener('change', function () { state.filters.vector = this.value; renderAll(); });
    $('#pf-evidence-filter').addEventListener('change', function () { state.filters.evidence = this.value; renderAll(); });
    $('#pf-watchlist-toggle').addEventListener('click', function () { state.watchOnly = !state.watchOnly; renderAll(); });
  }

  function validateData() {
    const familyIds = new Set(state.families.map(family => family.id));
    const personIds = new Set(state.people.map(person => person.id));
    const sourceIds = new Set(state.sources.map(source => source.id));
    if (personIds.size !== state.people.length) throw new Error('Curated registry contains duplicate person IDs.');
    if (new Set(state.links.map(link => `${link.familyId}:${link.personId}`)).size !== state.links.length) throw new Error('Curated registry contains duplicate family-person links.');
    for (const link of state.links) {
      if (!familyIds.has(link.familyId)) throw new Error(`Unknown family link: ${link.familyId}`);
      if (!personIds.has(link.personId)) throw new Error(`Unknown person link: ${link.personId}`);
    }
    for (const family of state.families) {
      if (!state.links.some(link => link.familyId === family.id)) throw new Error(`Family has no verified living profile: ${family.name}`);
    }
    for (const person of state.people) {
      if (!(person.sourceIds || []).length) throw new Error(`Person has no source IDs: ${person.name}`);
      for (const id of person.sourceIds) if (!sourceIds.has(id)) throw new Error(`Unresolved source ${id} for ${person.name}`);
    }
  }

  function stats() {
    $('#pf-family-count').textContent = state.families.length;
    $('#pf-person-count').textContent = state.people.length;
    $('#pf-source-count').textContent = state.sources.length;
    const dates = [state.core && state.core.asOf, state.config && state.config.asOf, ...state.people.map(person => person.verifiedAt)].filter(Boolean).sort();
    $('#pf-asof').textContent = dates.pop() || 'Under review';
  }

  Promise.all(Object.entries(URLS).map(([key, url]) => fetch(url, { cache: 'no-store' }).then(response => {
    if (!response.ok) throw new Error(`${key} feed ${response.status}`);
    return response.json();
  }).then(value => [key, value]))).then(rows => {
    const data = Object.fromEntries(rows);
    state.config = data.config;
    state.families = data.families.families || [];
    state.people = data.curated.people || [];
    state.links = data.curated.familyPersonLinks || [];
    state.sources = [...(data.families.sources || []), ...(data.curated.sources || [])];
    state.sourceById = new Map(state.sources.map(source => [source.id, source]));
    state.core = data.core;
    validateData();
    renderLanes();
    renderFilters();
    stats();
    bind();
    renderAll();
  }).catch(error => {
    console.error(error);
    document.querySelector('main').insertAdjacentHTML('afterbegin', `<section class="pf-section"><div class="wrap pf-fail"><h2>Power-family intelligence feed unavailable</h2><p>${esc(error.message)}</p><p>The page fails closed rather than inventing names, scores or relationships.</p></div></section>`);
  });
})();
