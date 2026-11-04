import {deflateRawSync} from 'node:zlib';

const table=Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
export function zipFiles(entries){
  const body=[],central=[];let offset=0,size=0;
  for(const entry of entries){
    const name=Buffer.from(entry.path),bytes=Buffer.from(entry.bytes??''),method=entry.method??8,flags=entry.flags??0x800;
    const compressed=method===8?deflateRawSync(bytes):bytes;
    let crc=0xffffffff;for(const byte of bytes)crc=table[(crc^byte)&255]^(crc>>>8);crc=(crc^0xffffffff)>>>0;
    const local=Buffer.alloc(30+name.length);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(flags,6);local.writeUInt16LE(method,8);
    local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(entry.declaredBytes??bytes.length,22);local.writeUInt16LE(name.length,26);name.copy(local,30);
    const record=Buffer.alloc(46+name.length);record.writeUInt32LE(0x02014b50);record.writeUInt16LE(0x0314,4);record.writeUInt16LE(20,6);record.writeUInt16LE(flags,8);record.writeUInt16LE(method,10);
    record.writeUInt32LE(crc,16);record.writeUInt32LE(compressed.length,20);record.writeUInt32LE(entry.declaredBytes??bytes.length,24);record.writeUInt16LE(name.length,28);record.writeUInt32LE(((entry.mode??(entry.path.endsWith('/')?0x41ed:0x81a4))*65536)>>>0,38);record.writeUInt32LE(offset,42);name.copy(record,46);
    body.push(local,compressed);central.push(record);offset+=local.length+compressed.length;size+=record.length;
  }
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(size,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...body,...central,end]);
}
