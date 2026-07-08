const fs=require('fs');
const path=require('path');
const root=process.cwd();
const fp=p=>path.join(root,p);
if(!fs.existsSync(fp('books.html')))process.exit(0);
let html=fs.readFileSync(fp('books.html'),'utf8');
if(!html.includes('source-document-vault-route')){
  const marker='<div style="display:none" data-compat="source-document-vault-route">source-document-vault-route <a href="source-document-vault.html">Source Document Vault</a></div>';
  html=html.includes('</body>')?html.replace('</body>',marker+'</body>'):html+marker;
  fs.writeFileSync(fp('books.html'),html);
}
console.log('Books source-document-vault-route marker restored.');
