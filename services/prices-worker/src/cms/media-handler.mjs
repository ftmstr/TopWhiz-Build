/**
 * Controlled, read-only publication of R2 image bytes.
 * The media lookup MUST independently verify approval AND current published
 * content use. Object presence, a guessed asset ID, or model claims are not enough.
 */
const ID=/^[a-z0-9][a-z0-9_-]{0,95}$/;
const HASH=/^[a-f0-9]{64}$/;
const MIME_EXT=new Map([["image/png","png"],["image/jpeg","jpg"],["image/webp","webp"]]);
function answer(status){
  return new Response(null,{status,headers:{
    "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"no-referrer"
  }});
}
export async function handleCmsMedia(request,{findApprovedAsset,bucket}={}){
  const url=new URL(request.url);
  if(request.method!=="GET" && request.method!=="HEAD")return answer(405);
  if(url.search||url.hash)return answer(400);
  const match=/^\/v1\/media\/([a-z0-9_-]{1,96})$/.exec(url.pathname);
  if(!match||!ID.test(match[1]))return answer(404);
  if(typeof findApprovedAsset!=="function"||!bucket||typeof bucket.get!=="function")return answer(503);
  try{
    const asset=await findApprovedAsset(match[1]);
    const extension=MIME_EXT.get(asset?.contentType);
    if(!asset||asset.rightsApproved!==true||!extension||
       !HASH.test(asset.sha256Hex??"")||
       !Number.isInteger(asset.bytes)||asset.bytes<12||asset.bytes>10485760||
       !asset.key ||asset.key!==
         "media/reviewed/"+match[1]+"/"+asset.sha256Hex+"."+extension) return answer(404);
    const image=await bucket.get(asset.key);
    if(!image)return answer(404);
    if(image.size!==asset.bytes||
       image.customMetadata?.sha256!==asset.sha256Hex||
       image.httpMetadata?.contentType!==asset.contentType)return answer(503);
    const headers={
      "Content-Type":asset.contentType,
      "Content-Length":String(image.size),
      "Cache-Control":"no-store",
      "Content-Disposition":"inline",
      "X-Content-Type-Options":"nosniff",
      "Referrer-Policy":"no-referrer",
      "Content-Security-Policy":"default-src 'none'; sandbox"
    };
    return new Response(request.method==="HEAD"?null:image.body,{status:200,headers});
  }catch{return answer(503)}
}
