// Run: node --env-file=.env.local scripts/verify-database.mjs
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(url && key, 'Set Supabase URL and server-only service-role key.');
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) },
});

const health = await client.rpc('health_check');
assert.equal(health.error, null, 'Database connection/health RPC failed.');
assert.equal(health.data, true);
const ids = Array.from({ length: 10 }, (_, i) => `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
const questions = await client.from('questions')
  .select('id,question,choices,points,active,claimed_at,created_at').in('id', ids);
assert.equal(questions.error, null, 'Question retrieval failed.');
assert.equal(questions.data.length, 10, 'Expected all ten seed questions.');
for (const table of ['participants', 'submissions']) {
  const result = await client.from(table).select('id', { head: true, count: 'exact' });
  assert.equal(result.error, null, `${table} is not accessible to the backend.`);
}
console.log('PASS: live Supabase connection, three tables, and ten sample questions.');
const publicKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.ok(publicKey,'Set the publishable key to verify anonymous database isolation.');
const publicClient=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
for (const table of ['participants','questions','submissions','participant_sessions','admin_login_attempts','api_request_limits','revoked_admin_sessions','leaderboard_notification_gate','event_control']) {
  const result=await publicClient.from(table).select('*',{head:true,count:'exact'});
  assert.ok(result.error,`${table} unexpectedly readable with public credentials.`);
  console.log('Public access error details:', JSON.stringify(result.error, null, 2));
}
const projection=await publicClient.rpc('get_leaderboard');
assert.equal(projection.error,null,'Public leaderboard unavailable.');
for(const row of projection.data || []) assert.deepEqual(Object.keys(row).sort(),['name','participant_id','rank','total_score']);
const forbidden=await publicClient.rpc('admin_get_dashboard',{p_page:1});
assert.equal(forbidden.error?.code,'42501','Public admin RPC must be denied.');
const revocations=await client.from('revoked_admin_sessions').select('token_hash',{head:true,count:'exact'});
assert.equal(revocations.error,null,'Apply the security migration before starting updated code.');
console.log('PASS: public table isolation, safe leaderboard projection, denied admin RPC and security migration.');
console.log('Run supabase/tests/database.sql for transactional constraint and scoring checks.');

const event = await publicClient.rpc('get_event_state');
assert.equal(event.error,null,'Apply migration 011 for event timing.');
assert.deepEqual(Object.keys(event.data).sort(),['duration_seconds','ends_at','is_open','running','server_time','started_at','version']);
const privateEvent = await client.from('event_control').select('*');
assert.ok(privateEvent.error,'Event table must only be accessible through functions.');
console.log('PASS: public timing projection and private event controls.');
