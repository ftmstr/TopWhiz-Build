/**
 * Entirely original synthetic PNG fixture. Generates full IHDR/IDAT/IEND
 * chunks with valid CRCs and compressed RGBA pixel scanlines, not a mere
 * 12-byte signature stand-in. No copyrighted/manufacturer photos.
 */
import {deflateSync} from "node:zlib";
const sig=Buffer.from([137,80,78,71,13,10,26,10]);
function crc(bytes){
 let acc=0xffffffff;
 for(const v of bytes){
  acc^=v;
  for(let i=0;i<8;i++)acc=acc&1?(acc>>>1)^0xedb88320:acc>>>1;
 }
 return (acc^0xffffffff)>>>0;
}
function chunk(tag,body){
 const label=Buffer.from(tag,"ascii");
 const length=Buffer.alloc(4);length.writeUInt32BE(body.length);
 const digest=Buffer.alloc(4);digest.writeUInt32BE(crc(Buffer.concat([label,body])));
 return Buffer.concat([length,label,body,digest]);
}
export function makeSyntheticPng(width=4,height=3){
 if(!Number.isInteger(width)||!Number.isInteger(height)||
    width<1||height<1||width*height>1000000)throw Error("invalid_fixture_dimensions");
 const hdr=Buffer.alloc(13);
 hdr.writeUInt32BE(width,0);hdr.writeUInt32BE(height,4);hdr[8]=8;hdr[9]=6;
 const scanlines=Buffer.alloc(height*(1+width*4));
 for(let y=0;y<height;y++){
  const base=y*(1+width*4);
  scanlines[base]=0;
  for(let x=0;x<width;x++){
   let offset=base+1+x*4;
   scanlines[offset]=(x*79+y*23)%256;
   scanlines[offset+1]=(x*37+y*89)%256;
   scanlines[offset+2]=(x*17+y*43)%256;
   scanlines[offset+3]=255;
  }
 }
 return new Uint8Array(Buffer.concat([
   sig,chunk("IHDR",hdr),chunk("IDAT",deflateSync(scanlines)),
   chunk("IEND",Buffer.alloc(0))
 ]));
}
