import assert from 'node:assert/strict';
import { readRequestBody } from '../src/lib/request-body.ts';
assert.equal(await readRequestBody(new Request('http://test',{method:'POST',body:'hello'}),5),'hello');
await assert.rejects(readRequestBody(new Request('http://test',{method:'POST',body:'oversized'}),3),error=>error.status===413);
let cancelled=false;
const slow=new ReadableStream({cancel(){cancelled=true;}});
await assert.rejects(readRequestBody(new Request('http://test',{method:'POST',body:slow,duplex:'half'}),100,30),error=>error.status===408);
assert.ok(cancelled);
console.log('PASS: bounded request bodies, oversized-body rejection, slow-stream timeout and cancellation.');
