// Only signed incoming events for the support inbox can reach the forwarding
// API. The worker never reads message bodies or attachments into its logs.
export const INBOX_ID = "d0e3b5da-bc23-40bb-9026-d745edc5c76b";
export const FORWARD_TO = "developer@venatiostudios.com";
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const bytes = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const reply = status => new Response(null,{status,headers:{"Cache-Control":"no-store"}});

async function verified(request, secret, now) {
  const id=request.headers.get("svix-id"),timestamp=request.headers.get("svix-timestamp");
  if(!id||!/^\d+$/.test(timestamp??"")||Math.abs(now/1000-Number(timestamp))>300)return null;
  const reader=request.body?.getReader();if(!reader)return null;
  const chunks=[];let size=0;
  while(true){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144){await reader.cancel();return null;}chunks.push(value);}
  const buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}
  const body=new TextDecoder("utf-8",{fatal:true}).decode(buffer);
  const key=await crypto.subtle.importKey("raw",bytes(secret.replace(/^whsec_/,"")),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  const message=new TextEncoder().encode(`${id}.${timestamp}.${body}`);
  for(const signature of (request.headers.get("svix-signature")??"").split(" ")){
    const[version,value]=signature.split(",");
    if(version==="v1"&&value&&await crypto.subtle.verify("HMAC",key,bytes(value),message))return JSON.parse(body);
  }
  return null;
}

export async function forwardSupport(request,env,send=(url,options)=>fetch(url,options),now=Date.now()) {
  if(request.method!=="POST"||new URL(request.url).pathname!=="/inbound")return reply(404);
  if(!env.RESEND_API_KEY||!env.RESEND_WEBHOOK_SECRET)return reply(503);
  let event;try{event=await verified(request,env.RESEND_WEBHOOK_SECRET,now);}catch{return reply(401);}
  if(!event)return reply(401);
  const data=event.data;
  if(event.type!=="inbox.email.received"||data?.inbox_id!==INBOX_ID)return reply(204);
  if(!uuid.test(data.thread_id??"")||!uuid.test(data.email_id??""))return reply(400);
  // Resend's idempotency key lasts 24 hours. Older replays require an operator
  // to inspect Sent before forwarding manually; time never permits a duplicate.
  const age=now-Date.parse(event.created_at);
  if(!Number.isFinite(age)||age>20*3600000||age< -300000)return reply(409);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  let response;
  try{response=await send(`https://api.resend.com/inboxes/${INBOX_ID}/threads/${data.thread_id}/emails/${data.email_id}/forward`,{
    method:"POST",redirect:"manual",signal:controller.signal,
    headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,"Content-Type":"application/json","User-Agent":"RobynSupportForwarder/1.0 (https://robyn.academy)","Idempotency-Key":`support-forward/${data.email_id}`},
    body:JSON.stringify({to:[FORWARD_TO]}),
  });}finally{clearTimeout(timer);}
  return response.ok?reply(204):new Response(null,{status:502,headers:{"Cache-Control":"no-store","X-Provider-Status":String(response.status)}});
}
export default {async fetch(request,env){try{return await forwardSupport(request,env);}catch(error){
  const category=error?.message?.includes("Illegal invocation")?"binding":error?.name==="TimeoutError"?"timeout":error instanceof TypeError?"request":"unavailable";
  return new Response(null,{status:502,headers:{"Cache-Control":"no-store","X-Forwarding-Error":category}});
}}};
