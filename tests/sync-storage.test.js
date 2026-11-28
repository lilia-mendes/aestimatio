'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const storageApi=require('../sync-storage.js');
const root=path.join(__dirname,'..');
const source=name=>fs.readFileSync(path.join(root,name),'utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
class MemoryStorage{
  constructor(limit=Infinity){this.map=new Map();this.limit=limit}
  get length(){return this.map.size}
  key(i){return [...this.map.keys()][i]??null}
  getItem(k){return this.map.has(k)?this.map.get(k):null}
  setItem(k,v){
    k=String(k);v=String(v);
    const next=new Map(this.map);next.set(k,v);
    if([...next].reduce((n,[a,b])=>n+2*(a.length+b.length),0)>this.limit)throw Error('QuotaExceededError');
    this.map=next;
  }
  removeItem(k){this.map.delete(k)}
}
const TABNAMES=Object.fromEntries(['schoolYears','regimes','classes','students','periods','assessments','questions','grades','stars','domainConfigs','deletions'].map(k=>[k,k]));
const STORE='atlas_sumativa_v1', BASE='atlas_sync_baseline_test-sheet';
const row=(id,score,rev='r1',parent=null)=>({id,score,_revision:rev,_parentRevision:parent});
function snapshot(grades=[row('a',10),row('b',20)]){
  return {...Object.fromEntries(Object.keys(TABNAMES).map(k=>[k,[]])),settings:{yearMethod:'average',starMax:25,starBonus:1},grades:clone(grades)};
}
function dbOf(data){return {...clone(data),version:2,settings:{...data.settings,clientId:'test-client',spreadsheetId:'test-sheet',driveFolderId:'test-folder',lastSync:'old'}}}
function runtime(data=snapshot(),storage=new MemoryStorage()){
  let counter=0,choice='local';
  const ctx=vm.createContext({
    console,TextEncoder,URL,URLSearchParams,Blob,localStorage:storage,STORE,TABNAMES:{...TABNAMES},
    db:dbOf(data),googleToken:'fake-token',localSaveError:'',
    E:id=>id==='syncChoice'?{value:choice}:null,view:'dashboard',render(){},syncSelection(){},setView(){},
    toast(){},esc:x=>String(x??''),uid:()=>String(++counter).padStart(16,'0'),
    document:{activeElement:null,hidden:false,addEventListener(){}},window:{addEventListener(){}},
    navigator:{onLine:true},location:{href:'https://example.test/'},history:{replaceState(){}},
    setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,confirm:()=>true,
    pushSheets:async()=>{},pullSheets:async()=>{},discoverDatabase:async()=>{},googleSignIn(){},
    settingsPage:()=>'',importJSON:async()=>true,clearAll:()=>true,downloadBlob(){},
    ensureDriveFolder:async()=>{throw Error('simulated history failure')},
    apiGoogle:async()=>{throw Error('unexpected network')},
    fetch:async()=>{throw Error('unexpected network')}
  });
  ctx.persistLocal=next=>{
    try{storage.setItem(STORE,JSON.stringify(next));ctx.localSaveError='';return true}
    catch(e){ctx.localSaveError='Falha de armazenamento local';return false}
  };
  ctx.save=()=>ctx.persistLocal(ctx.db);
  ctx.save();
  for(const name of ['sync-storage.js','cloudsync.js','sync-resolver.js','sync-phase2.js'])
    vm.runInContext(source(name),ctx,{filename:name});
  const S=vm.runInContext('AESTSYNC',ctx);
  let remote=clone(data),uploads=0;
  S.fetchCloud=async()=>clone(remote);
  S.upload=async x=>{uploads++;remote=clone(x)};
  return {ctx,S,storage,setRemote:x=>{remote=clone(x)},getRemote:()=>clone(remote),
    uploads:()=>uploads,setChoice:x=>{choice=x},
    setLocal:x=>{ctx.db=dbOf(x);assert.equal(ctx.persistLocal(ctx.db),true)}};
}
test('SHA-256 agrees with Node crypto, including Unicode and multiple blocks',()=>{
  for(const v of [undefined,null,'',123,{a:'avaliação',b:'x'.repeat(1000)},['α','😀']]){
    const expected=crypto.createHash('sha256').update(JSON.stringify(v)??'undefined').digest('hex');
    assert.equal(storageApi.fingerprint(v),expected);
  }
});
test('compact reference contains identifiers, revisions and fingerprints, not assessment content',()=>{
  const data=snapshot([{...row('a',10),note:'unique-secret-note'.repeat(1000)}]);
  const compact=storageApi.compactBaseline(data,{revision:'remote-1'},'confirmed');
  assert.equal(storageApi.isCompact(compact),true);
  assert.equal(compact.remoteRevision,'remote-1');
  assert.equal(JSON.stringify(compact).includes('unique-secret-note'),false);
  assert.ok(JSON.stringify(compact).length<JSON.stringify(data).length);
  assert.equal(storageApi.matches(compact,data),true);
  data.grades[0].score=11;
  assert.equal(storageApi.matches(compact,data),false);
});
test('in-place baseline migration is idempotent and does not create another key',()=>{
  const st=new MemoryStorage(),data=snapshot([{...row('a',10),note:'x'.repeat(9000)}]);
  st.setItem(STORE,JSON.stringify(dbOf(data)));st.setItem(BASE,JSON.stringify(data));
  st.limit=[...st.map].reduce((n,[k,v])=>n+2*(k.length+v.length),0);
  const original=st.getItem(STORE);
  assert.deepEqual(storageApi.migrateBaselines(st).converted,[BASE]);
  assert.equal(st.length,2);
  assert.equal(st.getItem(STORE),original);
  assert.equal(storageApi.matches(storageApi.readBaseline(st,BASE),data),true);
  assert.deepEqual(storageApi.migrateBaselines(st).converted,[]);
});
test('failed compact migration preserves the original reference',()=>{
  const st=new MemoryStorage(),data={settings:{},grades:[]};
  const raw=JSON.stringify(data);st.setItem(BASE,raw);st.limit=2*(BASE.length+raw.length);
  assert.deepEqual(storageApi.migrateBaselines(st).failed,[BASE]);
  assert.equal(st.getItem(BASE),raw);
});
test('malformed compact reference is never mistaken for a usable baseline',()=>{
  const st=new MemoryStorage();st.setItem(BASE,JSON.stringify({format:'aestimatio-baseline-v2',records:{},settings:{a:'not-a-hash'}}));
  assert.equal(storageApi.readBaseline(st,BASE),null);
});
test('legacy cleanup exports all 12 copies and does not touch the main database',()=>{
  const st=new MemoryStorage();st.setItem(STORE,'{"data":"main"}');
  for(let i=0;i<12;i++)st.setItem('atlas_recovery_'+i,JSON.stringify({value:i}));
  st.setItem('atlas_backup_before_v3','old');st.setItem('atlas_backup_cloud_2026-11-26','cloud');
  st.setItem('atlas_sync_audit','technical');
  const archive=storageApi.captureLegacy(st),token=storageApi.cleanupToken(archive);
  assert.equal(archive.entries.length,14);
  assert.equal(storageApi.removeLegacy(st,token).length,14);
  assert.equal(st.getItem(STORE),'{"data":"main"}');
  assert.equal(st.getItem('atlas_sync_audit'),'technical');
  assert.deepEqual(storageApi.removeLegacy(st,token),[]);
});
test('cleanup refuses changed copies and can resume after interruption',()=>{
  const st=new MemoryStorage();st.setItem(STORE,'main');st.setItem('atlas_recovery_1','one');st.setItem('atlas_recovery_2','two');
  let token=storageApi.cleanupToken(storageApi.captureLegacy(st));
  st.setItem('atlas_recovery_2','updated');
  assert.throws(()=>storageApi.removeLegacy(st,token),/mudaram/);
  assert.equal(st.getItem('atlas_recovery_1'),'one');
  token=storageApi.cleanupToken(storageApi.captureLegacy(st));
  const remove=st.removeItem.bind(st);let calls=0;
  st.removeItem=k=>{if(++calls===2)throw Error('interrupted');remove(k)};
  assert.throws(()=>storageApi.removeLegacy(st,token),/interrupted/);
  st.removeItem=remove;
  assert.equal(storageApi.removeLegacy(st,token).length,1);
  assert.equal(st.getItem(STORE),'main');
});
test('legacy primary database is not removed before the canonical primary exists',()=>{
  const st=new MemoryStorage();st.setItem('atlas_somativa_v1','legacy');
  const token=storageApi.cleanupToken(storageApi.captureLegacy(st));
  assert.deepEqual(storageApi.removeLegacy(st,token),[]);
  st.setItem(STORE,'main');
  assert.deepEqual(storageApi.removeLegacy(st,token),['atlas_somativa_v1']);
});
test('compact three-way merge is equivalent to the original full baseline',()=>{
  const {S}=runtime(),b=snapshot(),compact=storageApi.compactBaseline(b);
  const localA=snapshot([row('a',11,'l1','r1'),row('b',20)]);
  const remoteB=snapshot([row('a',10),row('b',21,'r2','r1')]);
  const remoteA=snapshot([row('a',12,'r2','r1'),row('b',20)]);
  const deleted=snapshot([row('b',20)]);deleted.deletions=[{id:'grades:a',collection:'grades',recordId:'a',baseRevision:'r1',_revision:'d1'}];
  const settings=clone(b);settings.settings.starBonus=2;
  const settingsOther=clone(b);settingsOther.settings.starBonus=3;
  const cases=[[b,b],[localA,b],[b,remoteB],[localA,remoteB],[localA,remoteA],[deleted,b],[deleted,remoteA],[settings,settingsOther]];
  for(const [l,r] of cases){
    const full=S.merge(b,l,r),small=S.merge(compact,l,r);
    assert.deepEqual(clone(small),clone(full));
    assert.deepEqual(clone(S.recordConflicts(compact,l,r).map(x=>[x.key,x.id])),clone(S.recordConflicts(b,l,r).map(x=>[x.key,x.id])));
    for(const item of small.data.grades)assert.ok([...l.grades,...r.grades].some(v=>S.eq(v,item)));
  }
  assert.equal(S.merge(compact,localA,remoteB).conflicts.length,0);
  assert.equal(S.merge(compact,localA,remoteA).conflicts.length,1);
  assert.equal(S.merge(compact,deleted,b).data.grades.length,1);
  assert.ok(S.merge(compact,deleted,remoteA).conflicts.length>0);
});
test('individual conflict decisions and global merge precedence retain real values',()=>{
  const {S}=runtime(),base=snapshot(),local=snapshot([row('a',11,'l1','r1'),row('b',20)]),
    remote=snapshot([row('a',12,'r2','r1'),row('b',20)]);
  const compact=storageApi.compactBaseline(base);
  const pending={base:compact,local,remote};
  S.individualSelections['grades:a']='local';
  assert.equal(S.individualResult(pending).grades[0].score,11);
  S.individualSelections['grades:a']='remote';
  assert.equal(S.individualResult(pending).grades[0].score,12);
  assert.equal(S.combine(local,remote,'local').grades[0].score,11);
  assert.equal(S.combine(local,remote,'remote').grades[0].score,12);
});
test('100 successive local saves do not create full recovery copies',()=>{
  const {S,ctx,storage}=runtime();S.setBase(S.snapshot());
  ctx.googleToken='';ctx.navigator.onLine=false;
  for(let i=0;i<100;i++){
    ctx.db.grades[0].score=i;
    assert.equal(ctx.save(),true);
  }
  assert.equal(JSON.parse(storage.getItem(STORE)).grades[0].score,99);
  assert.deepEqual(storageApi.legacyKeys(storage),[]);
  assert.equal(storageApi.isCompact(JSON.parse(storage.getItem(BASE))),true);
});
test('automatic sync merges independent changes and never writes a recovery copy',async()=>{
  const r=runtime(),{S,storage}=r;S.setBase(S.snapshot());
  r.setLocal(snapshot([row('a',11,'l1','r1'),row('b',20)]));
  r.setRemote(snapshot([row('a',10),row('b',21,'r2','r1')]));
  await S.sync();
  assert.match(S.state,/^Sincronizado/);
  assert.equal(r.uploads(),1);
  assert.deepEqual(r.getRemote().grades.map(x=>x.score),[11,21]);
  assert.deepEqual(JSON.parse(storage.getItem(STORE)).grades.map(x=>x.score),[11,21]);
  assert.deepEqual(storageApi.legacyKeys(storage),[]);
  assert.equal(storageApi.matches(S.getBase(),S.snapshot()),true);
  await S.sync();assert.equal(r.uploads(),1);
});
test('automatic sync detects concurrent edits without publishing',async()=>{
  const r=runtime(),{S}=r;S.setBase(S.snapshot());
  r.setLocal(snapshot([row('a',11,'l1','r1'),row('b',20)]));
  r.setRemote(snapshot([row('a',12,'r2','r1'),row('b',20)]));
  await S.sync();assert.match(S.state,/^Conflito:/);assert.equal(r.uploads(),0);
  assert.equal(r.ctx.db.grades[0].score,11);
});
test('API failure does not alter the local database or the baseline',async()=>{
  const r=runtime(),{S,storage}=r;S.setBase(S.snapshot());
  r.setLocal(snapshot([row('a',11,'l1','r1'),row('b',20)]));
  const before=storage.getItem(STORE),baseline=storage.getItem(BASE);
  S.fetchCloud=async()=>{throw Error('network')};
  await S.sync();assert.match(S.state,/Por sincronizar/);
  assert.equal(storage.getItem(STORE),before);assert.equal(storage.getItem(BASE),baseline);
});
test('remote modification between comparison and upload blocks publication',async()=>{
  const r=runtime(),{S}=r;S.setBase(S.snapshot());
  r.setLocal(snapshot([row('a',11,'l1','r1'),row('b',20)]));
  let reads=0;
  S.fetchCloud=async()=>++reads===1?snapshot():snapshot([row('a',10),row('b',99,'r2','r1')]);
  await S.sync();assert.equal(r.uploads(),0);assert.match(S.state,/O Drive mudou/);
});
test('edit made locally while upload is in progress is not overwritten',async()=>{
  const r=runtime(),{S,ctx,storage}=r;S.setBase(S.snapshot());
  r.setLocal(snapshot([row('a',11,'l1','r1'),row('b',20)]));
  const baseline=storage.getItem(BASE),upload=S.upload;
  S.upload=async x=>{await upload(x);ctx.db.grades[0].score=15;ctx.save()};
  await S.sync();
  assert.equal(ctx.db.grades[0].score,15);
  assert.equal(JSON.parse(storage.getItem(STORE)).grades[0].score,15);
  assert.equal(storage.getItem(BASE),baseline);
  assert.match(S.state,/dados locais mudaram/i);
});
test('quota error never advances baseline or adopts unpersisted remote data',async()=>{
  const r=runtime(),{S,ctx,storage}=r;S.setBase(S.snapshot());
  const before=storage.getItem(STORE),baseline=storage.getItem(BASE);
  storage.limit=[...storage.map].reduce((n,[k,v])=>n+2*(k.length+v.length),0);
  r.setRemote(snapshot([{...row('a',12,'r2','r1'),note:'x'.repeat(10000)},row('b',20)]));
  await S.sync();assert.match(S.state,/Por sincronizar/);
  assert.equal(ctx.db.grades[0].score,10);
  assert.equal(storage.getItem(STORE),before);
  assert.equal(storage.getItem(BASE),baseline);
  assert.equal(ctx.save(),true);
  ctx.db.grades[0].note='x'.repeat(10000);
  assert.equal(ctx.save(),false);
  assert.equal(storage.getItem(STORE),before);
});
test('global conflict resolution supports both replacements and both merge modes',async()=>{
  for(const [choice,expected] of [['local',11],['remote',12],['mergeLocal',11],['mergeRemote',12]]){
    const r=runtime(),{S,storage}=r;S.setBase(S.snapshot());
    r.setLocal(snapshot([row('a',11,'l1','r1'),row('b',20)]));
    r.setRemote(snapshot([row('a',12,'r2','r1'),row('b',20)]));
    await S.sync();r.setChoice(choice);await S.resolveSelected();
    assert.match(S.state,/^Sincronizado/);
    assert.equal(r.ctx.db.grades[0].score,expected);
    assert.equal(r.getRemote().grades[0].score,expected);
    assert.deepEqual(storageApi.legacyKeys(storage),[]);
    assert.equal(storageApi.matches(S.getBase(),S.snapshot()),true);
  }
});
test('individual conflict resolution writes and verifies the selected record',async()=>{
  const r=runtime(),{S}=r;S.setBase(S.snapshot());
  r.setLocal(snapshot([row('a',11,'l1','r1'),row('b',20)]));
  r.setRemote(snapshot([row('a',12,'r2','r1'),row('b',20)]));
  await S.sync();
  S.individualSelections['grades:a']='local';r.setChoice('individual');await S.resolveSelected();
  assert.match(S.state,/^Sincronizado/);
  assert.equal(r.getRemote().grades[0].score,11);
  assert.equal(r.ctx.db.grades[0].score,11);
});
test('technical history archive failure is independent of database sync',async()=>{
  const r=runtime(),{S,ctx}=r;S.setBase(S.snapshot());
  vm.runInContext(source('sync-history.js'),ctx,{filename:'sync-history.js'});
  r.setLocal(snapshot([row('a',11,'l1','r1'),row('b',20)]));
  await S.sync();assert.match(S.state,/^Sincronizado/);
  assert.equal(r.getRemote().grades[0].score,11);
  assert.equal(await S.flushHistory(),false);
});
test('application sources do not contain automatic recovery writes',()=>{
  for(const name of ['index.html','enhancements.js','cloudsync.js','sync-resolver.js','sync-phase2.js']){
    const s=source(name);
    assert.doesNotMatch(s,/localStorage\.setItem\(['"]atlas_(?:recovery_|backup_)/);
    assert.doesNotMatch(s,/\bS\.backup\s*\(/);
  }
});
