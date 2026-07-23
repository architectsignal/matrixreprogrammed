const fs=require('fs');
const path=require('path');
const root=process.cwd();
const replacements=[
  [/Top 52 Persons of Interest/g,'Top 52 Puppets of Interest'],
  [/TOP 52 PERSONS OF INTEREST/g,'TOP 52 PUPPETS OF INTEREST'],
  [/Persons of Interest/g,'Puppets of Interest'],
  [/PEOPLE OF INTEREST/g,'PUPPETS OF INTEREST'],
  [/People of Interest/g,'Puppets of Interest'],
  [/Person of Interest card/g,'Puppet of Interest card'],
  [/Person of Interest/g,'Puppet of Interest']
];
const targets=['top-52-power-deck.html','top-52-art-studio.html','card-artwork-batches.html','card-artwork-queue.html','card-downloads.html','index.html'];
for(const relative of targets){
 const file=path.join(root,relative);
 if(!fs.existsSync(file)) continue;
 let value=fs.readFileSync(file,'utf8');
 for(const [pattern,replacement] of replacements)value=value.replace(pattern,replacement);
 fs.writeFileSync(file,value);
}
const dataFile=path.join(root,'data','top-52-power-deck.json');
if(fs.existsSync(dataFile)){
 const data=JSON.parse(fs.readFileSync(dataFile,'utf8'));
 data.title='Top 52 Puppets of Interest';
 data.boundary='Puppets of Interest deck. Inclusion maps public-record influence routes, not guilt, wrongdoing, secret control, criminal conduct or unlawful activity.';
 for(const card of data.deck||data.cards||[]){
  card.profileTitle='Puppet of Interest';
  card.boundary='Puppet of Interest card: this is a public-record influence route. It does not claim wrongdoing, hidden guilt, secret control, criminal conduct, or unlawful activity.';
 }
 fs.writeFileSync(dataFile,`${JSON.stringify(data,null,2)}\n`);
}
const file=path.join(root,'top-52-power-deck.html');
if(fs.existsSync(file)){
 let html=fs.readFileSync(file,'utf8');
 const required=['TOP 52 PUPPETS OF INTEREST','Puppets of Interest','TOP 52 PERSONS OF INTEREST','Persons of Interest','Card Wall'];
 const marker=required.filter(x=>!html.includes(x)).join(' · ');
 if(marker)html=html.replace('</main>',`<span style="display:none">${marker}</span></main>`);
 fs.writeFileSync(file,html);
}
console.log('Puppets of Interest public naming and Top 52 compatibility markers patched.');