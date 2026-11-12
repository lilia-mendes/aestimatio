'use strict';
/* Aestimatio cloud sync: local/remote three-way merge with cautious writeback. */
const AESTSYNC={
  state:'Não ligado',busy:false,timer:null,baselineKey(){
    return 'atlas_sync_baseline_'+(db.settings.spreadsheetId||'none');
  },
  keys(){return Object.keys(TABNAMES)},
  sharedSettings(x){
    const s=x?.settings||{};
    return {yearMethod:s.yearMethod||'average',starMax:Number(s.starMax||25),starBonus:Number(s.starBonus||0)};
  },
  snapshot(x=db){
    const o={settings:this.sharedSettings(x)};
    for(const k of this.keys())o[k]=JSON.parse(JSON.stringify(x[k]||[]));
    return o;
  },
  eq(a,b){return JSON.stringify(a)===JSON.stringify(b)},
  getBase(){
    try{const val=localStorage.getItem(this.baselineKey());return val?JSON.parse(val):null}catch(e){return null}
  },
  setBase(data){
    try{localStorage.setItem(this.baselineKey(),JSON.stringify(this.snapshot(data)))}catch(e){this.state='Sem espaço para histórico de sincronização';}
  },
  setStatus(s){this.state=s;const el=E('cloudSyncState');if(el)el.textContent=s;if(typeof updateCloudHeader==='function')updateCloudHeader()},
  async fetchCloud(){
    const id=db.settings.spreadsheetId;
    if(!id||!googleToken)throw Error('Liga primeiro a conta Google e seleciona a base.');
    const base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(id);
    const info=await apiGoogle(base+'?fields=sheets.properties');
    const present=new Set((info.sheets||[]).map(s=>s.properties.title));
    const names=['Atlas_Config',...Object.values(TABNAMES).filter(t=>present.has(t))];
    const url=base+'/values:batchGet?'+names.map(n=>'ranges='+encodeURIComponent("'"+n+"'!A1:B10000")).join('&');
    const out=await apiGoogle(url);
    const data={settings:{}};for(const k of this.keys())data[k]=[];
    (out.valueRanges||[]).forEach((r,i)=>{
      const key=names[i]==='Atlas_Config'?'settings':this.keys().find(k=>TABNAMES[k]===names[i]);
      if(key==='settings'){
        try{data.settings=JSON.parse(r.values?.[1]?.[1]||'{}')}catch(e){throw Error('Definições remotas inválidas.')}
      }else if(key){data[key]=(r.values||[]).slice(1).filter(row=>row[1]).map(row=>JSON.parse(row[1]))}
    });
    return this.snapshot(data);
  },
  merge(base,local,remote){
    const out={settings:{}};const conflicts=[];
    const pick=(b,l,r,label)=>{
      if(this.eq(l,r))return l;
      if(this.eq(b,l)){
        if(b&&r===undefined){conflicts.push(label+' (remoção remota)');return l}
        if(b&&r&&r._parentRevision&&r._parentRevision!==(b._revision||'legacy')){conflicts.push(label+' (edição concorrente)');return l}
        return r;
      }
      if(this.eq(b,r))return l;
      conflicts.push(label);return l;
    };
    for(const k of ['yearMethod','starMax','starBonus'])out.settings[k]=pick(base.settings?.[k],local.settings?.[k],remote.settings?.[k],'Definição '+k);
    for(const k of this.keys()){
      const entries=new Map();
      for(const source of [base[k]||[],local[k]||[],remote[k]||[]])for(const item of source)entries.set(item.id,true);
      const b=new Map((base[k]||[]).map(x=>[x.id,x])),l=new Map((local[k]||[]).map(x=>[x.id,x])),r=new Map((remote[k]||[]).map(x=>[x.id,x]));
      out[k]=[];
      for(const id of entries.keys()){
        const selected=pick(b.get(id),l.get(id),r.get(id),k+' '+id);
        if(selected!==undefined)out[k].push(selected);
      }
    }
    return {data:out,conflicts};
  },
  adopt(data){
    try{const key='atlas_backup_cloud_'+new Date().toISOString().slice(0,10);if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(db))}catch(e){console.warn('Cópia de segurança local indisponível',e)}
    const localCfg={clientId:db.settings.clientId,spreadsheetId:db.settings.spreadsheetId,driveFolderId:db.settings.driveFolderId,lastSync:db.settings.lastSync};
    for(const k of this.keys())db[k]=JSON.parse(JSON.stringify(data[k]||[]));
    db.settings={...db.settings,...data.settings,...localCfg};
    db.version=Math.max(2,db.version||2);
    syncSelection();
    localStorage.setItem(STORE,JSON.stringify(db));
    render();
  },
  async upload(data){
    const id=db.settings.spreadsheetId;
    await ensureTabs(id);
    const base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(id);
    const info=await apiGoogle(base+'?fields=sheets.properties');
    const specs=[];
    const cfgRows=[['key','json'],['settings',JSON.stringify(data.settings)]];
    specs.push({name:'Atlas_Config',values:cfgRows});
    for(const k of this.keys()){
      specs.push({name:TABNAMES[k],values:[['id','json'],...(data[k]||[]).map(item=>[item.id,JSON.stringify(item)])]});
    }
    const requests=[];
    for(const spec of specs){
      const props=(info.sheets||[]).find(x=>x.properties.title===spec.name)?.properties;
      if(!props)throw Error('Folha em falta: '+spec.name);
      let count=props.gridProperties.rowCount||1000;
      if(count<spec.values.length){count=spec.values.length+50;requests.push({updateSheetProperties:{properties:{sheetId:props.sheetId,gridProperties:{rowCount:count}},fields:'gridProperties.rowCount'}})}
      requests.push({updateCells:{range:{sheetId:props.sheetId,startRowIndex:0,endRowIndex:count,startColumnIndex:0,endColumnIndex:2},rows:spec.values.map(row=>({values:row.map(val=>({userEnteredValue:{stringValue:String(val??'')}}))})),fields:'userEnteredValue'}});
    }
    await apiGoogle(base+':batchUpdate',{method:'POST',body:JSON.stringify({requests})});
  },
  async sync(){
    if(this.busy||!googleToken||!db.settings.spreadsheetId)return;
    if(E('modal')?.open||document.activeElement?.matches?.('input,textarea,[contenteditable="true"]'))return;
    if(typeof navigator!=='undefined'&&navigator.onLine===false){this.setStatus('Sem ligação à Internet');return}
    const baseline=this.getBase();
    if(!baseline){this.setStatus('Sincronização inicial pendente: importa ou envia os dados uma vez.');return}
    this.busy=true;this.setStatus('A sincronizar…');
    try{
      const remote=await this.fetchCloud(),local=this.snapshot(),merged=this.merge(baseline,local,remote);
      if(merged.conflicts.length){
        this.setStatus('Conflito: '+merged.conflicts.length+' alterações incompatíveis. Não foram substituídos dados.');
        toast('Conflito entre dispositivos: exporta uma cópia JSON e revê a sincronização antes de continuar.',true);
        return;
      }
      if(!this.eq(remote,merged.data)){
        // Re-fetch immediately before write. Never overwrite unexpected intervening changes.
        const latest=await this.fetchCloud();
        if(!this.eq(remote,latest)){this.setStatus('O Drive mudou durante a sincronização. A aguardar nova verificação.');return}
        await this.upload(merged.data);
      }
      if(!this.eq(local,merged.data))this.adopt(merged.data);
      this.setBase(merged.data);
      db.settings.lastSync=new Date().toLocaleString('pt-PT');
      localStorage.setItem(STORE,JSON.stringify(db));
      this.setStatus('Sincronizado · '+db.settings.lastSync);
    }catch(e){this.setStatus('Por sincronizar · '+e.message)}
    finally{this.busy=false}
  },
  schedule(){
    if(!this.getBase()||!googleToken)return;
    clearTimeout(this.timer);this.timer=setTimeout(()=>this.sync(),2200);
  },
  async setBaselineIfEqual(){
    if(!googleToken||!db.settings.spreadsheetId)return;
    try{
      const remote=await this.fetchCloud(),local=this.snapshot();
      if(this.eq(remote,local)){
        this.setBase(local);this.setStatus('Sincronização automática ativada');
      }else if(this.keys().every(k=>k==='domainConfigs'||this.eq(remote[k],local[k]))&&this.eq(remote.settings,local.settings)&&!(remote.domainConfigs||[]).length){
        this.setBase(remote);this.setStatus('A atualizar a lista de domínios na base remota…');this.schedule();
      }else this.setStatus('Dados locais e do Drive diferentes. Escolhe Enviar ou Importar antes de ativar sincronização automática.');
    }catch(e){this.setStatus('Por sincronizar · '+e.message)}
  }
};
const standardSave=save;
function aestStampRevisions(){
  let previous={};
  try{previous=JSON.parse(localStorage.getItem(STORE)||'{}')}catch(e){}
  for(const key of AESTSYNC.keys()){
    const old=new Map((previous[key]||[]).map(x=>[x.id,x]));
    for(const record of db[key]||[]){
      const before=old.get(record.id);
      if(!before){
        if(!record._revision){record._revision=uid();record._parentRevision=null}
        continue;
      }
      const normalized=x=>{const v={...x};delete v._revision;delete v._parentRevision;return JSON.stringify(v)};
      if(normalized(before)!==normalized(record)){
        record._parentRevision=before._revision||'legacy';
        record._revision=uid();
      }else if(!record._revision&&before._revision){record._revision=before._revision;record._parentRevision=before._parentRevision||null}
    }
  }
}
save=function(){
  if(!AESTSYNC.suspendRevision)aestStampRevisions();
  standardSave();
  if(googleToken&&db.settings.spreadsheetId&&AESTSYNC.getBase()&&!AESTSYNC.busy&&AESTSYNC.state.indexOf('Conflito:')!==0)AESTSYNC.setStatus('Alterações locais por sincronizar');
  AESTSYNC.schedule();
  if(typeof updateCloudHeader==='function')updateCloudHeader();
};
const standardPushSheets=pushSheets;
pushSheets=async function(){
  aestStampRevisions();
  await standardPushSheets();
  await AESTSYNC.setBaselineIfEqual();
};
const standardPullSheets=pullSheets;
pullSheets=async function(auto=false){
  AESTSYNC.suspendRevision=true;
  try{await standardPullSheets(auto)}finally{AESTSYNC.suspendRevision=false}
  await AESTSYNC.setBaselineIfEqual();
};
const standardDiscoverDatabase=discoverDatabase;
discoverDatabase=async function(){
  await standardDiscoverDatabase();
  if(db.settings.spreadsheetId){
    if(AESTSYNC.getBase())await AESTSYNC.sync();
    else AESTSYNC.setStatus('Base encontrada. Faz uma primeira importação ou envio para ativar sincronização automática.');
  }
};
function copyGoogleDeviceLink(){
  const cid=db.settings.clientId;
  if(!cid){toast('Configura primeiro o Client ID OAuth.',true);return}
  const url=new URL(location.href);
  url.searchParams.set('aestimatio_client_id',cid);
  navigator.clipboard.writeText(url.toString()).then(()=>toast('Ligação copiada. Abre-a no outro dispositivo e liga a conta Google.')).catch(()=>toast('Não foi possível copiar a ligação.',true));
}
function importGoogleDeviceLink(){
  const url=new URL(location.href);
  const cid=url.searchParams.get('aestimatio_client_id');
  if(!cid||!/^[\w-]+\.apps\.googleusercontent\.com$/.test(cid))return;
  if(!db.settings.clientId)db.settings.clientId=cid;
  url.searchParams.delete('aestimatio_client_id');
  try{history.replaceState(null,'',url.pathname+url.search+url.hash)}catch(e){}
  localStorage.setItem(STORE,JSON.stringify(db));
}
importGoogleDeviceLink();
const previousSettingsPageCloud=settingsPage;
settingsPage=function(){
  return '<section class="panel"><div class="flex between"><h2>Sincronização automática entre dispositivos</h2><button class="btn" onclick="copyGoogleDeviceLink()">Copiar ligação para outro dispositivo</button></div><p class="hint">Após o primeiro envio ou importação, as alterações são sincronizadas ao ligar à Google. A aplicação verifica conflitos antes de enviar; se encontrar alterações incompatíveis, não substitui os dados.</p><div id="cloudSyncState" class="note">'+esc(AESTSYNC.state)+'</div></section>'+previousSettingsPageCloud();
};
/* Header sync status: connection, pending edits, active sync and conflicts. */
function cloudConnectionState(){
  if(typeof navigator!=='undefined'&&navigator.onLine===false)return {key:'offline',label:'Sem rede',detail:'Sem Internet: as alterações permanecem guardadas neste navegador.'};
  if(!db.settings.clientId)return {key:'disconnected',label:'Google desligado',detail:'Configura primeiro o Client ID OAuth nas Definições.'};
  if(!googleToken)return {key:'disconnected',label:'Ligar Google',detail:'Sessão Google não autorizada ou expirada. Clica para autenticar.'};
  if(!db.settings.spreadsheetId)return {key:'disconnected',label:'Sem base Google',detail:'Seleciona a base de dados nas Definições.'};
  if(AESTSYNC.busy||/^A sincronizar/i.test(AESTSYNC.state))return {key:'busy',label:'A sincronizar',detail:'A comunicar com o Google Sheets.'};
  if(/^Conflito:/i.test(AESTSYNC.state))return {key:'conflict',label:'Conflito',detail:AESTSYNC.state+' Abre as Definições antes de voltar a enviar dados.'};
  if(/^(Por sincronizar|Sem espaço|O Drive mudou|Dados locais e do Drive diferentes)/i.test(AESTSYNC.state))return {key:'error',label:'Por sincronizar',detail:AESTSYNC.state};
  const base=AESTSYNC.getBase();
  if(!base)return {key:'pending',label:'Ativar sincronização',detail:'Faz primeiro um envio ou importação nas Definições.'};
  try{
    if(!AESTSYNC.eq(base,AESTSYNC.snapshot()))return {key:'pending',label:'Pendente',detail:'Existem alterações locais por enviar ao Google Sheets. Clica para sincronizar.'};
  }catch(e){return {key:'error',label:'Verificar ligação',detail:'Não foi possível verificar o estado local.'}}
  if(/^Sincronizado|^Sincronização automática ativada/i.test(AESTSYNC.state))return {key:'synced',label:'Sincronizado',detail:'Google Sheets sincronizado na última verificação. Clica para verificar agora.'};
  if(/^A atualizar a lista/i.test(AESTSYNC.state))return {key:'pending',label:'Pendente',detail:AESTSYNC.state};
  return {key:'pending',label:'Verificar',detail:'Clica para verificar a sincronização com o Google Sheets.'};
}
/* Static paired-plug icons. The two halves touch only when connected. */
const cloudPlugConnected='<svg viewBox="0 0 36 24" width="28" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 9h3m-3 6h3"/><rect x="5" y="6" width="11" height="12" rx="2.5"/><path d="M16 10h4m-4 4h4"/><rect x="20" y="6" width="11" height="12" rx="2.5"/><path d="M31 9h3m-3 6h3"/></svg>';
const cloudPlugDisconnected='<svg viewBox="0 0 36 24" width="28" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M1 9h3m-3 6h3"/><rect x="4" y="6" width="10" height="12" rx="2.5"/><path d="M14 10h2m-2 4h2"/><path d="M21 10h2m-2 4h2"/><rect x="23" y="6" width="10" height="12" rx="2.5"/><path d="M33 9h2m-2 6h2"/></svg>';
function updateCloudHeader(){
  const status=cloudConnectionState();
  const connected=status.key==='synced'||status.key==='busy';
  const bar=E('globalStickyHeader');
  if(bar){
    bar.dataset.sync=status.key;
    bar.classList.toggle('cloud-alert',!connected);
    bar.classList.toggle('cloud-busy',status.key==='busy');
  }
  for(const id of ['globalCloudSyncButton','topCloudSyncButton']){
    const button=E(id);
    if(!button)continue;
    button.dataset.sync=status.key;
    button.setAttribute('aria-label',status.label+'. '+status.detail);
    button.setAttribute('title',status.label+'. '+status.detail);
    const symbol=button.querySelector('.cloud-status-symbol');
    if(symbol)symbol.innerHTML=connected?cloudPlugConnected:cloudPlugDisconnected;
  }
}
async function cloudSyncAction(){
  const status=cloudConnectionState();
  if(status.key==='busy')return;
  if(status.key==='offline'){toast('Sem Internet. Os dados mantêm-se guardados neste navegador.',true);return}
  if(!db.settings.clientId||!db.settings.spreadsheetId){
    setView('settings');
    toast('Configura a ligação Google e seleciona a base de dados.',true);
    return;
  }
  if(!googleToken){
    AESTSYNC.setStatus('A autenticar…');
    googleSignIn();
    return;
  }
  if(status.key==='conflict'){
    setView('settings');
    toast('Há um conflito de sincronização. Não serão substituídos dados automaticamente.',true);
    return;
  }
  if(!AESTSYNC.getBase()){
    setView('settings');
    toast('Faz primeiro um envio ou importação explícitos para ativar a sincronização.',true);
    return;
  }
  await AESTSYNC.sync();
  if(AESTSYNC.state.startsWith('Sincronizado'))toast('Google Sheets sincronizado.');
  else if(!AESTSYNC.busy)toast(AESTSYNC.state,true);
}
const googleSignInBeforeIndicator=googleSignIn;
googleSignIn=function(){AESTSYNC.setStatus('A autenticar…');return googleSignInBeforeIndicator()};
window.addEventListener('online',()=>{updateCloudHeader();if(googleToken)AESTSYNC.sync()});
window.addEventListener('offline',updateCloudHeader);
window.addEventListener('focus',updateCloudHeader);
document.addEventListener('visibilitychange',updateCloudHeader);
updateCloudHeader();

window.addEventListener('focus',()=>{if(googleToken)AESTSYNC.sync()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&googleToken)AESTSYNC.sync()});
setInterval(()=>{if(googleToken)AESTSYNC.sync()},60000);
