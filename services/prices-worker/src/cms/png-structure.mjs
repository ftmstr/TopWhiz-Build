/**
 * Bounded PNG chunk/CRC and IHDR validator for rights-cleared R2 images.
 * It is NOT a pixel decoder or antivirus scanner. Limited to standard
 * RGBA/RGB 8-bit non-interlaced PNG to avoid unreviewed complex decoders.
 */
const SIG=[137,80,78,71,13,10,26,10];
function crc(bytes,start,end){
 let result=0xffffffff;
 for(let i=start;i<end;i++){
   result^=bytes[i];
   for(let b=0;b<8;b++)result=(result&1)?(result>>>1)^0xedb88320:result>>>1;
 }
 return (result^0xffffffff)>>>0;
}
export function validPngStructure(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<57||bytes.length>10485760 ||
    !SIG.every((v,i)=>bytes[i]===v))return false;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let position=8,first=true,seenData=false,seenEnd=false,chunkCount=0;
 while(position+12<=bytes.length&&chunkCount++<1024){
  const len=view.getUint32(position,false),typeStart=position+4;
  const dataStart=position+8,end=dataStart+len,checksumPos=end;
  if(len>10485760 || end+4>bytes.length)return false;
  if(crc(bytes,typeStart,end)!==view.getUint32(checksumPos,false))return false;
  const name=String.fromCharCode(...bytes.subarray(typeStart,typeStart+4));
  if(first){
    if(name!=="IHDR"||len!==13)return false;
    const width=view.getUint32(dataStart,false),height=view.getUint32(dataStart+4,false);
    if(width<1||height<1||width>8192||height>8192||width*height>16000000 ||
       bytes[dataStart+8]!==8||
       ![2,6].includes(bytes[dataStart+9]) ||
       bytes[dataStart+10]!==0||bytes[dataStart+11]!==0||
       bytes[dataStart+12]!==0)return false;
    first=false;
  }else if(name==="IHDR")return false;
  if(name==="IDAT"){if(len===0)return false;seenData=true}
  if(name==="IEND"){
    if(!seenData||len!==0||end+4!==bytes.length)return false;
    seenEnd=true;break;
  }
  position=end+4;
 }
 return seenEnd&&chunkCount<=1024;
}
