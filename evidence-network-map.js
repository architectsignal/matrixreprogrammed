(() => {
  const q = selector => document.querySelector(selector);
  const map = q('#evidence-network-map');
  const status = q('#map-status');
  const details = q('#map-details');
  const search = q('#map-search');
  const lane = q('#map-lane');
  const grade = q('#map-grade');
  const recordStatus = q('#map-record-status');
  const storageKey = 'matrix-evidence-map-views-v1';
  let graph;
  let cy;
  let layoutIndex = 0;
  const layouts = ['cose', 'concentric', 'breadthfirst', 'circle'];
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const human = value => String(value || '').replace(/-/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const setStatus = (text, kind = '') => { status.textContent = text; status.className = `map-status ${kind}`.trim(); };
  const addOption = (select, value, text) => { const option = document.createElement('option'); option.value = value; option.textContent = text; select.appendChild(option); };

  function populateFilters() {
    (graph.filters?.lanes || []).forEach(value => addOption(lane, value, human(value)));
    (graph.filters?.grades || []).forEach(value => addOption(grade, value, `Grade ${value}`));
    (graph.filters?.statuses || []).forEach(value => addOption(recordStatus, value, human(value)));
  }
  function matches(node) {
    const data = node.data();
    const selectedLane = lane.value;
    if (data.type !== 'finding') {
      if (selectedLane && data.type === 'source' && data.lane !== selectedLane) return false;
      if (selectedLane && data.type === 'lane' && data.rawId !== selectedLane) return false;
      return true;
    }
    if (selectedLane && data.lane !== selectedLane) return false;
    if (grade.value && data.grade !== grade.value) return false;
    if (recordStatus.value && data.status !== recordStatus.value) return false;
    const term = search.value.trim().toLowerCase();
    if (!term) return true;
    return [data.label,data.description,data.summary,data.mechanism,data.implication,data.sourceLabel,(data.indicators||[]).join(' ')].join(' ').toLowerCase().includes(term);
  }
  function filter() {
    if (!cy) return;
    cy.nodes().forEach(node => node.style('display', matches(node) ? 'element' : 'none'));
    cy.edges().forEach(edge => edge.style('display', edge.source().style('display') !== 'none' && edge.target().style('display') !== 'none' ? 'element' : 'none'));
    for (const type of ['source','lane']) {
      cy.nodes(`[type = "${type}"]`).forEach(node => {
        const connected = node.connectedEdges().some(edge => edge.style('display') !== 'none');
        const untouched = !search.value.trim() && !lane.value && !grade.value && !recordStatus.value;
        node.style('display', connected || untouched ? 'element' : 'none');
      });
    }
    cy.edges().forEach(edge => edge.style('display', edge.source().style('display') !== 'none' && edge.target().style('display') !== 'none' ? 'element' : 'none'));
    const count = cy.nodes('[type = "finding"]').filter(node => node.style('display') !== 'none').length;
    setStatus(`${count} evidence finding${count === 1 ? '' : 's'} shown. Select a node to inspect it.`, 'ok');
  }
  function renderDetails(data) {
    details.innerHTML = `<span class="label">${escapeHtml(human(data.type))}${data.grade ? ` · Grade ${escapeHtml(data.grade)}` : ''}${data.status ? ` · ${escapeHtml(human(data.status))}` : ''}</span>
      <h3>${escapeHtml(data.label || data.rawId || 'Evidence node')}</h3>
      ${data.sourceLabel ? `<p><strong>Source:</strong> ${escapeHtml(data.sourceLabel)}</p>` : ''}
      ${data.published ? `<p><strong>Published:</strong> ${escapeHtml(new Date(data.published).toLocaleString())}</p>` : ''}
      ${data.description ? `<p><strong>Conclusion:</strong> ${escapeHtml(data.description)}</p>` : ''}
      ${data.mechanism ? `<p><strong>Mechanism:</strong> ${escapeHtml(data.mechanism)}</p>` : ''}
      ${data.implication ? `<p><strong>Implication:</strong> ${escapeHtml(data.implication)}</p>` : ''}
      ${data.boundary ? `<p><strong>Evidence boundary:</strong> ${escapeHtml(data.boundary)}</p>` : ''}
      ${(data.nextRecords||[]).length ? `<h4>Next records</h4><ul>${data.nextRecords.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
      <div class="cta-row small">${data.route ? `<a class="btn" href="${escapeHtml(data.route)}" rel="noopener">Open record</a>` : ''}<a class="btn alt" href="search.html?q=${encodeURIComponent(data.label || '')}">Search connections</a></div>`;
  }
  function savedViews() {
    const box = q('#saved-views');
    let views = [];
    try { views = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch {}
    box.innerHTML = views.length ? '' : '<p class="mini">No saved views on this device.</p>';
    views.slice(0, 12).forEach(view => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn alt saved-view'; button.textContent = view.name;
      button.onclick = () => { search.value=view.query||''; lane.value=view.lane||''; grade.value=view.grade||''; recordStatus.value=view.status||''; filter(); cy.fit(cy.elements(':visible'),40); };
      box.appendChild(button);
    });
  }
  function init() {
    if (typeof cytoscape !== 'function') throw new Error('Cytoscape.js did not load.');
    cy = cytoscape({ container: map, elements: [...graph.elements.nodes,...graph.elements.edges], minZoom:.15,maxZoom:3.5,wheelSensitivity:.17,
      style:[
        {selector:'node',style:{label:'data(label)','font-size':10,'text-wrap':'wrap','text-max-width':120,'text-valign':'bottom','text-margin-y':8,color:'#f3e6bd','background-color':'#6f5826','border-color':'#d8b56a','border-width':1.5,width:'mapData(weight,20,90,24,64)',height:'mapData(weight,20,90,24,64)'}},
        {selector:'node[type = "lane"]',style:{shape:'round-rectangle','background-color':'#8b1e1e','border-color':'#ffb0a5','font-size':12,'font-weight':'bold',width:76,height:50}},
        {selector:'node[type = "source"]',style:{shape:'diamond','background-color':'#2e4f78','border-color':'#9bc9ff',width:42,height:42}},
        {selector:'node[grade = "A"]',style:{'background-color':'#856b2f','border-width':3}},
        {selector:'node[status = "established-wrongdoing"]',style:{'background-color':'#9d2323','border-color':'#ffd0c8','border-width':4}},
        {selector:'edge',style:{'curve-style':'bezier','line-color':'#665b42','target-arrow-color':'#665b42','target-arrow-shape':'triangle',width:1.2,opacity:.75}},
        {selector:'edge[type = "supports"]',style:{'line-color':'#b28b3c','target-arrow-color':'#b28b3c',width:1.8}},
        {selector:':selected',style:{'border-color':'#fff','border-width':4}}
      ], layout:{name:'cose',animate:false,randomize:true,nodeRepulsion:140000,idealEdgeLength:95,gravity:.45,numIter:900} });
    cy.on('tap','node',event=>renderDetails(event.target.data()));
    cy.on('tap',event=>{if(event.target===cy)details.innerHTML='<span class="label">Evidence boundary</span><h3>Select a node</h3><p>A line identifies a defined source relationship. It is not a verdict.</p>';});
    filter(); cy.fit(undefined,35);
  }
  async function load() {
    setStatus('Loading evidence map…','pending');
    try {
      const response = await fetch('/data/evidence-network-map.json',{cache:'no-store',headers:{accept:'application/json'}});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      graph = await response.json();
      if (!graph?.elements?.nodes?.length) throw new Error('No evidence nodes were generated.');
      populateFilters(); init();
      q('#map-generated').textContent = new Date(graph.generatedAt).toLocaleString();
      q('#map-total-findings').textContent = graph.totals.findings;
      q('#map-total-sources').textContent = graph.totals.sources;
      q('#map-total-lanes').textContent = graph.totals.lanes;
    } catch (error) {
      setStatus(`Evidence map unavailable: ${error.message}`,'error');
      map.innerHTML='<div class="map-fallback"><h3>Interactive view unavailable</h3><p>The source ledger and public CSV remain available.</p><a class="btn" href="investigation-source-ledger.html">Source Ledger</a></div>';
    }
  }
  [search,lane,grade,recordStatus].forEach(control=>control.addEventListener(control===search?'input':'change',filter));
  q('#map-reset').onclick=()=>{search.value='';lane.value='';grade.value='';recordStatus.value='';filter();if(cy)cy.fit(cy.elements(':visible'),40);};
  q('#map-fit').onclick=()=>cy&&cy.fit(cy.elements(':visible'),40);
  q('#map-layout').onclick=()=>{if(!cy)return;layoutIndex=(layoutIndex+1)%layouts.length;const name=layouts[layoutIndex];cy.layout({name,animate:name!=='cose',fit:true,padding:35}).run();q('#map-layout').textContent=`Layout: ${human(name)}`;};
  q('#map-save-view').onclick=()=>{const name=prompt('Name this evidence-map view:');if(!name)return;let views=[];try{views=JSON.parse(localStorage.getItem(storageKey)||'[]');}catch{}views.unshift({name:name.trim().slice(0,60),query:search.value.trim(),lane:lane.value,grade:grade.value,status:recordStatus.value});localStorage.setItem(storageKey,JSON.stringify(views.slice(0,12)));savedViews();setStatus('View saved on this device.','ok');};
  savedViews(); load();
})();
