import catalog from "./generated/blank-starters.json";
import {UUID, type PackageFile} from "./assets";
import {digestFile, type LocalPackageFile} from "./transfer-client";

export interface BlankStarter {
  id:string; appId:string; name:string; description:string;
  files:Array<PackageFile & {url:string}>;
}
export const blankStarters:readonly BlankStarter[]=catalog as BlankStarter[];
// New versions precede retained recovery versions in the generated catalog.
export const currentBlankStarters=blankStarters.filter((starter,index)=>blankStarters.findIndex(item=>item.appId===starter.appId)===index);
export interface BlankRequest {version:1;projectId:string;assetId:string;templateId:string}
export const blankRequestKey=(projectId:string)=>`robyn-blank:${projectId}`;
export function readBlankRequest(storage:Pick<Storage,"getItem">,projectId:string):BlankRequest|null {
  const raw=storage.getItem(blankRequestKey(projectId));if(!raw)return null;
  const request=JSON.parse(raw) as BlankRequest;
  if(request?.version!==1||request.projectId!==projectId||!UUID.test(request.assetId)||!blankStarters.some(item=>item.id===request.templateId))
    throw Error("The saved document start could not be read. Keep this browser’s data and reload to recover it.");
  return request;
}
export async function blankFiles(starter:BlankStarter,signal?:AbortSignal):Promise<LocalPackageFile[]> {
  return Promise.all(starter.files.map(async expected=>{
    const response=await fetch(expected.url,{signal});
    if(!response.ok)throw Error("The blank document could not be loaded. Try again to continue the same document.");
    const file=new Blob([await response.arrayBuffer()],{type:expected.mimeType});
    if(file.size!==expected.bytes||await digestFile(file,signal)!==expected.sha256)throw Error("The blank document could not be verified. Reload and try again.");
    return {path:expected.path,role:expected.role,file};
  }));
}
