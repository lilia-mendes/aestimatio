'use strict';
/* Aestimatio sync phase 2: per-record conflict choices, deletion journal, local audit. */
(function(){
  const S=AESTSYNC;
  /* The collection of deletion markers travels with the same Google spreadsheet. */
  if(!TABNAMES.deletions)TABNAMES.deletions='Eliminacoes';
  if(!Array.isArray(db.deletions))db.deletions=[];
  const labels={schoolYears:'Anos letivos',regimes:'Regimes',classes:'Turmas',students:'Alunos',periods:'Períodos',assessments:'Avaliações',questions:'Perguntas',grades:'Classificações',stars:'Estrelas',domainConfigs:'Domínios',deletions:'Eliminações'};
  /* Keep deletion markers on normal saves, but never mark records removed by a cloud import or adoption. */
  const earlierSave=save;
  save=function(){
    if(!S.suspendRevision){
      let previous={};
      try{previous=JSON.parse(localStorage.getItem(STORE)||'{}')}catch(e){}
      if(!Array.isArray(db.deletions))db.deletions=[];
      for(const collection of S.keys().filter(k=>k!=='deletions')){
        const before=previous[collection]||[],now=new Set((db[collection]||[]).map(x=>x.id));
        for(const item of before){
          if(now.has(item.id))continue;
          const deletionId=collection+':'+item.id;
          if(!db.deletions.some(x=>x.id===deletionId)){
            db.deletions.push({id:deletionId,collection,recordId:item.id,deletedAt:new Date().toISOString(),
              device:S.deviceId(),baseRevision:item._revision||null,_revision:uid()});
          }
        }
      }
    }
    const ok=earlierSave();if(ok===false)return false;
    if(!S.suspendRevision){
      try{
        const previous=JSON.parse(localStorage.getItem('atlas_sync_edit_snapshot')||'null');
        const current={};
        for(const k of S.keys().filter(k=>k!=='deletions'))current[k]=(db[k]||[]).map(x=>[x.id,x._revision||null]);
        if(previous){
          const changed=Object.keys(current).filter(k=>JSON.stringify(previous[k]||[])!==JSON.stringify(current[k]||[]));
          if(changed.length)S.track('Alterações locais: '+changed.map(k=>labels[k]||k).join(', '));
        }
        localStorage.setItem('atlas_sync_edit_snapshot',JSON.stringify(current));
      }catch(e){}
    }
    return ok;
  };
  const oldValidate=S.validate.bind(S);
  S.validate=function(data){
    const errors=oldValidate(data);
    for(const x of data.deletions||[]){
      if(!x.collection||!x.recordId||x.id!==x.collection+':'+x.recordId)errors.push('Eliminação com identificador inválido');
    }
    return [...new Set(errors)];
  };
  S.recordConflicts=function(base,local,remote){
    base=S.comparisonBase(base,local,remote);
    const conflicts=[],merge=S.merge(base,local,remote);
    for(const k of S.keys().filter(x=>x!=='deletions')){
      const b=new Map((base[k]||[]).map(x=>[x.id,x]));
      const l=new Map((local[k]||[]).map(x=>[x.id,x]));
      const r=new Map((remote[k]||[]).map(x=>[x.id,x]));
      const ids=new Set([...b.keys(),...l.keys(),...r.keys()]);
      for(const id of ids){
        const bv=b.get(id),lv=l.get(id),rv=r.get(id);
        if(S.eq(lv,rv)||S.eq(bv,lv)||S.eq(bv,rv))continue;
        conflicts.push({key:k,id,label:labels[k]||k,local:lv,remote:rv,base:bv});
      }
    }
    for(const k of ['yearMethod','starMax','starBonus']){
      const b=base.settings?.[k],l=local.settings?.[k],r=remote.settings?.[k];
      if(!S.eq(l,r)&&!S.eq(l,b)&&!S.eq(r,b))
        conflicts.push({key:'settings',id:k,label:'Definições',local:l,remote:r,base:b});
    }
    return conflicts;
  };
  S.individualSelections={};
  S.individualResult=function(p){
    const result=S.merge(p.base,p.local,p.remote).data;
    const decisions=S.recordConflicts(p.base,p.local,p.remote);
    for(const c of decisions){
      const chosen=S.individualSelections[c.key+':'+c.id]||'remote';
      const value=chosen==='local'?c.local:c.remote;
      if(c.key==='settings'){result.settings[c.id]=value;continue}
      const map=new Map((result[c.key]||[]).map(x=>[x.id,x]));
      if(value===undefined)map.delete(c.id);else map.set(c.id,value);
      result[c.key]=[...map.values()];
    }
    return S.applyDeletionMarkers(result,p.local,p.remote);
  };
  S.applyDeletionMarkers=function(data,local,remote){
    /* A marker only removes a record when it has not been independently modified after the deletion base. */
    const markers=new Map((data.deletions||[]).map(x=>[x.id,x]));
    for(const t of markers.values()){
      const k=t.collection;
      if(!Array.isArray(data[k]))continue;
      const rec=(data[k]||[]).find(x=>x.id===t.recordId);
      if(!rec)continue;
      const observed=(local[k]||[]).concat(remote[k]||[]).filter(x=>x.id===t.recordId);
      const changed=observed.some(x=>!t.baseRevision||!x._revision||x._revision!==t.baseRevision);
      if(!changed)data[k]=data[k].filter(x=>x.id!==t.recordId);
    }
    return data;
  };
  /* Three-way merge with explicit delete markers: delete-vs-edit remains a conflict. */
  const originalMerge=S.merge.bind(S);
  S.merge=function(base,local,remote){
    base=S.comparisonBase(base,local,remote);
    const b={...base,deletions:base.deletions||[]},l={...local,deletions:local.deletions||[]},r={...remote,deletions:remote.deletions||[]};
    const merged=originalMerge(b,l,r);
    const deletions=new Map([...(l.deletions||[]),...(r.deletions||[])].map(t=>[t.id,t]));
    merged.data.deletions=[...deletions.values()];
    for(const t of deletions.values()){
      const k=t.collection;
      if(!Array.isArray(merged.data[k]))continue;
      const old=(b[k]||[]).find(x=>x.id===t.recordId);
      const present=[...(l[k]||[]),...(r[k]||[])].filter(x=>x.id===t.recordId);
      if(!present.length){merged.data[k]=merged.data[k].filter(x=>x.id!==t.recordId);continue}
      const unchanged=present.every(x=>old&&S.eq(x,old));
      if(unchanged){merged.data[k]=merged.data[k].filter(x=>x.id!==t.recordId);continue}
      const label=(labels[k]||k)+' '+t.recordId+' (eliminação versus edição)';
      if(!merged.conflicts.includes(label))merged.conflicts.push(label);
    }
    /* A recorded deletion of an unchanged baseline is not a conflict. */
    merged.conflicts=merged.conflicts.filter(label=>{
      for(const t of deletions.values()){
        if(label!==(t.collection+' '+t.recordId+' (remoção remota)')&&label!==(t.collection+' '+t.recordId))continue;
        const before=(b[t.collection]||[]).find(x=>x.id===t.recordId);
        const localRecord=(l[t.collection]||[]).find(x=>x.id===t.recordId);
        const remoteRecord=(r[t.collection]||[]).find(x=>x.id===t.recordId);
        if((!localRecord||S.eq(localRecord,before))&&(!remoteRecord||S.eq(remoteRecord,before)))return false;
      }
      return true;
    });
    return merged;
  };
  const oldCombine=S.combine.bind(S);
  S.combine=function(local,remote,precedence){return S.applyDeletionMarkers(oldCombine(local,remote,precedence),local,remote)};
  const oldResolverHTML=S.resolverHTML.bind(S);
  S.resolverHTML=function(){
    let html=oldResolverHTML();
    if(!S.pendingConflict)return html;
    const options=S.recordConflicts(S.pendingConflict.base,S.pendingConflict.local,S.pendingConflict.remote);
    if(!options.length)return html;
    html=html.replace('</select></div><div id="syncPreview"',
      '<option value="individual">Escolher a versão de cada registo incompatível</option></select></div><div id="syncPreview"');
    const section='<div id="syncIndividual" style="display:none"><h3>Decisões por registo</h3><p class="hint">Seleciona uma versão para cada registo. Quando um valor está ausente, a opção corresponde à eliminação. Não são apresentadas classificações individualizadas neste resumo: consulta os registos na aplicação antes de confirmar.</p>'+
      options.map((c,i)=>{
        const selected=S.individualSelections[c.key+':'+c.id]||'remote';
        const localPresent=c.local!==undefined,remotePresent=c.remote!==undefined;
        const details=v=>v===undefined?'Não existe nesta versão':(typeof v==='object'?
          (v.name||v.title||v.score!==undefined&&('Pontuação: '+v.score)||'Registo existente'):'Valor: '+String(v));
        return '<div class="note" style="margin:8px 0"><strong>'+esc(c.label)+' · '+esc(c.id)+'</strong><p class="hint">Local: '+esc(details(c.local))+' | Drive: '+esc(details(c.remote))+'</p>'+
          '<label>Conservar <select data-sync-key="'+esc(c.key+':'+c.id)+'" onchange="AESTSYNC.individualSelections[this.dataset.syncKey]=this.value;AESTSYNC.updateChoice()">'+
          '<option value="remote"'+(selected==='remote'?' selected':'')+'>Drive'+(!remotePresent?' (eliminação)':'')+'</option>'+
          '<option value="local"'+(selected==='local'?' selected':'')+'>Computador'+(!localPresent?' (eliminação)':'')+'</option></select></label></div>';
      }).join('')+'</div>';
    return html.replace('<div class="flex"><button class="btn" onclick="AESTSYNC.showResolver()">',section+'<div class="flex"><button class="btn" onclick="AESTSYNC.showResolver()">');
  };
  const oldUpdateChoice=S.updateChoice.bind(S);
  S.updateChoice=function(){
    const choice=E('syncChoice')?.value||'remote';
    const individual=E('syncIndividual');if(individual)individual.style.display=choice==='individual'?'block':'none';
    if(choice!=='individual')return oldUpdateChoice();
    const p=S.pendingConflict;if(!p)return;
    const result=S.individualResult(p),problems=S.validate(result);
    const preview=E('syncPreview');
    if(preview)preview.innerHTML='<strong>Pré-visualização da escolha individual:</strong> '+
      S.summary(result).map(x=>esc(x.label)+': '+x.count).join(' · ')+
      (problems.length?'<p style="color:#a42323">'+esc(problems.slice(0,5).join('; '))+'</p>':'<p>Sem referências inválidas detetadas.</p>');
  };
  /* Reuse guarded writer but supply the curated individual result as the chosen merge. */
  const originalResolve=S.resolveSelected.bind(S);
  S.resolveSelected=async function(){
    if(E('syncChoice')?.value!=='individual')return originalResolve();
    const p=S.pendingConflict;if(!p)return;
    const result=S.individualResult(p),errors=S.validate(result);
    if(errors.length){toast('Não é possível aplicar: '+errors.slice(0,2).join('; '),true);return}
    if(!confirm('Aplicar as decisões por registo e atualizar os dados do Drive? Não será criada cópia automática. Exporta JSON antes, se necessário.'))return;
    if(!confirm('SEGUNDA CONFIRMAÇÃO: publicar as decisões individuais no Google Drive?'))return;
    if(S.busy)return;
    S.busy=true;S.setStatus('A resolver conflitos individuais…');
    try{
      S.assertLocalUnchanged(p.local);
      const latest=await S.fetchCloud();
      if(!S.eq(latest,p.remote))throw Error('O Drive mudou. Volta a comparar as versões.');
      S.assertLocalUnchanged(p.local);
      await S.upload(result);
      const confirmed=await S.fetchCloud();
      if(!S.eq(confirmed,result))throw Error('Não foi possível confirmar os dados publicados.');
      S.assertLocalUnchanged(p.local);
      S.finish(result);
      S.pendingConflict=null;S.individualSelections={};
      S.track('Resolução individual concluída');
      S.setStatus('Sincronizado · '+db.settings.lastSync);render();toast('Conflitos individuais resolvidos.');
    }catch(e){S.setStatus('Por sincronizar · '+e.message);toast(e.message,true)}
    finally{S.busy=false}
  };
  // Legacy copies are never created again. Existing copies remain until
  // the user has downloaded and explicitly confirmed a separate archive.
  let legacyToken=null;
  S.downloadLegacyCopies=function(){
    try{
      const archive=AtlasSyncStorage.captureLegacy(localStorage);
      if(!archive.entries.length){toast('Não existem cópias antigas.');return}
      archive.activeData=db;
      downloadBlob(new Blob([JSON.stringify(archive)],{type:'application/json'}),'aestimatio_arquivo_antigo_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
      legacyToken=AtlasSyncStorage.cleanupToken(archive);
      toast('Confirma que o ficheiro foi descarregado antes de limpar as cópias antigas.');render();
    }catch(e){toast('Erro ao exportar arquivo: '+e.message,true)}
  };
  S.cleanLegacyCopies=function(){
    if(!legacyToken||S.busy)return;
    if(!confirm('Confirmas que guardaste o arquivo JSON e que pretendes remover apenas as antigas cópias redundantes deste navegador?'))return;
    try{
      const removed=AtlasSyncStorage.removeLegacy(localStorage,legacyToken);
      const ok=save();
      // A legacy primary key is removable only after the current key exists.
      if(ok!==false)removed.push(...AtlasSyncStorage.removeLegacy(localStorage,legacyToken));
      legacyToken=null;S.track('Cópias antigas removidas: '+removed.length);render();
      toast(removed.length+' cópia(s) antiga(s) removida(s). A base de dados principal foi conservada.');
    }catch(e){toast('Limpeza não concluída: '+e.message,true)}
  };
  const priorSettings=settingsPage;
  settingsPage=function(){
    const log=(()=>{try{return JSON.parse(localStorage.getItem('atlas_sync_audit')||'[]')}catch(e){return []}})();
    const entries=log.slice(0,20).map(x=>'<tr><td>'+esc(new Date(x.at).toLocaleString('pt-PT'))+'</td><td>'+esc(x.action)+'</td><td>'+esc(x.device||'')+'</td></tr>').join('');
    const old=AtlasSyncStorage.legacyKeys(localStorage);
    const legacy=old.length?'<div class="note"><strong>Limpeza de cópias antigas ('+old.length+')</strong><p>As novas sincronizações não criam cópias integrais. Descarrega o arquivo das cópias existentes, verifica que ficou guardado e confirma a limpeza.</p>'+
      '<div class="flex"><button class="btn" onclick="AESTSYNC.downloadLegacyCopies()">Descarregar arquivo de cópias antigas</button>'+
      '<button class="btn" '+(legacyToken?'':'disabled')+' onclick="AESTSYNC.cleanLegacyCopies()">Confirmar limpeza</button></div></div>':
      '<p class="hint">Não existem cópias integrais redundantes neste navegador.</p>';
    return priorSettings()+'<section class="panel"><h2>Histórico técnico de sincronização</h2>'+
      '<p class="hint">Regista operações locais recentes, sem duplicar a base de dados.</p>'+
      '<details><summary>Consultar últimas operações ('+log.length+')</summary><table><thead><tr><th>Data</th><th>Operação</th><th>Dispositivo</th></tr></thead><tbody>'+entries+'</tbody></table></details>'+legacy+'</section>';
  };
  /* Automatic sync already checks every conflict; do not silently publish over a deleted record. */
})();
