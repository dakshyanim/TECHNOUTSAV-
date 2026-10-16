import assert from 'node:assert/strict';
import { isAllowedRequestOrigin as allowed } from '../src/lib/request-origin.ts';
const expected='http://localhost:3000';
for (const origin of [expected,'http://127.0.0.1:3000','http://[::1]:3000']) {
  assert.equal(allowed(origin,expected,expected,true),true);
}
assert.equal(allowed(expected,expected,expected+'/',false),true);
for (const origin of [null,'null','https://evil.example','http://localhost.evil.example:3000','http://localhost:3001','https://localhost:3000','http://localhost:3000/path','http://localhost:3000?x=1','http://user@localhost:3000']) {
  assert.equal(allowed(origin,expected,expected,true),false,`Reject ${origin}`);
}
assert.equal(allowed('http://127.0.0.1:3000',expected,expected,false),false);
assert.equal(allowed('https://event.example','http://internal:3000','https://event.example',false),true);
assert.equal(allowed('https://evil.example','https://evil.example','https://event.example',false),false);
assert.equal(allowed(expected,expected,undefined,false),false);
assert.equal(allowed(expected,expected,'not-a-url',true),false);
assert.equal(allowed('http://localhost:3001','http://localhost:3001',expected,true),true);
assert.equal(allowed('http://127.0.0.1:3001','http://localhost:3001',expected,true),true);
assert.equal(allowed('http://localhost:3001',expected,expected,true),false);
assert.equal(allowed('http://localhost:3001','http://localhost:3001',expected,false),false);
console.log('PASS: local aliases, normalized origins, strict production validation, missing Origin and cross-site rejection.');
