/** Isolated local preview. Never serve the repository, CMS, or any media. */
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const routes=new Map([['/',['index.html','text/html; charset=utf-8']],['/site.css',['site.css','text/css; charset=utf-8']],['/site.js',['site.js','text/javascript; charset=utf-8']]].map(([route,[file,mime]])=>[route,{bytes:readFileSync(new URL(file,import.meta.url)),mime}]));
const headers={'Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'none'; media-src 'none'; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"};
export async function startLocalText(port=8788,{loadNews,loadPhones}={}){
 if(loadNews!==undefined&&typeof loadNews!=='function')throw Error('INVALID_NEWS_LOADER');
 if(loadPhones!==undefined&&typeof loadPhones!=='function')throw Error('INVALID_PHONE_LOADER');
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('INVALID_PORT');
 const server=http.createServer(async(req,res)=>{
  const deny=status=>{res.writeHead(status,{...headers,'Content-Length':'0'});res.end()};
  if(req.headers.host!=='127.0.0.1:'+server.address().port)return deny(403);
  if(!['GET','HEAD'].includes(req.method))return deny(405);
  if(req.headers.range!==undefined)return deny(416);
  const asset=routes.get(req.url);
  if(!asset)return deny(404);
  let bytes=asset.bytes;
  if(req.url==='/'&&loadNews){
   try{
    const snapshot=await loadNews();
    const safe=JSON.stringify(snapshot).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    bytes=Buffer.from(asset.bytes.toString('utf8').replace('</body>',()=>'<template id="projection-data">'+safe+'</template></body>'));
   }catch{return deny(503)}
  }
  if(req.url==='/'&&loadPhones){
   try{
    const snapshot=await loadPhones();
    const safe=JSON.stringify(snapshot).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    bytes=Buffer.from(bytes.toString('utf8').replace('</body>',()=>'<template id="phone-projection-data">'+safe+'</template></body>'));
   }catch{return deny(503)}
  }
  res.writeHead(200,{...headers,'Content-Type':asset.mime,'Content-Length':bytes.length});
  res.end(req.method==='HEAD'?undefined:bytes);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
 return {server,url:'http://127.0.0.1:'+server.address().port+'/'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==2)throw Error('NO_PUBLIC_HOST_OR_OPTIONS');
 const {url}=await startLocalText();
 console.log('HARD NO-GO · synthetic local preview: '+url);
}
