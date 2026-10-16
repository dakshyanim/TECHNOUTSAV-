// Node 22.18+; reads a hidden password from the terminal or piped standard input.
import { randomBytes } from 'node:crypto';
import { createPasswordHash } from '../src/lib/admin-crypto.ts';

async function readPassword() {
  if (!process.stdin.isTTY) {
    let value=''; for await (const chunk of process.stdin) { value+=chunk; if (value.length>258) throw new Error('Password is too long.'); }
    return value.replace(/\r?\n$/,'');
  }
  process.stdout.write('Administrator password (16–256 characters; input hidden): ');
  return new Promise((resolve,reject)=>{
    let value=''; process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
    function finish(error) { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data',onData); process.stdout.write('\n'); error?reject(error):resolve(value); }
    function onData(chunk) {
      for (const char of chunk) {
        if (char==='\u0003') { finish(new Error('Cancelled.')); return; }
        if (char==='\r' || char==='\n') { finish(); return; }
        if (char==='\u007f' || char==='\b') value=value.slice(0,-1);
        else if (char>=' ' && value.length<256) value+=char;
      }
    }
    process.stdin.on('data',onData);
  });
}
try {
  const hash=await createPasswordHash(await readPassword());
  console.log('Add these SERVER-ONLY values to your ignored .env.local:');
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log(`ADMIN_SESSION_SECRET=${randomBytes(32).toString('hex')}`);
} catch(error) { console.error(error.message); process.exitCode=1; }
