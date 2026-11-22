'use strict';
/* Aestimatio: optional question-level grading criteria, version 1. */
const AESTCRITERIA={
  list(q){return Array.isArray(q?.criteria)?q.criteria:[]},
  valid(items){
    if(!items.length)return true;
    return items.every(c=>String(c.name||'').trim()&&Number.isFinite(Number(c.weight))&&Number(c.weight)>0)
      && Math.abs(items.reduce((n,c)=>n+Number(c.weight),0)-10)<0.000001;
  },
  scores(q,g){const values=g?.criterionScores||{};return this.list(q).map(c=>values[c.id]===null||values[c.id]===undefined?null:Number(values[c.id]))},
  complete(q,g){const cs=this.list(q),values=this.scores(q,g);return cs.length>0&&values.every((v,i)=>v!==null&&Number.isFinite(v)&&v>=0&&v<=Number(cs[i].weight)*10)},
  suggested(q,g){if(!this.complete(q,g))return null;return this.scores(q,g).reduce((n,v)=>n+v,0)*Number(q.max)/100},
  grade(q,g){
    if(g?.scoreMode==='manual'&&g.score!==null&&g.score!==undefined)return Number(g.score);
    return this.suggested(q,g);
  },
  same(a,b){return JSON.stringify(a||[])===JSON.stringify(b||[])},
  saveCriterion(a,s,qid,cid,input){
    const q=by('questions',qid),criterion=this.list(q).find(c=>c.id===cid);
    if(!criterion)return;
    const raw=String(input.value).trim(),max=Number(criterion.weight)*10;
    if(raw!==''&&(!Number.isFinite(Number(raw))||Number(raw)<0||Number(raw)>max)){
      toast('A classificação do critério deve estar entre 0 e '+fmt(max),true);render();return;
    }
    let g=db.grades.find(x=>x.assessmentId===a&&x.studentId===s&&x.questionId===qid);
    if(!g){g={id:uid(),assessmentId:a,studentId:s,questionId:qid,score:null,note:'',criterionScores:{},scoreMode:'auto'};db.grades.push(g)}
    if(!g.criterionScores||typeof g.criterionScores!=='object')g.criterionScores={};
    if(raw==='')delete g.criterionScores[cid];else g.criterionScores[cid]=Number(raw);
    const suggestion=this.suggested(q,g);
    if(g.scoreMode!=='manual')g.score=suggestion;
    else if(g.manualScore!==undefined&&g.manualScore!==null)g.score=Number(g.manualScore);
    g.updatedAt=new Date().toISOString();save();render();
  },
  setManual(a,s,qid,enabled){
    const q=by('questions',qid);
    if(!q)return;
    let g=db.grades.find(x=>x.assessmentId===a&&x.studentId===s&&x.questionId===qid);
    if(!g){g={id:uid(),assessmentId:a,studentId:s,questionId:qid,score:null,note:'',criterionScores:{}};db.grades.push(g)}
    if(enabled){
      g.scoreMode='manual';
      g.manualScore=g.score??this.suggested(q,g)??null;
      g.score=g.manualScore;
    }else{
      g.scoreMode='auto';
      delete g.manualScore;
      g.score=this.suggested(q,g);
    }
    g.updatedAt=new Date().toISOString();save();render();
  },
  setManualScore(a,s,qid,input){
    const q=by('questions',qid),g=db.grades.find(x=>x.assessmentId===a&&x.studentId===s&&x.questionId===qid);
    if(!g||!q)return;
    const raw=String(input.value).trim(),val=raw===''?null:Number(raw);
    if(raw!==''&&(!Number.isFinite(val)||val<0||val>Number(q.max))){toast('A nota deve estar entre 0 e '+fmt(q.max),true);render();return}
    g.scoreMode='manual';g.manualScore=val;g.score=val;g.updatedAt=new Date().toISOString();save();render();
  },
  row(a,s,q,i){
    const cs=this.list(q),g=db.grades.find(x=>x.assessmentId===a.id&&x.studentId===s&&x.questionId===q.id);
    const complete=this.complete(q,g),suggested=this.suggested(q,g),manual=g?.scoreMode==='manual'||(!g?.scoreMode&&g?.score!==null&&g?.score!==undefined&&!g?.criterionScores);
    const points=this.scores(q,g);
    const items=cs.map((c,j)=>{
      const score=points[j],max=Number(c.weight)*10,slider=score===null?0:score;
      const args="'"+a.id+"','"+s+"','"+q.id+"','"+c.id+"'";
      return '<div class="criterion-grade"><div class="flex between"><label>'+esc(c.name)+' <span class="hint">· peso '+fmt(c.weight)+'</span></label><strong>'+(score===null?'Por classificar':fmt(score)+' / '+fmt(max))+'</strong></div>'+
        '<div class="criterion-controls"><input aria-label="Slider: '+esc(c.name)+'" type="range" min="0" max="'+max+'" step="1" value="'+slider+'" oninput="this.nextElementSibling.value=this.value" onchange="AESTCRITERIA.saveCriterion('+args+',this)">'+
        '<input aria-label="Pontuação: '+esc(c.name)+'" type="number" min="0" max="'+max+'" step="0.01" placeholder="—" value="'+(score===null?'':score)+'" onchange="AESTCRITERIA.saveCriterion('+args+',this)"></div></div>';
    }).join('');
    return '<section class="panel individual-question"><div class="question-text" title="Expandir/recolher o enunciado" onclick="this.classList.toggle(\'expanded\')" role="button" tabindex="0" onkeydown="if(event.key===\'Enter\')this.click()"><strong>'+(i+1)+'. </strong>'+esc(q.name)+' <span aria-hidden="true">⌄</span></div>'+
      '<div class="hint">'+esc(q.domain)+' · Cotação '+fmt(q.max)+' pontos · '+cs.length+' critério(s)</div>'+
      '<div class="criterion-grades">'+items+'</div>'+
      '<div class="criterion-total"><strong>'+(complete?'Sugestão: '+fmt(suggested)+' / '+fmt(q.max):'Classificação pendente ('+points.filter(x=>x!==null).length+'/'+cs.length+' critérios)')+'</strong>'+
      (g?.score!==null&&g?.score!==undefined?'<span class="hint">Nota atribuída: '+fmt(g.score)+' / '+fmt(q.max)+'</span>':'')+'</div>'+
      '<label class="criterion-manual"><input type="checkbox" '+(manual?'checked ':'')+'onchange="AESTCRITERIA.setManual(\''+a.id+'\',\''+s+'\',\''+q.id+'\',this.checked)"> Usar classificação manual</label>'+
      (manual?'<div class="field"><label>Classificação manual (0–'+fmt(q.max)+')</label><input type="number" min="0" max="'+q.max+'" step="0.01" placeholder="Por classificar" value="'+(g?.score??'')+'" onchange="AESTCRITERIA.setManualScore(\''+a.id+'\',\''+s+'\',\''+q.id+'\',this)"></div><p class="hint">A nota manual é válida mesmo que os critérios ainda não estejam classificados. Podes regressar à nota automática quando terminares os critérios.</p>':'')+
      '<div class="field"><label>Anotação</label><textarea rows="2" onchange="setGradeNote(\''+a.id+'\',\''+s+'\',\''+q.id+'\',this)">'+esc(g?.note||'')+'</textarea></div></section>';
  }
};
const aestOldQuestionRows=questionRows;
questionRows=function(){
  const html=aestOldQuestionRows(),isWork=E('modalBody')?.querySelector('[name="type"]')?.value==='Trabalho';
  if(isWork)return html;
  return html.replace(/(<div><button type="button" class="btn danger small" onclick="delQuestion\((\d+)\)">Remover<\/button><\/div>)(<\/div>)/g,(whole,button,index,end)=>{
    const q=draftQuestions[Number(index)],items=AESTCRITERIA.list(q);
    const rows=items.map((c,j)=>'<div class="criterion-edit" data-ci="'+j+'" data-id="'+esc(c.id)+'"><input class="cname" aria-label="Descrição do critério" placeholder="Descrição do critério" value="'+esc(c.name)+'"><input type="number" class="cweight" aria-label="Peso do critério" min="0.01" max="10" step="0.01" value="'+esc(c.weight)+'"><button type="button" class="btn danger small" onclick="aestRemoveCriterion('+index+','+j+')">Remover</button></div>').join('');
    const sum=items.reduce((n,c)=>n+Number(c.weight||0),0);
    return button+'<div class="criterion-editor"><div class="flex between"><strong>Critérios de correção (opcionais)</strong><button type="button" class="btn small" onclick="aestAddCriterion('+index+')">+ Critério</button></div>'+
      rows+'<p class="hint">Total dos pesos: '+fmt(sum)+' / 10'+(items.length&&Math.abs(sum-10)>.000001?' · a soma tem de ser 10':'')+'</p></div>'+end;
  });
};
const aestOldCaptureQuestions=captureQuestions;
captureQuestions=function(){
  const editor=E('questionEditor'),before=draftQuestions.map(q=>({...q}));
  const input=editor?[...editor.querySelectorAll('[data-qi]')]:[];
  const criteria=input.map((r,i)=>{
    const original=AESTCRITERIA.list(before[i]);
    return [...r.querySelectorAll('[data-ci]')].map((c,j)=>({
      id:c.dataset.id||original[j]?.id||uid(),
      name:c.querySelector('.cname').value,
      weight:c.querySelector('.cweight').value===''?NaN:Number(c.querySelector('.cweight').value)
    }));
  });
  aestOldCaptureQuestions();
  draftQuestions.forEach((q,i)=>{if(!editor?.querySelector('[name="type"]')&&E('modalBody')?.querySelector('[name="type"]')?.value!=='Trabalho')q.criteria=criteria[i]||[];else if(E('modalBody')?.querySelector('[name="type"]')?.value!=='Trabalho')q.criteria=criteria[i]||[];});
};
function aestAddCriterion(i){
  captureQuestions();draftQuestions[i].criteria=AESTCRITERIA.list(draftQuestions[i]).concat([{id:uid(),name:'',weight:0}]);
  E('questionEditor').innerHTML=questionRows();
}
function aestRemoveCriterion(i,j){
  captureQuestions();draftQuestions[i].criteria.splice(j,1);E('questionEditor').innerHTML=questionRows();
}
const aestOldRefreshQuestionType=refreshQuestionType;
refreshQuestionType=function(){
  captureQuestions();const before=draftQuestions.map(q=>({id:q.id,criteria:AESTCRITERIA.list(q)}));
  aestOldRefreshQuestionType();
  if(E('modalBody')?.querySelector('[name="type"]')?.value!=='Trabalho'){
    draftQuestions.forEach(q=>{q.criteria=before.find(x=>x.id===q.id)?.criteria||[]});
    E('questionEditor').innerHTML=questionRows();
  }
};
const aestOldEditAssessment=editAssessment;
editAssessment=function(id=''){
  aestOldEditAssessment(id);
  if(!E('modal').open)return;
  const oldSubmit=modalSubmit,prior=id?questions(id).map(x=>({...x})):[];
  modalSubmit=function(form){
    captureQuestions();
    const isWork=form.get('type')==='Trabalho';
    if(!isWork){
      for(const q of draftQuestions){
        const cs=AESTCRITERIA.list(q);
        if(cs.length&&!AESTCRITERIA.valid(cs))throw Error('Os critérios da pergunta "'+q.name+'" têm de ter descrição, pesos positivos e soma exatamente igual a 10.');
        const before=prior.find(x=>x.id===q.id);
        const hasGrade=before&&db.grades.some(g=>g.questionId===q.id&&(g.score!==null&&g.score!==undefined||Object.keys(g.criterionScores||{}).length));
        if(hasGrade&&Number(before.max)!==Number(q.max)&&AESTCRITERIA.list(before).length)
          throw Error('A cotação da pergunta "'+q.name+'" já classificada não pode ser alterada.');
      }
    }
    const keep=draftQuestions.map(q=>({id:q.id,criteria:AESTCRITERIA.list(q).map(c=>({...c,name:String(c.name).trim(),weight:Number(c.weight)}))}));
    const changed=keep.filter(item=>{
      const before=prior.find(q=>q.id===item.id);
      return before&&!AESTCRITERIA.same(AESTCRITERIA.list(before),item.criteria);
    });
    const result=oldSubmit(form);
    if(result===false)return false;
    if(!isWork){
      for(const item of keep){
        const q=by('questions',item.id);if(q)q.criteria=item.criteria;
      }
      // Existing teacher-given marks remain authoritative when criteria are added
      // or redefined. Discard only the obsolete criterion detail, never the mark.
      for(const item of changed)for(const g of db.grades.filter(x=>x.questionId===item.id)){
        if(g.score!==null&&g.score!==undefined){
          g.scoreMode='manual';
          g.manualScore=Number(g.score);
        }else{
          g.scoreMode='auto';
          delete g.manualScore;
        }
        g.criterionScores={};
        g.updatedAt=new Date().toISOString();
      }
    }
    return result;
  };
};
const aestOldGradesPage=gradesPage;
gradesPage=function(){
  const base=aestOldGradesPage(),a=by('assessments',assessmentId);
  if(!a||a.type==='Trabalho')return base;
  const qs=questions(a.id),s=AEST.selectedStudent;
  let index=0;
  return base.replace(/<section class="panel individual-question">[\s\S]*?<\/section>/g,original=>{
    const i=index++,q=qs[i];
    return q&&AESTCRITERIA.list(q).length?AESTCRITERIA.row(a,s,q,i):original;
  });
};
const aestOldExcelSheets=excelSheets;
excelSheets=function(){
  const data=aestOldExcelSheets(),rows=[];
  for(const a of db.assessments){
    if(a.type==='Trabalho')continue;
    const qlist=questions(a.id);
    for(const q of qlist)for(const c of AESTCRITERIA.list(q)){
      const max=Number(c.weight)*10;
      for(const s of db.students.filter(x=>x.classId===a.classId)){
        const g=db.grades.find(x=>x.assessmentId===a.id&&x.studentId===s.id&&x.questionId===q.id);
        const score=g?.criterionScores?.[c.id];
        rows.push({Turma:by('classes',a.classId)?.name||'',Avaliacao:a.name,Aluno:s.name,Pergunta:q.name,Dominio:q.domain,Criterio:c.name,Peso:c.weight,'Maximo criterio':max,'Pontuacao criterio':score??'','Cotacao pergunta':q.max,'Nota sugerida pergunta':AESTCRITERIA.suggested(q,g)??'','Nota atribuida pergunta':g?.score??'',Modo:g?.scoreMode||'auto'});
      }
    }
  }
  data['Criterios de correcao']=rows;
  return data;
};
// Styles are scoped to the optional grading feature and do not affect existing work criteria.
const aestCriteriaStyle=document.createElement('style');
aestCriteriaStyle.textContent='.criterion-editor{grid-column:1/-1;background:#f5f8fd;border:1px solid #dfe7f3;border-radius:10px;padding:12px;display:grid;gap:8px}.criterion-edit{display:grid;grid-template-columns:minmax(0,1fr) 96px auto;gap:8px}.criterion-edit input,.criterion-controls input[type=number]{width:100%;min-width:0;border:1px solid #cad5e4;border-radius:8px;padding:8px}.criterion-grades{display:grid;gap:15px;margin:15px 0}.criterion-grade{display:grid;gap:7px}.criterion-controls{display:grid;grid-template-columns:minmax(0,1fr) 94px;align-items:center;gap:15px}.criterion-controls input[type=range]{width:100%;accent-color:#265bd5}.criterion-total{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;padding:12px;background:#edf4ff;border-radius:9px;margin-bottom:12px}.criterion-manual{display:flex;align-items:center;gap:8px;margin:10px 0;font-size:13px}@media(max-width:600px){.criterion-edit{grid-template-columns:minmax(0,1fr) 74px}.criterion-edit button{grid-column:1/-1;justify-self:end}}';
document.head.appendChild(aestCriteriaStyle);
