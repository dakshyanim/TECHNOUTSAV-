import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { challengeQrUrl,normalizeQrOrigin,qrPng,qrSvg } from '../src/lib/qr.ts';

for (const code of ['Q001','Q010','Q-1234567890ABCDEF1234567890ABCDEF12']) {
  const expected=challengeQrUrl('https://event.example.edu',code);
  const png=PNG.sync.read(await qrPng(expected));
  const decoded=jsQR(new Uint8ClampedArray(png.data),png.width,png.height);
  assert.equal(decoded?.data,expected,'QR did not decode to its exact challenge URL.');
  const matrix=QRCode.create(expected,{errorCorrectionLevel:'Q'}).modules.size;
  assert.equal(png.width,(matrix+8)*20,'PNG must retain a four-module quiet zone and integral pixels.');
  assert.equal(png.width,png.height);
  for (let y=0;y<80;y++) for (let x=0;x<png.width;x++) {
    const offset=(y*png.width+x)*4;
    assert.deepEqual([...png.data.subarray(offset,offset+4)],[255,255,255,255]);
  }
  const svg=await qrSvg(expected); assert.ok(svg.includes('<svg') && svg.includes('viewBox'));
  assert.ok(!decoded.data.includes('answer') && !decoded.data.includes('participant'));
}
assert.equal(normalizeQrOrigin('https://event.example.edu/'),'https://event.example.edu');
for (const origin of ['https://user:secret@example.edu','https://event.example.edu/?answer=secret','https://event.example.edu/path','javascript:alert(1)']) assert.throws(()=>normalizeQrOrigin(origin));
assert.throws(()=>challengeQrUrl('https://event.example.edu','Q001?answer=secret'));
console.log('PASS: decoded PNG URLs, four-module white quiet zone, integer-resolution printing, SVG generation, and origin/payload validation.');
