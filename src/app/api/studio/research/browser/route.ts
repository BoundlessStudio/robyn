import {agent37} from "@/lib/agent37";
import {ApiError,handleError,json} from "@/lib/http";
import {readStudioBody,id} from "@/studio/server";
import {researchBrowserOwner,changeResearchControl} from "@/studio/research-browser";
const privateJson=(value:unknown)=>{const response=json(value);response.headers.set("Cache-Control","no-store");response.headers.set("Referrer-Policy","no-referrer");return response;};
export async function GET(){
  try{const {employee}=await researchBrowserOwner();return privateJson({control:employee.browser_control,controlId:employee.browser_control_id});}catch(error){return handleError(error);}
}
export async function POST(request:Request){
  try{
    const input=await readStudioBody(request),owner=await researchBrowserOwner();
    if(input.action==="take"||input.action==="return"){
      const employee=await changeResearchControl(owner,id(input.controlId,"control ID"),input.action);
      return privateJson({control:employee.browser_control,controlId:employee.browser_control_id});
    }
    if(input.action!=="connect")throw new ApiError(400,"invalid_action","Choose connect, take or return.");
    const signed=await agent37.signedUrl(owner.instance.id,6901,60);
    const url=new URL(signed.url);url.protocol="wss:";url.pathname="/websockify";
    return privateJson({ws:url.href,control:owner.employee.browser_control,controlId:owner.employee.browser_control_id});
  }catch(error){return handleError(error);}
}
