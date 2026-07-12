const fs=require('fs');
const path=require('path');
const root=process.cwd();
const file=path.join(root,'start-here.html');
if(!fs.existsSync(file)) throw new Error('start-here.html not found');
let html=fs.readFileSync(file,'utf8');

// Remove older generated duplicate safety block and reveal the canonical Start Here grid.
html=html.replace(/<!-- start-here-safety:start -->[\s\S]*?<!-- start-here-safety:end -->/g,'');
html=html.replace(/<section class="section commercial-internal">/g,'<section class="section">');
html=html.replace(/<section class='section commercial-internal'>/g,"<section class='section'>");

// Keep one clean primary navigation set.
html=html.replace(/<a href="security-privacy\.html">Security Tools<\/a>\s*/g,'');
html=html.replace(/<a href="dark-web-safety\.html">Dark Web Safety<\/a>\s*/g,'');
html=html.replace(/<!-- safety-start-nav -->/g,'');
html=html.replace('<a href="search.html">Search</a>', '<a href="security-privacy.html">Security Tools</a><a href="dark-web-safety.html">Dark Web Safety</a><a href="search.html">Search</a>');

// Ensure stable, unique card IDs without duplicating the existing public cards.
html=html.replace(/id="start-here-safety"/g,'id="start-here-security-tools"');
if(!html.includes('href="security-privacy.html"')) throw new Error('Start Here Security Tools route missing after patch.');
if(!html.includes('href="dark-web-safety.html"')) throw new Error('Start Here Dark Web Safety route missing after patch.');

fs.writeFileSync(file,html);
console.log('Start Here safety routes normalised, revealed and deduplicated.');
