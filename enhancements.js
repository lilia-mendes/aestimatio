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
