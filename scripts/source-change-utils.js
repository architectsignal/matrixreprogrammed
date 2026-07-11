const crypto = require('crypto');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function cleanText(value = '') {
  return String(value || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableJson(value[key])]));
}

function canonicalContent(buffer, contentType = '') {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '');
  if (/json/i.test(contentType)) {
    try { return JSON.stringify(stableJson(JSON.parse(text))); } catch {}
  }
  if (/html|xml|rss|atom|text/i.test(contentType) || /<html|<rss|<feed|<\?xml/i.test(text.slice(0, 500))) {
    return cleanText(text)
      .replace(/\b(?:nonce|csrf|request|session)[-_ ]?(?:id|token)?\s*[:=]\s*[a-z0-9._-]{12,}\b/gi, ' ')
      .replace(/\b20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return text.replace(/\r\n/g, '\n').trim();
}

function compact(value = '', max = 500) {
  const text = cleanText(value);
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function sanitizeError(value = '') {
  const text = compact(value, 240)
    .replace(/(token|secret|key|password|authorization)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/[A-Za-z0-9+/_-]{36,}={0,2}/g, '[redacted]');
  if (/timeout|abort/i.test(text)) return 'Source request timed out.';
  const http = text.match(/HTTP\s+(\d{3})/i);
  if (http) return `Source returned HTTP ${http[1]}.`;
  return text || 'Source request failed.';
}

function difference(current = [], previous = []) {
  const prior = new Set(previous);
  return current.filter(item => !prior.has(item));
}

function mapRecords(ids = [], currentRecords = [], previousRecords = []) {
  const records = new Map([...previousRecords, ...currentRecords].filter(Boolean).map(item => [item.id, item]));
  return ids.slice(0, 100).map(id => {
    const row = records.get(id) || {};
    return { id, title: compact(row.title || id, 220), url: String(row.url || row.itemUrl || '') };
  });
}

function classifyChange({ previous = {}, current = {}, canonicalHash = '', currentRecords = [], detectedAt }) {
  const previousStatus = String(previous.status || 'not-observed');
  const currentStatus = String(current.status || 'not-observed');
  const currentIds = Array.isArray(current.itemIds) ? current.itemIds : [];
  const previousIds = Array.isArray(previous.itemIds) ? previous.itemIds : [];
  const addedIds = difference(currentIds, previousIds);
  const removedIds = difference(previousIds, currentIds);
  const restored = previousStatus !== 'fetched' && currentStatus === 'fetched' && previousStatus !== 'not-observed';
  const becameUnavailable = previousStatus === 'fetched' && currentStatus !== 'fetched';
  const firstSnapshot = !previous.canonicalHash && currentStatus === 'fetched';
  const canonicalChanged = Boolean(previous.canonicalHash && canonicalHash && previous.canonicalHash !== canonicalHash);
  const rawChanged = Boolean(previous.bodyHash && current.bodyHash && previous.bodyHash !== current.bodyHash);
  let changeType = 'unchanged';
  if (firstSnapshot) changeType = 'initial-snapshot';
  else if (restored) changeType = 'restored';
  else if (becameUnavailable) changeType = 'unavailable';
  else if (removedIds.length && addedIds.length) changeType = 'records-added-and-removed';
  else if (removedIds.length) changeType = 'records-removed';
  else if (addedIds.length) changeType = 'records-added';
  else if (canonicalChanged) changeType = 'content-changed';
  else if (rawChanged) changeType = 'technical-churn';
  const meaningful = ['restored','unavailable','records-added-and-removed','records-removed','records-added','content-changed'].includes(changeType);
  return {
    detectedAt,
    previousStatus,
    currentStatus,
    changeType,
    meaningful,
    firstSnapshot,
    restored,
    becameUnavailable,
    rawChanged,
    canonicalChanged,
    addedIds,
    removedIds,
    currentRecords,
    previousRecords: Array.isArray(previous.records) ? previous.records : []
  };
}

module.exports = {
  sha256,
  cleanText,
  canonicalContent,
  compact,
  sanitizeError,
  difference,
  mapRecords,
  classifyChange
};
