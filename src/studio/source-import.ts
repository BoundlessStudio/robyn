import {validatePackagePath, type RevisionPackage} from "./assets";

export type SourceKind = "image" | "audio" | "video";
const formats: Record<string, [SourceKind, string]> = {
  png:["image","image/png"], jpg:["image","image/jpeg"], jpeg:["image","image/jpeg"],
  svg:["image","image/svg+xml"], webp:["image","image/webp"], gif:["image","image/gif"],
  wav:["audio","audio/wav"], mp3:["audio","audio/mpeg"], flac:["audio","audio/flac"],
  ogg:["audio","audio/ogg"], m4a:["audio","audio/mp4"],
  mp4:["video","video/mp4"], mov:["video","video/quicktime"], webm:["video","video/webm"],
};

export function sourceFormat(filename: string) {
  const format = formats[filename.split(".").pop()?.toLowerCase() ?? ""];
  return format ? {kind:format[0], mimeType:format[1]} : null;
}

/** Metadata policy is shared with the owner-authorized BFF. Source files never
 * acquire an owning Craft or masquerade as editable native documents. */
export function validateSourcePackage(pkg: RevisionPackage): SourceKind {
  const master=pkg.files.find(file=>file.role==="master");
  const format=master&&sourceFormat(master.path);
  if(!master||!format||master.mimeType!==format.mimeType||master.bytes>256*1024**2||pkg.dependencies.length)throw Error("Choose a supported image, audio or video file up to 256 MiB.");
  const exports=pkg.files.filter(file=>file.role!=="master");
  if(exports.length>(format.kind==="image"?1:0)||exports.some(file=>file.role!=="export"||file.path!==`exports/${master.path}`||file.bytes!==master.bytes||file.sha256!==master.sha256||file.mimeType!==master.mimeType))throw Error("A source import must preserve its original file.");
  return format.kind;
}

export async function sourceImportFiles(file:File) {
  validatePackagePath(file.name);
  const format=sourceFormat(file.name);
  if(!format||!file.size||file.size>256*1024**2)throw Error("Choose a supported image, audio or video file up to 256 MiB.");
  const head=new Uint8Array(await file.slice(0,512).arrayBuffer());
  const ascii=(offset:number,value:string)=>Array.from(head.slice(offset,offset+value.length),byte=>String.fromCharCode(byte)).join("")===value;
  // Catch accidental renames before writing. This is a container signature
  // check; the chosen Craft still determines supported media codecs/content.
  const valid:Record<string,boolean>={
    "image/png":[137,80,78,71,13,10,26,10].every((b,i)=>head[i]===b),
    "image/jpeg":head[0]===255&&head[1]===216&&head[2]===255,
    "image/gif":ascii(0,"GIF87a")||ascii(0,"GIF89a"),
    "image/webp":ascii(0,"RIFF")&&ascii(8,"WEBP"),
    "audio/wav":ascii(0,"RIFF")&&ascii(8,"WAVE"),
    "audio/mpeg":ascii(0,"ID3")||head[0]===255&&(head[1]&0xe0)===0xe0,
    "audio/flac":ascii(0,"fLaC"), "audio/ogg":ascii(0,"OggS"),
    "audio/mp4":ascii(4,"ftyp"), "video/mp4":ascii(4,"ftyp"),
    "video/quicktime":ascii(4,"ftyp")||ascii(4,"moov")||ascii(4,"mdat")||ascii(4,"wide"),
    "video/webm":[0x1a,0x45,0xdf,0xa3].every((b,i)=>head[i]===b),
  };
  if(format.mimeType==="image/svg+xml"){
    if(file.size>32*1024**2)throw Error("SVG sources must be no larger than 32 MiB.");
    const svg=await file.text();
    if(!/<svg(?:\s|>)/i.test(svg)||/<!ENTITY|<!DOCTYPE/i.test(svg))throw Error("Choose a standalone SVG file without an external document definition.");
  }else if(!valid[format.mimeType])throw Error("The file contents do not match its extension. Export it in its original application and try again.");
  const original=file.slice(0,file.size,format.mimeType);
  // Existing Craft insertion adapters look for an export when placing images.
  // Preserve the exact original as that export; this does not flatten a master.
  return [{path:file.name,role:"master" as const,file:original},...(format.kind==="image"?[{path:`exports/${file.name}`,role:"export" as const,file:original}]:[])];
}
