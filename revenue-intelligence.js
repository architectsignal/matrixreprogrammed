(() => {
  'use strict';

  const VERSION = '1.0.0';
  const STORAGE_KEY = 'matrix.revenue.intent.v1';
  const SESSION_KEY = 'matrix.revenue.session.v1';
  const OPENED_KEY = 'matrix.revenue.opened.v1';
  const BASE = new URL('.', document.currentScript?.src || document.baseURI);

  const DEFAULT_CONFIG = {
    lanes: {
      investigate: { label: 'Investigate', description: 'Evidence, dossiers, sources and unresolved questions.' },
      read: { label: 'Read', description: 'Books, reports and deeper reading routes.' },
      support: { label: 'Support', description: 'Membership and recurring support for the research machine.' },
      build: { label: 'Build', description: 'Practical money, business and operating guides.' },
      watch: { label: 'Watch', description: 'Daily intelligence, watchlists and return loops.' },
      mystery: { label: 'Decode', description: 'D.O.G, symbolism and hidden-system reading routes.' }
    },
    offers: [
      { id: 'membership', lane: 'support', priority: 7, href: 'membership.html', title: 'Power the machine', kicker: 'Recurring support', description: 'Turn occasional reading into ongoing access and support the intelligence system.', variants: [{ cta: 'Open membership', headline: 'Go deeper than the public layer.' }, { cta: 'See member access', headline: 'Keep the machine running and unlock the next layer.' }] },
      { id: 'book-archive', lane: 'read', priority: 6, href: 'amazon-store-books.html', title: 'Enter the book universe', kicker: 'One-off purchase', description: 'Move from the public record into the full Matrix Reprogrammed reading universe.', variants: [{ cta: 'Open the book store', headline: 'Your next file is probably a book.' }, { cta: 'Browse the archive', headline: 'Take the investigation off-screen.' }] },
      { id: 'black-file', lane: 'investigate', priority: 5, href: 'black-file.html', title: 'Open The Black File', kicker: 'Free entry route', description: 'Use the free Black File as the shortest route into the wider archive and evidence system.', variants: [{ cta: 'Open The Black File', headline: 'Start with the free deep file.' }, { cta: 'Get the free brief', headline: 'Take the evidence trail with you.' }] },
      { id: 'daily-watch', lane: 'watch', priority: 5, href: 'daily-watch.html', title: 'Follow what changes', kicker: 'Return loop', description: 'Use the daily intelligence hit list to return only when something meaningful changes.', variants: [{ cta: 'Open daily intelligence', headline: 'Do not reread the archive. Watch the delta.' }, { cta: 'See today’s priorities', headline: 'Track the records that are moving now.' }] },
      { id: 'making-money', lane: 'build', priority: 4, href: 'making-money.html', title: 'Build something useful', kicker: 'Practical route', description: 'Move from analysis into practical business, income and operating guides.', variants: [{ cta: 'Open making money', headline: 'Turn attention into an operating plan.' }, { cta: 'Browse practical guides', headline: 'Use the machine to build, not only observe.' }] },
      { id: 'dog-architect', lane: 'mystery', priority: 4, href: 'dog-the-architect.html', title: 'Enter D.O.G', kicker: 'Collector route', description: 'Follow the symbolic and mystery-tradition lane into the flagship D.O.G universe.', variants: [{ cta: 'Enter D.O.G', headline: 'Follow the hidden-system lane.' }, { cta: 'Open the Architect route', headline: 'Go where the symbolic trail becomes a book.' }] }
    ]
  };

  const ROUTE_SIGNALS = [
    { rx: /(evidence|source|dossier|epstein|intel|investigat|follow-the-money|power-atlas|open-question|consequence)/i, add: { investigate: 4, watch: 1 } },
    { rx: /(book|amazon|offer|sales-ladder|black-file)/i, add: { read: 4, investigate: 1 } },
    { rx: /(membership|member|support|donat)/i, add: { support: 6 } },
    { rx: /(making-money|business|guide|income|revenue|profit)/i, add: { build: 5 } },
    { rx: /(daily-watch|weekly-watch|live-intel|news|watchlist|brief)/i, add: { watch: 5, investigate: 1 } },
    { rx: /(dog-the-architect|symbol|masonic|occult|mystery|architect)/i, add: { mystery: 5, read: 2 } }
  ];

  const state = {
    scores: { investigate: 0, read: 0, support: 0, build: 0, watch: 0, mystery: 0 },
    touches: 0,
    config: DEFAULT_CONFIG,
    sessionId: '',
    loaded: false,
    dismissed: false
  };

  function safeSessionGet(key) { try { return sessionStorage.getItem(key); } catch { return null; } }
  function safeSessionSet(key, value) { try { sessionStorage.setItem(key, value); } catch {} }
  function randomId() { if (crypto?.randomUUID) return crypto.randomUUID(); return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
  function sessionId() { let value = safeSessionGet(SESSION_KEY); if (!value) { value = randomId(); safeSessionSet(SESSION_KEY, value); } return value; }
  function restore() {
    state.sessionId = sessionId();
    try {
      const saved = JSON.parse(safeSessionGet(STORAGE_KEY) || 'null');
      if (saved?.scores) {
        for (const lane of Object.keys(state.scores)) {
          const value = Number(saved.scores[lane] || 0);
          state.scores[lane] = Number.isFinite(value) ? Math.max(0, Math.min(value, 50)) : 0;
        }
      }
      state.touches = Number(saved?.touches || 0);
      state.dismissed = Boolean(saved?.dismissed);
    } catch {}
  }
  function persist() { safeSessionSet(STORAGE_KEY, JSON.stringify({ scores: state.scores, touches: state.touches, dismissed: state.dismissed })); }
  function addSignal(add, magnitude = 1) {
    if (!add || typeof add !== 'object') return;
    for (const [lane, raw] of Object.entries(add)) {
      if (!(lane in state.scores)) continue;
      const value = Number(raw || 0) * magnitude;
      state.scores[lane] = Math.max(0, Math.min(50, state.scores[lane] + value));
    }
    state.touches += 1;
    persist();
    refreshUi();
  }
  function applyRouteSignal(text) { for (const rule of ROUTE_SIGNALS) { if (rule.rx.test(text)) addSignal(rule.add, 1); } }
  function hash(text) { let h = 2166136261; for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function variantIndex(offer) { const count = Math.max(1, offer.variants?.length || 0); return hash(`${state.sessionId}:${offer.id}`) % count; }
  function currentPath() { return `${location.pathname} ${document.title}`.toLowerCase(); }
  function scoreOffer(offer) {
    let score = Number(offer.priority || 0);
    score += Number(state.scores[offer.lane] || 0) * 1.4;
    if (currentPath().includes(String(offer.href || '').replace('.html', '').toLowerCase())) score -= 8;
    if (offer.id === 'black-file' && state.touches < 2) score += 5;
    if (offer.id === 'membership' && state.scores.support >= 4) score += 6;
    if (offer.id === 'book-archive' && state.scores.read >= 4) score += 4;
    return score;
  }
  function rankedOffers() { return [...(state.config.offers || [])].map((offer) => ({ ...offer, score: scoreOffer(offer), variantIndex: variantIndex(offer) })).sort((a, b) => b.score - a.score); }
  function topLane() { return Object.entries(state.scores).sort((a, b) => b[1] - a[1])[0]?.[0] || 'investigate'; }
  function eventPayload(name, extra = {}) { return { name, route: 'revenue_intelligence', page: location.pathname || '/', title: document.title, at: new Date().toISOString(), revenue_engine_version: VERSION, session_bucket: hash(state.sessionId) % 1000, top_lane: topLane(), touches: state.touches, ...extra }; }
  function track(name, extra) {
    if (navigator.doNotTrack === '1') return;
    const payload = JSON.stringify(eventPayload(name, extra));
    try {
      if (navigator.sendBeacon) { navigator.sendBeacon('/track-event', new Blob([payload], { type: 'application/json' })); return; }
      fetch('/track-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
    } catch {}
  }
  function installCss() {
    if (document.querySelector('link[data-matrix-revenue-intelligence]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('revenue-intelligence.css?v=1.0.0', BASE).href;
    link.dataset.matrixRevenueIntelligence = 'true';
    document.head.appendChild(link);
  }
  function buildUi() {
    if (document.getElementById('matrix-revenue-signal')) return;
    const root = document.createElement('aside');
    root.id = 'matrix-revenue-signal';
    root.setAttribute('aria-live', 'polite');
    root.innerHTML = `<button class="mri-chip" type="button" aria-expanded="false"><span class="mri-dot"></span><span>SIGNAL PATH</span><small>next best action</small></button><section class="mri-panel" aria-hidden="true"><div class="mri-panel-head"><div><span class="mri-kicker">REVENUE INTELLIGENCE / VISITOR CONTROL</span><h2 class="mri-headline">Find the shortest useful route.</h2></div><button class="mri-close" type="button" aria-label="Close Signal Path">×</button></div><p class="mri-copy"></p><div class="mri-meter"><span></span></div><div class="mri-actions"><a class="mri-primary" href="black-file.html">Open route</a><button class="mri-next" type="button">Show another</button><a class="mri-tune" href="signal-path.html">Tune my path</a></div><p class="mri-privacy">Based only on pages and links used in this browser session. No identity profile is required.</p></section>`;
    document.body.appendChild(root);

    const chip = root.querySelector('.mri-chip');
    const close = root.querySelector('.mri-close');
    const next = root.querySelector('.mri-next');
    const primary = root.querySelector('.mri-primary');
    chip.addEventListener('click', () => setOpen(!root.classList.contains('is-open'), 'chip'));
    close.addEventListener('click', () => { state.dismissed = true; persist(); setOpen(false, 'dismiss'); track('revenue_signal_dismiss', {}); });
    next.addEventListener('click', cycleOffer);
    primary.addEventListener('click', () => { const offer = primary.dataset.offerId || ''; addSignal({ [primary.dataset.lane || 'read']: 2 }, 1); track('revenue_offer_click', { offer_id: offer, offer_lane: primary.dataset.lane || '', variant: primary.dataset.variant || '', destination: primary.getAttribute('href') || '' }); });
  }
  let activeOfferIndex = 0;
  function refreshUi() {
    const root = document.getElementById('matrix-revenue-signal');
    if (!root) return;
    const offers = rankedOffers();
    if (!offers.length) return;
    activeOfferIndex = Math.min(activeOfferIndex, offers.length - 1);
    const offer = offers[activeOfferIndex];
    const variant = offer.variants?.[offer.variantIndex] || {};
    const lane = state.config.lanes?.[offer.lane];
    root.querySelector('.mri-headline').textContent = variant.headline || offer.title;
    root.querySelector('.mri-copy').textContent = `${offer.description} ${lane?.description || ''}`.trim();
    const primary = root.querySelector('.mri-primary');
    primary.textContent = variant.cta || offer.title;
    primary.href = offer.href;
    primary.dataset.offerId = offer.id;
    primary.dataset.lane = offer.lane;
    primary.dataset.variant = String(offer.variantIndex);
    root.querySelector('.mri-meter span').style.width = `${Math.max(12, Math.min(100, 20 + offer.score * 4))}%`;
    root.dataset.offerId = offer.id;
  }
  function cycleOffer() { const offers = rankedOffers(); if (!offers.length) return; activeOfferIndex = (activeOfferIndex + 1) % Math.min(offers.length, 4); refreshUi(); const offer = offers[activeOfferIndex]; track('revenue_offer_cycle', { offer_id: offer.id, offer_lane: offer.lane }); }
  function setOpen(open, source) {
    const root = document.getElementById('matrix-revenue-signal');
    if (!root) return;
    root.classList.toggle('is-open', open);
    root.querySelector('.mri-chip')?.setAttribute('aria-expanded', String(open));
    root.querySelector('.mri-panel')?.setAttribute('aria-hidden', String(!open));
    if (open) { const offer = rankedOffers()[activeOfferIndex] || rankedOffers()[0]; track('revenue_offer_view', { source, offer_id: offer?.id || '', offer_lane: offer?.lane || '', variant: offer?.variantIndex ?? '' }); }
  }
  function eligibleForAutoOpen() { if (state.dismissed || safeSessionGet(OPENED_KEY) === '1') return false; if (/login|privacy|terms|correction|contact/i.test(location.pathname)) return false; return true; }
  function scheduleOpen() {
    if (!eligibleForAutoOpen()) return;
    let opened = false;
    const open = (source) => { if (opened || !eligibleForAutoOpen()) return; opened = true; safeSessionSet(OPENED_KEY, '1'); setOpen(true, source); };
    const timer = window.setTimeout(() => open('engaged_timer'), 14000);
    const onScroll = () => { const max = Math.max(1, document.documentElement.scrollHeight - innerHeight); if (scrollY / max >= 0.36) { clearTimeout(timer); open('engaged_scroll'); removeEventListener('scroll', onScroll); } };
    addEventListener('scroll', onScroll, { passive: true });
  }
  function observeSignals() {
    document.addEventListener('click', (event) => { const anchor = event.target.closest?.('a[href]'); if (!anchor) return; applyRouteSignal(`${anchor.getAttribute('href') || ''} ${anchor.textContent || ''}`.toLowerCase()); }, true);
    document.addEventListener('submit', (event) => { const form = event.target; const text = `${form?.id || ''} ${form?.getAttribute?.('name') || ''}`.toLowerCase(); if (/lead|optin|brief|email/.test(text)) addSignal({ investigate: 2, read: 1, watch: 2 }); if (/member|support|paypal/.test(text)) addSignal({ support: 5 }); }, true);
    window.addEventListener('matrix:revenue-signal', (event) => { const detail = event.detail || {}; if (detail.lane && detail.lane in state.scores) { addSignal({ [detail.lane]: Math.max(1, Math.min(8, Number(detail.weight || 3))) }); track('revenue_explicit_signal', { lane: detail.lane, source: detail.source || 'custom_event' }); } });
  }
  async function loadConfig() {
    try {
      const response = await fetch(new URL('data/revenue-intelligence.json?v=1.0.0', BASE), { cache: 'no-store' });
      if (!response.ok) return;
      const remote = await response.json();
      if (Array.isArray(remote?.offers) && remote.offers.length >= 3 && remote?.lanes) state.config = remote;
    } catch {}
  }
  function publicApi() {
    window.MatrixRevenueIntelligence = Object.freeze({
      version: VERSION,
      getState: () => JSON.parse(JSON.stringify({ scores: state.scores, touches: state.touches, topLane: topLane() })),
      rankOffers: () => rankedOffers().map(({ id, lane, title, href, score, variantIndex }) => ({ id, lane, title, href, score, variantIndex })),
      signal: (lane, weight = 3, source = 'api') => { if (!(lane in state.scores)) return false; addSignal({ [lane]: Math.max(1, Math.min(8, Number(weight || 3))) }); track('revenue_explicit_signal', { lane, source }); return true; },
      open: () => setOpen(true, 'api'),
      close: () => setOpen(false, 'api')
    });
    window.dispatchEvent(new CustomEvent('matrix:revenue-ready', { detail: { version: VERSION } }));
  }
  async function init() {
    restore();
    installCss();
    await loadConfig();
    applyRouteSignal(currentPath());
    buildUi();
    observeSignals();
    refreshUi();
    publicApi();
    state.loaded = true;
    track('revenue_engine_ready', { offer_id: rankedOffers()[0]?.id || '' });
    scheduleOpen();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
