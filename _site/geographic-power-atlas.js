import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.0.0-20/dist/maplibre-gl.mjs';
import {Protocol} from 'https://unpkg.com/pmtiles@4.4.1/dist/esm/index.js';

const $ = id => document.getElementById(id);
const state = {manifest:null, geojson:null, filtered:null, map:null, fallback:false};
const categoryColours = {
  regulator:'#d8b56a','central-bank':'#66c2ff',government:'#b8a3ff',justice:'#ff8b8b','law-enforcement':'#ffb870',intelligence:'#c28cff',oversight:'#8bd9a5','financial-intelligence':'#5cd6c0','intergovernmental':'#8fb8ff','financial-institution':'#66c2ff',parliament:'#e8cf84','security-alliance':'#d996ff','financial-governance':'#5cd6c0',infrastructure:'#f0a65a'
};
const fallbackStyle = {version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#090806'}}]};

function setStatus(text, kind='') {
  const node = $('atlas-status'); if (!node) return;
  node.textContent = text; node.dataset.kind = kind;
}
function esc(value='') { return String(value); }
function localPmtilesUrl(value) {
  try { const url = new URL(value, location.href); return url.origin === location.origin && /\.pmtiles(?:$|\?)/i.test(url.pathname) ? url.href : ''; }
  catch { return ''; }
}
function addText(parent, tag, text, className='') {
  const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; parent.appendChild(node); return node;
}
function popupNode(feature) {
  const p = feature.properties || {};
  const wrap = document.createElement('article');
  addText(wrap,'h3',p.name || 'Location');
  addText(wrap,'p',`${p.role || ''} · ${p.city || ''}, ${p.country || ''}`);
  const badges = document.createElement('div'); badges.className='atlas-badges';
  [p.category,p.precisionLabel,`${Number(p.recordCount||0).toLocaleString()} matched records`,p.evidenceGrade ? `Registry grade ${p.evidenceGrade}` : ''].filter(Boolean).forEach(value => addText(badges,'span',value));
  wrap.appendChild(badges);
  addText(wrap,'p',p.establishes || '');
  addText(wrap,'p',p.doesNotEstablish || '', 'figure-caption');
  if (p.sourceUrl) { const link=document.createElement('a'); link.href=p.sourceUrl; link.target='_blank'; link.rel='noopener noreferrer'; link.textContent='Open official location source ↗'; wrap.appendChild(link); }
  return wrap;
}
function graticule() {
  const features=[];
  for(let lat=-60;lat<=60;lat+=30) features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:Array.from({length:73},(_,i)=>[-180+i*5,lat])}});
  for(let lng=-150;lng<=150;lng+=30) features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:Array.from({length:33},(_,i)=>[lng,-80+i*5])}});
  return {type:'FeatureCollection',features};
}
function addAtlasLayers() {
  const map=state.map; if (!map || !state.filtered) return;
  if (!map.getSource('atlas-graticule')) map.addSource('atlas-graticule',{type:'geojson',data:graticule()});
  if (!map.getLayer('atlas-graticule')) map.addLayer({id:'atlas-graticule',type:'line',source:'atlas-graticule',paint:{'line-color':'rgba(216,181,106,.15)','line-width':1}});
  if (!map.getSource('atlas-points')) map.addSource('atlas-points',{type:'geojson',data:state.filtered,cluster:true,clusterRadius:42,clusterMaxZoom:4});
  else map.getSource('atlas-points').setData(state.filtered);
  if (!map.getLayer('atlas-clusters')) map.addLayer({id:'atlas-clusters',type:'circle',source:'atlas-points',filter:['has','point_count'],paint:{'circle-color':'#d8b56a','circle-opacity':.82,'circle-stroke-color':'#f3e6bd','circle-stroke-width':1,'circle-radius':['step',['get','point_count'],17,10,22,25,28]}});
  if (!map.getLayer('atlas-cluster-count')) map.addLayer({id:'atlas-cluster-count',type:'symbol',source:'atlas-points',filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-size':12},paint:{'text-color':'#090806'}});
  if (!map.getLayer('atlas-halo')) map.addLayer({id:'atlas-halo',type:'circle',source:'atlas-points',filter:['!',['has','point_count']],paint:{'circle-radius':['interpolate',['linear'],['coalesce',['get','recordCount'],0],0,9,100,14,1000,20],'circle-color':'rgba(216,181,106,.1)','circle-stroke-color':'rgba(216,181,106,.35)','circle-stroke-width':1}});
  if (!map.getLayer('atlas-points')) map.addLayer({id:'atlas-points',type:'circle',source:'atlas-points',filter:['!',['has','point_count']],paint:{'circle-radius':['interpolate',['linear'],['coalesce',['get','recordCount'],0],0,5,100,8,1000,12],'circle-color':['match',['get','category'],...Object.entries(categoryColours).flat(),'#d8b56a'],'circle-stroke-color':'#f3e6bd','circle-stroke-width':1.2,'circle-opacity':.9}});
  for (const source of state.manifest.pmtilesSources || []) {
    if (!source.enabled || !source.id || map.getSource(source.id)) continue;
    const href=localPmtilesUrl(source.url); if (!href) continue;
    map.addSource(source.id,{type:'vector',url:`pmtiles://${href}`});
    for (const layer of source.layers || []) { if (layer && layer.id && !map.getLayer(layer.id)) map.addLayer({...layer,source:source.id}); }
  }
}
function wireMapEvents() {
  const map=state.map;
  map.on('click','atlas-clusters',event=>{
    const feature=map.queryRenderedFeatures(event.point,{layers:['atlas-clusters']})[0];
    if (!feature) return; const id=feature.properties.cluster_id; const source=map.getSource('atlas-points');
    source.getClusterExpansionZoom(id).then(zoom=>map.easeTo({center:feature.geometry.coordinates,zoom})).catch(()=>{});
  });
  map.on('click','atlas-points',event=>{
    const feature=event.features && event.features[0]; if (!feature) return;
    new maplibregl.Popup({maxWidth:'380px'}).setLngLat(feature.geometry.coordinates).setDOMContent(popupNode(feature)).addTo(map);
  });
  ['atlas-clusters','atlas-points'].forEach(layer=>{
    map.on('mouseenter',layer,()=>{map.getCanvas().style.cursor='pointer';});
    map.on('mouseleave',layer,()=>{map.getCanvas().style.cursor='';});
  });
}
function buildMap(style) {
  const existing=state.map; if (existing) existing.remove();
  const map=new maplibregl.Map({container:'power-atlas-map',style,center:[8,32],zoom:1.45,minZoom:1,maxZoom:14,attributionControl:true});
  state.map=map;
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
  map.addControl(new maplibregl.ScaleControl({maxWidth:120,unit:'metric'}),'bottom-left');
  let loaded=false;
  map.once('load',()=>{loaded=true;addAtlasLayers();wireMapEvents();setStatus(`${state.filtered.features.length} mapped locations. Select a point or use the accessible list.`,'success');});
  map.on('error',event=>{
    if (!loaded && !state.fallback) {
      state.fallback=true; setStatus('Public basemap unavailable. Using the local dark graticule fallback.','warning');
      setTimeout(()=>buildMap(fallbackStyle),0);
    } else if (event && event.error) console.warn('Atlas map error:',event.error.message || event.error);
  });
}
function filters() {
  return {q:($('atlas-search')?.value||'').trim().toLowerCase(),category:$('atlas-category')?.value||'',country:$('atlas-country')?.value||'',precision:$('atlas-precision')?.value||''};
}
function matches(feature, f) {
  const p=feature.properties||{};
  const text=[p.name,p.role,p.city,p.country,p.category,p.sourceTitle].join(' ').toLowerCase();
  return (!f.q || text.includes(f.q)) && (!f.category || p.category===f.category) && (!f.country || p.country===f.country) && (!f.precision || p.precision===f.precision);
}
function renderList() {
  const target=$('power-atlas-list'); if (!target) return; target.textContent='';
  const features=state.filtered.features.slice().sort((a,b)=>(b.properties.recordCount||0)-(a.properties.recordCount||0)||a.properties.name.localeCompare(b.properties.name));
  for (const feature of features) {
    const p=feature.properties; const card=document.createElement('article'); card.className='card power-atlas-item'; card.tabIndex=0;
    addText(card,'h3',p.name); addText(card,'p',`${p.city}, ${p.country} · ${p.role}`);
    const badges=document.createElement('div'); badges.className='atlas-badges'; [p.category,p.precisionLabel,`${Number(p.recordCount||0).toLocaleString()} records`].forEach(v=>addText(badges,'span',v)); card.appendChild(badges);
    addText(card,'p',p.doesNotEstablish,'figure-caption');
    const open=()=>{ if(state.map){state.map.flyTo({center:feature.geometry.coordinates,zoom:p.precision==='jurisdiction-centroid'?7:10}); new maplibregl.Popup({maxWidth:'380px'}).setLngLat(feature.geometry.coordinates).setDOMContent(popupNode(feature)).addTo(state.map);} };
    card.addEventListener('click',open); card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}}); target.appendChild(card);
  }
  if (!features.length) addText(target,'p','No registered locations match these filters.');
}
function applyFilters() {
  if (!state.geojson) return; const f=filters();
  state.filtered={...state.geojson,features:state.geojson.features.filter(feature=>matches(feature,f))};
  renderList();
  if (state.map && state.map.getSource('atlas-points')) state.map.getSource('atlas-points').setData(state.filtered);
  setStatus(`${state.filtered.features.length} of ${state.geojson.features.length} registered locations shown.`,'success');
}
function wireControls() {
  ['atlas-search','atlas-category','atlas-country','atlas-precision'].forEach(id=>$(id)?.addEventListener(id==='atlas-search'?'input':'change',applyFilters));
  $('atlas-reset')?.addEventListener('click',()=>{['atlas-search','atlas-category','atlas-country','atlas-precision'].forEach(id=>{const node=$(id);if(node)node.value='';});applyFilters();state.map?.flyTo({center:[8,32],zoom:1.45});});
}
async function init() {
  try {
    const [manifestResponse,geoResponse]=await Promise.all([fetch('data/geographic-power-atlas.json',{cache:'no-store'}),fetch('data/geographic-power-atlas-data.json',{cache:'no-store'})]);
    if (!manifestResponse.ok || !geoResponse.ok) throw new Error('Atlas data could not be loaded.');
    state.manifest=await manifestResponse.json(); state.geojson=await geoResponse.json(); state.filtered=state.geojson;
    const protocol=new Protocol(); maplibregl.addProtocol('pmtiles',protocol.tile);
    wireControls(); renderList(); buildMap(state.manifest.basemap?.styleUrl || fallbackStyle);
  } catch (error) { console.error(error); setStatus(error.message || 'Atlas failed to load.','error'); }
}
init();
