import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJSON,canonicalHash} from '../src/canonical.mjs';
import {createHash} from 'node:crypto';
test('canonical JSON stable Unicode vector, key ordering and integer restrictions',async()=>{
 const a={z:[true,null,17],a:{tr:'Türkçe',en:'Phone'}};
 const b={a:{en:'Phone',tr:'Türkçe'},z:[true,null,17]};
 const expected='{"a":{"en":"Phone","tr":"Türkçe"},"z":[true,null,17]}';
 assert.equal(canonicalJSON(a),expected);assert.equal(canonicalJSON(b),expected);
 assert.equal(await canonicalHash(a),createHash('sha256').update(expected,'utf8').digest('hex'));
 for(const invalid of [1.5,-0,Infinity,undefined,{x:undefined},{'ş':1},'\ud800',Array(2)])assert.throws(()=>canonicalJSON(invalid));
});
