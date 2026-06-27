const fs = require('fs');
const path = require('path');
const root = process.cwd();
const SITE = 'https://matrixreprogrammed.com';
function file(name){ return path.join(root, name); }
function exists(name){ return fs.existsSync(file(name)); }
function read(name){ return fs.readFileSync(file(name), 'utf8'); }
function write(name, value){ fs.writeFileSync(file(name), value); }
function esc(s=''){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function ensureBodyBoard(html, board){ return html.replace('<body>', `<body data-board="${board}">`).replace(/<body data-board="[^"]*">/, `<body data-board="${board}">`); }
function ensureFormBoard(html, board){
  html = html.replace(/<input\s+type="hidden"\s+name="board"\s+value="[^"]*"\s*\/?>/gi, '');
  return html.replace(/<form\s+id="signal-board-form"([^>]*)>/i, (full, attrs) => {
    const cleaned = String(attrs || '').replace(/\sdata-board="[^"]*"/i, '').trim();
    return `<form id="signal-board-form" data-board="${board}"${cleaned ? ' ' + cleaned : ''}><input type="hidden" name="board" value="${board}" />`;
  });
}
function ensureBoardNav(html){
  const block = '<a href="forum.html">Main Board</a><a href="dark-speculation-forum.html">Speculation Board</a><a href="epstein-alive-board.html">Epstein Sighting Board</a>';
  if (html.includes('epstein-alive-board.html') && html.includes('dark-speculation-forum.html')) return html;
  return html.replace('<a href="forum.html">Signal Board</a>', block).replace('<a href="forum.html">Main Board</a>', block);
}
function ensureFeed(html, heading, lead){
  if (html.includes('id="signal-board-feed"')) return html;
  const section = `<section id="board-feed" class="section wrap"><h2>${esc(heading)}</h2><p class="lead">${esc(lead)}</p><div class="grid" id="signal-board-feed"><article class="card"><h3>Loading signals...</h3><p>The board is checking for posts.</p></article></div></section>`;
  return html.includes('</main>') ? html.replace('</main>', `${section}</main>`) : `${html}${section}`;
}
function patchPage(name, board, heading, lead){
  if (!exists(name)) return false;
  let html = read(name);
  html = ensureBodyBoard(html, board);
  html = ensureFormBoard(html, board);
  html = ensureBoardNav(html);
  html = ensureFeed(html, heading, lead);
  write(name, html);
  return true;
}
patchPage('forum.html', 'main', 'Main Signal Board', 'Main-board posts only. Dark speculation and Epstein sighting claims are separated into their own boards.');
patchPage('dark-speculation-forum.html', 'speculation', 'Dark Speculation Board', 'Speculation links, claim motifs, counter-sources, and source trails live here instead of the main board.');
patchPage('epstein-sighting-submit.html', 'epstein-alive', 'Epstein Sighting Board', 'Epstein alive, sighting, lookalike, fake-media, and debunk claims live here instead of the main board.');
if (exists('epstein-sighting-submit.html')) {
  let html = read('epstein-sighting-submit.html');
  html = html
    .replace(/<title>Submit Epstein Sighting Claim \| Matrix Reprogrammed<\/title>/, '<title>Epstein Sighting Board | Matrix Reprogrammed</title>')
    .replace(/Submit A Sighting Claim/g, 'Epstein Sighting Board')
    .replace(/Post To Sighting Watch/g, 'Post To Epstein Sighting Board');
  write('epstein-alive-board.html', html);
}
if (exists('epstein-sighting-watch.html')) {
  let html = read('epstein-sighting-watch.html').replace(/epstein-sighting-submit\.html/g, 'epstein-alive-board.html');
  write('epstein-sighting-watch.html', html);
}
if (exists('epstein-files.html')) {
  let html = read('epstein-files.html').replace(/epstein-sighting-submit\.html/g, 'epstein-alive-board.html');
  write('epstein-files.html', html);
}
const routes = ['forum.html','dark-speculation-forum.html','epstein-alive-board.html'];
if (exists('sitemap.xml')) {
  let xml = read('sitemap.xml');
  const today = new Date().toISOString().slice(0,10);
  for (const route of routes) {
    if (!xml.includes(`/${route}</loc>`)) xml = xml.replace('</urlset>', `  <url><loc>${SITE}/${route}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.82</priority></url>\n</urlset>`);
  }
  write('sitemap.xml', xml);
}
if (exists('llms.txt')) {
  let txt = read('llms.txt');
  const block = '\n\nSignal Board Split:\n- /forum.html: main Signal Board for general source drops and reader questions.\n- /dark-speculation-forum.html: separate Dark Speculation Board.\n- /epstein-alive-board.html: separate Epstein Sighting Board.\n- Worker feeds: /forum-feed?board=main, /forum-feed?board=speculation, /forum-feed?board=epstein-alive.\n';
  if (!txt.includes('/epstein-alive-board.html')) write('llms.txt', `${txt.trim()}${block}`);
}
if (exists('search-index.json')) {
  const index = JSON.parse(read('search-index.json'));
  const additions = [
    { key:'main-signal-board', title:'Main Signal Board', subtitle:'Clean general source-drop board', series:'Signal Board', category:'Forum', url:'forum.html', description:'Main Signal Board for general source drops, reader questions, books, intelligence, crime-state overlap, war files, and human-cost updates.', keywords:['signal board','forum','source drops','reader questions','main board'] },
    { key:'dark-speculation-board', title:'Dark Speculation Board', subtitle:'Separate speculation feed', series:'Signal Board', category:'Forum', url:'dark-speculation-forum.html', description:'Separate board for speculation links, claim motifs, counter-sources, and source trails.', keywords:['dark speculation','speculation board','claim motifs','counter sources'] },
    { key:'epstein-sighting-board', title:'Epstein Sighting Board', subtitle:'Separate Epstein sighting claim feed', series:'Epstein Files', category:'Forum', url:'epstein-alive-board.html', description:'Separate board for Epstein alive, sighting, lookalike, fake-media, and debunk claims with an official-status boundary.', keywords:['epstein','sighting','alive claim','lookalike','debunk','board'] }
  ];
  for (const item of additions) if (!index.some(row => row.url === item.url)) index.push(item);
  write('search-index.json', JSON.stringify(index, null, 2));
}
write('data/forum-board-split.json', JSON.stringify({ updated: new Date().toISOString(), boards: [
  { id:'main', title:'Main Signal Board', route:'forum.html', feed:'/forum-feed?board=main' },
  { id:'speculation', title:'Dark Speculation Board', route:'dark-speculation-forum.html', feed:'/forum-feed?board=speculation' },
  { id:'epstein-alive', title:'Epstein Sighting Board', route:'epstein-alive-board.html', feed:'/forum-feed?board=epstein-alive' }
]}, null, 2));
console.log('Built three-board Signal Board split: main, speculation, epstein-alive.');
