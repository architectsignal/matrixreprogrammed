const fs = require('fs');
const path = require('path');
const root = process.cwd();
function file(name){return path.join(root,name)}
function exists(name){return fs.existsSync(file(name))}
function read(name){return fs.readFileSync(file(name),'utf8')}
function write(name,value){fs.writeFileSync(file(name),value)}

function patchWorker(){
  if(!exists('src/worker.js')) return false;
  let w=read('src/worker.js');
  let changed=false;
  const aliases={
    '/black-file-index':'/black-file-index.html','/answer-index':'/answer-index.html','/atlas-index':'/atlas-index.html','/evidence-vault-index':'/evidence-vault-index.html','/evidence-policy':'/evidence-policy.html','/network-maps':'/network-maps.html','/network-map':'/network-maps.html','/secret-societies-hub':'/authority-secret-societies.html','/intelligence-hub':'/authority-intelligence-network.html','/crime-hub':'/authority-crime-state-overlap.html','/war-conflict-hub':'/authority-war-machine.html','/surveillance-hub':'/authority-intelligence-network.html','/dashboard-human-cost':'/news.html','/dashboard-conflict':'/news.html','/dashboard-economy':'/news.html','/human-cost':'/news.html','/vaccines':'/news.html','/migration':'/migration-flow.html','/migration-flow-panel':'/migration-flow.html','/blackfile':'/black-file.html','/black-file-pdf':'/downloads/the-black-file-matrix-reprogrammed.pdf','/the-black-file':'/black-file.html','/epstein-files':'/epstein-files.html','/intel-desk':'/news.html','/daily-drop':'/daily-drop.html','/network-search':'/network-search.html','/source-cards':'/source-cards.html','/source-document-vault':'/source-document-vault.html','/claim-classifier':'/claim-classifier.html','/newsletter':'/newsletter.html'
  };
  for(const [from,to] of Object.entries(aliases)){
    if(!w.includes(`'${from}': '${to}'`)){
      w=w.replace('const routeAliases = {',`const routeAliases = {\n  '${from}': '${to}',`);
      changed=true;
    }
  }
  if(!w.includes('function isHostileProbePath')){
    const helpers=`
function isHostileProbePath(pathname='') {
  return /\/(?:wp-admin|wp-login|xmlrpc\.php|\.env|vendor\/phpunit|cgi-bin|boaform|phpmyadmin|adminer|\.git|config\.php|setup\.php|shell|password|owa|autodiscover)/i.test(pathname) || /\.(?:php|asp|aspx|jsp|cgi)$/i.test(pathname);
}
function cacheHeadersForPath(pathname='') {
  const p = String(pathname || '').toLowerCase();
  if (/\.(?:css|js|mjs|png|jpg|jpeg|webp|gif|svg|ico|woff2?|mp4|webm)$/.test(p)) return 'public, max-age=31536000, immutable';
  if (/\.(?:pdf|json|xml|txt|md)$/.test(p) || p.startsWith('/downloads/') || p.startsWith('/feeds/')) return 'public, max-age=3600, stale-while-revalidate=86400';
  if (/\.html$/.test(p) || !p.includes('.')) return 'public, max-age=300, stale-while-revalidate=3600';
  return 'public, max-age=600, stale-while-revalidate=3600';
}
function hardenResponse(response, pathname='') {
  const headers = new Headers(response.headers);
  if (!headers.has('Cache-Control') || !/no-store/i.test(headers.get('Cache-Control') || '')) headers.set('Cache-Control', cacheHeadersForPath(pathname));
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
function safeNotConfigured(name, extra = {}) {
  return json({ ok: false, configured: false, error: String(name || 'service') + ' not configured', ...extra }, 200);
}
`;
    w=w.replace('\nasync function handleIntroVoice',helpers+'\nasync function handleIntroVoice'); changed=true;
  }
  w=w.replace("return json({ ok: false, error: 'ELEVENLABS_API_KEY Cloudflare secret missing. Browser fallback voice can still be used.' }, 503);","return safeNotConfigured('ELEVENLABS_API_KEY', { fallback: 'browser speechSynthesis' });");
  w=w.replace("if (!data) return json({ ok: false, error: 'FORUM_POSTS KV binding missing', posts: [] }, 503);","if (!data) return json({ ok: false, configured: false, error: 'FORUM_POSTS KV binding missing', posts: [] }, 200);");
  w=w.replace("if (!env.FORUM_POSTS) return json({ ok: false, error: 'FORUM_POSTS KV binding missing' }, 503);","if (!env.FORUM_POSTS) return safeNotConfigured('FORUM_POSTS KV binding');");
  w=w.replace("}, hasForumPostsBinding ? 200 : 503);","}, 200);");
  if(!w.includes("if (isHostileProbePath(originalPath))")){
    w=w.replace("const routedPath = routeAliases[originalPath] || routeAliases[normalizedPath] || originalPath;","const routedPath = routeAliases[originalPath] || routeAliases[normalizedPath] || originalPath;\n\n    if (isHostileProbePath(originalPath)) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=3600', 'X-Robots-Tag': 'noindex, nofollow' } });"); changed=true;
  }
  w=w.replace("let response = await tryAsset(routedPath);\n    if (response.status !== 404) return response;","let response = await tryAsset(routedPath);\n    if (response.status !== 404) return hardenResponse(response, routedPath);");
  w=w.replace(/if \(response\.status !== 404\) return response;/g,"if (response.status !== 404) return hardenResponse(response, routedPath);");
  w=w.replace("return tryAsset('/404.html');","const notFound = await tryAsset('/404.html');\n    return hardenResponse(notFound.status === 404 ? new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }) : notFound, '/404.html');");
  if(!w.includes('try {\n    const url = new URL(request.url);')){
    w=w.replace("async fetch(request, env) {\n    const url = new URL(request.url);","async fetch(request, env) {\n    try {\n    const url = new URL(request.url);");
    w=w.replace("    return hardenResponse(notFound.status === 404 ? new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }) : notFound, '/404.html');\n  }\n};","    return hardenResponse(notFound.status === 404 ? new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }) : notFound, '/404.html');\n    } catch (error) {\n      return json({ ok: false, error: 'Worker handled failure safely', detail: cleanText(error && error.message, 300) }, 200);\n    }\n  }\n};");
    changed=true;
  }
  if(changed) write('src/worker.js',w);
  return changed;
}

