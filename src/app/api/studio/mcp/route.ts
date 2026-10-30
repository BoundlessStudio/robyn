import { ApiError, json } from "@/lib/http";
import { requireEmployee } from "@/studio/employee-auth";
import { employeeToolsFor, employeeToolCall } from "@/studio/employee-tools";
import { readMetadataBody } from "@/studio/server";

export const maxDuration=60;
const errorResult=(id:unknown,code:number,message:string)=>({jsonrpc:"2.0",id,error:{code,message}});
export async function POST(request:Request){
  let requestId:unknown=null;
  try{
    const auth=await requireEmployee(request);
    const input=await readMetadataBody(request);
    requestId=input.id??null;
    if(input.jsonrpc!=="2.0"||typeof input.method!=="string"||(input.id!==undefined&&typeof input.id!=="string"&&typeof input.id!=="number"))return json(errorResult(null,-32600,"Invalid JSON-RPC request."),400);
    if(input.id===undefined){
      if(input.method!=="notifications/initialized"&&input.method!=="notifications/cancelled")return json(errorResult(null,-32601,"Unknown notification."),400);
      return new Response(null,{status:202,headers:{"Cache-Control":"no-store"}});
    }
    const params=input.params&&typeof input.params==="object"&&!Array.isArray(input.params)?input.params as Record<string,unknown>:{};
    let result:unknown;
    if(input.method==="initialize"){
      const versions=["2025-11-25","2025-06-18","2025-03-26"];
      result={protocolVersion:versions.includes(String(params.protocolVersion))?params.protocolVersion:versions[0],capabilities:{tools:{}},serverInfo:{name:"robyn-studio",version:"0.1.0"},instructions:"Work only on the assigned project. Native file bytes transfer directly to private Storage. Saved revisions are immutable; preserve conflicts."};
    }else if(input.method==="ping")result={};
    else if(input.method==="tools/list")result={tools:employeeToolsFor(auth.scope)};
    else if(input.method==="tools/call"){
      if(typeof params.name!=="string"||!params.arguments||typeof params.arguments!=="object"||Array.isArray(params.arguments))return json(errorResult(requestId,-32602,"Supply a tool name and an arguments object."),400);
      try{
        const value=await employeeToolCall(auth,params.name,params.arguments as Record<string,unknown>);
        result={content:[{type:"text",text:JSON.stringify(value)}],structuredContent:value,isError:false};
      }catch(error){
        if(!(error instanceof ApiError))throw error;
        result={content:[{type:"text",text:JSON.stringify({error:{code:error.code,message:error.message}})}],isError:true};
      }
    }else return json(errorResult(requestId,-32601,"Method not found."));
    return json({jsonrpc:"2.0",id:requestId,result});
  }catch(error){
    if(error instanceof ApiError)return json(errorResult(requestId,-32000,error.message),error.status);
    console.error("[studio-mcp] request failed");
    return json(errorResult(requestId,-32603,"The studio could not complete this request."),500);
  }
}
// Stateless POST responses use JSON; this server offers no unsolicited SSE stream.
export async function GET(request:Request){
  try{await requireEmployee(request);return new Response(null,{status:405,headers:{Allow:"POST","Cache-Control":"no-store"}});}
  catch(error){return json(errorResult(null,-32000,error instanceof ApiError?error.message:"Employee access denied."),error instanceof ApiError?error.status:500);}
}
