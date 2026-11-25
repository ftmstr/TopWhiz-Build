/** Offline configuration report; optional explicit local-only D1 state snapshot. */
import {existsSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {inspectSetup,loadClosedConfigs} from './pilot-preflight.mjs';
import {readLocalMetrics,renderPilotPanel} from './pilot-panel.mjs';
try{
 const args=process.argv.slice(2),html=args[0]==='--html';
 if(html)args.shift();
 if(args.length!==0&&(args.length!==2||args[0]!=='--local-state'))throw Error('USAGE');
 const setup=inspectSetup(loadClosedConfigs(),process.env);
 let metrics={status:'NOT_CONNECTED'};
 if(args.length&&setup.closedConfig){
  const path=resolve(args[1]);
  if(!existsSync(path)||!statSync(path).isDirectory())throw Error('LOCAL_STATE_REQUIRED');
  process.env.WRANGLER_SEND_METRICS='false';
  const require=createRequire(new URL('../../../apps/web/package.json',import.meta.url));
  const {getPlatformProxy}=await import(pathToFileURL(require.resolve('wrangler')).href);
  const platform=await getPlatformProxy({configPath:fileURLToPath(new URL('../wrangler.ci-d1.jsonc',import.meta.url)),persist:{path},remoteBindings:false});
  try{metrics=await readLocalMetrics(platform.env.TPW_DB)}finally{await platform.dispose()}
 }
 process.stdout.write(html?renderPilotPanel(setup,metrics):JSON.stringify({setup,metrics},null,2)+'\n');
 if(!setup.closedConfig||args.length&&metrics.status!=='LOCAL_READ_OK')process.exitCode=1;
}catch{process.stderr.write('PILOT_INSPECTION_FAILED (details withheld); usage: [--html] [--local-state DIRECTORY]\n');process.exitCode=1}
