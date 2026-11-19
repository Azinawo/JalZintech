/* Cloudflare Pages Function: POST /api/sync  (setup | login | sync). Data lives in a D1 database bound as DB. */
const enc=new TextEncoder(),J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const ROLES=['owner','attendant','admin'],PERM={owner:['products','customers','sales','pay','sup','ord'],attendant:['sales'],admin:[]},
 PULL={owner:['products','customers','sales','pay','sup','ord'],attendant:['products','customers','sales','pay'],admin:['products','customers','sales','pay']};
async function sig(env,t){const k=await crypto.subtle.importKey('raw',enc.encode(env.SESSION_SECRET||env.SHOP_TOKEN||'unset'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return [...new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(t)))].map(x=>x.toString(16).padStart(2,'0')).join('')}
const mint=async(env,id)=>{const t=id+'.'+(Date.now()+30*864e5);return t+'.'+await sig(env,t)};
async function who(env,req){const p=(req.headers.get('authorization')||'').replace(/^Bearer /,'').split('.');if(p.length!=3||+p[1]<Date.now())return null;
 if(p[2]!==await sig(env,p[0]+'.'+p[1]))return null;const u=await env.DB.prepare('SELECT id,name,role,active FROM users WHERE id=?').bind(p[0]).first();return u&&u.active?u:null}
const okU=x=>x&&typeof x.id=='string'&&x.id.length<40&&typeof x.n=='string'&&x.n.length<80&&typeof x.h=='string'&&x.h.length<20&&ROLES.includes(x.r);
const putU=(env,x,role)=>env.DB.prepare('INSERT INTO users(id,name,role,active,h,updated) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO UPDATE SET name=?2,active=?4,h=?5,updated=?6').bind(x.id,x.n,role,x.on?1:0,x.h,Date.now());
const NEXT='(SELECT COALESCE(MAX(seq),0)+1 FROM recs)';
const put=(env,k,id,d,o)=>env.DB.prepare(`INSERT INTO recs(kind,id,data,owner,seq) VALUES(?1,?2,?3,?4,${NEXT}) ON CONFLICT(kind,id) DO UPDATE SET data=?3,owner=?4,seq=${NEXT}`).bind(k,id,JSON.stringify(d),o||'').run();
const get=(env,k,id)=>env.DB.prepare('SELECT data FROM recs WHERE kind=?1 AND id=?2').bind(k,id).first();
async function throttled(env,k){const r=await env.DB.prepare('SELECT n,t FROM lock WHERE k=?').bind(k).first();return !!(r&&r.n>=5&&Date.now()-r.t<6e5)}
const fail=(env,k)=>env.DB.prepare('INSERT INTO lock(k,n,t) VALUES(?1,1,?2) ON CONFLICT(k) DO UPDATE SET n=CASE WHEN ?2-t>600000 THEN 1 ELSE n+1 END,t=?2').bind(k,Date.now()).run();

export async function onRequestPost({request,env}){
 if(!env.DB)return J({error:'Database not configured'},500);
 let b;try{b=await request.json()}catch{return J({error:'Bad request'},400)}
 if(b.act=='setup'){
  if(!env.SHOP_TOKEN||b.code!==env.SHOP_TOKEN)return J({error:'Wrong setup code'},403);
  const c=await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();if(c.n>0)return J({error:'This shop is already set up. Connect from the sign-in screen instead.'},409);
  const L=(b.users||[]).filter(okU).slice(0,50),a=L.find(x=>x.id==b.me&&x.r=='admin')||L.find(x=>x.r=='admin');if(!a)return J({error:'An administrator is required'},400);
  for(const x of L)await putU(env,x,x.r).run();return J({token:await mint(env,a.id)})}
 if(b.act=='login'){
  const key=(b.id||String(b.name||'').toLowerCase())+'|'+(request.headers.get('cf-connecting-ip')||'');
  if(await throttled(env,key))return J({error:'Too many attempts. Try again in 10 minutes.'},429);
  const q=b.id?env.DB.prepare('SELECT id,name,role,active,h FROM users WHERE id=?').bind(b.id):env.DB.prepare('SELECT id,name,role,active,h FROM users WHERE lower(name)=lower(?)').bind(String(b.name||''));
  const u=(await q.all()).results.find(x=>x.active&&x.h===b.h);
  if(!u){await fail(env,key);return J({error:'Wrong name or PIN'},401)}
  await env.DB.prepare('DELETE FROM lock WHERE k=?').bind(key).run();return J({token:await mint(env,u.id),user:{id:u.id,n:u.name,r:u.role}})}
 if(b.act!='sync')return J({error:'Unknown action'},400);
 const u=await who(env,request);if(!u)return J({error:'Sign in again'},401);
 const push=b.push||{},known={};
 if(u.role=='admin')for(const x of (push.users||[]).slice(0,100)){if(!okU(x))continue;const ex=await env.DB.prepare('SELECT role FROM users WHERE id=?').bind(x.id).first();if(!ex&&x.r=='admin')continue;await putU(env,x,ex?ex.role:x.r).run()}
 for(const k of PERM[u.role])for(const x of (push[k]||[]).slice(0,500)){
  if(!x||typeof x.id!='string'||x.id.length>60||JSON.stringify(x).length>20000)continue;
  if(k=='sales'||k=='pay'){
   if(await get(env,k,x.id))continue;
   if(k=='sales'){if(known[x.u]===undefined)known[x.u]=!!await env.DB.prepare('SELECT 1 AS y FROM users WHERE id=? AND active=1').bind(x.u).first();if(!known[x.u])continue}
   await put(env,k,x.id,{...x,sy:1},u.id);
   if(k=='sales')for(const i of Array.isArray(x.it)?x.it:[]){const q=+i.q,r=q>0&&await get(env,'products',i.id);if(r){const d=JSON.parse(r.data);d.s=(+d.s||0)-q;await put(env,'products',i.id,d,'')}}
  }else if(k=='products'){const {ds,s,...f}=x,r=await get(env,k,x.id),o=r?JSON.parse(r.data):{s:0};await put(env,k,x.id,{...f,s:(+o.s||0)+(+ds||0)},u.id)}
  else await put(env,k,x.id,x,u.id)}
 const kinds=PULL[u.role],since=+b.since||0,LIM=2000,
  rows=(await env.DB.prepare(`SELECT kind,data,seq FROM recs WHERE seq>?1 AND kind IN (${kinds.map(k=>`'${k}'`).join(',')}) ORDER BY seq LIMIT ${LIM}`).bind(since).all()).results,
  more=rows.length==LIM,mx=more?rows[rows.length-1].seq:(await env.DB.prepare('SELECT COALESCE(MAX(seq),0) AS m FROM recs').first()).m,recs={};
 for(const r of rows)(recs[r.kind]=recs[r.kind]||[]).push(JSON.parse(r.data));
 const users=(await env.DB.prepare('SELECT id,name AS n,role AS r,active AS "on",h FROM users').all()).results;
 return J({seq:Math.max(mx,since),more,recs,users})}
