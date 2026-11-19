/* Cloudflare Pages Function: POST /api/sms  {to, message}. Keeps the Arkesel key off the phones. */
export async function onRequestPost({request,env}){
 const j=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});
 if(env.SHOP_TOKEN&&request.headers.get('x-shop-token')!==env.SHOP_TOKEN)return j({error:'unauthorized'},401);
 let b;try{b=await request.json()}catch{return j({error:'bad request'},400)}
 let n=String(b.to||'').replace(/\D/g,'');
 if(/^0\d{9}$/.test(n))n='233'+n.slice(1);
 if(!/^233\d{9}$/.test(n))return j({error:'invalid phone number'},400);
 const message=String(b.message||'').slice(0,600);if(!message)return j({error:'empty message'},400);
 if(!env.ARKESEL_API_KEY)return j({error:'gateway not configured'},500);
 const r=await fetch('https://sms.arkesel.com/api/v2/sms/send',{method:'POST',headers:{'api-key':env.ARKESEL_API_KEY,'Content-Type':'application/json'},
  body:JSON.stringify({sender:env.SMS_SENDER||'JalZintech',message,recipients:[n]})});
 return j({ok:r.ok},r.ok?200:502)}
