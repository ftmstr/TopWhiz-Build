/** Aggregate-only local D1 view. No content, URL, owner, token, or raw exception in output. */
const agents=['TPW1','TPW3','TPW2'],runStates=['RUNNING','SUCCEEDED','FAILED'],stageStates=['PENDING','PROCESSING','APPROVED','REJECTED','QUARANTINED'];
const count=x=>{if(!Number.isSafeInteger(x)||x<0)throw Error('METRIC_INVALID');return x};
export async function readLocalMetrics(db){
 try{
  const result=await db.batch([
   db.prepare('SELECT agent,state,count(*) AS n FROM tpw_hourly_run GROUP BY agent,state'),
   db.prepare('SELECT state,count(*) AS n FROM tpw_stage GROUP BY state'),
   db.prepare('SELECT epoch FROM tpw_revision_authority WHERE singleton=1'),
   db.prepare('SELECT count(*) AS n FROM tpw_device_revisions'),
   db.prepare('SELECT count(*) AS n FROM tpw_revision_operations'),
   db.prepare('SELECT count(*) AS n FROM tpw_revision_revocations')
  ]);
  if(result.length!==6||result.some(x=>!x.success))throw Error('METRIC_QUERY');
  const runs=Object.fromEntries(agents.map(a=>[a,Object.fromEntries(runStates.map(s=>[s,0]))]));
  const stage=Object.fromEntries(stageStates.map(s=>[s,0]));
  for(const x of result[0].results){if(!agents.includes(x.agent)||!runStates.includes(x.state))throw Error('METRIC_ENUM');runs[x.agent][x.state]=count(x.n)}
  for(const x of result[1].results){if(!stageStates.includes(x.state))throw Error('METRIC_ENUM');stage[x.state]=count(x.n)}
  const scalar=(i,k)=>{if(result[i].results.length!==1)throw Error('METRIC_SCALAR');return count(result[i].results[0][k])};
  return {status:'LOCAL_READ_OK',runs,stage,epoch:scalar(2,'epoch'),revisions:scalar(3,'n'),operations:scalar(4,'n'),revocations:scalar(5,'n')};
 }catch{return {status:'LOCAL_READ_UNAVAILABLE'}}
}
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");
export function renderPilotPanel(setup,metrics={status:'NOT_CONNECTED'}){
 const rows=setup.groups.flatMap(g=>g.items.map(x=>'<tr><td>'+esc(g.label)+'</td><td>'+esc(x.name)+'</td><td>'+esc(x.kind)+'</td><td>'+esc(x.state)+'</td></tr>')).join('');
 const configs=setup.profiles.map(x=>'<li>'+esc(x.name)+': '+(x.ok?'CLOSED CONFIG OK':esc(x.errors.join(', ')))+'</li>').join('');
 const summary=metrics.status==='LOCAL_READ_OK'?'<p>LOCAL_READ_OK</p><div class="cards">'+[['Epoch',metrics.epoch],['Revisions',metrics.revisions],['Operations',metrics.operations],['Revocations',metrics.revocations]].map(([k,v])=>'<div><small>'+k+'</small><strong>'+esc(v)+'</strong></div>').join('')+'</div><h2>Agent runs</h2><table><thead><tr><th>Agent</th><th>Running</th><th>Succeeded</th><th>Failed</th></tr></thead><tbody>'+agents.map(a=>'<tr><td>'+a+'</td>'+runStates.map(s=>'<td>'+esc(metrics.runs[a][s])+'</td>').join('')+'</tr>').join('')+'</tbody></table><h2>Stage totals</h2><ul>'+stageStates.map(s=>'<li>'+s+': '+esc(metrics.stage[s])+'</li>').join('')+'</ul>':'<p>'+esc(metrics.status)+'</p>';
 return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>TOPWHIZ Local Operations</title><style>body{font:15px system-ui,sans-serif;color:#dce6f4;background:#101722;margin:0;padding:24px}main{max-width:1000px;margin:auto}h1{letter-spacing:.06em}h2{font-size:19px;margin-top:28px}.red{color:#ff9a9a;border:1px solid #f87171;padding:12px;border-radius:8px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px}.cards div{background:#202c3c;padding:16px;border-radius:8px}.cards strong{display:block;font-size:30px}table{width:100%;border-collapse:collapse;overflow-wrap:anywhere}td,th{padding:9px;text-align:left;border-bottom:1px solid #394657}small{color:#b2c4d8}@media(max-width:580px){body{padding:12px}td,th{font-size:11px;padding:6px}}</style><main><h1>TOPWHIZ / LOCAL OPERATIONS</h1><p class="red">HARD NO-GO · LOCAL INSPECTION ONLY · No release authorization</p><h2>Configuration</h2><ul>'+configs+'</ul><h2>D1 aggregate metrics</h2>'+summary+'<h2>Binding and configuration inventory</h2><p>Presence is unverified, not activation. No values are displayed.</p><table><thead><tr><th>Group</th><th>Name</th><th>Type</th><th>Status</th></tr></thead><tbody>'+rows+'</tbody></table><h2>Open blockers</h2><ul>'+setup.blockers.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></main></html>';
}
