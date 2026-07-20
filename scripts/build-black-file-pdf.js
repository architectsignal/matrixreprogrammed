const {execFileSync}=require('child_process');
const path=require('path');
execFileSync(process.execPath,[path.join(__dirname,'build-deep-pdf-intelligence.mjs'),'--black-only'],{cwd:process.cwd(),stdio:'inherit'});
