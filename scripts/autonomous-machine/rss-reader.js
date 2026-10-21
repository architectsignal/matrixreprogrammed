'use strict';

const { normaliseUrl } = require('./validation');

function decodeEntities(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function cleanText(value = '', maxLength = 1000) {
  const cleaned = decodeEntities(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trim()}…` : cleaned;
}

function tag(block, name) {
  const escaped = name.replace(':', '\\:');
  const match = block.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return match ? match[1] : '';
}

function linkFromBlock(block) {
  const textLink = cleanText(tag(block, 'link'), 4096);
  if (textLink) return textLink;
  const hrefMatch = block.match(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/i);
  if (hrefMatch) return decodeEntities(hrefMatch[1]).trim();
  return cleanText(tag(block, 'guid'), 4096);
}

function parsePublishedAt(raw, fallback) {
  const parsed = new Date(cleanText(raw, 200));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback;
}

function parseRssItems(xml, options = {}) {
  if (typeof xml !== 'string' || !xml.trim()) throw new TypeError('RSS payload must be a non-empty string');
  if (!/<(?:rss|feed|rdf:RDF)\b/i.test(xml)) throw new Error('Payload is not recognised RSS or Atom XML');

  const checkedAt = options.checkedAt || new Date().toISOString();
  const maxItems = Number.isInteger(options.maxItems) ? options.maxItems : 12;
  if (maxItems < 1 || maxItems > 100) throw new TypeError('maxItems must be between 1 and 100');

  const rssBlocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  const blocks = rssBlocks.length
    ? rssBlocks
    : [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);

  return blocks.slice(0, maxItems).map((block) => {
    const rawUrl = linkFromBlock(block);
    const title = cleanText(tag(block, 'title'), 300);
    const summary = cleanText(
      tag(block, 'description') || tag(block, 'summary') || tag(block, 'content:encoded'),
      1200,
    );
    const publishedAt = parsePublishedAt(
      tag(block, 'pubDate') || tag(block, 'updated') || tag(block, 'published'),
      checkedAt,
    );
    let url = '';
    try {
      url = normaliseUrl(rawUrl);
    } catch (_) {
      url = '';
    }
    return { title, url, summary, publishedAt };
  }).filter((item) => item.title && item.url);
}

module.exports = {
  cleanText,
  parseRssItems,
};
