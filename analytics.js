(function(){
  'use strict';

  const CONSENT_KEY = 'matrix_analytics_consent';
  const CONSENT_VERSION = 'analytics-consent-v1';
  const outboundHosts = ['amazon.com','amazon.co.uk','rumble.com'];
  const routeMap = [
    ['epstein-files.html','epstein_command_center'],
    ['source-cards.html','source_cards'],
    ['optin-center.html','optin_center'],
    ['black-file.html','black_file'],
    ['book-black-file.html','black_file_book'],
    ['books.html','book_archive'],
    ['amazon-store-books.html','amazon_store'],
    ['live-intel.html','live_intel'],
    ['news.html','intel_desk'],
    ['intel-archive.html','intel_archive'],
    ['dog-the-architect.html','dog'],
    ['transmissions.html','rumble_network'],
    ['videos.html','video_drops'],
    ['forum.html','forum']
  ];

  function currentRoute(){
    const path = window.location.pathname;
    const found = routeMap.find(([needle]) => path.includes(needle));
    return found ? found[1] : path === '/' || path.endsWith('/index.html') ? 'home' : 'other';
  }

  function globalPrivacyControl(){
    return navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  }

  function storedConsent(){
    if (globalPrivacyControl()) return 'denied';
    try {
      const parsed = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null');
      if (parsed && parsed.version === CONSENT_VERSION && ['granted','denied'].includes(parsed.choice)) return parsed.choice;
    } catch {}
    return 'unset';
  }

  function saveConsent(choice){
    if (!['granted','denied'].includes(choice)) return;
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice, version: CONSENT_VERSION, updatedAt: new Date().toISOString() }));
    } catch {}
  }

  function analyticsAllowed(){
    return storedConsent() === 'granted';
  }

  function internalSend(name, data){
    if (!analyticsAllowed()) return false;
    const payload = JSON.stringify({ name, route: currentRoute(), page: window.location.pathname || '/', title: document.title, at: new Date().toISOString(), consentVersion: CONSENT_VERSION, ...(data || {}) });
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      return navigator.sendBeacon('/track-event', blob);
    }
    fetch('/track-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
      credentials: 'same-origin'
    }).catch(function(){});
    return true;
  }

  function providerSend(name, data){
    if (!analyticsAllowed()) return false;
    internalSend(name, data);
    if (window.plausible) window.plausible(name, { props: data });
    if (window.gtag) window.gtag('consent', 'update', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    if (window.gtag) window.gtag('event', name, data || {});
    if (window.dataLayer) window.dataLayer.push({ event: name, ...(data || {}) });
    window.MatrixReprogrammedEvents = window.MatrixReprogrammedEvents || [];
    window.MatrixReprogrammedEvents.push({ name, data, at: new Date().toISOString() });
    return true;
  }

  function classifyLink(anchor){
    const href = anchor.getAttribute('href') || '';
    const text = (anchor.textContent || '').trim().replace(/\s+/g,' ').slice(0,90);
    let url;
    try { url = new URL(href, window.location.href); } catch { return null; }
    const host = url.hostname.replace(/^www\./,'');
    const pathname = url.pathname;
    let type = 'internal_click';
    if (outboundHosts.some(h => host === h || host.endsWith('.' + h))) type = 'outbound_click';
    if (/amazon\./i.test(host) || /amazon-store-books\.html/i.test(pathname)) type = 'amazon_click';
    if (/rumble\.com/i.test(host) || /videos\.html|transmissions\.html/i.test(pathname)) type = 'rumble_click';
    if (/black-file\.html|book-black-file\.html/i.test(pathname)) type = 'black_file_click';
    if (/books\.html|book-[-\w]+\.html/i.test(pathname)) type = 'book_archive_click';
    if (/live-intel\.html|news\.html/i.test(pathname)) type = 'live_intel_click';
    if (/source-cards\.html|source-cards\.json|source-cards\.md/i.test(pathname)) type = 'source_card_click';
    if (/epstein-files\.html/i.test(pathname) || /\/epstein$/i.test(pathname)) type = 'epstein_source_click';
    if (/evidence-vault|evidence-lane|evidence-policy/i.test(pathname)) type = 'evidence_route_click';
    if (/optin-|optin-center|lead-magnet|seven-day-intel/i.test(pathname)) type = 'brief_open';
    if (/downloads\/lead-magnet|downloads\/source-cards|\.md$|\.json$/i.test(pathname)) type = 'brief_download';
    if (/forum\.html/i.test(pathname)) type = 'forum_open';
    return { type, href: url.href, host, text };
  }

  function removeConsentBanner(){
    const banner = document.getElementById('matrix-analytics-consent');
    if (banner) banner.remove();
  }

  function consentButton(label, choice, primary){
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.analyticsChoice = choice;
    button.style.cssText = primary
      ? 'border:1px solid #d8b56a;background:#d8b56a;color:#090702;border-radius:8px;padding:.7rem 1rem;font-weight:700;cursor:pointer'
      : 'border:1px solid #8d7137;background:#111;color:#f3e6bd;border-radius:8px;padding:.7rem 1rem;font-weight:700;cursor:pointer';
    button.addEventListener('click', function(){
      saveConsent(choice);
      removeConsentBanner();
      if (choice === 'granted') providerSend('consent_update', { choice: 'granted', version: CONSENT_VERSION });
      if (choice === 'granted') providerSend('page_view', { consentedAfterPrompt: true });
      document.dispatchEvent(new CustomEvent('matrix:analytics-consent', { detail: { choice } }));
    });
    return button;
  }

  function showConsentBanner(){
    if (storedConsent() !== 'unset' || document.getElementById('matrix-analytics-consent')) return;
    const banner = document.createElement('section');
    banner.id = 'matrix-analytics-consent';
    banner.setAttribute('role','dialog');
    banner.setAttribute('aria-modal','false');
    banner.setAttribute('aria-labelledby','matrix-analytics-consent-title');
    banner.style.cssText = 'position:fixed;z-index:2147483647;left:1rem;right:1rem;bottom:1rem;max-width:760px;margin:auto;background:#090806;color:#f3e6bd;border:1px solid #8d7137;border-radius:14px;padding:1rem 1.1rem;box-shadow:0 12px 40px rgba(0,0,0,.55);font:15px/1.45 Arial,sans-serif';
    const title = document.createElement('strong');
    title.id = 'matrix-analytics-consent-title';
    title.textContent = 'Privacy choice';
    title.style.cssText = 'display:block;font-size:1.05rem;margin-bottom:.35rem';
    const copy = document.createElement('p');
    copy.textContent = 'Essential site functions work without analytics. Optional anonymous usage events are sent only after you accept.';
    copy.style.cssText = 'margin:.2rem 0 .8rem';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:.65rem;flex-wrap:wrap;align-items:center';
    actions.append(consentButton('Accept analytics','granted',true), consentButton('Essential only','denied',false));
    const privacy = document.createElement('a');
    privacy.href = '/trust-privacy-policy.html';
    privacy.textContent = 'Privacy policy';
    privacy.style.cssText = 'color:#d8b56a;margin-left:auto';
    actions.append(privacy);
    banner.append(title, copy, actions);
    document.body.append(banner);
  }

  document.addEventListener('click', function(event){
    if (!analyticsAllowed()) return;
    const anchor = event.target.closest && event.target.closest('a[href]');
    if (!anchor) return;
    const data = classifyLink(anchor);
    if (data) providerSend(data.type, data);
  }, true);

  document.addEventListener('submit', function(event){
    if (!analyticsAllowed()) return;
    const form = event.target;
    if (!form || !form.tagName || form.tagName.toLowerCase() !== 'form') return;
    const name = form.getAttribute('name') || form.id || 'unnamed_form';
    let eventName = 'form_submit';
    if (/lead|optin|brief/i.test(name)) eventName = 'email_submit';
    if (/forum|signal/i.test(name)) eventName = 'forum_post_submit';
    providerSend(eventName, { form: name });
  }, true);

  window.MatrixPrivacy = Object.freeze({
    consentVersion: CONSENT_VERSION,
    status: storedConsent,
    grant: function(){ saveConsent('granted'); removeConsentBanner(); providerSend('consent_update',{choice:'granted',version:CONSENT_VERSION}); },
    deny: function(){ saveConsent('denied'); removeConsentBanner(); },
    reset: function(){ try{localStorage.removeItem(CONSENT_KEY)}catch{} showConsentBanner(); }
  });

  function start(){
    if (analyticsAllowed()) providerSend('page_view', {});
    else showConsentBanner();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
