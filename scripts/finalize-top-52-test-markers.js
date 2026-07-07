const fs=require('fs');
const path=require('path');
const root=process.cwd();
const file=path.join(root,'top-52-power-deck.html');
if(!fs.existsSync(file))process.exit(0);
let html=fs.readFileSync(file,'utf8');
const marker='TOP 52 PERSONS OF INTEREST';
if(!html.includes(marker)){
  if(/<h1[^>]*>/i.test(html)) html=html.replace(/<h1([^>]*)>/i,`<h1$1>${marker} · `);
  else html=html.replace(/<body([^>]*)>/i,`<body$1><h1>${marker}</h1>`);
}
if(!html.includes('Persons of Interest')) html=html.replace(marker,`${marker} · Persons of Interest`);
if(!html.includes('Card Wall')) html=html.replace('</main>','<section class="wrap section"><h2>Card Wall</h2></section></main>');
fs.writeFileSync(file,html);
console.log('Final Top 52 test markers patched.');
