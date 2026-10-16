import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Test-only PostgreSQL engine; no Supabase or application configuration required.
const db = new PGlite();
try {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  // Only the notification transport is stubbed; ranking/scoring use real SQL.
  await db.exec(`
    create schema realtime;
    create table realtime.test_broadcasts(payload jsonb, event text, topic text, private boolean);
    create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
    returns void language sql as $$
      insert into realtime.test_broadcasts values(payload,event,topic,private);
    $$;
  `);
  const migrations = (await readdir(new URL('../supabase/migrations/', import.meta.url)))
    .filter(name => name.endsWith('.sql')).sort();
  for (const name of migrations) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    console.log(`PASS migration: ${name}`);
  }
  const seed = await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8');
  await db.exec(seed);
  await db.exec(seed);
  const { rows } = await db.query('select count(*)::int as count from public.questions');
  assert.equal(rows[0].count, 10, 'Seed must be repeatable.');
  for (const name of (await readdir(new URL('../supabase/tests/', import.meta.url))).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(`../supabase/tests/${name}`, import.meta.url), 'utf8'));
    console.log(`PASS database suite: ${name}`);
  }
  await db.exec('begin');
  const { rows: participants } = await db.query("insert into public.participants(name,roll_number) values('Broadcast fixture','BROADCAST-TEST') returning id");
  const { rows: questions } = await db.query("insert into public.questions(question,category,difficulty,correct_answer,points) values('Broadcast fixture','Test','easy','yes',10) returning id");
  await db.exec("update public.leaderboard_notification_gate set last_sent_at='2000-01-01'");
  await db.query('select * from public.submit_answer($1,$2,$3)',[participants[0].id,questions[0].id,'yes']);
  const { rows: signals } = await db.query('select * from realtime.test_broadcasts');
  assert.equal(signals.length,2,'Registration and score changes must both broadcast.');
  for (const signal of signals) {
    assert.deepEqual(signal.payload,{}); assert.equal(signal.event,'changed');
    assert.equal(signal.topic,'techno-utsav:leaderboard'); assert.equal(signal.private,false);
  }
  await db.exec('rollback');
  console.log('PASS: all migrations, repeatable seed, database assertions and minimal notification payloads (transport stubbed).');
  console.log('Separate-session concurrency and live API/session checks require scripts/test-scoring.mjs against a configured test Supabase project.');
} catch (error) {
  console.error(`FAIL: ${error.message} (${error.code || 'assertion'})`);
  process.exitCode = 1;
} finally { await db.close(); }
