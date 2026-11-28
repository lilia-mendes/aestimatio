'use strict';
/* Conflict resolution and recovery UI. Loaded after cloudsync.js. */
(function(){
  const S=AESTSYNC;
  const names={schoolYears:'Anos letivos',regimes:'Regimes',classes:'Turmas',students:'Alunos',periods:'Períodos',assessments:'Avaliações',questions:'Perguntas',grades:'Classificações',stars:'Estrelas',domainConfigs:'Domínios',deletions:'Eliminações'};
  const key='atlas_installation_id';
  S.deviceId=function(){
    let id=localStorage.getItem(key);
    if(!id){id='ATL-'+uid().replace(/-/g,'').slice(0,10).toUpperCase();localStorage.setItem(key,id)}
    return id;
  };
  S.deviceId();
  S.pendingConflict=null;
  S.remoteInfo=null;
  S.track=function(action){
    try{
      const k='atlas_sync_audit',log=JSON.parse(localStorage.getItem(k)||'[]');
      log.unshift({at:new Date().toISOString(),device:S.deviceId(),action});
      localStorage.setItem(k,JSON.stringify(log.slice(0,60)));
    }catch(e){}
  };
  S.validate=function(data){
    const errors=[];
    const ids={};
    for(const k of S.keys()){
      ids[k]=new Set();
      for(const item of data[k]||[]){
        if(!item||!item.id||ids[k].has(item.id))errors.push(names[k]+': identificador repetido ou ausente');
        else ids[k].add(item.id);
      }
    }
    const relations=[['students','classId','classes'],['assessments','classId','classes'],['assessments','periodId','periods'],['questions','assessmentId','assessments'],['grades','assessmentId','assessments'],['grades','studentId','students'],['grades','questionId','questions'],['stars','classId','classes'],['stars','studentId','students'],['stars','periodId','periods']];
    for(const [source,field,target] of relations)for(const item of data[source]||[])if(item[field]&&!ids[target].has(item[field]))errors.push(names[source]+': referência em falta ('+field+')');
    return [...new Set(errors)];
  };
  S.summary=function(data){
    return S.keys().map(k=>({key:k,label:names[k],count:(data[k]||[]).length}));
  };
  S.combine=function(local,remote,precedence){
    const out={settings:{...remote.settings,...local.settings}};
    if(precedence==='remote')out.settings={...local.settings,...remote.settings};
    for(const k of S.keys()){
      const records=new Map();
      for(const item of (precedence==='local'?[...(remote[k]||[]),...(local[k]||[])]:[...(local[k]||[]),...(remote[k]||[])]))records.set(item.id,item);
      out[k]=[...records.values()];
    }
    return out;
  };
  S.preview=function(){
    const local=S.snapshot(),remote=S.pendingConflict?.remote;
    if(!remote)return '';
    const table=S.summary(local).map((x,i)=>'<tr><td>'+esc(x.label)+'</td><td>'+x.count+'</td><td>'+S.summary(remote)[i].count+'</td></tr>').join('');
    const conflicts=S.pendingConflict.conflicts||[];
    const samples=conflicts.slice(0,8).map(x=>'<li>'+esc(x)+'</li>').join('');
    return '<div class="note"><strong>Origem:</strong> '+esc(S.deviceId())+
      ' · <strong>Revisão remota:</strong> '+esc(S.remoteInfo?.revision||'sem identificador')+
      ' · <strong>Publicada:</strong> '+esc(S.remoteInfo?.publishedAt||'não registada')+
      ' · <strong>Por:</strong> '+esc(S.remoteInfo?.publisher||'origem desconhecida')+'</div>'+
      '<table style="width:100%;border-collapse:collapse"><thead><tr><th>Dados</th><th>Neste computador</th><th>No Drive</th></tr></thead><tbody>'+table+'</tbody></table>'+
      '<p class="hint">Os totais acima não representam o número de conflitos. Há '+conflicts.length+' diferença(s) incompatível(is) detetada(s).</p>'+
      (samples?'<details><summary>Ver exemplos de conflitos</summary><ul>'+samples+'</ul></details>':'');
  };
  S.showResolver=async function(){
    if(!googleToken||!db.settings.spreadsheetId){toast('Liga primeiro o Google Sheets.',true);return}
    try{
      const remote=await S.fetchCloud(),local=S.snapshot(),reference=S.getBase(),base=reference?S.comparisonBase(reference,local,remote):remote;
      S.remoteInfo=S.lastRemoteMeta?{...S.lastRemoteMeta}:null;
      S.pendingConflict={remote,local,base,conflicts:reference?S.merge(base,local,remote).conflicts:['Versões iniciais ainda não conciliadas']};
      setView('settings');
      const el=E('syncResolverPanel');
      if(el){el.innerHTML=S.resolverHTML();S.updateChoice();el.scrollIntoView({behavior:'smooth',block:'start'})}
    }catch(e){toast('Não foi possível comparar dados: '+e.message,true)}
  };
  S.resolverHTML=function(){
    if(!S.pendingConflict)return '<p class="hint">Não há comparação carregada. Usa «Comparar versões» para consultar os dados locais e remotos.</p>';
    return S.preview()+
      '<div class="field"><label for="syncChoice">Como pretendes resolver?</label><select id="syncChoice" onchange="AESTSYNC.updateChoice()">'+
      '<option value="remote">Usar apenas os dados do Drive (substituir locais)</option>'+
      '<option value="local">Usar apenas os dados locais (substituir Drive)</option>'+
      '<option value="mergeLocal">Fundir; em duplicados prevalecem os dados locais</option>'+
      '<option value="mergeRemote">Fundir; em duplicados prevalecem os dados do Drive</option>'+
      '</select></div><div id="syncPreview" class="note"></div>'+
      '<div class="flex"><button class="btn" onclick="AESTSYNC.showResolver()">Atualizar comparação</button>'+
      '<button class="btn primary" onclick="AESTSYNC.resolveSelected()">Continuar com esta opção</button></div>';
  };
  S.updateChoice=function(){
    const selected=E('syncChoice')?.value||'remote',p=S.pendingConflict;
    if(!p)return;
    const data=selected==='remote'?p.remote:selected==='local'?p.local:S.combine(p.local,p.remote,selected==='mergeLocal'?'local':'remote');
    const problems=S.validate(data);
    const label=selected==='remote'?'A versão do Drive substituirá os dados locais.':
      selected==='local'?'Os dados locais substituirão os dados do Drive.':
      'Os dados exclusivos de ambas as origens serão conservados; registos com o mesmo identificador seguirão a precedência escolhida.';
    const el=E('syncPreview');
    if(el)el.innerHTML='<strong>Resultado previsto:</strong> '+esc(label)+'<br>'+
      S.summary(data).map(x=>esc(x.label)+': '+x.count).join(' · ')+
      (problems.length?'<p style="color:#a42323">Validação: '+esc(problems.slice(0,5).join('; '))+'</p>':'<p>Verificação de referências: sem problemas detetados.</p>');
  };
  S.resolveSelected=async function(){
    const choice=E('syncChoice')?.value||'remote',pending=S.pendingConflict;
    if(!pending)return;
    const selected=choice==='remote'?pending.remote:choice==='local'?pending.local:S.combine(pending.local,pending.remote,choice==='mergeLocal'?'local':'remote');
    const problems=S.validate(selected);
    if(problems.length){toast('A operação foi bloqueada por referências inválidas: '+problems.slice(0,2).join('; '),true);return}
    const destructive=choice==='local'||choice==='mergeLocal'||choice==='mergeRemote';
    const message=choice==='remote'?'Substituir os dados neste navegador pela versão do Drive? Não será criada cópia automática. Exporta JSON antes, se necessário.':
      'Esta operação vai escrever no Google Drive e pode substituir registos. Não será criada cópia automática. Confirmas?';
    if(!confirm(message))return;
    if(destructive&&!confirm('SEGUNDA CONFIRMAÇÃO: pretendes mesmo publicar esta versão no Google Drive?'))return;
    if(S.busy){toast('A sincronização já está em curso.',true);return}
    S.busy=true;S.setStatus('A resolver conflito…');
    try{
      S.assertLocalUnchanged(pending.local);
      const latest=await S.fetchCloud();
      if(!S.eq(latest,pending.remote)){S.pendingConflict=null;throw Error('O Drive foi alterado entretanto. Compara novamente as versões.')}
      S.assertLocalUnchanged(pending.local);
      if(destructive){
        S.lastRemoteMeta=S.lastRemoteMeta||null;
        await S.upload(selected);
        const check=await S.fetchCloud();
        if(!S.eq(check,selected))throw Error('A verificação após a publicação falhou. Não será assumida sincronização.');
      }
      S.assertLocalUnchanged(pending.local);
      S.finish(selected);
      S.pendingConflict=null;S.track('Conflito resolvido: '+choice);
      S.setStatus('Sincronizado · '+db.settings.lastSync);
      toast('Versão escolhida aplicada e confirmada.');
      render();
    }catch(e){S.setStatus('Por sincronizar · '+e.message);toast(e.message,true)}
    finally{S.busy=false}
  };
  /* Avoid the legacy destructive import/export paths; require the same comparison flow. */
  pushSheets=async function(){await S.showResolver();const sel=E('syncChoice');if(sel){sel.value='local';S.updateChoice()}};
  pullSheets=async function(){await S.showResolver();const sel=E('syncChoice');if(sel){sel.value='remote';S.updateChoice()}};
  const legacySync=S.sync.bind(S);
  S.sync=async function(){
    if(S.busy||!googleToken||!db.settings.spreadsheetId)return;
    if(localSaveError){S.setStatus('Por sincronizar · '+localSaveError);return}
    if(!S.getBase())return legacySync();
    if(E('modal')?.open||document.activeElement?.matches?.('input,textarea,[contenteditable="true"]'))return;
    S.busy=true;S.setStatus('A sincronizar…');
    try{
      const reference=S.getBase(),remote=await S.fetchCloud(),local=S.snapshot(),base=S.comparisonBase(reference,local,remote);
      S.remoteInfo=S.lastRemoteMeta?{...S.lastRemoteMeta}:null;
      const result=S.merge(base,local,remote);
      if(result.conflicts.length){
        S.pendingConflict={base,local,remote,conflicts:result.conflicts};
        S.setStatus('Conflito: '+result.conflicts.length+' alterações incompatíveis. Ação necessária.');
        toast('Foram detetados conflitos. Abre as Definições para comparar as versões.',true);
        return;
      }
      const errors=S.validate(result.data);
      if(errors.length)throw Error('Validação de dados: '+errors.slice(0,3).join('; '));
      if(!S.eq(remote,result.data)){
        const latest=await S.fetchCloud();
        if(!S.eq(latest,remote))throw Error('O Drive mudou. Nova comparação necessária.');
        S.assertLocalUnchanged(local);
        await S.upload(result.data);
        const verified=await S.fetchCloud();
        if(!S.eq(verified,result.data))throw Error('O Drive não confirmou a publicação.');
      }
      S.assertLocalUnchanged(local);
      S.finish(result.data);
      S.pendingConflict=null;S.track('Sincronização concluída');
      S.setStatus('Sincronizado · '+db.settings.lastSync);
    }catch(e){S.setStatus('Por sincronizar · '+e.message)}
    finally{S.busy=false}
  };
  const oldSettings=settingsPage;
  settingsPage=function(){
    const content=oldSettings();
    return '<section class="panel"><h2>Identidade e resolução de conflitos</h2>'+
      '<p class="hint">Instalação: <strong>'+esc(S.deviceId())+'</strong>. Cada navegador tem um identificador persistente. As operações de substituição exigem confirmação. Exporta JSON antes de substituir dados; não são criadas cópias automáticas.</p>'+
      '<div class="flex"><button class="btn" onclick="AESTSYNC.showResolver()">Comparar versões e resolver conflitos</button>'+
      '<button class="btn" onclick="exportJSON()">Descarregar cópia JSON</button></div>'+
      '<div id="syncResolverPanel">'+S.resolverHTML()+'</div></section>'+content;
  };
  /* Old local JSON import must never silently imply a successful cloud synchronization. */
  const originalImport=importJSON;
  importJSON=async function(input){
    if(S.busy){toast('A sincronização está em curso.',true);return false}
    const ok=await originalImport(input);
    if(ok){S.pendingConflict=null;S.setStatus('Dados locais importados. Necessária nova comparação com o Drive.')}
    return ok;
  };
  const originalClear=clearAll;
  clearAll=function(){
    if(S.busy){toast('A sincronização está em curso.',true);return false}
    const ok=originalClear();
    if(ok){S.pendingConflict=null;S.setStatus('Dados locais alterados. Verifica sincronização.')}
    return ok;
  };
  window.addEventListener('load',()=>{S.track('Aplicação iniciada');if(view==='settings')render()});
})();
