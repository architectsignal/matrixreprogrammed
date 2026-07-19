const fs = require('fs');
const path = require('path');

const root = process.cwd();
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg']);
const RASTER_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);
const SKIP_DIRECTORIES = new Set(['.git', 'node_modules', '_site', '.wrangler', '.netlify', 'video-packages']);
const GENERIC_BASENAMES = new Set(['sigil', 'logo', 'favicon', 'placeholder', 'default', 'card-back', 'deck-back', 'background']);

const deckConfigs = [
  { id: 'people-of-interest', source: 'data/top-52-power-deck.json', kind: 'object', assetDir: 'assets/top-52/cards', profileDir: 'top-52' },
  { id: 'controlled-opposition', source: 'data/controlled-opposition-deck.json', kind: 'array', assetDir: 'assets/controlled-opposition/cards', profileDir: 'controlled-opposition' },
  { id: 'institutions', source: 'data/institution-deck.json', kind: 'array', assetDir: 'assets/institution/cards', profileDir: 'institutions' },
  { id: 'power-families', source: 'data/power-families-deck.json', kind: 'object', assetDir: 'assets/power-families/cards', profileDir: 'power-families' },
  { id: 'secret-societies', source: 'data/secret-societies-deck.json', kind: 'object', assetDir: 'assets/secret-societies/cards', profileDir: 'secret-societies' },
  { id: 'policy', source: 'data/policy-deck.json', kind: 'object', assetDir: 'assets/policy/cards', profileDir: 'policy' },
  { id: 'think-tanks', source: 'data/think-tanks-deck.json', kind: 'object', assetDir: 'assets/think-tanks/cards', profileDir: 'think-tanks' },
  { id: 'black-nobility', source: 'data/black-nobility-deck.json', kind: 'object', assetDir: 'assets/black-nobility/cards', profileDir: 'black-nobility' },
  { id: 'jurisdictions-of-power', source: 'data/jurisdictions-of-power-deck.json', kind: 'object', assetDir: 'assets/jurisdictions-of-power/cards', profileDir: 'jurisdictions-of-power' }
];

