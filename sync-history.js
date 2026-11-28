'use strict';
/* Atlas technical history is archived outside the active spreadsheet:
   Google Drive /aestimatio/history, separate JSON audit batches per device.
   No assessment or student payloads are included in this technical log. */
(function(){
  const S=AESTSYNC;
  const QUEUE='atlas_history_queue_v1';
  const HISTORY_FOLDER='atlas_history_folder_id_v1';
  const LAST_ERROR='atlas_history_last_error_v1';
  const baseURL='https://www.googleapis.com/drive/v3/files';
  let uploading=false;
  let queuedRetry=false;
  function readQueue(){
    try{const rows=JSON.parse(localStorage.getItem(QUEUE)||'[]');return Array.isArray(rows)?rows:[]}
    catch(e){return []}
  }
  function writeQueue(rows){localStorage.setItem(QUEUE,JSON.stringify(rows))}
  function cleanMessage(value){
    // Restrict remote audit content to a finite set of technical events.
    const s=String(value||'');
    if(/^Conflito:/i.test(s))return 'Conflitos detetados';
    if(/^Sincronizado/i.test(s))return 'Sincronização confirmada';
    if(/^Por sincronizar/i.test(s))return 'Falha de sincronização';
    if(/^A sincronizar/i.test(s))return 'Sincronização iniciada';
    if(/^Alterações locais:/i.test(s))return 'Alterações locais guardadas';
    if(/^Conflito resolvido:/i.test(s))return 'Conflito resolvido';
    if(/^Resolução individual/i.test(s))return 'Conflitos individuais resolvidos';
    if(/^Sincronização concluída/i.test(s))return 'Sincronização concluída';
    if(/^Cópia de recuperação/i.test(s))return 'Cópia de recuperação descarregada';
    if(/^Aplicação iniciada/i.test(s))return 'Aplicação iniciada';
    return 'Evento técnico';
  }
  /* Import the pre-existing local audit log only once, without duplicating future events. */
  try{
    const migrationFlag='atlas_history_local_audit_migrated_v1';
    if(!localStorage.getItem(migrationFlag)){
      const old=JSON.parse(localStorage.getItem('atlas_sync_audit')||'[]');
      const pending=readQueue();
      const archive=old.filter(x=>x&&x.at&&x.action).map(x=>({
        id:uid(),at:x.at,device:x.device||S.deviceId(),type:cleanMessage(x.action)
      }));
      writeQueue([...archive.reverse(),...pending]);
      localStorage.setItem(migrationFlag,'1');
    }
  }catch(e){
    try{localStorage.setItem(LAST_ERROR,'Falha na migração do histórico técnico anterior')}catch(_){}
  }
  const originalTrack=S.track.bind(S);
  S.track=function(action){
    originalTrack(action); // keep local audit for offline use
    try{
      const rows=readQueue(),when=new Date().toISOString();
      rows.push({id:uid(),at:when,device:S.deviceId(),type:cleanMessage(action)});
      writeQueue(rows);
    }catch(e){
      try{localStorage.setItem(LAST_ERROR,'Histórico local sem espaço para arquivo')}catch(_){}
    }
  };
  const oldStatus=S.setStatus.bind(S);
  let previousStatus='';
  S.setStatus=function(status){
    oldStatus(status);
    const category=/^Conflito:/i.test(status)?'Conflitos detetados':/^Sincronizado/i.test(status)?'Sincronização confirmada':'';
    if(category&&category!==previousStatus){
      previousStatus=category;
      S.track(category);
      S.flushHistory().catch(()=>{});
    }else if(!category)previousStatus='';
  };
  async function ensureHistoryFolder(){
    const parent=await ensureDriveFolder();
    const stored=localStorage.getItem(HISTORY_FOLDER);
    if(stored){
      try{
        const info=await apiGoogle(baseURL+'/'+encodeURIComponent(stored)+'?fields=id,name,mimeType,parents,trashed');
        if(!info.trashed&&info.name==='history'&&info.mimeType==='application/vnd.google-apps.folder'&&(info.parents||[]).includes(parent))return info.id;
      }catch(e){ /* stale folder id: search again */ }
    }
    const q="'"+parent.replace(/'/g,"\\'")+"' in parents and name = 'history' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
    const query=new URLSearchParams({q,fields:'nextPageToken,files(id,name,parents)',pageSize:'100'});
    const found=await apiGoogle(baseURL+'?'+query);
    const folder=found.files?.[0]||await apiGoogle(baseURL+'?fields=id,name,parents',{method:'POST',body:JSON.stringify({name:'history',mimeType:'application/vnd.google-apps.folder',parents:[parent]})});
    localStorage.setItem(HISTORY_FOLDER,folder.id);
    return folder.id;
  }
  function sanitizeForArchive(rows){
    return rows.map(x=>({id:x.id,at:x.at,device:x.device,type:x.type}));
  }
  async function uploadAudit(folder,rows){
    const filename='sync_'+new Date().toISOString().replace(/[:.]/g,'-')+'_'+S.deviceId()+'.json';
    const boundary='atlas_'+uid().replace(/-/g,'');
    const meta={name:filename,mimeType:'application/json',parents:[folder],
      description:'Aestimatio: histórico técnico de sincronização sem dados de avaliações'};
    const payload={schema:1,createdAt:new Date().toISOString(),device:S.deviceId(),
      spreadsheetId:db.settings.spreadsheetId||null,events:sanitizeForArchive(rows)};
    const body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+
      '\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(payload)+
      '\r\n--'+boundary+'--';
    const res=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,parents',{
      method:'POST',headers:{Authorization:'Bearer '+googleToken,
        'Content-Type':'multipart/related; boundary='+boundary},body});
    const result=await res.json().catch(()=>({}));
    if(!res.ok||!result.id)throw Error(result.error?.message||'Não foi possível guardar o histórico técnico no Drive');
    return result;
  }
  S.flushHistory=async function(){
    if(uploading||!googleToken||!db.settings.spreadsheetId)return false;
    const pending=readQueue();
    if(!pending.length)return true;
    uploading=true;
    try{
      const folder=await ensureHistoryFolder();
      await uploadAudit(folder,pending);
      const done=new Set(pending.map(x=>x.id));
      writeQueue(readQueue().filter(x=>!done.has(x.id)));
      localStorage.removeItem(LAST_ERROR);
      return true;
    }catch(e){
      try{localStorage.setItem(LAST_ERROR,e.message||'Falha ao arquivar')}catch(_){}
      return false; // Never remove unarchived records
    }finally{uploading=false}
  };
  S.historyStorageStatus=function(){
    const pending=readQueue().length;
    const err=localStorage.getItem(LAST_ERROR);
    return 'Destino: Google Drive /aestimatio/history · '+pending+' evento(s) à espera de arquivo.'+
      (err?' Último erro: '+err:'');
  };
  const priorSettings=settingsPage;
  settingsPage=function(){
    const content=priorSettings();
    return content+'<section class="panel"><h2>Arquivo do histórico técnico</h2>'+
      '<p class="hint">Os eventos técnicos são arquivados na pasta <strong>/aestimatio/history</strong> do Google Drive, fora da folha principal de avaliações. O arquivo técnico não contém cópias integrais da base de dados.</p>'+
      '<div class="note">'+esc(S.historyStorageStatus())+'</div>'+
      '<button class="btn" onclick="AESTSYNC.flushHistory().then(ok=>{toast(ok?\'Histórico arquivado no Drive.\':\'Histórico pendente: verifica a ligação Google.\',!ok);render()})">Arquivar eventos pendentes</button></section>';
  };
  window.addEventListener('online',()=>{S.flushHistory().catch(()=>{})});
  window.addEventListener('focus',()=>{if(googleToken)S.flushHistory().catch(()=>{})});
})();
