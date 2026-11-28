/** Local preview only. Fence ordinary monotonic writers; not a receiver-side revocation guarantee. */
import {loadLocalNewsView} from './local-news-view.mjs';
import {loadLocalDeviceView} from './local-device-view.mjs';
import {startLocalText} from '../../../local-text/server.mjs';
const local=env=>env?.TPW_MODE==='LOCAL_DRY_RUN'&&env.TPW_RELEASE_GATE==='CLOSED'&&env.TPW_GITHUB_WRITES==='DISABLED';
async function fence(db){
 const q=await db.prepare("SELECT 'news' AS kind,CAST(generation AS TEXT) AS key,operation_id AS value FROM tpw_news_projection_head WHERE singleton=1 UNION ALL SELECT 'epoch',CAST(epoch AS TEXT),'' FROM tpw_revision_authority WHERE singleton=1 UNION ALL SELECT 'device',variant_key,revision_hash FROM tpw_revision_heads ORDER BY kind,key,value LIMIT 33").all();
 if(!q.success||!Array.isArray(q.results)||q.results.length<3||q.results.length>32||q.results.filter(x=>x.kind==='news').length!==1||q.results.filter(x=>x.kind==='epoch').length!==1)throw Error('UNIFIED_FENCE');
 return JSON.stringify(q.results);
}
export async function loadUnifiedView(env,nowFn=Date.now){
 if(!local(env))throw Error('UNIFIED_LOCAL_ONLY');
 const pins={...env};
 const before=await fence(pins.TPW_DB);
 const news=await loadLocalNewsView(pins);
 const {validUntil,...devices}=await loadLocalDeviceView(pins,nowFn);
 const after=await fence(pins.TPW_DB),now=nowFn();
 if(before!==after||!Number.isSafeInteger(now)||!Number.isSafeInteger(validUntil)||now>=validUntil)throw Error('UNIFIED_CHANGED');
 return {news,devices};
}
export function startUnifiedPreview(env,port=0,nowFn=Date.now){
 if(!local(env))throw Error('UNIFIED_LOCAL_ONLY');
 const pins={...env};
 return startLocalText(port,{loadCombined:()=>loadUnifiedView(pins,nowFn)});
}
