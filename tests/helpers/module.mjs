import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Bundle the real route/helper and replace only external boundaries.
export async function loadModule(relative, mocks) {
  const result = await build({entryPoints:[fileURLToPath(new URL(relative,import.meta.url))],bundle:true,write:false,platform:"node",format:"cjs",packages:"external",
    plugins:[{name:"test-boundaries",setup(build){
      build.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:"fixture"}:undefined);
      build.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:mocks[args.path],loader:"js"}));
    }}]});
  const module={exports:{}};
  new Function("require","module","exports",result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  return module.exports;
}
export const httpMock=`export class ApiError extends Error {constructor(status,code,message){super(message);this.status=status;this.code=code;}}
  export const json=data=>Response.json(data);export const readJson=request=>request.json();
  export const handleError=error=>Response.json({error:{code:error.code??'internal_error'}},{status:error.status??500});`;
