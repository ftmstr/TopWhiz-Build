/** Checkout-bound source integrity, not a signed supplier or portable runtime attestation. */
import {readFileSync,readdirSync,lstatSync,writeFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,dirname,relative} from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../../apps/web/package.json',import.meta.url));
const base='services/tpw-orchestrator/',manifest=resolve(root,base+'unified-demo.sha256.json'),inventory=resolve(root,base+'unified-demo-licenses.json');
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
function regular(p){const stat=lstatSync(p);if(!stat.isFile()||stat.isSymbolicLink())throw Error('DEMO_NOT_REGULAR');return p}
function files(){
 const f=['LICENSE','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','apps/web/package.json','scripts/tur011-license-gate.mjs',base+'wrangler.ci-d1.jsonc',base+'ci/news-projection-d1.mjs',base+'scripts/unified-demo.mjs',base+'scripts/unified-demo-integrity.mjs',base+'unified-demo-licenses.json','local-text/TOPWHIZ-DINAMIK-BASLAT.cmd','local-text/TOPWHIZ-DINAMIK-HAZIRLA.cmd','local-text/README_DYNAMIC_TR.txt','local-text/index.html','local-text/site.css','local-text/site.js','local-text/server.mjs'];
 for(const [d,ext] of [[base+'src/','.mjs'],[base+'migrations/','.sql'],['packages/tpw-content/','.json']])for(const n of readdirSync(resolve(root,d)))if(n.endsWith(ext))f.push(d+n);
 return f.sort().map(p=>[p,hash(regular(resolve(root,p)))]);
}
function dependencies(){
 if(Number(process.versions.node.split('.')[0])!==22)throw Error('DEMO_NODE_22_REQUIRED');
 const p=JSON.parse(readFileSync(require.resolve('wrangler/package.json'),'utf8'));
 if(p.version!=='4.158.0'||!['MIT','Apache-2.0','MIT OR Apache-2.0'].includes(p.license))throw Error('DEMO_WRANGLER_PIN_OR_LICENSE');
 const report=JSON.parse(readFileSync(regular(inventory),'utf8'));
 if(report.scanComplete!==true||!Number.isSafeInteger(report.checked)||report.checked<1||!Array.isArray(report.unknownLicenses)||report.unknownLicenses.some(x=>x!=='LGPL-3.0-or-later')||report.approved!==!report.unknownLicenses.length)throw Error('DEMO_LICENSE_REPORT');
 if(!report.approved)console.log('LICENSE REVIEW BLOCKER: local use only; no redistribution or release');
 const config=JSON.parse(readFileSync(resolve(root,base+'wrangler.ci-d1.jsonc'),'utf8'));
 if(config.workers_dev!==false||config.triggers.crons.length!==0||config.vars.TPW_MODE!=='CLOSED'||config.vars.TPW_RELEASE_GATE!=='CLOSED'||config.vars.TPW_GITHUB_WRITES!=='DISABLED'||config.d1_databases.length!==1||config.d1_databases[0].binding!=='TPW_DB'||config.d1_databases[0].database_id!=='00000000-0000-0000-0000-000000000165')throw Error('DEMO_CONFIG');
 return p.version;
}
export function verifyDemo(){
 const expected=JSON.parse(readFileSync(regular(manifest),'utf8'));
 if(expected.version!==1||expected.wrangler!==dependencies()||JSON.stringify(expected.files)!==JSON.stringify(files()))throw Error('DEMO_INTEGRITY');
 console.log('DEMO_INTEGRITY_OK; local source manifest; installed runtime not fully attested');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv[2]==='--seal'&&process.argv.length===3){
  const wrangler=dependencies();writeFileSync(manifest,JSON.stringify({version:1,wrangler,files:files()},null,2)+'\n',{flag:'wx'});
  console.log('DEMO_MANIFEST_CREATED; trust checked-out source before sealing');
 }else if(process.argv.length===2)verifyDemo();else throw Error('DEMO_NO_OPTIONS');
}
