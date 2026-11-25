/** Isolated local preview. Never serve the repository, CMS, or any media. */
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const routes=new Map([['/',['index.html','text/html; charset=utf-8']],['/site.css',['site.css','text/css; charset=utf-8']],['/site.js',['site.js','text/javascript; charset=utf-8']]].map(([route,[file,mime]])=>[route,{bytes:readFileSync(new URL(file,import.meta.url)),mime}]));
const headers={'Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'none'; media-src 'none'; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"};
export async function startLocalText(port=8788){
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('INVALID_PORT');
 const server=http.createServer((req,res)=>{
  const deny=status=>{res.writeHead(status,{...headers,'Content-Length':'0'});res.end()};
  if(req.headers.host!=='127.0.0.1:'+server.address().port)return deny(403);
  if(!['GET','HEAD'].includes(req.method))return deny(405);
  if(req.headers.range!==undefined)return deny(416);
  const asset=routes.get(req.url);
  if(!asset)return deny(404);
  res.writeHead(200,{...headers,'Content-Type':asset.mime,'Content-Length':asset.bytes.length});
  res.end(req.method==='HEAD'?undefined:asset.bytes);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
 return {server,url:'http://127.0.0.1:'+server.address().port+'/'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==2)throw Error('NO_PUBLIC_HOST_OR_OPTIONS');
 const {url}=await startLocalText();
 console.log('HARD NO-GO · synthetic local preview: '+url);
}
