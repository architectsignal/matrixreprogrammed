const fs=require('fs');
const path=require('path');
const root=process.cwd();
const fp=p=>path.join(root,p);
const ex=p=>fs.existsSync(fp(p));
const rd=p=>fs.readFileSync(fp(p),'utf8');
const wr=(p,v)=>fs.writeFileSync(fp(p),v);
function clean(s=''){return String(s||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim()}
const file='data/live-intel.json';
if(!ex(file)) process.exit(0);
const data=JSON.parse(rd(file));
const lanes=Array.isArray(data.lanes)?data.lanes:[];
const feeds=Array.isArray(data.feedResults)?data.feedResults:[];
const existing=Array.isArray(data.items)?data.items:[];
function laneFor(id){return lanes.find(l=>l.id===id)||lanes[0]||{id:'control-system',title:'Elite Control Structure',route:'power-atlas.html',evidenceRoute:'evidence-vault.html',videoRoute:'videos.html',offerRoute:'offer-center.html',bookRoute:'books.html'}}
function itemFromFeed(f,i){const lane=laneFor(f.lane);const title=clean(f.title||`Live Intel Update ${i+1}`);const laneTitle=clean(lane.title||f.lane||'Live Intel');return{ id:`live-intel-${i+1}-${String(f.published||Date.now()).slice(0,10)}`, lane:clean(f.lane||lane.id), laneTitle, sourceLabel:clean((title.split(' - ').pop()||'Public source')), title, url:clean(f.url||'#'), published:clean(f.published||new Date().toISOString()), summary:clean(f.summary||title), evidenceLevel:'Source linked', evidenceBoundary:'This is a dated public-source lead. It is not proof of wrongdoing by itself. Open the source and evidence route before treating it as evidence.', whyItMatters:`This item belongs to the ${laneTitle} watch lane and may connect to wider public-record influence, disclosure, oversight or control-structure routes.`, nextAction:'Open the source, check the evidence route, then use the video hook, free brief, offer and book path for deeper context.', videoHook:`A new ${laneTitle} signal just entered the public record: ${title}`, rumbleShortTitle:title.slice(0,96), rumbleLongTitle:`Live Intel: ${title}`.slice(0,140), socialThread:[`New public-source lead: ${title}`,`Lane: ${laneTitle}`,`Boundary: source lead, not automatic proof.`], evidenceRoute:lane.evidenceRoute||'evidence-vault.html', videoRoute:lane.videoRoute||'videos.html', optinRoute:'optin-center.html', offerRoute:lane.offerRoute||'offer-center.html', bookRoute:lane.bookRoute||'books.html', storeRoute:'amazon-store-books.html'} }
const merged=[...existing.filter(x=>x&&x.title),...feeds.map(itemFromFeed)];
const seen=new Set();
data.items=merged.filter(x=>{const k=x.title+'|'+x.published;if(seen.has(k))return false;seen.add(k);return true}).slice(0,12);
if(data.items.length<4){for(let i=data.items.length;i<4;i++){const lane=laneFor(lanes[i%Math.max(1,lanes.length)]?.id);data.items.push(itemFromFeed({lane:lane.id,title:`Fallback public-record watch item for ${lane.title}`,url:lane.route||'live-intel.html',published:new Date().toISOString()},i));}}
data.updated=new Date().toISOString();
data.status='enriched-live-intel-items';
wr(file,JSON.stringify(data,null,2));
console.log('Live Intel items enriched: '+data.items.length);
