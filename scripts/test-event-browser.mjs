// Optional local browser integration test. PostgreSQL is real; Supabase HTTP
// and WebSocket transport are simulated. This does not prove hosted delivery.
// Usage: node scripts/test-leaderboard-browser.mjs [path-to-playwright-package]
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createPasswordHash } from '../src/lib/admin-crypto.ts';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { qrPng } from '../src/lib/qr.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || 'playwright');
const db = new PGlite();
const sockets = new Set();
let browser, app, backend;
let log = '';
let lastMessage = 0;
let leaderboardQueries = 0;
let dropEventNotifications=false;
const tables = {
  revoked_admin_sessions: ['token_hash'],
  participant_sessions: ['participant_id','token_hash','expires_at'],
  participants: ['id','name','roll_number','total_score'],
  questions: ['id','challenge_code','question','category','difficulty','active','correct_answer','points','choices','claimed_at'],
  submissions: ['id','submitted_at','participant_id','question_id'],
};
async function deliverNotifications() {
  const { rows } = await db.query('select id,topic from realtime.test_broadcasts where id > $1 order by id',[lastMessage]);
  for (const row of rows) {
    lastMessage = row.id;
    for (const socket of sockets) {
      if(!socket.topic.endsWith(row.topic) || (dropEventNotifications && row.topic==='techno-utsav:event'))continue;
      try { socket.ws.send(JSON.stringify([socket.joinRef,null,socket.topic,'broadcast',{ event:'changed', payload:{} }])); }
      catch { sockets.delete(socket); }
    }
  }
}
function send(res,status,data) { res.writeHead(status,{'Content-Type':'application/json'}); res.end(JSON.stringify(data)); }
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema realtime;
    create table realtime.test_broadcasts(id serial, payload jsonb, topic text);
    create function realtime.send(payload jsonb,event text,topic text,private boolean default true)
    returns void language sql as $$ insert into realtime.test_broadcasts(payload,topic) values(payload,topic); $$;`);
  for (const name of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
  }
  await db.exec(await readFile(new URL('../supabase/seed.sql',import.meta.url),'utf8'));
  backend = createServer(async(req,res)=>{
    try {
      const url = new URL(req.url,'http://localhost');
      const route = url.pathname.replace('/rest/v1/','');
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      if (route.startsWith('rpc/')) {
        const fn = route.slice(4);
        if (fn==='get_leaderboard') leaderboardQueries++;
        const args = {
          get_leaderboard: [],
          get_event_state: [],
          get_live_question: [body.p_code],
          admin_control_event: [body.p_action,body.p_seconds,body.p_expected_version],
          register_participant: [body.p_name,body.p_roll_number,body.p_token_hash],
          submit_answer: [body.p_participant_id,body.p_question_id,body.p_answer],
          admin_claim_login_attempt: [body.p_key],
          admin_get_dashboard: [body.p_page || 1],
          admin_export_results: [],
          claim_api_request: [body.p_scope,body.p_key],
          revoke_admin_session: [body.p_token_hash],
        }[fn];
        if (!args) return send(res,404,{});
        const params = args.map((_,i)=>`$${i+1}`).join(',');
        const result = await db.query(`select * from public.${fn}(${params})`,args);
        await deliverNotifications();
        const value = ['register_participant','admin_claim_login_attempt','admin_get_dashboard','claim_api_request','get_event_state','admin_control_event'].includes(fn) ? result.rows[0][fn]
          : req.headers.accept?.includes('object+json') ? (result.rows[0] ?? null) : result.rows;
        return send(res,200,value);
      }
      if (!tables[route]) return send(res,404,{});
      const columns = (url.searchParams.get('select') || '').split(',');
      assert.ok(columns.every(c=>tables[route].includes(c)));
      const filters=[], args=[]; let ordering=''; let limit='';
      for (const [column,value] of url.searchParams) {
        if (column === 'select') continue;
        if (column === 'limit') {assert.ok(/^\d+$/.test(value));limit=` limit ${Number(value)}`;continue;}
        if (column === 'order') {
          const [field,direction]=value.split('.'); assert.ok(tables[route].includes(field) && ['asc','desc'].includes(direction));
          ordering=` order by ${field} ${direction}`; continue;
        }
        assert.ok(tables[route].includes(column));
        const operator=value.slice(0,value.indexOf('.'));
        assert.ok(['eq','gt'].includes(operator));
        args.push(value.slice(value.indexOf('.')+1));
        filters.push(`${column} ${operator==='eq'?'=':'>'} $${args.length}`);
      }
      let sql=`select ${columns.join(',')} from public.${route}${filters.length?' where '+filters.join(' and '):''}${ordering}${limit}`;
      if (req.method==='POST' || req.method==='PATCH') {
        assert.equal(route,'questions');
        const keys=Object.keys(body); assert.ok(keys.every(k=>['question','category','difficulty','active','correct_answer','points','choices'].includes(k)));
        const assignments=keys.map(key=>{args.push(key==='choices'?JSON.stringify(body[key]):body[key]); return `${key}=$${args.length}`;});
        if (req.method==='POST') sql=`insert into public.questions(${keys.join(',')}) values(${keys.map((_,i)=>`$${i+1}`).join(',')}) returning ${columns.join(',')}`;
        else sql=`update public.questions set ${assignments.join(',')}${filters.length?' where '+filters.join(' and '):''} returning ${columns.join(',')}`;
      }
      const result=await db.query(sql,args);
      return send(res,200,req.headers.accept?.includes('object+json') ? result.rows[0] : result.rows);
    } catch(error) { send(res,error.code==='23505'?409:400,{code:error.code || 'TEST_ERROR',message:'Test database request rejected'}); }
  });
  await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));
  const backendOrigin=`http://127.0.0.1:${backend.address().port}`;
  const probe=createServer(); await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=probe.address().port; await new Promise(resolve=>probe.close(resolve));
  const origin=`http://127.0.0.1:${port}`;
  const adminPassword='Isolated admin browser test password';
  const adminHash=await createPasswordHash(adminPassword);
  app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',String(port)],{
    cwd:process.cwd(),windowsHide:true,
    env:{...process.env,NODE_ENV:'development',APP_ORIGIN:origin,NEXT_DIST_DIR:'.next-test-event',NEXT_PUBLIC_SUPABASE_URL:backendOrigin,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test-publishable',SUPABASE_SERVICE_ROLE_KEY:'test-server',
      ADMIN_PASSWORD_HASH:adminHash,ADMIN_SESSION_SECRET:'test-only-admin-secret-at-least-32-characters'},
    stdio:['ignore','pipe','pipe'],
  });
  app.stdout.on('data',chunk=>{log+=chunk.toString();}); app.stderr.on('data',chunk=>{log+=chunk.toString();});
  const startupDeadline=Date.now()+60000;
  while (!log.includes('Ready in')) {
    if (Date.now()>startupDeadline || app.exitCode !== null) throw new Error(`Test app failed to start: ${log.slice(-2000)}`);
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  browser=await chromium.launch({channel:'chrome',headless:true});
  const contexts=[];
  async function window(viewport) {
    const context=await browser.newContext({viewport}); contexts.push(context);
    await context.routeWebSocket(`${backendOrigin.replace('http:','ws:')}/realtime/v1/**`,ws=>{
      ws.onMessage(raw=>{
        if (typeof raw !== 'string') return;
        const [joinRef,ref,topic,event]=JSON.parse(raw);
        if (event==='phx_join') sockets.add({ws,joinRef,topic});
        ws.send(JSON.stringify([joinRef,ref,topic,'phx_reply',{status:'ok',response:{postgres_changes:[]}}]));
      });
    });
    const page=await context.newPage(); page.setDefaultNavigationTimeout(90000); page.setDefaultTimeout(60000); return page;
  }


  const participant=await window({width:390,height:844});
  const organizer=await window({width:1280,height:900});
  async function register(page,name,roll,code) {
    await page.goto(origin+'/?next='+encodeURIComponent('/challenge/'+code));
    await page.getByLabel('Name',{exact:true}).fill(name);await page.getByLabel('Roll Number').fill(roll);
    await page.getByRole('button',{name:'START CHALLENGE'}).click();await page.waitForURL('**/challenge/'+code);
  }
  const state=async()=>{const r=await fetch(origin+'/api/event');assert.equal(r.status,200);return (await r.json()).event;};
  const change=async(action,durationSeconds)=>organizer.request.post(origin+'/api/admin/event',{headers:{Origin:origin},data:{action,durationSeconds,version:(await state()).version}});
  const post=(page,code,answer)=>page.request.post(origin+'/api/challenges/'+code,{headers:{Origin:origin},data:{answer,is_open:true,ends_at:'2099-01-01'}});
  await register(participant,'Timer Participant','TIMER-A','Q001');
  await participant.getByRole('heading',{name:'The challenge has not started',exact:true}).waitFor();
  assert.equal(await participant.getByRole('radio').count(),0);
  assert.ok(!(await participant.content()).includes('What does CPU stand for?'));
  const closedGet=await participant.request.get(origin+'/api/challenges/Q001');assert.equal(closedGet.status(),423);
  assert.ok(!JSON.stringify(await closedGet.json()).includes('Central Processing Unit'));
  assert.equal((await post(participant,'Q001','Central Processing Unit')).status(),423);
  assert.equal((await participant.request.post(origin+'/api/admin/event',{headers:{Origin:origin},data:{action:'start',durationSeconds:60,version:0}})).status(),401);
  const development=await participant.request.get(origin+'/dev/questions');assert.ok(development.url().endsWith('/admin/login'));
  console.log('PASS: registration works before start; QR HTML/API and submissions remain locked; participants cannot control event or use the development question list.');

  await organizer.goto(origin+'/admin/login');await organizer.getByLabel('Administrator password').fill(adminPassword);
  await organizer.getByRole('button',{name:'LOG IN',exact:true}).click();await organizer.getByRole('heading',{name:'Admin dashboard',exact:true}).waitFor();
  await organizer.getByLabel('Challenge duration (minutes)').fill('1');
  await organizer.getByRole('button',{name:'Save duration',exact:true}).click();await organizer.getByText('Timer updated.',{exact:true}).waitFor();
  assert.equal((await state()).is_open,false);
  await organizer.getByRole('button',{name:'Start challenge',exact:true}).click();await organizer.getByText('Challenge started.',{exact:true}).waitFor();
  await participant.getByRole('radio',{name:'Central Processing Unit',exact:true}).waitFor({timeout:30000});
  assert.equal(await participant.getByRole('radio').count(),4);
  const other=await window({width:390,height:844});await register(other,'Timer Second','TIMER-B','Q002');
  await other.getByRole('radio',{name:'Stack',exact:true}).waitFor();
  const timerA=await participant.getByRole('timer').textContent(),timerB=await other.getByRole('timer').textContent();
  assert.ok(/^00:00:\d\d$/.test(timerA));assert.ok(/^00:00:\d\d$/.test(timerB));
  const seconds=value=>value.split(':').map(Number).reduce((total,n)=>total*60+n,0);
  assert.ok(Math.abs(seconds(timerA)-seconds(timerB))<=2,'Participants must share one event deadline.');
  await participant.evaluate(()=>{Date.now=()=>0;});
  await organizer.getByLabel('Remaining time (minutes)').fill('2');
  await organizer.getByRole('button',{name:'Set remaining time',exact:true}).click();await organizer.getByText('Timer updated.',{exact:true}).waitFor();
  for(const page of [participant,other]) await page.waitForFunction(()=>/^00:0[12]:/.test(document.querySelector('[role="timer"]').textContent),{},{timeout:20000});
  console.log('PASS: admin saves duration/starts event; waiting QR opens automatically; two participants share the countdown and pick up remaining-time changes despite a tampered browser wall clock.');

  await organizer.getByRole('button',{name:'Stop challenge',exact:true}).click();await organizer.getByText('Challenge stopped.',{exact:true}).waitFor();
  assert.equal((await post(participant,'Q001','Central Processing Unit')).status(),423);
  await other.getByRole('heading',{name:'The challenge is closed',exact:true}).waitFor({timeout:20000});
  assert.equal(await other.getByRole('radio').count(),0);
  assert.equal((await participant.request.get(origin+'/api/challenges/Q001')).status(),423);
  assert.equal((await change('set_time',60)).status(),200);assert.equal((await state()).is_open,false);
  assert.equal((await change('start',60)).status(),200);
  await participant.getByRole('radio',{name:'Central Processing Unit',exact:true}).waitFor({timeout:20000});
  await participant.getByRole('radio',{name:'Central Processing Unit',exact:true}).check();
  await participant.getByRole('button',{name:'SUBMIT ANSWER',exact:true}).click();
  await participant.getByRole('heading',{name:'Correct answer!',exact:true}).waitFor();
  assert.equal((await change('set_time',2)).status(),200);
  await other.getByRole('heading',{name:'The challenge is closed',exact:true}).waitFor({timeout:20000});
  await other.getByRole('timer').filter({hasText:'00:00:00'}).waitFor();
  assert.equal((await post(other,'Q002','Stack')).status(),423);
  assert.equal((await other.request.get(origin+'/api/challenges/Q002')).status(),423);
  assert.equal((await db.query("select total_score from public.participants where roll_number='TIMER-A'")).rows[0].total_score,10);
  assert.equal((await db.query("select count(*)::int n from public.submissions s join public.participants p on p.id=s.participant_id where p.roll_number='TIMER-B'")).rows[0].n,0);
  console.log('PASS: stop and natural timeout hide open questions and reject direct/forged late submissions; accepted scores remain intact.');

  dropEventNotifications=true;
  assert.equal((await change('set_time',60)).status(),200);assert.equal((await state()).is_open,false);
  assert.equal((await change('start',60)).status(),200);
  await other.getByRole('radio',{name:'Stack',exact:true}).waitFor({timeout:25000});
  await other.route('**/api/event',route=>route.fulfill({status:503,contentType:'application/json',body:'{"message":"Test network outage"}'}));
  await other.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await other.getByRole('heading',{name:'Checking challenge status',exact:true}).waitFor();
  assert.equal(await other.getByRole('radio').count(),0);
  await other.unroute('**/api/event');
  await other.getByRole('radio',{name:'Stack',exact:true}).waitFor({timeout:25000});
  assert.equal((await change('stop')).status(),200);
  const version=(await state()).version;
  const edits=await Promise.all([30,60].map(durationSeconds=>organizer.request.post(origin+'/api/admin/event',{headers:{Origin:origin},data:{action:'set_time',durationSeconds,version}})));
  assert.deepEqual(edits.map(r=>r.status()).sort(),[200,409]);
  assert.equal((await db.query("select claimed_at is not null claimed from public.questions where challenge_code='Q001'")).rows[0].claimed,true);
  const publicState=await state();assert.deepEqual(Object.keys(publicState).sort(),['duration_seconds','ends_at','is_open','running','server_time','started_at','version']);
  await mkdir('test-results',{recursive:true});await organizer.screenshot({path:'test-results/admin-event-controls.png',fullPage:true});
  await other.screenshot({path:'test-results/participant-event-timer.png',fullPage:true});
  console.log('PASS: event changes recover through polling when Realtime is missing; status API outages lock controls and recover automatically; stale admin writes rejected; restarting never reopens won QRs.');
  console.log('Browser → API → PostgreSQL event controls verified locally. Transport is simulated; hosted lock contention and actual Realtime delivery remain to rehearse.');
} catch(error) { console.error(`FAIL: ${error.message}\n${log.slice(-2500)}`); process.exitCode=1; }
finally {
  await browser?.close();
  if (app?.pid && app.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill',['/PID',String(app.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    else app.kill();
  }
  if (backend) await new Promise(resolve=>backend.close(resolve));
  await db.close();
}