function fp(relative) { return path.join(root, relative); }
function exists(relative) { return fs.existsSync(fp(relative)); }
function readJson(relative, fallback = {}) { try { return JSON.parse(fs.readFileSync(fp(relative), 'utf8')); } catch { return fallback; } }
function writeJson(relative, value) { fs.mkdirSync(path.dirname(fp(relative)), { recursive: true }); fs.writeFileSync(fp(relative), `${JSON.stringify(value, null, 2)}\n`); }
function slug(value = '') { return String(value).toLowerCase().replace(/&/g, ' and ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'card'; }
function normalizeFilename(value = '') {
  return slug(value)
    .replace(/^(img|image|card|art|final|approved|upload|generated)-+/, '')
    .replace(/-+(img|image|card|card-art|artwork|art|portrait|final|approved|upload|generated|installed|v\d+|\d+x\d+)$/g, '');
}
function isRaster(relative) { return RASTER_EXTENSIONS.has(path.extname(relative).toLowerCase()); }
function svgContent(relative) { try { return fs.readFileSync(fp(relative), 'utf8').slice(0, 160000); } catch { return ''; } }
function isGeneratedPlaceholderSvg(relative) {
  if (path.extname(relative).toLowerCase() !== '.svg') return false;
  const content = svgContent(relative);
  return /VISUAL CARD PLACEHOLDER|GENERATED CARD ART LAYER|Editorial SVG card assets|ARTWORK PENDING|OVERALL INFLUENCE SCORE|CARD SCORE|PUBLIC-RECORD ROUTE[^<]{0,80}NOT ACCUSATION/i.test(content) && !/<image\b/i.test(content);
}
function isEmbeddedArtSvg(relative) {
  if (path.extname(relative).toLowerCase() !== '.svg') return false;
  const content = svgContent(relative);
  return /<image\b/i.test(content) && (/data:image\//i.test(content) || /\.installed\.(webp|png|jpe?g|avif)/i.test(content) || /installed Matrix Reprogrammed card artwork/i.test(content));
}
function walk(directory = root, output = []) {
  let entries = [];
  try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return output; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.well-known') continue;
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, output);
    else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) output.push(path.relative(root, absolute).replace(/\\/g, '/'));
  }
  return output;
}
function cardsForDeck(config) {
  const data = readJson(config.source, { deck: [] });
  const sourceCards = data.cards || data.deck || [];
  if (config.kind === 'array') return sourceCards.map(raw => ({ raw, id: slug(raw.name || raw[1]), name: raw.name || raw[1], rank: raw.rank || raw[0], suit: raw.suit || raw[2], score: raw.powerScore || raw.score || raw[3], lane: raw.lane || raw[4] || '' }));
  return sourceCards.map(raw => ({ raw, id: slug(raw.id || raw.name), name: raw.name || raw.id, rank: raw.rank, suit: raw.suit, score: raw.powerScore || raw.score, lane: raw.lane || raw.role || '' }));
}
function candidateScore(relative, card, config) {
  const extension = path.extname(relative).toLowerCase();
  const base = path.basename(relative, extension);
  const normalized = normalizeFilename(base);
  const id = slug(card.id);
  const name = slug(card.name);
  if (GENERIC_BASENAMES.has(normalized)) return -Infinity;
  let score = 0;
  if (normalized === id || normalized === name) score += 1000;
  else if (normalized.startsWith(`${id}-`) || normalized.endsWith(`-${id}`) || normalized.startsWith(`${name}-`) || normalized.endsWith(`-${name}`)) score += 600;
  else if (normalized.includes(id) || normalized.includes(name)) score += 250;
  else return -Infinity;
  if (RASTER_EXTENSIONS.has(extension)) score += 500;
  if (isEmbeddedArtSvg(relative)) score += 420;
  if (/\/(images?|uploads?|card-art-inbox|generated-images?|approved-art)\//i.test(`/${relative}`)) score += 250;
  if (relative.startsWith(`${config.assetDir}/`)) score += 180;
  if (relative.toLowerCase().includes(config.id.replace(/-/g, ''))) score += 40;
  if (/share|thumbnail|thumb|social/i.test(relative)) score -= 80;
  if (isGeneratedPlaceholderSvg(relative)) score -= 650;
  try { score += Math.min(100, Math.round(fs.statSync(fp(relative)).size / 50000)); } catch {}
  return score;
}
function chooseCandidate(images, card, config) {
  return images
    .map(relative => ({ relative, score: candidateScore(relative, card, config), raster: isRaster(relative), embeddedArtSvg: isEmbeddedArtSvg(relative), placeholder: isGeneratedPlaceholderSvg(relative) }))
    .filter(candidate => Number.isFinite(candidate.score) && candidate.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.raster) - Number(a.raster) || Number(b.embeddedArtSvg) - Number(a.embeddedArtSvg) || a.relative.localeCompare(b.relative))[0] || null;
}
function canonicalAsset(config, cardId, sourceRelative) {
  const extension = path.extname(sourceRelative).toLowerCase() || '.webp';
  return `${config.assetDir}/${cardId}${extension}`;
}
function copyCanonical(sourceRelative, destinationRelative) {
  if (sourceRelative === destinationRelative) return;
  fs.mkdirSync(path.dirname(fp(destinationRelative)), { recursive: true });
  fs.copyFileSync(fp(sourceRelative), fp(destinationRelative));
}
function registryLookup(registry, deckId, cardId) { return registry?.byKey?.[`${deckId}:${slug(cardId)}`] || null; }
function loadRegistry() { return readJson('data/card-art-registry.json', { cards: [], byKey: {} }); }

module.exports = { root, deckConfigs, fp, exists, readJson, writeJson, slug, isRaster, isGeneratedPlaceholderSvg, isEmbeddedArtSvg, walk, cardsForDeck, chooseCandidate, canonicalAsset, copyCanonical, registryLookup, loadRegistry };
