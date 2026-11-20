import test from "node:test";
import assert from "node:assert/strict";
import {state,DURATION,IGNITE,FIRE_OFF,COUNT_DONE,validateClipMetadata} from "../dragon-point-video/assets/timing.mjs";
test("fire occurs once; score ends exactly two seconds before video ends",()=>{
 assert.equal(DURATION,15);assert.equal(COUNT_DONE,13);
 assert.equal(state(0,842).phase,"sleep");assert.equal(state(3,842).phase,"wake");
 assert.equal(state(IGNITE,842).fire,true);
 assert.equal(state(FIRE_OFF,842).fire,false);
 assert.equal(state(FIRE_OFF,842).burning,true);
 assert.ok(state(12.999,842).number<842);
 assert.equal(state(COUNT_DONE,842).number,842);
 assert.equal(state(14.99,842).burning,true);
 assert.equal(state(15,842).burning,false);
});
test("count monotonic with seek-back and synthetic score bounds",()=>{
 let prev=0;for(let i=0;i<=300;i++){const x=state(i/20,842);assert.ok(x.number>=prev);prev=x.number;}
 assert.equal(state(15,9999).number,1000);
 assert.equal(state(15,-42).number,0);
 assert.equal(state(3,842).number,0);
});
test("15-second 16:9 metadata required to keep counter exactly two seconds before end",()=>{
 assert.equal(validateClipMetadata(15.04,1280,720),null);
 assert.equal(validateClipMetadata(15,1920,1080),null);
 assert.equal(validateClipMetadata(15.51,1280,720),"duration");
 assert.equal(validateClipMetadata(5,1280,720),"duration");
 assert.equal(validateClipMetadata(Infinity,1280,720),"duration");
 assert.equal(validateClipMetadata(15,320,180),"dimensions");
 assert.equal(validateClipMetadata(15,720,1280),"dimensions");
 assert.equal(validateClipMetadata(15,1280,0),"dimensions");
});

test("real 15.04s video finishes counting at exactly 13.04s (not rounded 13s)",()=>{
 assert.equal(state(13.039,842,15.04).number<842,true);
 assert.equal(state(13.04,842,15.04).number,842);
 assert.equal(state(15.039,842,15.04).burning,true);
 assert.equal(state(15.04,842,15.04).burning,false);
 assert.equal(state(15.04,842,15.04).phase,"complete");
});
