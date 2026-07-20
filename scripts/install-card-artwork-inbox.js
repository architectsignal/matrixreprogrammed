const fs = require('fs');
const path = require('path');
const root = process.cwd();
const fp = p => path.join(root, p);
const ex = p => fs.existsSync(fp(p));
const rd = p => fs.readFileSync(fp(p), 'utf8');
const wr = (p, v) => { fs.mkdirSync(path.dirname(fp(p)), { recursive: true }); fs.writeFileSync(fp(p), v); };
const wb = (p, b) => { fs.mkdirSync(path.dirname(fp(p)), { recursive: true }); fs.writeFileSync(fp(p), b); };
const js = (p, f) => { try { return ex(p) ? JSON.parse(rd(p)) : f; } catch { return f; } };
const slug = s => String(s || '').toLowerCase().replace(/&/g, ' and ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'card';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function assetDeck(deckId) {
  if (deckId === 'people-of-interest' || deckId === 'top-52') return 'top-52';
  if (deckId === 'institutions') return 'institution';
  return deckId;
}
function extFromMime(mime, fallback) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('webp')) return 'webp';
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('avif')) return 'avif';
  if (m.includes('svg')) return 'svg';
  return fallback || 'webp';
}
function parseDataUri(uri) {
  const match = String(uri || '').match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;
  const mime = match[1] || 'image/webp';
  const isBase64 = Boolean(match[2]);
  const raw = match[3] || '';
  const buffer = isBase64 ? Buffer.from(raw, 'base64') : Buffer.from(decodeURIComponent(raw), 'utf8');
  return { mime, buffer };
}
async function fetchImage(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'MatrixReprogrammedCardArtInstaller/2.0' } });
  if (!res.ok) throw new Error(`download failed ${res.status} ${res.statusText}`);
  const mime = res.headers.get('content-type') || 'image/webp';
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) throw new Error('downloaded image is empty');
  return { mime, buffer };
}
function svgWrapper({ label, sourceHref }) {
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800" role="img" aria-label="${esc(label)} installed Matrix Reprogrammed card artwork"><rect width="1200" height="1800" fill="#020202"/><image href="${esc(sourceHref)}" x="0" y="0" width="1200" height="1800" preserveAspectRatio="xMidYMid slice"/><rect x="24" y="24" width="1152" height="1752" rx="38" fill="none" stroke="#d8b56a" stroke-width="6" opacity=".74"/><title>${esc(label)} · installed generated artwork</title><desc>Installed through the automated card artwork inbox. Evidence and current intelligence remain in the linked dossier.</desc></svg>`;
}
function refreshCardSurfaces() {
  const scripts = ['ensure-card-art-assets.js', 'build-clean-card-decks.js', 'build-card-download-manifest.js'];
  for (const script of scripts) {
    const scriptPath = path.join(root, 'scripts', script);
    if (!fs.existsSync(scriptPath)) continue;
    delete require.cache[require.resolve(scriptPath)];
    require(scriptPath);
  }
  const previous = process.env.CARD_ART_FINAL_AUDIT;
  process.env.CARD_ART_FINAL_AUDIT = '1';
  const auditPath = path.join(root, 'scripts', 'card-deck-system-audit.js');
  if (fs.existsSync(auditPath)) {
    delete require.cache[require.resolve(auditPath)];
    require(auditPath);
  }
  if (previous === undefined) delete process.env.CARD_ART_FINAL_AUDIT;
  else process.env.CARD_ART_FINAL_AUDIT = previous;
}
async function main() {
  const inboxPath = 'data/card-artwork-inbox.json';
  const inbox = js(inboxPath, { pending: [] });
  const pending = Array.isArray(inbox.pending) ? inbox.pending : [];
  const log = js('data/card-artwork-install-log.json', { installed: [], errors: [] });
  const installed = [];
  const errors = [];
  for (const item of pending) {
    if (!item || String(item.status || 'pending') !== 'pending') continue;
    const deckId = item.deckId || item.deck || 'people-of-interest';
    const cardId = slug(item.cardId || item.card || item.name || item.label);
    const label = item.label || item.name || cardId;
    const dir = assetDeck(deckId);
    try {
      let image;
      let ext;
      if (item.sourceDataUri) {
        image = parseDataUri(item.sourceDataUri);
        if (!image) throw new Error('invalid sourceDataUri');
        ext = extFromMime(image.mime, 'webp');
      } else if (item.sourceUrl) {
        image = await fetchImage(item.sourceUrl);
        ext = extFromMime(image.mime, path.extname(new URL(item.sourceUrl).pathname).replace(/^\./, '') || 'webp');
      } else if (item.sourcePath && ex(item.sourcePath)) {
        image = { mime: '', buffer: fs.readFileSync(fp(item.sourcePath)) };
        ext = path.extname(item.sourcePath).replace(/^\./, '') || 'webp';
      } else {
        throw new Error('missing sourceUrl, sourceDataUri, or valid sourcePath');
      }
      const imagePath = `assets/${dir}/cards/${cardId}.installed.${ext}`;
      wb(imagePath, image.buffer);
      const canonicalPath = `assets/${dir}/cards/${cardId}.${ext}`;
      wb(canonicalPath, image.buffer);
      const svgPath = `assets/${dir}/cards/${cardId}.svg`;
      wr(svgPath, svgWrapper({ label, sourceHref: `${cardId}.installed.${ext}` }));
      item.status = 'installed';
      item.installedAt = new Date().toISOString();
      item.assetPath = canonicalPath;
      item.wrapperPath = svgPath;
      item.deckId = deckId;
      item.cardId = cardId;
      installed.push({ deckId, cardId, label, assetPath: canonicalPath, wrapperPath: svgPath, sourceUrl: item.sourceUrl || null, sourcePath: item.sourcePath || null, installedAt: item.installedAt });
    } catch (error) {
      item.status = process.env.ARTWORK_INBOX_KEEP_PENDING === '1' ? 'pending' : 'error';
      item.error = error.message;
      errors.push({ deckId, cardId, label, error: error.message });
    }
  }
  inbox.updated = new Date().toISOString();
  wr(inboxPath, JSON.stringify(inbox, null, 2));
  const merged = {
    ok: errors.length === 0,
    updated: new Date().toISOString(),
    title: 'Card Artwork Install Log',
    installedCount: (log.installed || []).length + installed.length,
    latestInstalledCount: installed.length,
    errorCount: errors.length,
    installed: [...(log.installed || []), ...installed],
    errors: [...(log.errors || []), ...errors],
    boundary: 'Installed artwork is visual presentation only. Evidence and current intelligence remain in linked dossiers and source routes.'
  };
  wr('data/card-artwork-install-log.json', JSON.stringify(merged, null, 2));
  wr('downloads/card-artwork-install-log.md', '# Card Artwork Install Log\n\nUpdated: ' + merged.updated + '\n\nLatest installed: ' + installed.length + '\n\nErrors: ' + errors.length + '\n\n## Latest Installed\n' + (installed.map(i => `- ${i.label} — ${i.assetPath}`).join('\n') || 'None') + '\n\n## Errors\n' + (errors.map(e => `- ${e.label}: ${e.error}`).join('\n') || 'None'));
  refreshCardSurfaces();
  console.log(`Card artwork inbox installer complete: ${installed.length} installed, ${errors.length} error(s).`);
  if (errors.length && process.env.STRICT_CARD_ART_INSTALL === '1') process.exit(1);
}
main().catch(error => { console.error(error); process.exit(1); });
