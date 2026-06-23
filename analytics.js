(function(){
  const outboundHosts = ['amazon.com','amazon.co.uk','rumble.com'];
  const routeMap = [
    ['black-file.html','black_file'],
    ['books.html','book_archive'],
    ['news.html','intel_desk'],
    ['intel-archive.html','intel_archive'],
    ['dog-the-architect.html','dog'],
    ['transmissions.html','rumble_network'],
    ['videos.html','video_drops']
  ];

  function currentRoute(){
    const path = window.location.pathname;
    const found = routeMap.find(([needle]) => path.includes(needle));
    return found ? found[1] : path === '/' || path.endsWith('/index.html') ? 'home' : 'other';
  }

  function internalSend(name, data){
    const payload = JSON.stringify({ name, route: currentRoute(), page: window.location.pathname || '/', title: document.title, ...(data || {}) });
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
    let type = 'internal_click';
    if (outboundHosts.some(h => host === h || host.endsWith('.' + h))) type = 'outbound_click';
    if (/amazon\./i.test(host)) type = 'amazon_click';
    if (/rumble\.com/i.test(host)) type = 'rumble_click';
    if (/black-file\.html/i.test(url.pathname)) type = 'black_file_click';
    if (/books\.html/i.test(url.pathname)) type = 'book_archive_click';
    if (/news\.html/i.test(url.pathname)) type = 'intel_desk_click';
    if (/dog-the-architect\.html/i.test(url.pathname)) type = 'dog_click';
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
    providerSend('form_submit', { form: form.getAttribute('name') || form.id || 'unnamed_form' });
  }, true);

  providerSend('page_view', {});
})();
