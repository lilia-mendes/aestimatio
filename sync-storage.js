'use strict';
/* Single persistent database. Compact three-way comparison references, no data backups. */
(function(root){
  const PREFIX='atlas_sync_baseline_';
  const FORMAT='aestimatio-baseline-v2';
  const MAIN_DB='atlas_sumativa_v1', LEGACY_DB='atlas_somativa_v1';
  const MARK=Symbol('baseline fingerprint');
  const K=[
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const rot=(x,n)=>(x>>>n)|(x<<(32-n));
  function sha256(text){
    const bytes=new TextEncoder().encode(text), n=bytes.length;
    const padded=new Uint8Array(Math.ceil((n+9)/64)*64);
    padded.set(bytes);padded[n]=128;
    const view=new DataView(padded.buffer);
    view.setUint32(padded.length-8,Math.floor(n/0x20000000));
    view.setUint32(padded.length-4,(n*8)>>>0);
    const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const w=new Uint32Array(64);
    for(let offset=0;offset<padded.length;offset+=64){
      for(let i=0;i<16;i++)w[i]=view.getUint32(offset+i*4);
      for(let i=16;i<64;i++){
        const a=w[i-15],b=w[i-2];
        w[i]=(w[i-16]+(rot(a,7)^rot(a,18)^(a>>>3))+w[i-7]+(rot(b,17)^rot(b,19)^(b>>>10)))>>>0;
      }
      let [a,b,c,d,e,f,g,h]=H;
      for(let i=0;i<64;i++){
        const t1=(h+(rot(e,6)^rot(e,11)^rot(e,25))+((e&f)^(~e&g))+K[i]+w[i])>>>0;
        const t2=((rot(a,2)^rot(a,13)^rot(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
        h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
      }
      const next=[a,b,c,d,e,f,g,h];for(let i=0;i<8;i++)H[i]=(H[i]+next[i])>>>0;
    }
    return H.map(x=>x.toString(16).padStart(8,'0')).join('');
  }
  const fingerprint=value=>sha256(JSON.stringify(value)??'undefined');
  const digest=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
  const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  function isCompact(x){
    return object(x)&&x.format===FORMAT&&object(x.settings)&&object(x.records)&&
      Object.values(x.settings).every(digest)&&Object.values(x.records).every(rows=>Array.isArray(rows)&&
        rows.every(r=>Array.isArray(r)&&r.length===3&&typeof r[0]==='string'&&
          (r[1]===null||typeof r[1]==='string')&&digest(r[2]))&&new Set(rows.map(r=>r[0])).size===rows.length);
  }
  function compactBaseline(data,meta=null,confirmedAt=null){
    if(isCompact(data))return data;
    if(!object(data)||!object(data.settings))throw Error('Referência de sincronização inválida.');
    const settings=Object.fromEntries(Object.entries(data.settings).map(([k,v])=>[k,fingerprint(v)]));
    const records=Object.fromEntries(Object.entries(data).filter(([,v])=>Array.isArray(v)).map(([k,rows])=>[k,rows.map(r=>{
      if(!r||typeof r.id!=='string'||!r.id)throw Error('Registo inválido na referência de sincronização.');
      return [r.id,r._revision??null,fingerprint(r)];
    })]));
    const out={format:FORMAT,settings,records,remoteRevision:meta?.revision??null,
      publishedAt:meta?.publishedAt??null,publisher:meta?.publisher??null,confirmedAt};
    if(!isCompact(out))throw Error('Não foi possível compactar a referência de sincronização.');
    return out;
  }
  function placeholder(id,revision,hash){
    const x={};
    if(id!==undefined)x.id=id;
    if(revision!==null)x._revision=revision;
    Object.defineProperty(x,MARK,{value:hash});
    return x;
  }
  function equal(a,b){
    const ah=a?.[MARK],bh=b?.[MARK];
    if(ah||bh)return (ah||fingerprint(a))===(bh||fingerprint(b));
    return JSON.stringify(a)===JSON.stringify(b);
  }
  /* Recreate only the comparison view in RAM. If neither current version
     matches the reference, use a fingerprint-only sentinel, never a data record.
     Three-way merge must select values exclusively from local or remote. */
  function comparisonBase(base,local,remote){
    if(!isCompact(base))return base;
    const out={settings:{}};
    for(const [k,h] of Object.entries(base.settings)){
      const l=local.settings?.[k],r=remote.settings?.[k];
      out.settings[k]=fingerprint(l)===h?l:fingerprint(r)===h?r:placeholder(undefined,null,h);
    }
    const keys=new Set([...Object.keys(base.records),...Object.keys(local).filter(k=>Array.isArray(local[k])),
      ...Object.keys(remote).filter(k=>Array.isArray(remote[k]))]);
    for(const k of keys){
      const l=new Map((local[k]||[]).map(x=>[x.id,x])),r=new Map((remote[k]||[]).map(x=>[x.id,x]));
      out[k]=(base.records[k]||[]).map(([id,revision,h])=>{
        const lv=l.get(id),rv=r.get(id);
        return lv!==undefined&&fingerprint(lv)===h?lv:rv!==undefined&&fingerprint(rv)===h?rv:placeholder(id,revision,h);
      });
    }
    return out;
  }
  function matches(base,data){
    if(!base)return false;
    const b=isCompact(base)?base:compactBaseline(base),d=compactBaseline(data);
    const settings=new Set([...Object.keys(b.settings),...Object.keys(d.settings)]);
    for(const k of settings)if(b.settings[k]!==d.settings[k])return false;
    const keys=new Set([...Object.keys(b.records),...Object.keys(d.records)]);
    for(const k of keys)if(JSON.stringify(b.records[k]||[])!==JSON.stringify(d.records[k]||[]))return false;
    return true;
  }
  function keys(storage){return Array.from({length:storage.length},(_,i)=>storage.key(i)).filter(k=>typeof k==='string')}
  function readBaseline(storage,key){
    try{
      const raw=storage.getItem(key);if(!raw)return null;
      const parsed=JSON.parse(raw);
      if(isCompact(parsed))return parsed;
      if(parsed?.format===FORMAT)return null;
      return compactBaseline(parsed);
    }catch(e){return null}
  }
  function migrateBaselines(storage){
    const converted=[],failed=[];
    for(const key of keys(storage).filter(k=>k.startsWith(PREFIX))){
      try{
        const raw=storage.getItem(key),parsed=JSON.parse(raw);
        if(isCompact(parsed))continue;
        if(parsed?.format===FORMAT)throw Error('Referência compacta inválida.');
        // Replace the same key, never allocate a second persistent copy.
        storage.setItem(key,JSON.stringify(compactBaseline(parsed)));
        converted.push(key);
      }catch(e){failed.push(key)}
    }
    return {converted,failed};
  }
  function isLegacyKey(key){
    return key===LEGACY_DB||key==='atlas_backup_before_v3'||
      key.startsWith('atlas_recovery_')||key.startsWith('atlas_backup_cloud_')||
      key.startsWith('atlas_backup_pre_regimes_');
  }
  function legacyKeys(storage){return keys(storage).filter(isLegacyKey).sort()}
  function captureLegacy(storage){
    return {format:'aestimatio-legacy-archive-v1',createdAt:new Date().toISOString(),
      entries:legacyKeys(storage).map(key=>({key,raw:storage.getItem(key)}))};
  }
  function cleanupToken(archive){
    return archive.entries.map(({key,raw})=>({key,hash:fingerprint(raw)}));
  }
  function removeLegacy(storage,token){
    if(!Array.isArray(token)||token.some(x=>!x||!isLegacyKey(x.key)||!digest(x.hash)))throw Error('Arquivo de salvaguarda inválido.');
    // Check every still-present entry before removing anything.
    for(const {key,hash} of token){
      const raw=storage.getItem(key);
      if(raw!==null&&fingerprint(raw)!==hash)throw Error('As cópias antigas mudaram. Descarrega um novo arquivo antes de limpar.');
    }
    const removed=[];
    for(const {key} of token){
      if(storage.getItem(key)===null)continue;
      if(key===LEGACY_DB&&!storage.getItem(MAIN_DB))continue;
      storage.removeItem(key);removed.push(key);
    }
    return removed;
  }
  const api={fingerprint,equal,isCompact,compactBaseline,comparisonBase,matches,readBaseline,
    migrateBaselines,legacyKeys,captureLegacy,cleanupToken,removeLegacy};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.AtlasSyncStorage=api;
})(typeof globalThis!=='undefined'?globalThis:this);