function patchHeaders(){
  const content=`/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/*.html
  Cache-Control: public, max-age=300, stale-while-revalidate=3600

/*.css
  Cache-Control: public, max-age=31536000, immutable

/*.js
  Cache-Control: public, max-age=31536000, immutable

/*.png
  Cache-Control: public, max-age=31536000, immutable

/*.jpg
  Cache-Control: public, max-age=31536000, immutable

/*.jpeg
  Cache-Control: public, max-age=31536000, immutable

/*.webp
  Cache-Control: public, max-age=31536000, immutable

/*.svg
  Cache-Control: public, max-age=31536000, immutable

/downloads/*.pdf
  Content-Disposition: attachment
  Content-Type: application/pdf
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400

/downloads/*.json
  Content-Disposition: attachment
  Content-Type: application/json
  Cache-Control: public, max-age=600, stale-while-revalidate=3600

/downloads/*.md
  Content-Disposition: attachment
  Content-Type: text/markdown
  Cache-Control: public, max-age=600, stale-while-revalidate=3600

/downloads/*.txt
  Content-Disposition: attachment
  Content-Type: text/plain
  Cache-Control: public, max-age=600, stale-while-revalidate=3600

/feeds/*.xml
  Content-Type: application/xml
  Cache-Control: public, max-age=600, stale-while-revalidate=3600

/feeds/*.json
  Content-Type: application/feed+json
  Cache-Control: public, max-age=600, stale-while-revalidate=3600
`;
  write('_headers',content);
}

patchHeaders();
const workerPatched=patchWorker();
console.log(`Cloudflare error hardening built. Worker patched: ${workerPatched}. Headers hardened: true.`);
