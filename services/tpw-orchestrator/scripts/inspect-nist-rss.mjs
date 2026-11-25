/** Offline private RSS format inspection. No network, output files, staging, or rights approval. */
import {createHash} from 'node:crypto';
import {readOfficialSource} from '../src/official-source.mjs';
const feeds=Object.freeze({news:'https://www.nist.gov/news-events/news/rss.xml',cybersecurity:'https://www.nist.gov/news-events/cybersecurity/rss.xml'});
const MAX=256*1024;
const blocked={rights:'UNVERIFIED',release:'HARD_NO_GO',activation:false,transport:'OFFLINE_SUPPLIED_BYTES'};
let output={...blocked,status:'REJECTED',reason:'INPUT_INVALID'},bytes=0,digest=null;
try{
 const args=process.argv.slice(2);
 if(args.length!==1||!Object.hasOwn(feeds,args[0])||process.stdin.isTTY)throw Error('INPUT_INVALID');
 const hash=createHash('sha256'),chunks=[];
 for await(const chunk of process.stdin){
  bytes+=chunk.length;
  if(bytes>MAX)throw Error('MAX_BYTES');
  hash.update(chunk);chunks.push(chunk);
 }
 if(bytes===0)throw Error('EMPTY_RESPONSE');
 digest=hash.digest('hex');
 const body=Buffer.concat(chunks,bytes),endpoint=feeds[args[0]];
 const env={TPW_MODE:'LOCAL_DRY_RUN',TPW_RELEASE_GATE:'CLOSED',TPW_GITHUB_WRITES:'DISABLED',TPW1_SOURCE_FORMAT:'RSS',TPW1_FEED_URL:endpoint,TPW1_FEED_HOST:'www.nist.gov',TPW1_SOURCE_HOST:'www.nist.gov',TPW1_SOURCE_PUBLISHER:'NIST'};
 let calls=0;
 const result=await readOfficialSource(env,'TPW1',async(url,init)=>{
  if(++calls!==1||url!==endpoint||init.method!=='GET'||init.redirect!=='error')throw Error('OFFLINE_TRANSPORT_DENIED');
  return new Response(body,{status:200,headers:{'content-type':'application/rss+xml','content-length':String(bytes)}});
 },Date.now());
 if(calls!==1)throw Error('OFFLINE_TRANSPORT_DENIED');
 output={...blocked,status:'FORMAT_COMPATIBLE',feed:args[0],bytes,sha256:digest,parsed:result.stats.received,unique:result.approved.length,duplicates:result.stats.duplicates,remoteHttpVerified:false,sourceAuthenticityVerified:false};
}catch(e){
 const allowed=new Set(['INPUT_INVALID','MAX_BYTES','EMPTY_RESPONSE','XML_SIZE','XML_ENTITY_UNSUPPORTED','XML_UNSUPPORTED','XML_MISMATCH','XML_COMPLEXITY','XML_ATTRIBUTE','XML_ROOT','RSS_ROOT','XML_REQUIRED_FIELD','XML_MARKUP_FIELD','SOURCE_ITEM_LIMIT','SOURCE_ROW','ENDPOINT_NOT_ALLOWLISTED','SOURCE_IDENTITY_CONFLICT','SOURCE_CANDIDATE_INVALID','OFFLINE_TRANSPORT_DENIED']);
 output={...blocked,status:'REJECTED',reason:allowed.has(e?.message)?e.message:'FORMAT_INSPECTION_FAILED',...(digest?{bytes,sha256:digest}:{})};
 process.exitCode=1;
}
process.stdout.write(JSON.stringify(output)+'\n');
