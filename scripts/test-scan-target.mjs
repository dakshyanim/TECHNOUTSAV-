import assert from 'node:assert/strict';
import { challengePathFromQr as target } from '../src/lib/scan-target.ts';
const origin='https://event.example';
assert.equal(target(origin+'/challenge/Q001',origin),'/challenge/Q001');
assert.equal(target('/challenge/Q001',origin),'/challenge/Q001');
assert.equal(target('https://canonical.example/challenge/Q001',origin,'https://canonical.example'),'/challenge/Q001');
for(const value of ['https://evil.example/challenge/Q001','javascript:alert(1)','/admin','/challenge/../admin','/challenge/Q001?answer=yes','/challenge/Q001#x','https://user@event.example/challenge/Q001','/challenge/bad!']) assert.equal(target(value,origin),null);
console.log('PASS: scanner targets only event challenge URLs; external links, scripts, traversal and answer-bearing query strings rejected.');
