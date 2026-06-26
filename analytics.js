(function(){
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

  function internalSend(name, data){
    const payload = JSON.stringify({ name, route: currentRoute(), page: window.location.pathname || '/', title: document.title, at: new Date().toISOString(), ...(data || {}) });
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/.netlify/functions/track-event', blob);
      return;
    }
    fetch('/.netlify/functions/track-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true
    }).catch(function(){});
  }

  function providerSend(name, data){
    internalSend(name, data);
    if (window.plausible) window.plausible(name, { props: data });
    if (window.gtag) window.gtag('event', name, data || {});
    if (window.dataLayer) window.dataLayer.push({ event: name, ...(data || {}) });
    window.MatrixReprogrammedEvents = window.MatrixReprogrammedEvents || [];
    window.MatrixReprogrammedEvents.push({ name, data, at: new Date().toISOString() });
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

  document.addEventListener('click', function(event){
    const anchor = event.target.closest && event.target.closest('a[href]');
    if (!anchor) return;
    const data = classifyLink(anchor);
    if (data) providerSend(data.type, data);
  }, true);

  document.addEventListener('submit', function(event){
    const form = event.target;
    if (!form || !form.tagName || form.tagName.toLowerCase() !== 'form') return;
    const name = form.getAttribute('name') || form.id || 'unnamed_form';
    let eventName = 'form_submit';
    if (/lead|optin|brief/i.test(name)) eventName = 'email_submit';
    if (/forum|signal/i.test(name)) eventName = 'forum_post_submit';
    providerSend(eventName, { form: name });
  }, true);

  providerSend('page_view', {});
})();
