const fs = require('fs');
const path = require('path');
const {
  root,
  deckConfigs,
  fp,
  exists,
  readJson,
  writeJson,
  slug,
  isRaster,
  walk,
  cardsForDeck,
  chooseCandidate,
  canonicalAsset,
  copyCanonical
} = require('./card-art-resolver.js');

function escapeXml(value = '') { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
function fallbackSvg(card, deckTitle) {
  const initials = String(card.name || card.id).split(/\s+/).map(part => part[0]).join('').slice(0, 3).toUpperCase();
  const name = String(card.name || card.id).toUpperCase().slice(0, 34);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800" role="img" aria-label="${escapeXml(card.name)} ${escapeXml(deckTitle)} placeholder card">
  <defs>
    <radialGradient id="bg" cx="50%" cy="20%" r="80%"><stop offset="0" stop-color="#2d1708"/><stop offset=".45" stop-color="#080706"/><stop offset="1" stop-color="#010101"/></radialGradient>
    <pattern id="h" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(32)"><line x1="0" y1="0" x2="0" y2="8" stroke="#d8b56a" stroke-opacity=".16"/></pattern>
  </defs>
  <rect width="1200" height="1800" fill="url(#bg)"/>
  <rect x="34" y="34" width="1132" height="1732" rx="38" fill="none" stroke="#d8b56a" stroke-width="8"/>
  <rect x="70" y="70" width="1060" height="1660" rx="28" fill="url(#h)" stroke="#d8b56a" stroke-width="2" opacity=".75"/>
  <text x="600" y="160" text-anchor="middle" fill="#f2e2b8" font-family="Georgia,serif" font-size="44" letter-spacing="5">${escapeXml(deckTitle.toUpperCase())}</text>
  <ellipse cx="600" cy="565" rx="310" ry="350" fill="#090807" stroke="#d8b56a" stroke-width="6"/>
  <circle cx="600" cy="430" r="120" fill="#1b1008" stroke="#d8b56a" stroke-width="5"/>
  <text x="600" y="470" text-anchor="middle" fill="#d8b56a" font-family="Georgia,serif" font-size="92">${escapeXml(initials)}</text>
  <path d="M220 870 H980 Q1020 870 1044 910 Q1020 950 980 950 H220 Q180 950 156 910 Q180 870 220 870Z" fill="#160705" stroke="#d8b56a" stroke-width="5"/>
  <text x="600" y="928" text-anchor="middle" fill="#f2e2b8" font-family="Georgia,serif" font-size="58" letter-spacing="3">${escapeXml(name)}</text>
  <circle cx="600" cy="1120" r="126" fill="#120706" stroke="#d8b56a" stroke-width="5"/>
  <text x="600" y="1160" text-anchor="middle" fill="#f2e2b8" font-family="Georgia,serif" font-size="92">${escapeXml(card.score || '--')}</text>
  <text x="600" y="1330" text-anchor="middle" fill="#d8b56a" font-family="Georgia,serif" font-size="36" letter-spacing="4">${escapeXml(String(card.suit || 'ROUTE').toUpperCase())}</text>
  <text x="600" y="1490" text-anchor="middle" fill="#d8b56a" font-family="Georgia,serif" font-size="28" letter-spacing="2">ARTWORK PENDING · DOSSIER LIVE</text>
  <text x="600" y="1605" text-anchor="middle" fill="#d8b56a" font-family="Georgia,serif" font-size="23" letter-spacing="2">DROP APPROVED ART INTO card-art-inbox/ USING THIS CARD ID</text>
  <text x="600" y="1660" text-anchor="middle" fill="#d8b56a" font-family="Georgia,serif" font-size="22" letter-spacing="2">MATRIX REPROGRAMMED · VISUAL CARD PLACEHOLDER</text>
</svg>`;
}
function deckTitle(config, data) {
  return data.title || ({
    'people-of-interest': 'People of Interest',
    'controlled-opposition': 'Controlled Opposition',
    institutions: 'Institution Deck',
    'power-families': 'Power Families',
    'secret-societies': 'Secret Societies',
    policy: 'Policy Deck',
    'think-tanks': 'Think Tanks',
    'black-nobility': 'Black Nobility',
    'jurisdictions-of-power': 'Jurisdictions of Power'
  }[config.id] || config.id);
}
function updateObjectDeck(config, registryCards) {
  if (config.kind !== 'object' || !exists(config.source)) return;
  const data = readJson(config.source, { deck: [] });
  const cards = data.cards || data.deck || [];
  const byId = new Map(registryCards.map(card => [card.id, card]));
  for (const card of cards) {
    const id = slug(card.id || card.name);
    const resolved = byId.get(id);
    if (!resolved) continue;
    card.artAsset = resolved.asset;
    card.downloadAsset = resolved.asset;
    card.artStatus = resolved.status;
    card.artSource = resolved.source;
    card.artResolvedAt = resolved.resolvedAt;
  }
  writeJson(config.source, data);
}
function updateArtStudio(registry) {
  const relative = 'data/top-52-art-studio.json';
  if (!exists(relative)) return;
  const data = readJson(relative, {});
  const lookup = registry.byKey || {};
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (value.id) {
      const resolved = lookup[`people-of-interest:${slug(value.id)}`];
      if (resolved) {
        value.asset = resolved.asset;
        value.status = resolved.status;
        value.artSource = resolved.source;
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(data);
  data.updated = registry.updated;
  data.artRegistry = 'data/card-art-registry.json';
  writeJson(relative, data);
}

const updated = new Date().toISOString();
const discoveredImages = walk();
const registryCards = [];
const consumedSources = new Set();
for (const config of deckConfigs) {
  if (!exists(config.source)) continue;
  const data = readJson(config.source, { deck: [] });
  const title = deckTitle(config, data);
  const deckCards = cardsForDeck(config);
  const perDeck = [];
  for (const card of deckCards) {
    const candidate = chooseCandidate(discoveredImages, card, config);
    let asset = '';
    let source = '';
    let status = '';
    let candidateScore = null;
    if (candidate && candidate.raster) {
      asset = canonicalAsset(config, card.id, candidate.relative);
      copyCanonical(candidate.relative, asset);
      source = candidate.relative;
      status = 'real-art-live';
      candidateScore = candidate.score;
      consumedSources.add(candidate.relative);
    } else {
      const existingRaster = ['.webp', '.png', '.jpg', '.jpeg', '.avif'].map(extension => `${config.assetDir}/${card.id}${extension}`).find(exists);
      if (existingRaster) {
        asset = existingRaster;
        source = existingRaster;
        status = 'real-art-live';
      } else {
        asset = `${config.assetDir}/${card.id}.svg`;
        source = candidate?.relative || asset;
        status = 'placeholder-svg';
        if (!exists(asset)) {
          fs.mkdirSync(path.dirname(fp(asset)), { recursive: true });
          fs.writeFileSync(fp(asset), fallbackSvg(card, title));
        }
      }
    }
    const record = {
      deckId: config.id,
      cardId: card.id,
      id: card.id,
      name: card.name,
      rank: card.rank,
      suit: card.suit,
      score: card.score,
      asset,
      source,
      sourceExtension: path.extname(source || asset).toLowerCase(),
      status,
      realArt: status === 'real-art-live',
      placeholder: status === 'placeholder-svg',
      candidateScore,
      canonicalDirectory: config.assetDir,
      resolvedAt: updated
    };
    perDeck.push(record);
    registryCards.push(record);
  }
  updateObjectDeck(config, perDeck);
}
const byKey = Object.fromEntries(registryCards.map(card => [`${card.deckId}:${card.cardId}`, card]));
const rasterCandidates = discoveredImages.filter(isRaster);
const likelyCardRasterCandidates = rasterCandidates.filter(relative => {
  const base = slug(path.basename(relative, path.extname(relative)));
  if (/\/(images?|uploads?|card-art-inbox|generated-images?|approved-art)\//i.test(`/${relative}`)) return true;
  return registryCards.some(card => base === card.id || base.includes(card.id) || card.id.includes(base));
});
const unmatchedRasterCandidates = likelyCardRasterCandidates.filter(relative => !consumedSources.has(relative) && !registryCards.some(card => card.asset === relative));
const decks = Object.fromEntries(deckConfigs.map(config => {
  const cards = registryCards.filter(card => card.deckId === config.id);
  return [config.id, { total: cards.length, realArt: cards.filter(card => card.realArt).length, placeholders: cards.filter(card => card.placeholder).length }];
}));
const registry = {
  ok: registryCards.length > 0,
  updated,
  title: 'Matrix Reprogrammed Card Art Registry',
  boundary: 'Real card images are visual editorial assets, not evidence. Existing PNG/JPG/WebP/AVIF files are preferred over generated SVG placeholders.',
  resolutionRules: [
    'Scan the repository for raster and SVG card art.',
    'Match existing images to cards using normalized card IDs and names.',
    'Prefer real PNG/JPG/WebP/AVIF artwork from images, upload, approved-art, card-art-inbox and canonical asset folders.',
    'Copy matched art into a stable canonical card path.',
    'Use SVG only when no real stored artwork exists.',
    'Never overwrite a real raster card with a generated SVG placeholder.'
  ],
  uploadInbox: 'card-art-inbox/',
  supportedExtensions: ['.webp', '.png', '.jpg', '.jpeg', '.avif'],
  discoveredImageCount: discoveredImages.length,
  rasterCandidateCount: rasterCandidates.length,
  likelyCardRasterCandidateCount: likelyCardRasterCandidates.length,
  matchedStoredImageCount: consumedSources.size,
  unmatchedRasterCandidates,
  totalCards: registryCards.length,
  realArtCount: registryCards.filter(card => card.realArt).length,
  placeholderCount: registryCards.filter(card => card.placeholder).length,
  decks,
  cards: registryCards,
  byKey
};
writeJson('data/card-art-registry.json', registry);
fs.mkdirSync(fp('downloads'), { recursive: true });
fs.writeFileSync(fp('downloads/card-art-registry.md'), `# Card Art Registry\n\nUpdated: ${updated}\n\nReal artwork: ${registry.realArtCount}\n\nPlaceholders: ${registry.placeholderCount}\n\nMatched stored images: ${registry.matchedStoredImageCount}\n\nUnmatched likely card images: ${unmatchedRasterCandidates.length}\n\n## Decks\n\n${Object.entries(decks).map(([id, summary]) => `- ${id}: ${summary.realArt} real / ${summary.placeholders} placeholder / ${summary.total} total`).join('\n')}\n\n## Unmatched stored images\n\n${unmatchedRasterCandidates.map(relative => `- ${relative}`).join('\n') || '- None'}\n\n## Card map\n\n${registryCards.map(card => `- ${card.deckId}/${card.cardId}: ${card.asset} — ${card.status}${card.source && card.source !== card.asset ? ` — source ${card.source}` : ''}`).join('\n')}\n`);
updateArtStudio(registry);
console.log(`Card art resolver complete: ${registry.realArtCount} real images, ${registry.placeholderCount} placeholders, ${unmatchedRasterCandidates.length} unmatched likely card images.`);
