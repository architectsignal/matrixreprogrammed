(() => {
  'use strict';

  const VERSION = '1.0.0';
  const DATA_URL = 'data/identity-affiliation-overlay.json?v=1.0.0';
  const state = {
    config: null,
    records: [],
    active: null,
    pageSubject: '',
    open: false
  };

  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const slug = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function pageContext() {
    const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const title = document.title || '';
    const h1 = document.querySelector('main h1, h1');
    const bodySubject = document.body && (document.body.dataset.dossierSubject || document.body.dataset.subject || '');
    const metaSubject = document.querySelector('meta[name="matrix-subject"]');
    return {
      path,
      title,
      heading: h1 ? h1.textContent.trim() : '',
      explicitSubject: bodySubject || (metaSubject ? metaSubject.content : ''),
      bodyClass: document.body ? document.body.className : ''
    };
  }

  function dossierLike(context) {
    const text = [context.path, context.title, context.heading, context.bodyClass].join(' ').toLowerCase();
    return /dossier|profile|person|family|epstein|behind.the.curtain|power.family|crime.file|intelligence.file/.test(text) || Boolean(context.explicitSubject);
  }

  function matchScore(record, context) {
    let score = 0;
    const match = record.match || {};
    const aliases = [record.subject].concat(record.aliases || []).filter(Boolean);
    const path = context.path.toLowerCase();
    const title = context.title.toLowerCase();
    const heading = context.heading.toLowerCase();
    const explicit = context.explicitSubject.toLowerCase();

    (match.paths || []).forEach((candidate) => {
      if (path === String(candidate).toLowerCase()) score = Math.max(score, 120);
    });
    aliases.forEach((alias) => {
      const needle = String(alias).toLowerCase();
      if (!needle) return;
      if (explicit === needle) score = Math.max(score, 110);
      if (title.includes(needle)) score = Math.max(score, 90);
      if (heading.includes(needle)) score = Math.max(score, 80);
    });
    return score;
  }

  function chooseRecord(context) {
    return state.records
      .map((record) => ({ record, score: matchScore(record, context) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.record || null;
  }

  function classificationLabel(id) {
    const item = (state.config.classifications || []).find((entry) => entry.id === id);
    return item ? item.label : String(id || 'unclassified').replace(/_/g, ' ');
  }

  function badge(id) {
    return `<span class="iao-badge iao-${esc(slug(id))}">${esc(classificationLabel(id))}</span>`;
  }

  function percent(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : null;
  }

  function ownershipRows(record) {
    const ownership = record.ownership || {};
    const entries = ownership.entries || [];
    if (!entries.length) {
      return `<div class="iao-empty">${esc(ownership.summary || 'No verified ownership distribution is attached to this subject record.')}</div>`;
    }
    return entries.map((entry) => {
      const economic = percent(entry.economicPct);
      const voting = percent(entry.votingPct);
      return `<article class="iao-owner">
        <div class="iao-owner-head"><strong>${esc(entry.owner)}</strong>${badge(entry.classification)}</div>
        <p>${esc(entry.basis || '')}</p>
        ${economic == null ? '' : `<div class="iao-meter"><span>Economic ownership ${economic}%</span><i style="--iao-value:${economic}%"></i></div>`}
        ${voting == null ? '' : `<div class="iao-meter"><span>Voting control ${voting}%</span><i style="--iao-value:${voting}%"></i></div>`}
      </article>`;
    }).join('');
  }

  function affiliationRows(record) {
    const entries = record.identityAffiliation || [];
    if (!entries.length) return '<div class="iao-empty">No verified identity or institutional-affiliation record is attached yet.</div>';
    return entries.map((entry) => `<article class="iao-fact">
      <div class="iao-fact-head"><strong>${esc(entry.label)}</strong>${badge(entry.classification)}</div>
      <p>${esc(entry.assessment)}</p>
      <dl>
        <div><dt>Confidence</dt><dd>${esc(entry.confidence || 'not rated')}</dd></div>
        <div><dt>Scope</dt><dd>${esc(entry.scope || 'not specified')}</dd></div>
      </dl>
      ${entry.boundary ? `<div class="iao-boundary"><strong>Boundary:</strong> ${esc(entry.boundary)}</div>` : ''}
    </article>`).join('');
  }

  function claimRows(record) {
    const claims = record.claimTests || [];
    if (!claims.length) return '<div class="iao-empty">No identity-linked or control-linked claim has been logged for testing on this record.</div>';
    return claims.map((claim) => `<article class="iao-claim">
      <div class="iao-fact-head">${badge(claim.classification)}<span class="iao-confidence">${esc(claim.confidence || 'unrated')} confidence</span></div>
      <h4>${esc(claim.claim)}</h4>
      <p><strong>Support:</strong> ${esc(claim.support || 'None recorded.')}</p>
      <p><strong>Contradiction:</strong> ${esc(claim.against || 'None recorded.')}</p>
      <p><strong>Missing proof:</strong> ${esc(claim.missing || 'Not specified.')}</p>
      <div class="iao-conclusion"><strong>Current conclusion:</strong> ${esc(claim.conclusion || 'Open.')}</div>
    </article>`).join('');
  }

  function sourceRows(record) {
    const ids = new Set(record.sourceIds || []);
    (record.identityAffiliation || []).forEach((entry) => (entry.sourceIds || []).forEach((id) => ids.add(id)));
    (record.ownership?.entries || []).forEach((entry) => (entry.sourceIds || []).forEach((id) => ids.add(id)));
    (record.claimTests || []).forEach((entry) => (entry.sourceIds || []).forEach((id) => ids.add(id)));
    const sources = (state.config.sources || []).filter((source) => ids.has(source.id));
    if (!sources.length) return '<div class="iao-empty">No source list is attached to this record yet.</div>';
    return sources.map((source) => `<article class="iao-source">
      <div><strong>${esc(source.publisher)}</strong><span>${esc(source.type || 'source')}</span></div>
      <a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a>
      <p><strong>Establishes:</strong> ${esc(source.establishes || '')}</p>
      <p><strong>Does not establish:</strong> ${esc(source.doesNotEstablish || '')}</p>
    </article>`).join('');
  }

  function genericRecord(context) {
    const subject = context.explicitSubject || context.heading || context.title.replace(/\s*[|·-].*$/, '') || 'Current dossier';
    return {
      id: `unresolved-${slug(subject)}`,
      subject,
      subjectType: 'dossier subject',
      status: 'record_pending',
      verifiedAt: null,
      conclusion: 'This dossier is covered by the overlay, but no identity, affiliation or ownership assertion has been published without evidence.',
      identityAffiliation: [],
      ownership: { summary: 'Ownership and voting-control data remain unverified for this dossier.', entries: [] },
      claimTests: [],
      evidenceGaps: [
        'Public self-identification or a reliable biographical record',
        'Formal institutional membership or office records',
        'Legal ownership, voting-right or beneficial-ownership filings',
        'Evidence connecting any affiliation to a specific decision or act'
      ],
      sourceIds: []
    };
  }

  function renderPanel(record) {
    const panel = document.getElementById('iao-panel');
    if (!panel) return;
    const gaps = record.evidenceGaps || [];
    panel.innerHTML = `<div class="iao-panel-inner">
      <header class="iao-header">
        <div><span class="iao-kicker">Identity, Affiliation & Ownership Evidence Overlay</span><h2 id="iao-title">${esc(record.subject)}</h2><p>${esc(record.subjectType || 'subject')} · ${esc(record.status || 'under review')}</p></div>
        <button type="button" class="iao-close" data-iao-close aria-label="Close overlay">×</button>
      </header>
      <div class="iao-rule"><strong>Evidence rule:</strong> identity is recorded only from public self-identification, formal records or reliable biography. It is never inferred from a surname. Identity alone is not evidence of wrongdoing, coordination or control.</div>
      <nav class="iao-tabs" aria-label="Overlay sections">
        <button class="active" data-iao-tab="summary">Summary</button>
        <button data-iao-tab="ownership">Ownership</button>
        <button data-iao-tab="affiliation">Identity & affiliation</button>
        <button data-iao-tab="claims">Claims tested</button>
        <button data-iao-tab="sources">Sources</button>
      </nav>
      <section class="iao-section active" data-iao-section="summary">
        <div class="iao-summary-grid">
          <article><span>Last verified</span><strong>${esc(record.verifiedAt || 'Not yet verified')}</strong></article>
          <article><span>Record status</span><strong>${esc(String(record.status || 'under review').replace(/_/g, ' '))}</strong></article>
          <article><span>Ownership entries</span><strong>${(record.ownership?.entries || []).length}</strong></article>
          <article><span>Affiliation entries</span><strong>${(record.identityAffiliation || []).length}</strong></article>
        </div>
        <div class="iao-conclusion"><strong>Evidence-led conclusion:</strong> ${esc(record.conclusion || 'No conclusion recorded.')}</div>
        <h3>Evidence gaps</h3>
        <ul class="iao-gaps">${gaps.length ? gaps.map((gap) => `<li>${esc(gap)}</li>`).join('') : '<li>No material gap recorded.</li>'}</ul>
      </section>
      <section class="iao-section" data-iao-section="ownership"><h3>Legal ownership and voting control</h3><p class="iao-muted">Percentages appear only where a filing or equivalent record establishes the denominator. Religious, ethnic or cultural identity is not converted into collective ownership.</p>${ownershipRows(record)}</section>
      <section class="iao-section" data-iao-section="affiliation"><h3>Documented identity and institutional affiliation</h3><p class="iao-muted">Family background, personal belief, adult practice and formal institutional membership remain separate fields.</p>${affiliationRows(record)}</section>
      <section class="iao-section" data-iao-section="claims"><h3>Claims tested</h3>${claimRows(record)}</section>
      <section class="iao-section" data-iao-section="sources"><h3>Source provenance</h3>${sourceRows(record)}</section>
      <footer class="iao-footer"><a href="contact-the-machine.html?topic=evidence&subject=${encodeURIComponent(record.subject)}">Drop evidence</a><a href="contact-the-machine.html?topic=correction&subject=${encodeURIComponent(record.subject)}">Correction / right of reply</a><span>Engine v${VERSION}</span></footer>
    </div>`;
  }

  function installShell(record, context) {
    if (document.getElementById('iao-trigger')) return;
    const trigger = document.createElement('button');
    trigger.id = 'iao-trigger';
    trigger.type = 'button';
    trigger.setAttribute('aria-controls', 'iao-panel');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = '<span>IDENTITY + CONTROL</span><strong>EVIDENCE OVERLAY</strong>';

    const backdrop = document.createElement('div');
    backdrop.id = 'iao-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');

    const panel = document.createElement('aside');
    panel.id = 'iao-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'iao-title');
    panel.setAttribute('aria-hidden', 'true');

    document.body.append(trigger, backdrop, panel);
    renderPanel(record);

    if (dossierLike(context)) {
      const main = document.querySelector('main');
      const firstSection = main && main.querySelector('section');
      const strip = document.createElement('div');
      strip.className = 'iao-inline-strip';
      strip.innerHTML = `<div><span>Evidence overlay active</span><strong>${esc(record.subject)}</strong><small>${esc(record.conclusion || 'Identity, affiliation and ownership are assessed separately.')}</small></div><button type="button" data-iao-open>Open identity + control record</button>`;
      if (main) {
        if (firstSection && firstSection.nextSibling) main.insertBefore(strip, firstSection.nextSibling);
        else main.prepend(strip);
      }
    }
  }

  function setOpen(open) {
    state.open = Boolean(open);
    const panel = document.getElementById('iao-panel');
    const backdrop = document.getElementById('iao-backdrop');
    const trigger = document.getElementById('iao-trigger');
    if (!panel || !backdrop || !trigger) return;
    panel.classList.toggle('open', state.open);
    backdrop.classList.toggle('open', state.open);
    panel.setAttribute('aria-hidden', String(!state.open));
    backdrop.setAttribute('aria-hidden', String(!state.open));
    trigger.setAttribute('aria-expanded', String(state.open));
    document.documentElement.classList.toggle('iao-lock', state.open);
    if (state.open) panel.querySelector('[data-iao-close]')?.focus();
  }

  function bind() {
    document.addEventListener('click', (event) => {
      if (event.target.closest('#iao-trigger,[data-iao-open]')) setOpen(true);
      if (event.target.closest('[data-iao-close]') || event.target.id === 'iao-backdrop') setOpen(false);
      const tab = event.target.closest('[data-iao-tab]');
      if (tab) {
        document.querySelectorAll('[data-iao-tab]').forEach((button) => button.classList.toggle('active', button === tab));
        document.querySelectorAll('[data-iao-section]').forEach((section) => section.classList.toggle('active', section.dataset.iaoSection === tab.dataset.iaoTab));
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.open) setOpen(false);
    });
    window.addEventListener('matrix:dossier-subject', (event) => {
      if (!event.detail) return;
      const incoming = event.detail.record || event.detail;
      register(incoming, true);
    });
  }

  function validateRecord(record) {
    return Boolean(record && typeof record === 'object' && record.subject && record.id);
  }

  function register(record, activate = false) {
    if (!validateRecord(record)) return false;
    const index = state.records.findIndex((item) => item.id === record.id);
    if (index >= 0) state.records[index] = record;
    else state.records.push(record);
    if (activate) {
      state.active = record;
      renderPanel(record);
      const strip = document.querySelector('.iao-inline-strip strong');
      if (strip) strip.textContent = record.subject;
    }
    return true;
  }

  async function init() {
    const context = pageContext();
    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Overlay data request failed: ${response.status}`);
      state.config = await response.json();
      state.records = Array.isArray(state.config.records) ? state.config.records : [];
    } catch (error) {
      console.warn('[identity-affiliation-overlay]', error);
      state.config = { classifications: [], sources: [], records: [] };
      state.records = [];
    }
    state.active = chooseRecord(context) || genericRecord(context);
    state.pageSubject = state.active.subject;
    installShell(state.active, context);
    bind();
    window.dispatchEvent(new CustomEvent('matrix:identity-overlay-ready', { detail: { version: VERSION, record: state.active } }));
  }

  window.MatrixIdentityOverlay = {
    version: VERSION,
    open: () => setOpen(true),
    close: () => setOpen(false),
    register,
    validateRecord,
    getActiveRecord: () => state.active
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
