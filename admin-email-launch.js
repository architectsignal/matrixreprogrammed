(function(){
'use strict';
const token=document.getElementById('email-admin-token');
const checkButton=document.getElementById('email-readiness-check');
const testButton=document.getElementById('email-test-send');
const output=document.getElementById('email-launch-output');
const states={
  brevo:document.getElementById('state-brevo'),
  domain:document.getElementById('state-domain'),
  sender:document.getElementById('state-sender'),
  transactional:document.getElementById('state-transactional'),
  automation:document.getElementById('state-automation'),
  d1:document.getElementById('state-d1')
};
if(!token||!checkButton||!testButton||!output)return;
const saved=sessionStorage.getItem('matrixEmailAdminToken');if(saved)token.value=saved;
function setState(node,ok,passText,failText){if(!node)return;node.dataset.state=ok?'pass':'fail';node.textContent=ok?passText:failText;}
function cleanSummary(data){return {
  ok:Boolean(data.ok),
  d1Connected:Boolean(data.d1Connected),
  schemaReady:Boolean(data.schemaReady),
  brevoConfigured:Boolean(data.brevoConfigured),
  domainAuthenticated:Boolean(data.domainAuthenticated),
  transactionalConfigurationReady:Boolean(data.transactionalConfigurationReady),
  transactionalEnabled:Boolean(data.transactionalEnabled),
  transactionalLive:Boolean(data.transactionalLive),
  automationEnabled:Boolean(data.automationEnabled),
  sender:data.sender||{},
  requiredSecrets:data.requiredSecrets||{},
  outbox:data.outbox||[],
  campaigns:data.campaigns||[],
  events:data.events||[],
  provider:data.provider||[]
};}
async function request(path,options={}){
  const adminToken=token.value.trim();
  if(!adminToken)throw new Error('Enter the protected administrator token.');
  sessionStorage.setItem('matrixEmailAdminToken',adminToken);
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{'content-type':'application/json','x-admin-token':adminToken,...(options.headers||{})}});
  let data={};try{data=await response.json();}catch{}
  if(!response.ok){const error=new Error(data.error||data.message||`Request failed (${response.status})`);error.data=data;error.status=response.status;throw error;}
  return data;
}
function renderHealth(data){
  const summary=cleanSummary(data);
  setState(states.brevo,summary.brevoConfigured,'Configured','Not configured');
  setState(states.domain,summary.domainAuthenticated,'Authenticated','Not confirmed');
  const senderReady=Boolean(summary.sender.fromEmailConfigured&&summary.sender.replyToEmailConfigured&&!summary.sender.temporaryBrevoDomain);
  setState(states.sender,senderReady,'Verified sender and reply-to ready',summary.sender.temporaryBrevoDomain?'Temporary Brevo sender detected':'Sender or reply-to incomplete');
  setState(states.transactional,summary.transactionalLive,'Transactional delivery active',summary.transactionalEnabled?'Configuration incomplete':'Safely disabled');
  setState(states.automation,!summary.automationEnabled,'Marketing automation off','Marketing automation unexpectedly on');
  setState(states.d1,summary.d1Connected&&summary.schemaReady,'D1 and schema ready','D1 or schema unavailable');
  output.textContent=JSON.stringify(summary,null,2);
  testButton.disabled=!summary.transactionalConfigurationReady||!summary.transactionalEnabled;
}
async function check(){checkButton.disabled=true;output.textContent='Checking protected email readiness…';try{renderHealth(await request('/api/email/admin/health',{method:'GET'}));}catch(error){output.textContent=JSON.stringify({ok:false,error:error.message,details:error.data||null},null,2);}finally{checkButton.disabled=false;}}
async function sendTest(){testButton.disabled=true;output.textContent='Requesting one controlled transactional test…';try{const result=await request('/api/email/admin/test-transactional',{method:'POST',body:'{}'});output.textContent=JSON.stringify(result,null,2);await check();}catch(error){output.textContent=JSON.stringify({ok:false,error:error.message,details:error.data||null},null,2);testButton.disabled=false;}}
checkButton.addEventListener('click',check);
testButton.addEventListener('click',sendTest);
})();
