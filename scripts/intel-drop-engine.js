const fs = require('fs');
const path = require('path');

const root = process.cwd();
const configPath = path.join(root, 'data', 'content-routes.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const today = new Date();
const isoDate = today.toISOString().slice(0, 10);

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function clean(s = '') { return String(s).replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim(); }
function escapeXml(s = '') { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function slugify(s = '') { return clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 92) || 'intel-drop'; }
function itemTag(xml, tag) { const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')); return m ? clean(m[1]) : ''; }
function sourceDomain(url = '') { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }

function parseRss(xml, feed) {
  const items = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const block of blocks.slice(0, 30)) {
    let link = itemTag(block, 'link');
    const href = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
    if (href) link = href[1];
    const title = itemTag(block, 'title');
    if (!title || !link) continue;
    const description = itemTag(block, 'description') || itemTag(block, 'summary') || itemTag(block, 'content:encoded');
    const pubDateRaw = itemTag(block, 'pubDate') || itemTag(block, 'updated') || itemTag(block, 'published');
    const pubDate = pubDateRaw ? new Date(pubDateRaw) : null;
    items.push({
      source: feed.name,
      label: feed.label,
      sourceWeight: feed.weight || 1,
      title,
      description,
      link,
      pubDate: pubDate && !Number.isNaN(pubDate.getTime()) ? pubDate.toISOString() : null,
      domain: sourceDomain(link)
    });
  }
  return items;
}

function scoreItem(item) {
  const hay = `${item.title} ${item.description} ${item.source}`.toLowerCase();
  let score = item.sourceWeight || 0;
  for (const term of config.highPriorityTerms) {
    if (hay.includes(term.toLowerCase())) score += 5;
  }
  if (/epstein|maxwell/i.test(hay)) score += 18;
  if (/declass|vault|archive|wikileaks|court|filing|sanction/i.test(hay)) score += 8;
  if (/war|proxy|nato|ukraine|russia|china|iran|israel|cyber/i.test(hay)) score += 6;
  if (/cartel|mafia|launder|traffick|corruption/i.test(hay)) score += 7;
  if (item.pubDate) {
    const ageDays = Math.max(0, (Date.now() - new Date(item.pubDate).getTime()) / 86400000);
    score += Math.max(0, 8 - ageDays);
  }
  return Math.round(score * 100) / 100;
}

function chooseBook(item) {
  const hay = `${item.title} ${item.description} ${item.label}`.toLowerCase();
  let best = config.books[0];
  let bestScore = -1;
  for (const book of config.books) {
    let score = 0;
    for (const keyword of book.keywords || []) {
      if (hay.includes(keyword.toLowerCase())) score += 4;
    }
    if (book.key === 'black-file') score += 1;
    if (score > bestScore) { best = book; bestScore = score; }
  }
  return best;
}

function buildFacebookPost(item, book) {
  return [
    `SIGNAL DROP: ${item.title}`,
    '',
    `Evidence label: ${item.label}`,
    `Source: ${item.source}${item.pubDate ? ` / ${item.pubDate.slice(0, 10)}` : ''}`,
    '',
    'The headline is not the machine. The question is what structure this story reveals: power, files, money, intelligence, crime, war, symbols, or public record.',
    '',
    `Reader path: ${book.title}`,
    book.description,
    '',
    `Open the archive: ${book.localUrl}`,
    `Download The Black File: ${config.brand.blackFileUrl}`,
    '',
    '#MatrixReprogrammed #BlackFile #IntelDesk #DOGTheArchitect #PublicRecord'
  ].join('\n');
}

function buildYoutubeShort(item, book) {
  return {
    title: `The file behind the headline: ${item.title}`.slice(0, 98),
    description: [
      `Evidence label: ${item.label}`,
      `Source: ${item.source}`,
      item.link,
      '',
      'Matrix Reprogrammed does not chase noise. It follows structure.',
      '',
      `Read next: ${book.title}`,
      book.localUrl,
      '',
      `Black File: ${config.brand.blackFileUrl}`
    ].join('\n'),
    tags: ['Matrix Reprogrammed', 'Black File', 'D.O.G The Architect', 'public record', 'intel desk', item.label]
  };
}

function buildVideoScript(item, book) {
  const safeTitle = item.title.replace(/[\r\n]+/g, ' ');
  return [
    `The file everyone missed is not always hidden. Sometimes it is sitting in public, waiting for someone to connect it.`,
    `Today’s signal is labelled: ${item.label}.`,
    `The source is ${item.source}. The headline: ${safeTitle}.`,
    `Do not treat one headline as proof of a whole system. Treat it as a door.`,
    `Ask the better question: what does this story reveal about power, money, intelligence, crime, war, symbols, or consent?`,
    `That is the Matrix Reprogrammed method: source first, claim second, pattern last.`,
    `If this signal connects with you, follow the reader path: ${book.title}.`,
    `And download The Black File. The truth is not hidden. It is encoded.`
  ].join(' ');
}

function buildImagePrompt(item, book) {
  return `${config.style.video}; scene based on source-led news drop: ${item.title}; evidence label ${item.label}; visual metaphor for ${book.title}; dog guardian in black hooded archive, manga ink lines, rain of green code, gold dossier stamps, redacted documents, cinematic shadows, no photorealism, no real person likeness, no unsupported accusation, high contrast, vertical 9:16 composition`;
}

async function fetchFeed(feed) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(feed.url, { signal: controller.signal, headers: { 'User-Agent': 'MatrixReprogrammedIntelDesk/1.0' } });
    if (!res.ok) throw new Error(`${feed.name} HTTP ${res.status}`);
    return parseRss(await res.text(), feed);
  } catch (err) {
    console.warn(`Feed skipped: ${feed.name}: ${err.message}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackItem() {
  return {
    source: 'Matrix Reprogrammed Archive',
    label: 'Archive Signal',
    sourceWeight: 1,
    title: 'The Black File: thirty-three systems behind the visible story',
    description: 'Fallback archive post used when live source feeds produce no suitable drop.',
    link: config.brand.blackFileUrl,
    pubDate: today.toISOString(),
    domain: 'matrixreprogrammed.com'
  };
}

function markdownDrop(drop) {
  return `# ${drop.title}\n\n**Date:** ${drop.date}\n\n**Evidence label:** ${drop.label}\n\n**Source:** ${drop.source}\n\n**Source link:** ${drop.sourceLink}\n\n## Matrix Reprogrammed Angle\n\n${drop.angle}\n\n## Reader Path\n\n**${drop.book.title}**\n\n${drop.book.description}\n\n${drop.book.localUrl}\n\n## Facebook Post\n\n\`\`\`text\n${drop.social.facebook}\n\`\`\`\n\n## YouTube / Rumble Metadata\n\n**Title:** ${drop.social.youtube.title}\n\n**Description:**\n\n\`\`\`text\n${drop.social.youtube.description}\n\`\`\`\n\n## D.O.G Manga Video Script\n\n${drop.video.script}\n\n## Visual Prompt\n\n${drop.video.imagePrompt}\n`;
}

async function main() {
  const allItems = [];
  for (const feed of config.sourceFeeds) allItems.push(...await fetchFeed(feed));
  const scored = allItems.map(item => ({ ...item, score: scoreItem(item) })).sort((a, b) => b.score - a.score);
  const item = scored[0] || fallbackItem();
  const book = chooseBook(item);
  const slug = `${isoDate}-${slugify(item.title)}`;
  const drop = {
    date: isoDate,
    slug,
    title: item.title,
    label: item.label,
    source: item.source,
    sourceLink: item.link,
    sourceDomain: item.domain,
    sourceDate: item.pubDate,
    score: item.score || 0,
    summary: item.description,
    angle: 'This item is treated as a signal, not a conclusion. The value is in what it reveals about structure: institutions, files, money, war, intelligence, crime, media, symbols, or public consent.',
    book: {
      key: book.key,
      title: book.title,
      description: book.description,
      localUrl: book.localUrl,
      amazonUs: book.amazonUs || null,
      amazonUk: book.amazonUk || null
    },
    social: {
      facebook: buildFacebookPost(item, book),
      youtube: buildYoutubeShort(item, book)
    },
    video: {
      style: config.style.video,
      script: buildVideoScript(item, book),
      narrationText: buildVideoScript(item, book),
      imagePrompt: buildImagePrompt(item, book)
    },
    candidates: scored.slice(0, 8).map(x => ({ title: x.title, source: x.source, label: x.label, link: x.link, score: x.score }))
  };

  const dataDir = path.join(root, 'data', 'drops');
  const socialDir = path.join(root, 'social', 'daily');
  ensureDir(dataDir); ensureDir(socialDir);
  fs.writeFileSync(path.join(dataDir, `${slug}.json`), JSON.stringify(drop, null, 2));
  fs.writeFileSync(path.join(socialDir, `${slug}.md`), markdownDrop(drop));
  fs.writeFileSync(path.join(root, 'data', 'latest-drop.json'), JSON.stringify(drop, null, 2));

  console.log(`Generated daily Intel Drop: ${slug}`);
  console.log(`Title: ${drop.title}`);
  console.log(`Book route: ${drop.book.title}`);
}

main().catch(err => { console.error(err); process.exit(1); });
