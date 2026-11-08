/** TUR012 deterministic license dependency provenance.
 * No package is modified/removed, no real distribution clearance is made.
 * Tracks the transitive Next.js -> optional sharp -> optional libvips path.
 */
import assert from "node:assert/strict";
import {readFileSync,existsSync,readdirSync,statSync} from "node:fs";
import path from "node:path";
const root=new URL("../",import.meta.url);
const lock=readFileSync(new URL("../pnpm-lock.yaml",import.meta.url),"utf8");
const pkg=JSON.parse(readFileSync(new URL("../apps/web/package.json",import.meta.url),"utf8"));
const next=pkg.dependencies.next;
const nextSnapshot=lock.match(new RegExp("  next@"+next.replaceAll(".","\\.")+"\\([^\\n]+:\\n([\\s\\S]*?)(?=\\n  [^ \\n][^\\n]*:\\n|$)"))?.[1]??"";
assert.ok(nextSnapshot.includes("optionalDependencies:"),"Next.js optional image deps not found");
assert.ok(/sharp:\s*0\.35\.5/.test(nextSnapshot),"Next -> sharp provenance unverified");
const sharpSnapshot=lock.match(/  sharp@0\.35\.5\([^)]*\):\n([\s\S]*?)(?=\n  [^ \n][^\n]*:\n|$)/)?.[1]??"";
assert.ok(sharpSnapshot.includes("optionalDependencies:"));
for(const p of ["@img/sharp-libvips-linux-x64","@img/sharp-libvips-linuxmusl-x64"]){
 assert.ok(sharpSnapshot.includes("'"+p+"': 1.3.4"),p+" not linked as optional");
 assert.ok(lock.includes("'"+p+"@1.3.4'"),p+" must remain visible in lockfile/license review");
}
const tree=[];
const output=new URL("../apps/web/dist/",import.meta.url);
if(existsSync(output)){
 const queue=[output.pathname];
 while(queue.length){
  const dir=queue.pop();
  for(const name of readdirSync(dir)){
   const full=path.join(dir,name);
   const stat=statSync(full);
   if(stat.isDirectory()){queue.push(full);continue}
   tree.push(path.relative(output.pathname,full));
   if(tree.length>10000)throw Error("unexpected_worker_bundle_file_count");
  }
 }
}
const suspicious=tree.filter(name=>/libvips|sharp\.node|sharp-libvips/i.test(name));
assert.equal(suspicious.length,0,"native libvips copied into local Worker artifact");
const report={
 provenance:["next@"+next,"optional sharp@0.35.5","optional sharp-libvips@1.3.4"],
 nextImageOptimizer:"optional_sharp_required_for_native_next_optimization",
 cloudflareAlternative:"Cloudflare Images binding or unoptimized images, requires independent deployment/cost/privacy review",
 nativeLibvipsFilesInLocalWorkerdBundle:suspicious.length,
 buildArtifactsInspected:tree.length,
 legalReviewRequired:true,releaseBlocked:true,
 note:"Optional dependency and absent local binary do not resolve LGPL notice, source, static/dynamic linking or distribution obligations."
};
assert.equal(report.legalReviewRequired,true);
console.log(JSON.stringify(report));
