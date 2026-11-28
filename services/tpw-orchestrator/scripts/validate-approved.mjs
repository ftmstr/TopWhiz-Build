#!/usr/bin/env node
/** CI checks approved-only JSON shapes. NOT independent fact or rights attestation. */
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {publicationGate,safeApprovedPath} from '../src/policy.mjs';
const root=path.resolve(process.argv[2]||'content-approved');let files=[];
async function walk(dir){
 let entries;try{entries=await readdir(dir,{withFileTypes:true})}catch(e){if(e.code==='ENOENT')return;throw e}
 for(const x of entries){const file=path.join(dir,x.name);
  if(x.isSymbolicLink())throw new Error('SYMLINK_FORBIDDEN');
  if(x.isDirectory())await walk(file);
  else if(x.isFile()){if(!file.endsWith('.json'))throw new Error('CONTENT_FILE_NOT_JSON');files.push(file)}
 }
}
await walk(root);
for(const file of files){
 const rel=path.relative(root,file).split(path.sep).join('/');
 const text=await readFile(file,'utf8');if(text.length>60000)throw new Error('CONTENT_OVERSIZE');
 const doc=JSON.parse(text),result=publicationGate(doc,{releaseGate:'OPEN'});
 if(!result.ok)throw new Error('CONTENT_POLICY:'+rel+':'+result.errors.join(','));
 if(rel!==safeApprovedPath(doc).slice('content-approved/'.length))throw new Error('CONTENT_PATH');
}
console.log(JSON.stringify({result:'CI_SHAPE_ONLY',count:files.length,publication:'HARD_NO_GO'}));
