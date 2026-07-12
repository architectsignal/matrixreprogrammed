const fs=require('fs');
const path=require('path');
const root=process.cwd();
const source=path.join(root,'data','geographic-power-atlas.geojson');
const deployable=path.join(root,'data','geographic-power-atlas-data.json');
if(!fs.existsSync(source)) throw new Error('Canonical geographic atlas GeoJSON is missing.');
const parsed=JSON.parse(fs.readFileSync(source,'utf8'));
if(parsed.type!=='FeatureCollection'||!Array.isArray(parsed.features)) throw new Error('Canonical geographic atlas is not a FeatureCollection.');
fs.writeFileSync(deployable,JSON.stringify(parsed,null,2));
for(const rel of ['geographic-power-atlas.html','geographic-power-atlas.js','research-tools.html','llms.txt']){
  const file=path.join(root,rel); if(!fs.existsSync(file)) continue;
  const before=fs.readFileSync(file,'utf8');
  const after=before.replace(/data\/geographic-power-atlas\.geojson/g,'data/geographic-power-atlas-data.json');
  if(after!==before) fs.writeFileSync(file,after);
}
require('./patch-start-here-safety-links.js');
console.log(`Deployable atlas data prepared: ${parsed.features.length} GeoJSON features in data/geographic-power-atlas-data.json.`);
