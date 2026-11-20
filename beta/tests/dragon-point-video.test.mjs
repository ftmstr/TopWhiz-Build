import test from "node:test";
import assert from "node:assert/strict";
import {state,DURATION,IGNITE,FIRE_OFF,COUNT_DONE} from "../dragon-point-video/assets/timing.mjs";
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