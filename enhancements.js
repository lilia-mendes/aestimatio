'use strict';
/* Aestimatio v3: domains, work criteria and individual grading. */
const AEST={
  selectedStudent:'',reportTab:'instrument',reportDetail:'domain',reportDomain:'all',
  reportSeries:{},flashStudent:'',flashKind:'',flashUntil:0,
  domainsFor(cid){
    if(!Array.isArray(db.domainConfigs))db.domainConfigs=[];
    if(!cid)return [];
    let list=db.domainConfigs.filter(d=>d.classId===cid);
    if(!list.length){
      const legacy=[...new Set(db.questions.filter(q=>db.assessments.some(a=>a.id===q.assessmentId&&a.classId===cid)).map(q=>q.domain).filter(Boolean))];
      const base=legacy.length?legacy:['Tratamento de Fontes','Compreensão Histórica','Comunicação em História'];
      const standard={'Tratamento de Fontes':20,'Compreensão Histórica':60,'Comunicação em História':20};
      base.forEach((name,i)=>db.domainConfigs.push({id:uid(),classId:cid,name,weight:standard[name]??(100/base.length)}));
      list=db.domainConfigs.filter(d=>d.classId===cid);
    }
    return list;
  },
  domName(q){return q.domain||'Sem domínio'},
  domains(cid){return this.domainsFor(cid).map(x=>x.name)},
  resultsByDomain(a,s){
    const ds=this.domainsFor(a.classId),qs=questions(a.id);
    return ds.map(d=>{
      const subset=qs.filter(q=>q.domain===d.name||q.domain===d.id),max=subset.reduce((sum,q)=>sum+Number(q.max||0),0);
      const has=subset.some(q=>grade(a.id,s,q.id)!==null);
      const earned=subset.reduce((sum,q)=>sum+Number(grade(a.id,s,q.id)??0),0);
      const tw=subset.reduce((sum,q)=>sum+Number(q.criterionWeight||0),0);
      const weighted=subset.reduce((sum,q)=>sum+Number(grade(a.id,s,q.id)??0)*Number(q.criterionWeight||0),0);
      const score20=!has?null:a.type==='Trabalho'&&tw>0?weighted/tw/10:max>0?earned/max*20:null;
      return {name:d.name,weight:Number(d.weight)||0,earned,max,score20,has,criteriaCount:subset.length};
    });
  },
  result(a,s){
    if(!a)return null;
    const qs=questions(a.id),total=qs.reduce((n,q)=>n+Number(q.max||0),0);
    if(!qs.length)return null;
    const vals=qs.map(q=>grade(a.id,s,q.id));
    if(vals.every(v=>v===null))return null;
    const earned=qs.reduce((n,q,i)=>n+Number(vals[i]??0),0),full=vals.every(v=>v!==null);
    let score20;
    if(a.type==='Trabalho'){
      const tw=qs.reduce((n,q)=>n+Number(q.criterionWeight||0),0);
      score20=tw>0?qs.reduce((n,q,i)=>n+Number(vals[i]??0)*Number(q.criterionWeight||0),0)/tw/10:total>0?earned/total*20:0;
    }else{
      const domains=this.resultsByDomain(a,s).filter(d=>d.criteriaCount&&d.score20!==null&&d.weight>0);
      const used=domains.reduce((n,d)=>n+d.weight,0);
      score20=used>0?domains.reduce((n,d)=>n+d.score20*d.weight,0)/used:total>0?earned/total*20:0;
    }
    return {earned,total,score200:score20*10,score20,raw20:total>0?earned/total*20:null,filled:vals.filter(v=>v!==null).length,full};
  },
  fmt20(v){return v===null||v===undefined||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('pt-PT',{minimumFractionDigits:1,maximumFractionDigits:1})},
  escAttr(v){return esc(v)},
  periodResult(s,p){
    const owner=by('students',s);
    const arr=db.assessments.filter(a=>a.classId===owner?.classId&&a.periodId===p).map(a=>({a,r:this.result(a,s)})).filter(x=>x.r&&Number(x.a.weight)>0);
    if(!arr.length)return null;
    const totalWeight=arr.reduce((n,x)=>n+Number(x.a.weight),0);
    const base=arr.reduce((n,x)=>n+x.r.score20*Number(x.a.weight),0)/totalWeight;
    const star=bonus(s,p);
    return {base,bonus:star,total:Math.min(20,base+star),count:arr.length};
  },
  domainAssessmentAverage(s,p,name){
    const owner=by('students',s),list=db.assessments.filter(a=>a.periodId===p&&a.classId===owner?.classId);
    const entries=list.map(a=>({a,d:this.resultsByDomain(a,s).find(d=>d.name===name)})).filter(x=>x.d&&x.d.score20!==null&&Number(x.a.weight)>0);
    const w=entries.reduce((n,x)=>n+Number(x.a.weight),0);
    return w?entries.reduce((n,x)=>n+x.d.score20*Number(x.a.weight),0)/w:null;
  },
  timeSeries(cid,p,name,studentId=''){
    const ass=db.assessments.filter(a=>a.classId===cid&&a.periodId===p).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    const ids=studentId?[studentId]:db.students.filter(s=>s.classId===cid).map(s=>s.id);
    return ass.map((a,i)=>{
      const prior=ass.slice(0,i+1);
      const values=ids.map(s=>{
        const rec=prior.map(x=>({a:x,r:name==='all'?this.result(x,s):this.resultsByDomain(x,s).find(d=>d.name===name)})).filter(x=>x.r&&(name==='all'?x.r.score20:x.r.score20)!==null&&Number(x.a.weight)>0);
        const w=rec.reduce((n,x)=>n+Number(x.a.weight),0);
        return w?rec.reduce((n,x)=>n+x.r.score20*Number(x.a.weight),0)/w:null;
      }).filter(v=>v!==null);
      return {x:a.date||a.name,y:values.length?values.reduce((n,v)=>n+v,0)/values.length:null};
    });
  }
};
if(!Array.isArray(db.domainConfigs))db.domainConfigs=[];
TABNAMES.domainConfigs='Dominios';
const oldMigrateData=migrateData;
migrateData=function(data){
  const next=oldMigrateData(data);
  if(!Array.isArray(next.domainConfigs))next.domainConfigs=[];
  return next;
};
assessmentResult=function(a,s){return AEST.result(a,s)};
periodResult=function(s,p){return AEST.periodResult(s,p)};
domainResult=function(a,s,d){const ass=by('assessments',a);return ass?AEST.resultsByDomain(ass,s).find(x=>x.name===d)?.score20??null:null};
const oldSetView=setView;
setView=function(v){oldSetView(v)};
function editDomains(){
  if(!classId){toast('Seleciona uma turma',true);return}
  const ds=AEST.domainsFor(classId);
  const h='<p class="hint">Lista finita de domínios desta turma. Os pesos devem somar 100%. Não alteres o nome de um domínio já usado sem rever as perguntas associadas.</p><div id="domainEditor">'+ds.map((d,i)=>'<div class="formgrid" data-did="'+esc(d.id)+'">'+field('Domínio','domainName'+i,d.name)+field('Peso (%)','domainWeight'+i,d.weight,'number','min="0" max="100" step="0.01"')+'</div>').join('')+'</div>';
  openModal('Domínios da turma',h,f=>{
    const changed=ds.map((d,i)=>({d,name:String(f.get('domainName'+i)||'').trim(),weight:Number(f.get('domainWeight'+i))}));
    if(changed.some(x=>!x.name||!Number.isFinite(x.weight)||x.weight<0))throw Error('Domínios ou pesos inválidos.');
    if(Math.abs(changed.reduce((n,x)=>n+x.weight,0)-100)>0.01)throw Error('A soma dos pesos dos domínios deve ser 100%.');
    if(new Set(changed.map(x=>x.name.toLowerCase())).size!==changed.length)throw Error('Os nomes dos domínios devem ser diferentes.');
    changed.forEach(x=>{const old=x.d.name;db.questions.forEach(q=>{if(q.domain===old&&db.assessments.some(a=>a.id===q.assessmentId&&a.classId===classId))q.domain=x.name});x.d.name=x.name;x.d.weight=x.weight});
  });
}
questionRows=function(){
  const ds=AEST.domainsFor(classId),isWork=E('modal')?.open&&E('modalBody')?.querySelector('[name="type"]')?.value==='Trabalho';
  return draftQuestions.map((q,i)=>'<div class="formgrid" style="align-items:end;margin-bottom:9px" data-qi="'+i+'"><div class="field"><label>'+(isWork?'Critério':'Pergunta / enunciado')+'</label><input class="qname" value="'+esc(q.name)+'" required></div><div class="field"><label>Domínio</label><select class="qdomain">'+ds.map(d=>'<option value="'+esc(d.name)+'" '+(d.name===q.domain?'selected':'')+'>'+esc(d.name)+'</option>').join('')+'</select></div><div class="field"><label>'+(isWork?'Peso do critério (%)':'Cotação (pontos)')+'</label><input class="qmax" type="number" min="'+(isWork?'0':'0.01')+'" max="200" step="0.01" value="'+(isWork?(q.criterionWeight??25):q.max)+'" required></div><div><button type="button" class="btn danger small" onclick="delQuestion('+i+')">Remover</button></div></div>').join('');
};
captureQuestions=function(){
  const isWork=E('modalBody')?.querySelector('[name="type"]')?.value==='Trabalho';
  const rows=[...E('questionEditor').querySelectorAll('[data-qi]')];
  draftQuestions=rows.map((r,i)=>({id:draftQuestions[i]?.id||uid(),name:r.querySelector('.qname').value,domain:r.querySelector('.qdomain').value,max:isWork?200:Number(r.querySelector('.qmax').value),criterionWeight:isWork?Number(r.querySelector('.qmax').value):undefined,order:i+1}));
};
addQuestion=function(){
  captureQuestions();const work=E('modalBody')?.querySelector('[name="type"]')?.value==='Trabalho';
  draftQuestions.push({id:uid(),name:work?'Critério '+(draftQuestions.length+1):'Pergunta '+(draftQuestions.length+1),domain:AEST.domainsFor(classId)[0]?.name||'',max:work?200:10,criterionWeight:work?0:undefined,order:draftQuestions.length+1});
  E('questionEditor').innerHTML=questionRows();
};
function refreshQuestionType(){
  captureQuestions();
  const work=E('modalBody')?.querySelector('[name="type"]')?.value==='Trabalho';
  if(work)draftQuestions.forEach(q=>{q.criterionWeight=Number(q.criterionWeight??0);q.max=200});
  E('questionEditor').innerHTML=questionRows();
}
editAssessment=function(id=''){
  if(!periodId){toast('Cria primeiro um semestre ou período',true);return}
  AEST.domainsFor(classId);
  const a=by('assessments',id)||{};
  draftQuestions=id?questions(id).map(x=>({...x})):[];
  const types=['Teste','Questão de aula','Trabalho'];
  const select='<div class="field"><label>Tipo</label><select name="type" onchange="refreshQuestionType()">'+types.map(type=>'<option '+((a.type||'Teste')===type?'selected':'')+'>'+type+'</option>').join('')+'</select></div>';
  openModal(id?'Editar avaliação':'Nova avaliação','<div class="formgrid">'+field('Nome','name',a.name||'')+select+field('Data','date',a.date||new Date().toISOString().slice(0,10),'date')+field('Peso relativo no período','weight',a.weight??1,'number','min="0" step="0.01"')+'<div class="full">'+field('Google Docs · ID (opcional)','docId',a.docId||'')+'</div></div><div class="divider"></div><div class="flex between"><h3>Perguntas / critérios</h3><div class="flex"><button type="button" class="btn small" onclick="editDomains()">Configurar domínios</button><button type="button" class="btn small" onclick="addQuestion()">+ Adicionar</button></div></div><div id="questionEditor">'+questionRows()+'</div><p class="hint">Os testes e questões de aula totalizam 200 pontos; os Trabalhos usam critérios classificados de 0 a 200, cujos pesos totalizam 100%.</p>',f=>{
    captureQuestions();
    const name=String(f.get('name')||'').trim(),type=f.get('type'),weight=Number(f.get('weight'));
    if(!name||!Number.isFinite(weight)||weight<0)throw Error('Nome ou peso inválido.');
    const isWork=type==='Trabalho',total=draftQuestions.reduce((n,q)=>n+(isWork?Number(q.criterionWeight):Number(q.max)),0);
    if(draftQuestions.some(q=>!q.name.trim()||!AEST.domainsFor(classId).some(d=>d.name===q.domain)))throw Error('Define enunciados e seleciona domínios válidos.');
    if(draftQuestions.length&&Math.abs(total-(isWork?100:200))>.001)throw Error(isWork?'Os pesos dos critérios devem somar 100%.':'A soma das cotações deve ser 200 pontos.');
    if(draftQuestions.some(q=>!Number.isFinite(isWork?Number(q.criterionWeight):Number(q.max))||(isWork?Number(q.criterionWeight)<0:Number(q.max)<=0)))throw Error('Cotações ou pesos inválidos.');
    const x={name,type,date:f.get('date'),weight,docId:String(f.get('docId')||'').trim()};
    let aid=id;
    if(id)Object.assign(a,x);else{aid=uid();db.assessments.push({id:aid,classId,periodId,...x})}
    const previous=questions(aid).map(q=>q.id),current=new Set(draftQuestions.map(q=>q.id));
    db.questions=db.questions.filter(q=>q.assessmentId!==aid);
    db.questions.push(...draftQuestions.map((q,i)=>({id:q.id,assessmentId:aid,name:q.name.trim(),domain:q.domain,max:isWork?200:Number(q.max),criterionWeight:isWork?Number(q.criterionWeight):undefined,order:i+1})));
    db.grades=db.grades.filter(g=>!previous.includes(g.questionId)||current.has(g.questionId));
    return true;
  });
  E('questionEditor').innerHTML=questionRows();
};
const oldGradeSetter=setGrade;
setGrade=function(a,s,q,input){
  const ques=by('questions',q),raw=String(input.value).trim();
  if(raw!==''&&(!Number.isFinite(Number(raw))||Number(raw)<0||Number(raw)>Number(ques.max))){toast('A pontuação deve estar entre 0 e '+fmt(ques.max),true);input.value=grade(a,s,q)??'';return}
  const existing=db.grades.find(g=>g.assessmentId===a&&g.studentId===s&&g.questionId===q);
  if(raw===''){
    if(existing){existing.score=null;existing.updatedAt=new Date().toISOString();}
  }else if(existing){existing.score=Number(raw);existing.updatedAt=new Date().toISOString()}
  else db.grades.push({id:uid(),assessmentId:a,studentId:s,questionId:q,score:Number(raw),note:'',updatedAt:new Date().toISOString()});
  save();
  if(view==='grades')updateIndividualSummary();
};
function setGradeNote(a,s,q,input){
  let g=db.grades.find(g=>g.assessmentId===a&&g.studentId===s&&g.questionId===q);
  if(!g){g={id:uid(),assessmentId:a,studentId:s,questionId:q,score:null,note:''};db.grades.push(g)}
  g.note=input.value;g.updatedAt=new Date().toISOString();save();
}
function updateIndividualSummary(){
  const a=by('assessments',assessmentId),s=AEST.selectedStudent;
  if(!a||!s)return;
  const slot=E('individualSummary');if(slot)slot.innerHTML=individualSummary(a,s);
}
function individualSummary(a,s){
  const r=AEST.result(a,s),ds=AEST.resultsByDomain(a,s);
  return '<div class="layout"><div class="panel span6 stat"><label>Pontos obtidos</label><strong>'+(r?AEST.fmt20(r.earned)+' / '+fmt(r.total):'—')+'</strong></div><div class="panel span6 stat"><label>Nota</label><strong>'+(r?AEST.fmt20(r.score20)+' / 20':'—')+'</strong></div></div><section class="panel"><h3>Classificação por domínio</h3><div class="tablewrap"><table><thead><tr><th>Domínio</th><th>Peso</th><th>Pontos / cotação</th><th>Nota / 20</th></tr></thead><tbody>'+ds.map(d=>'<tr><td>'+esc(d.name)+'</td><td>'+fmt(d.weight)+'%</td><td>'+AEST.fmt20(d.earned)+' / '+fmt(d.max)+'</td><td><strong>'+AEST.fmt20(d.score20)+'</strong></td></tr>').join('')+'</tbody></table></div></section>';
}
function individualClassSelect(type){
  const options=db.classes.map(c=>'<option value="'+esc(c.id)+'" '+(c.id===classId?'selected':'')+'>'+esc(c.name)+'</option>').join('');
  return '<div class="field"><label>Turma</label><select onchange="setClass(this.value)">'+options+'</select></div>';
}
gradesPage=function(){
  const ass=assessments(),a=by('assessments',assessmentId);
  const ss=students();
  if(!ss.some(s=>s.id===AEST.selectedStudent))AEST.selectedStudent=ss[0]?.id||'';
  const s=AEST.selectedStudent,qs=a?questions(a.id):[];
  const selectors='<div class="panel"><div class="filters">'+individualClassSelect()+'<div class="field"><label>Período / semestre</label><select onchange="setPeriod(this.value)">'+periods().map(p=>'<option value="'+p.id+'" '+(p.id===periodId?'selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></div><div class="field"><label>Instrumento</label><select onchange="assessmentId=this.value;render()">'+ass.map(x=>'<option value="'+x.id+'" '+(x.id===assessmentId?'selected':'')+'>'+esc(x.name)+' · '+esc(x.type)+'</option>').join('')+'</select></div><div class="field"><label>Aluno</label><select onchange="AEST.selectedStudent=this.value;render()">'+ss.map(x=>'<option value="'+x.id+'" '+(x.id===s?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></div></div></div>';
  if(!a)return selectors+'<section class="panel empty">Cria um instrumento de avaliação para começar.</section>';
  const rows=qs.map((q,i)=>{
    const g=db.grades.find(g=>g.assessmentId===a.id&&g.studentId===s&&g.questionId===q.id);
    return '<section class="panel individual-question"><div class="question-text" title="Expandir/recolher apenas o enunciado" onclick="this.classList.toggle(\'expanded\')" role="button" tabindex="0" onkeydown="if(event.key===\'Enter\'){this.click()}"><strong>'+(i+1)+'. </strong>'+esc(q.name)+' <span aria-hidden="true">⌄</span></div><div class="hint">'+esc(q.domain)+' · '+(a.type==='Trabalho'?'Peso '+fmt(q.criterionWeight)+'% · cotação 200': 'Cotação '+fmt(q.max)+' pontos')+'</div><div class="formgrid individual-fields"><div class="field"><label>Classificação (0–'+fmt(q.max)+')</label><input type="number" min="0" max="'+fmt(q.max)+'" step="0.01" value="'+(g?.score??'')+'" onchange="setGrade(\''+a.id+'\',\''+s+'\',\''+q.id+'\',this)"></div><div class="field"><label>Anotação</label><textarea rows="2" onchange="setGradeNote(\''+a.id+'\',\''+s+'\',\''+q.id+'\',this)">'+esc(g?.note||'')+'</textarea></div></div></section>';
  }).join('');
  return '<div class="individual-grading">'+selectors+'<div class="flex between"><h2>'+esc(a.name)+'</h2><span class="chip">'+esc(a.type)+'</span></div>'+rows+'<div id="individualSummary">'+individualSummary(a,s)+'</div><div class="flex between"><button class="btn" onclick="navigateStudent(-1)">← Aluno anterior</button><button class="btn primary" onclick="navigateStudent(1)">Aluno seguinte →</button></div></div>';
};
function navigateStudent(step){const ss=students(),i=ss.findIndex(s=>s.id===AEST.selectedStudent);AEST.selectedStudent=ss[Math.max(0,Math.min(ss.length-1,i+step))]?.id||'';render()}

/* Immutable signed star movements and responsive layout. */
addStar=function(id){
  if(!periodId)return;
  db.stars.push({id:uid(),classId,periodId,studentId:id,count:1,action:'adicionada',createdAt:new Date().toISOString()});
  save();render();markStarFeedback(id,'add');
};
undoStar=function(id){
  if(!periodId||starCount(id,periodId)<=0)return;
  db.stars.push({id:uid(),classId,periodId,studentId:id,count:-1,action:'removida',createdAt:new Date().toISOString()});
  save();render();markStarFeedback(id,'remove');
};
removeStar=function(id){
  const log=db.stars.find(e=>e.id===id);
  if(!log||!confirm('Registar um movimento inverso, sem apagar o histórico?'))return;
  if(Number(log.count)>0&&starCount(log.studentId,log.periodId)<=0){toast('Não é possível ficar com estrelas negativas.',true);return}
  db.stars.push({id:uid(),classId:log.classId,periodId:log.periodId,studentId:log.studentId,count:-Number(log.count||1),action:'correcao',createdAt:new Date().toISOString(),reverts:id});
  save();render();
};
function markStarFeedback(id,kind){
  const row=[...document.querySelectorAll('.star-student')].find(n=>n.dataset.student===id);
  if(!row)return;
  row.classList.add(kind==='add'?'flash-add':'flash-remove');
  setTimeout(()=>row.classList.remove('flash-add','flash-remove'),1100);
}
starsPage=function(){
  if(!classId)return '<section class="panel empty">Seleciona uma turma.</section>';
  const p=by('periods',periodId),max=Number(db.settings.starMax)||25,starSvg='<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 2l3 6.4 7 1-5 5 .9 7L12 18l-5.9 3.4 1-7-5-5 7-1z"/></svg>';
  const cards=students().map(s=>{
    const count=starCount(s.id,periodId),pct=Math.min(100,Math.max(0,100*count/max));
    return '<div class="star-student" data-student="'+s.id+'"><div class="star-line"><strong class="star-name">'+esc(s.name)+'</strong><span class="star-number">★ '+count+'</span><span class="star-bonus">+'+AEST.fmt20(bonus(s.id,periodId))+'</span><div class="star-buttons"><button class="star-action star-plus" title="Adicionar estrela" aria-label="Adicionar estrela a '+esc(s.name)+'" onclick="addStar(\''+s.id+'\')">'+starSvg+'<b>+</b></button><button class="star-action star-minus" title="Remover estrela" aria-label="Remover estrela a '+esc(s.name)+'" '+(count<=0?'disabled':'')+' onclick="undoStar(\''+s.id+'\')">'+starSvg+'<b>−</b></button></div></div><div class="star-track" role="progressbar" aria-valuemin="0" aria-valuemax="'+max+'" aria-valuenow="'+Math.min(max,count)+'" aria-label="Progresso de '+esc(s.name)+'"><span style="width:'+pct+'%"></span></div></div>';
  }).join('');
  const logs=db.stars.filter(e=>e.classId===classId&&e.periodId===periodId).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,150);
  const history=logs.map(l=>'<div class="star-history-row"><span>'+esc(new Date(l.createdAt).toLocaleString('pt-PT'))+'</span><strong>'+esc(by('students',l.studentId)?.name||'Aluno removido')+'</strong><span class="'+(Number(l.count)>=0?'star-history-add':'star-history-remove')+'">'+(Number(l.count)>0?'★ +'+fmt(l.count):'★ '+fmt(l.count))+'</span></div>').join('');
  return wrap('<section class="panel"><div class="flex between"><h2>Estrelas · '+esc(p?.name||'')+'</h2><span class="chip gold">Máximo '+max+' ★ · bónus até +'+AEST.fmt20(db.settings.starBonus)+'</span></div><p class="hint">Atribui ou retira estrelas. Todas as ações ficam registadas no histórico.</p><div class="star-rows">'+(cards||'<div class="empty">Sem alunos.</div>')+'</div></section><section class="panel" style="margin-top:16px"><h2>Histórico de movimentos</h2><div class="star-history">'+(history||'<div class="empty">Ainda sem movimentos.</div>')+'</div></section>');
};
/* Avoid repetitive Google consent; never persist credentials. */
googleSignIn=function(){
  const cid=db.settings.clientId;
  if(!cid){toast('Configura primeiro o Client ID OAuth.',true);return}
  if(!window.google?.accounts?.oauth2){toast('Autenticação Google ainda não disponível.',true);return}
  tokenClient=google.accounts.oauth2.initTokenClient({
    client_id:cid,scope:SCOPES,
    callback:async response=>{
      if(response.error){
        if(response.error==='interaction_required'||response.error==='consent_required'){
          toast('A Google requer nova autorização.',true);tokenClient.requestAccessToken({prompt:'consent'});return;
        }
        toast('Não foi possível iniciar sessão: '+response.error,true);return;
      }
      googleToken=response.access_token;
      try{localStorage.setItem('aestimatio_google_authorized_'+cid,'1')}catch(e){}
      try{await ensureDriveFolder();toast('Google ligado.')}catch(e){toast('Google ligado, mas falhou a pesquisa da pasta: '+e.message,true)}
      if(view==='settings')render();
      await discoverDatabase();
    }
  });
  let known=false;try{known=localStorage.getItem('aestimatio_google_authorized_'+cid)==='1'}catch(e){}
  tokenClient.requestAccessToken({prompt:known?'':'consent'});
};
const originalApiGoogle=apiGoogle;
apiGoogle=async function(url,options={}){
  try{return await originalApiGoogle(url,options)}
  catch(e){
    if(/invalid credentials|401|authentication credential/i.test(e.message)){
      googleToken='';toast('A ligação Google expirou. Usa «Iniciar sessão Google» para voltar a ligar.',true);
    }
    throw e;
  }
};

/* Five reporting views: instrument, semester, student, class and global. */
AEST.reportStudent='';
AEST.reportMode='overall';
AEST.reportDomain='all';
AEST.reportDetail='domain';
AEST.reportSeries={};
AEST.reportOptions=function(list,selected){
  return list.map(x=>'<option value="'+esc(x.id)+'" '+(String(x.id)===String(selected)?'selected':'')+'>'+esc(x.name)+'</option>').join('');
};
AEST.reportHeader=function(){
  const cs=db.classes,ps=periods();
  const ass=assessments(),ss=students();
  if(!ss.some(s=>s.id===this.reportStudent))this.reportStudent=ss[0]?.id||'';
  return '<div class="panel"><div class="filters report-filters"><div class="field"><label>Turma</label><select onchange="setClass(this.value)">'+this.reportOptions(cs.map(c=>({id:c.id,name:c.name})),classId)+'</select></div><div class="field"><label>Semestre / período</label><select onchange="setPeriod(this.value)">'+this.reportOptions(ps,periodId)+'</select></div>'+((this.reportTab==='instrument')?'<div class="field"><label>Instrumento de avaliação</label><select onchange="assessmentId=this.value;render()">'+this.reportOptions(ass,assessmentId)+'</select></div>':'')+((this.reportTab==='student')?'<div class="field"><label>Aluno</label><select onchange="AEST.reportStudent=this.value;render()">'+this.reportOptions(ss,this.reportStudent)+'</select></div>':'')+'</div></div>';
};
AEST.reportTabMenu=function(){
  const tabs=[['instrument','Pauta · Instrumento'],['semester','Pauta · Semestre'],['student','Dashboard · Aluno'],['class','Dashboard · Turma'],['global','Dashboard · Global']];
  return '<div class="report-tabs" role="tablist">'+tabs.map(t=>'<button class="btn '+(this.reportTab===t[0]?'primary':'')+'" role="tab" aria-selected="'+(this.reportTab===t[0])+'" onclick="AEST.reportTab=\''+t[0]+'\';AEST.reportSeries={};render()">'+t[1]+'</button>').join('')+'</div>';
};
AEST.reportTable=function(headers,rows){
  const desktop='<div class="tablewrap report-table"><table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  const mobile='<div class="report-card-list">'+rows.map(row=>'<div class="report-student-card"><strong>'+row[0]+'</strong>'+row.slice(1).map((cell,i)=>'<div class="report-card-line"><span>'+esc(headers[i+1])+'</span><span>'+cell+'</span></div>').join('')+'</div>').join('')+'</div>';
  return desktop+mobile;
};
AEST.instrumentReport=function(){
  const a=by('assessments',assessmentId);
  if(!a)return '<section class="panel empty">Ainda não há instrumentos para este período.</section>';
  const qs=questions(a.id),ds=this.domainsFor(classId),isDomain=this.reportDetail==='domain';
  const switcher='<div class="field"><label>Detalhe da pauta</label><select onchange="AEST.reportDetail=this.value;render()"><option value="domain" '+(isDomain?'selected':'')+'>Por domínio</option><option value="question" '+(!isDomain?'selected':'')+'>Por pergunta / critério</option></select></div>';
  const columns=isDomain?ds.map(d=>d.name):qs.map((q,i)=>(a.type==='Trabalho'?'Critério ':'Pergunta ')+(i+1));
  const rows=students().map(s=>{
    const details=isDomain?this.resultsByDomain(a,s.id).map(d=>this.fmt20(d.score20)):qs.map(q=>{const score=grade(a.id,s.id,q.id);return score===null?'—':fmt(score)+' / '+fmt(q.max)});
    return [esc(s.name),...details,'<strong>'+this.fmt20(this.result(a,s.id)?.score20)+'</strong>'];
  });
  return '<section class="panel"><div class="flex between"><h2>Pauta · '+esc(a.name)+'</h2><button class="btn" onclick="exportExcel()">↓ Excel</button></div><div class="report-tools">'+switcher+'<span class="hint">Valores dos domínios em 0–20, com uma casa decimal. As perguntas mostram pontos e cotação.</span></div>'+this.reportTable(['Aluno',...columns,'Nota / 20'],rows)+'</section>';
};
AEST.semesterReport=function(){
  const ass=assessments(),list=students(),weights=ass.reduce((n,a)=>n+Number(a.weight||0),0);
  const headers=['Aluno',...ass.map(a=>a.name+' ('+(weights?this.fmt20(a.weight/weights*100):'0')+'%)'),'★ Bónus','Nota final / 20'];
  const rows=list.map(s=>{
    const r=this.periodResult(s.id,periodId);
    return [esc(s.name),...ass.map(a=>this.fmt20(this.result(a,s.id)?.score20)),'+'+this.fmt20(bonus(s.id,periodId)),'<strong>'+this.fmt20(r?.total)+'</strong>'];
  });
  return '<section class="panel"><div class="flex between"><h2>Pauta final · '+esc(by('periods',periodId)?.name||'')+'</h2><button class="btn" onclick="exportExcel()">↓ Excel</button></div><p class="hint">Cada instrumento apresenta a nota e a ponderação no cabeçalho. O bónus das estrelas é aplicado à média ponderada, até ao limite de 20 valores.</p>'+this.reportTable(headers,rows)+'</section>';
};
AEST.currentDomainScores=function(s,p=periodId,cid=classId){
  return this.domainsFor(cid).map(d=>({name:d.name,weight:d.weight,score:this.domainAssessmentAverage(s,p,d.name)}));
};
AEST.annotationList=function(s){
  const ids=db.assessments.filter(a=>a.classId===classId).map(a=>a.id);
  return db.grades.filter(g=>g.studentId===s&&g.note&&ids.includes(g.assessmentId)).sort((a,b)=>{
    const dateA=by('assessments',a.assessmentId)?.date||'',dateB=by('assessments',b.assessmentId)?.date||'';
    return dateB.localeCompare(dateA);
  }).map(g=>({date:by('assessments',g.assessmentId)?.date||'',ass:by('assessments',g.assessmentId)?.name||'',question:by('questions',g.questionId)?.name||'',note:g.note}));
};
AEST.metrics=function(items){
  return '<div class="report-metrics">'+items.map(i=>'<div class="panel report-metric"><div class="hint">'+esc(i.name)+'</div><strong>'+esc(i.value)+'</strong></div>').join('')+'</div>';
};
AEST.xyChart=function(series,title){
  const allDates=[...new Set(series.flatMap(s=>s.points.map(p=>p.x)).filter(Boolean))].sort();
  if(!allDates.length||!series.length)return '<div class="empty">Ainda não há avaliações suficientes para desenhar o gráfico.</div>';
  const W=650,H=265,L=38,R=12,T=15,B=40,colors=['#2369d2','#159475','#d58b20','#914fc0','#dd556c','#475569','#17a4b7','#84624e'];
  const xIndex=date=>allDates.indexOf(date),xPos=x=>L+(allDates.length>1?xIndex(x)/(allDates.length-1):.5)*(W-L-R),yPos=y=>T+(20-y)/20*(H-T-B);
  let svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(title)+'" class="report-chart">';
  for(let i=0;i<=4;i++){const v=i*5,y=yPos(v);svg+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'" stroke="#dce4ef"/><text x="'+(L-8)+'" y="'+(y+4)+'" font-size="11" fill="#70829b" text-anchor="end">'+v+'</text>'}
  allDates.forEach((date,i)=>{if(i%Math.max(1,Math.ceil(allDates.length/6))!==0&&i!==allDates.length-1)return;svg+='<text x="'+xPos(date)+'" y="'+(H-12)+'" font-size="10" fill="#70829b" text-anchor="middle">'+esc(date.length>10?date.slice(0,10):date)+'</text>'});
  series.forEach((s,i)=>{
    if(!s.show)return;
    const c=s.color||colors[i%colors.length];
    const segments=[];let seg=[];
    for(const p of s.points){if(p.y===null||!Number.isFinite(p.y)){if(seg.length)segments.push(seg);seg=[]}else seg.push([xPos(p.x),yPos(Math.max(0,Math.min(20,p.y))),p])}
    if(seg.length)segments.push(seg);
    segments.forEach(points=>{
      if(points.length>1)svg+='<polyline fill="none" stroke="'+c+'" stroke-width="'+(s.bold?3.5:2.5)+'" stroke-linejoin="round" points="'+points.map(pt=>pt[0]+','+pt[1]).join(' ')+'"/>';
      points.forEach(pt=>svg+='<circle cx="'+pt[0]+'" cy="'+pt[1]+'" r="3.2" fill="'+c+'"><title>'+esc(s.name+': '+this.fmt20(pt[2].y)+' ('+pt[2].x+')')+'</title></circle>');
    });
  });
  return svg+'</svg>';
};
AEST.seriesControls=function(series,key){
  return '<div class="report-series">'+series.map((s,i)=>{
    const k=key+':'+i,checked=this.reportSeries[k]!==false;
    return '<label><input type="checkbox" '+(checked?'checked':'')+' onchange="AEST.reportSeries[\''+k+'\']=this.checked;render()"><span class="series-dot" style="background:'+(s.color||'#4686dd')+'"></span>'+esc(s.name)+'</label>';
  }).join('')+'</div>';
};
AEST.chartPanel=function(title,series,key){
  const enabled=series.map((s,i)=>({...s,show:this.reportSeries[key+':'+i]!==false}));
  return '<section class="panel"><h3>'+esc(title)+'</h3><p class="hint">Clica nas legendas para mostrar ou ocultar séries.</p>'+this.seriesControls(series,key)+this.xyChart(enabled,title)+'</section>';
};
AEST.studentReport=function(){
  const s=this.reportStudent,student=by('students',s);
  if(!student)return '<div class="panel empty">Seleciona um aluno.</div>';
  const pr=this.periodResult(s,periodId),domains=this.currentDomainScores(s);
  const comps=assessments().map(a=>{
    const r=this.result(a,s);return '<div class="report-component"><span>'+esc(a.name)+' <small>('+esc(a.type)+')</small></span><strong>'+this.fmt20(r?.score20)+'</strong><span class="hint">Peso '+fmt(a.weight)+'</span></div>';
  }).join('');
  const domainTable=this.reportTable(['Domínio','Peso','Nota / 20'],domains.map(d=>[esc(d.name),fmt(d.weight)+'%',this.fmt20(d.score)]));
  const notes=this.annotationList(s);
  const overall=[{name:'Nota global',points:this.timeSeries(classId,periodId,'all',s),color:'#2369d2',bold:true}];
  const domainSeries=domains.map((d,i)=>({name:d.name,points:this.timeSeries(classId,periodId,d.name,s)}));
  return this.metrics([{name:'Nota do semestre',value:this.fmt20(pr?.total)+' / 20'},{name:'Estrelas',value:starCount(s,periodId)+' ★'},{name:'Bónus',value:'+'+this.fmt20(bonus(s,periodId))}])+
    '<section class="panel"><h3>Composição da nota · '+esc(student.name)+'</h3>'+comps+'<div class="report-component"><span>★ Estrelas</span><strong>+'+this.fmt20(bonus(s,periodId))+'</strong><span class="hint">Bónus</span></div></section>'+
    '<section class="panel"><h3>Classificação atual por domínio</h3>'+domainTable+'</section>'+
    this.chartPanel('Evolução da nota global',overall,'studentOverall')+
    this.chartPanel('Evolução por domínio',domainSeries,'studentDomains')+
    '<section class="panel"><h3>Anotações</h3>'+(notes.length?notes.map(n=>'<div class="report-note"><span class="hint">'+esc(n.date)+' · '+esc(n.ass)+'</span><strong>'+esc(n.question)+'</strong><p>'+esc(n.note)+'</p></div>').join(''):'<div class="empty">Ainda sem anotações.</div>')+'</section>';
};
AEST.regimePeriodFor=function(c,order){
  return db.periods.find(p=>p.regimeId===c.regimeId&&Number(p.order)===Number(order))?.id||'';
};
AEST.globalTimeline=function(classes){
  const order=by('periods',periodId)?.order||1;
  return [...new Set(classes.flatMap(c=>{
    const p=this.regimePeriodFor(c,order);
    return db.assessments.filter(a=>a.classId===c.id&&a.periodId===p).map(a=>a.date).filter(Boolean);
  }))].sort();
};
AEST.cumulative=function(s,period,domain,date){
  const owner=by('students',s);
  const ass=db.assessments.filter(a=>a.classId===owner?.classId&&a.periodId===period&&a.date&&a.date<=date);
  const records=ass.map(a=>({a,v:domain==='all'?this.result(a,s)?.score20:this.resultsByDomain(a,s).find(d=>d.name===domain)?.score20})).filter(x=>x.v!==null&&x.v!==undefined&&Number(x.a.weight)>0);
  const w=records.reduce((n,x)=>n+Number(x.a.weight),0);
  return w?records.reduce((n,x)=>n+x.v*Number(x.a.weight),0)/w:null;
};
AEST.classCumulative=function(c,p,domain,date,ids){
  const scores=(ids||db.students.filter(s=>s.classId===c.id).map(s=>s.id)).map(s=>this.cumulative(s,p,domain,date)).filter(x=>x!==null);
  return scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null;
};
AEST.chartModeSwitcher=function(){
  return '<div class="panel"><div class="report-tools"><div class="field"><label>Mostrar evolução</label><select onchange="AEST.reportMode=this.value;AEST.reportSeries={};render()"><option value="overall" '+(this.reportMode==='overall'?'selected':'')+'>Nota global</option><option value="domains" '+(this.reportMode==='domains'?'selected':'')+'>Por domínio</option></select></div></div></div>';
};
AEST.classReport=function(){
  const c=by('classes',classId),ass=assessments(),dates=[...new Set(ass.map(a=>a.date).filter(Boolean))].sort(),ss=students(),ds=this.domainsFor(classId),mode=this.reportMode;
  if(!c)return '<div class="panel empty">Seleciona uma turma.</div>';
  const series=mode==='overall'?ss.map((s,i)=>({name:s.name,points:dates.map(date=>({x:date,y:this.cumulative(s.id,periodId,'all',date)}))})):ds.map((d,i)=>({name:d.name,points:dates.map(date=>({x:date,y:this.classCumulative(c,periodId,d.name,date)}))}));
  return this.chartModeSwitcher()+this.metrics([{name:'Média da turma',value:this.fmt20(this.classCumulative(c,periodId,'all',dates.at(-1)||''))+' / 20'},{name:'Alunos',value:String(ss.length)},{name:'Domínios',value:String(ds.length)}])+this.chartPanel(mode==='overall'?'Evolução das notas por aluno':'Evolução das médias por domínio · '+c.name,series,'class'+mode);
};
AEST.globalReport=function(){
  const cs=db.classes,dates=this.globalTimeline(cs),order=by('periods',periodId)?.order||1,domainNames=[...new Set(cs.flatMap(c=>this.domainsFor(c.id).map(d=>d.name)))];
  const domains=this.reportMode==='domains';
  const filter='<div class="panel"><div class="report-tools"><div class="field"><label>Mostrar evolução</label><select onchange="AEST.reportMode=this.value;AEST.reportSeries={};render()"><option value="overall" '+(!domains?'selected':'')+'>Média global das turmas</option><option value="domains" '+(domains?'selected':'')+'>Por domínio</option></select></div>'+(domains?'<div class="field"><label>Domínio</label><select onchange="AEST.reportDomain=this.value;AEST.reportSeries={};render()"><option value="all">Todos os domínios</option>'+domainNames.map(d=>'<option value="'+esc(d)+'" '+(d===this.reportDomain?'selected':'')+'>'+esc(d)+'</option>').join('')+'</select></div>':'')+'</div></div>';
  const classMean=(c,d,date)=>this.classCumulative(c,this.regimePeriodFor(c,order),d,date);
  let series;
  if(domains&&this.reportDomain==='all'){
    series=domainNames.map(d=>({name:d,points:dates.map(date=>({x:date,y:this.globalMean(cs,order,d,date)}))}));
  }else{
    const domain=domains?this.reportDomain:'all';
    series=cs.map(c=>({name:c.name,points:dates.map(date=>({x:date,y:classMean(c,domain,date)}))}));
    series.push({name:domains?'Média global · '+domain:'Média global',points:dates.map(date=>({x:date,y:this.globalMean(cs,order,domain,date)})),bold:true,color:'#1d3355'});
  }
  return filter+this.metrics([{name:'Média global',value:this.fmt20(this.globalMean(cs,order,domains&&this.reportDomain!=='all'?this.reportDomain:'all',dates.at(-1)||''))+' / 20'},{name:'Turmas',value:String(cs.length)},{name:'Domínios',value:String(domainNames.length)}])+this.chartPanel(domains?'Evolução das médias por domínio':'Evolução das médias das turmas',series,'global'+this.reportMode+this.reportDomain);
};
AEST.globalMean=function(cs,order,domain,date){
  const vals=cs.flatMap(c=>{
    const p=this.regimePeriodFor(c,order);
    return db.students.filter(s=>s.classId===c.id).map(s=>this.cumulative(s.id,p,domain,date)).filter(x=>x!==null);
  });
  return vals.length?vals.reduce((n,x)=>n+x,0)/vals.length:null;
};
reportsPage=function(){
  if(!db.classes.length)return '<div class="panel empty">Cria uma turma.</div>';
  const panes={instrument:()=>AEST.instrumentReport(),semester:()=>AEST.semesterReport(),student:()=>AEST.studentReport(),class:()=>AEST.classReport(),global:()=>AEST.globalReport()};
  return '<div class="reporting">'+AEST.reportTabMenu()+AEST.reportHeader()+panes[AEST.reportTab]()+'</div>';
};
