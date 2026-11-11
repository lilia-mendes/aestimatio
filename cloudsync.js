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
  setStatus(s){this.state=s;const el=E('cloudSyncState');if(el)el.textContent=s},
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
  standardSave();AESTSYNC.schedule();
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
window.addEventListener('focus',()=>{if(googleToken)AESTSYNC.sync()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&googleToken)AESTSYNC.sync()});
setInterval(()=>{if(googleToken)AESTSYNC.sync()},60000);
