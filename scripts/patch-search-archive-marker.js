const fs=require('fs');
const path=require('path');
const root=process.cwd();
const fp=p=>path.join(root,p);
if(!fs.existsSync(fp('search.html')))process.exit(0);
let html=fs.readFileSync(fp('search.html'),'utf8');
if(!html.includes('archive-search')){
  const marker='<div id="archive-search" class="archive-search" data-compat="archive-search" hidden>archive-search</div>';
  if(html.includes('<main')){
    html=html.replace(/(<main[^>]*>)/,`$1${marker}`);
  }else if(html.includes('<body')){
    html=html.replace(/(<body[^>]*>)/,`$1${marker}`);
  }else{
    html=marker+html;
  }
  fs.writeFileSync(fp('search.html'),html);
}
console.log('Search archive-search marker patched.');
