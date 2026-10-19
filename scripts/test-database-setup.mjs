import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { buildDatabaseSetup } from './prepare-database.mjs';

async function freshDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema realtime;
    create table realtime.test_broadcasts(payload jsonb,event text,topic text,private boolean);
    create function realtime.send(payload jsonb,event text,topic text,private boolean default true)
    returns void language sql as $$insert into realtime.test_broadcasts values(payload,event,topic,private);$$;`);
  return db;
}
const sql = await buildDatabaseSetup();
assert.equal(await readFile(new URL('../supabase/setup.sql', import.meta.url), 'utf8'), sql, 'Regenerate setup.sql with npm run prepare:database.');
const db = await freshDatabase();
try {
  await db.exec(sql);
  const { rows } = await db.query('select count(*)::int count from public.questions');
  assert.equal(rows[0].count, 10);
  const { rows: history } = await db.query('select count(*)::int count from supabase_migrations.schema_migrations');
  assert.equal(history[0].count, 10);
  for (const name of (await readdir(new URL('../supabase/tests/', import.meta.url))).filter(name=>name==='mcq.sql' || name==='security.sql' || name==='registration.sql').sort()) {
    await db.exec(await readFile(new URL(`../supabase/tests/${name}`, import.meta.url), 'utf8'));
    console.log(`PASS combined-setup suite: ${name}`);
  }
  await assert.rejects(db.exec(sql), /Application tables already exist/);
  await db.exec('rollback');
  assert.equal((await db.query('select count(*)::int count from public.questions')).rows[0].count, 10);
  console.log('PASS: fresh setup, ten migration records, ten seed questions, current MCQ/security/session SQL suites, and safe refusal to overwrite an existing app.');
} finally { await db.close(); }
const rollback = await freshDatabase();
try {
  await assert.rejects(rollback.exec(sql.replace('\ncommit;', '\nselect 1/0;\ncommit;')), /division by zero/);
  await rollback.exec('rollback');
  assert.equal((await rollback.query("select to_regclass('public.participants')::text object")).rows[0].object, null);
  assert.equal((await rollback.query("select to_regclass('supabase_migrations.schema_migrations')::text object")).rows[0].object, null);
  console.log('PASS: a failed setup transaction leaves no partial application tables or migration records.');
} finally { await rollback.close(); }
