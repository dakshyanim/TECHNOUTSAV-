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
const tables = {
  revoked_admin_sessions: ['token_hash'],
  participant_sessions: ['participant_id','token_hash','expires_at'],
  participants: ['id','name','roll_number','total_score'],
  questions: ['id','challenge_code','question','category','difficulty','active','correct_answer','points','choices','claimed_at'],
  submissions: ['id','submitted_at','participant_id','question_id'],
};
async function deliverNotifications() {
  const { rows } = await db.query('select id from realtime.test_broadcasts where id > $1 order by id',[lastMessage]);
  for (const row of rows) {
    lastMessage = row.id;
    for (const socket of sockets) {
      try { socket.ws.send(JSON.stringify([socket.joinRef,null,socket.topic,'broadcast',{ event:'changed', payload:{} }])); }
      catch { sockets.delete(socket); }
    }
  }
}
function send(res,status,data) { res.writeHead(status,{'Content-Type':'application/json'}); res.end(JSON.stringify(data)); }
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema realtime;
    create table realtime.test_broadcasts(id serial, payload jsonb);
    create function realtime.send(payload jsonb,event text,topic text,private boolean default true)
    returns void language sql as $$ insert into realtime.test_broadcasts(payload) values(payload); $$;`);
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
        const value = ['register_participant','admin_claim_login_attempt','admin_get_dashboard','claim_api_request'].includes(fn) ? result.rows[0][fn]
          : req.headers.accept?.includes('object+json') ? result.rows[0] : result.rows;
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
    env:{...process.env,NODE_ENV:'development',APP_ORIGIN:origin,NEXT_DIST_DIR:'.next-test-mcq',NEXT_PUBLIC_SUPABASE_URL:backendOrigin,
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

  const display=await window({width:1920,height:1080});
  const student=await window({width:390,height:844});
  const other=await window({width:390,height:844});
  await display.goto(origin+'/leaderboard');
  async function register(page,name,roll) {
    await page.goto(origin+'/?next='+encodeURIComponent('/challenge/Q001'));
    assert.equal(await page.getByRole('link',{name:'Admin panel',exact:true}).count(),0);
    await page.getByLabel('Name',{exact:true}).fill(name);await page.getByLabel('Roll Number').fill(roll);
    await page.getByRole('button',{name:'START CHALLENGE'}).click();
    await page.waitForURL('**/challenge/Q001');
    assert.equal(await page.getByRole('radio').count(),4);
    assert.equal(await page.locator('textarea').count(),0);
  }
  await register(student,'First Winner','MCQ-UI-A');
  await register(other,'Second Student','MCQ-UI-B');
  await student.getByRole('radio',{name:'Central Processing Unit',exact:true}).check();
  await student.getByRole('button',{name:'SUBMIT ANSWER',exact:true}).click();
  await student.getByRole('heading',{name:'Correct answer!',exact:true}).waitFor();
  await other.getByRole('radio',{name:'Central Processing Unit',exact:true}).check();
  await other.getByRole('button',{name:'SUBMIT ANSWER',exact:true}).click();
  await other.getByText('This challenge has expired. Another participant answered correctly.',{exact:true}).waitFor();
  await other.goto(origin+'/challenge/Q001');
  assert.equal(await other.getByRole('radio').count(),0);
  await student.reload();await student.getByText('You have already attempted this challenge.',{exact:true}).waitFor();
  await other.goto(origin+'/challenge/Q002');await other.getByRole('radio',{name:'Queue',exact:true}).check();
  await other.getByRole('button',{name:'SUBMIT ANSWER',exact:true}).click();await other.getByRole('heading',{name:'Incorrect answer',exact:true}).waitFor();
  assert.equal((await db.query("select claimed_at from public.questions where challenge_code='Q002'")).rows[0].claimed_at,null);
  const standings=display.getByRole('row').filter({has:display.getByRole('cell',{name:'First Winner',exact:true})});
  await standings.getByRole('cell',{name:'10',exact:true}).waitFor({timeout:35000});
  assert.equal(await student.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  console.log('PASS: four-choice UI, correct/wrong choices, global expiry, stale form rejection, historical attempt message and automatic leaderboard.');

  const organizer=await window({width:1280,height:900});
  await organizer.goto(origin+'/admin/login');await organizer.getByLabel('Administrator password').fill(adminPassword);
  await organizer.getByRole('button',{name:'LOG IN',exact:true}).click();await organizer.getByRole('heading',{name:'Admin dashboard',exact:true}).waitFor();
  assert.equal(await organizer.getByRole('columnheader',{name:'Category',exact:true}).count(),0);
  assert.equal(await organizer.getByRole('columnheader',{name:'Difficulty',exact:true}).count(),0);
  await organizer.getByRole('link',{name:'Add question',exact:true}).click();
  assert.equal(await organizer.getByLabel('Category',{exact:true}).count(),0);
  assert.equal(await organizer.getByLabel('Difficulty',{exact:true}).count(),0);
  await organizer.getByLabel('Question',{exact:true}).fill('Managed MCQ fixture');
  for(let i=0;i<4;i++)await organizer.getByLabel('Choice '+(i+1),{exact:true}).fill(['Alpha','Beta','Gamma','Delta'][i]);
  await organizer.getByLabel('Correct choice',{exact:true}).selectOption('1');await organizer.getByLabel('Points',{exact:true}).fill('25');
  await organizer.getByRole('button',{name:'Save question',exact:true}).click();await organizer.waitForURL('**/admin?notice=saved');
  const managed=organizer.getByRole('row').filter({has:organizer.getByRole('cell',{name:'Managed MCQ fixture',exact:true})});
  await managed.getByRole('link',{name:'Edit',exact:true}).click();await organizer.getByLabel('Points',{exact:true}).fill('30');
  await organizer.getByRole('button',{name:'Save question',exact:true}).click();await organizer.waitForURL('**/admin?notice=saved');
  const saved=(await db.query("select choices,correct_answer,points from public.questions where question='Managed MCQ fixture'")).rows[0];
  assert.deepEqual(saved.choices,['Alpha','Beta','Gamma','Delta']);assert.equal(saved.correct_answer,'Beta');assert.equal(saved.points,30);
  assert.equal((await student.request.post(origin+'/api/admin/questions',{data:{question:'Unauthorized'}})).status(),401);
  await organizer.getByRole('link',{name:'Generate / print active QR codes',exact:true}).click();
  assert.equal(await organizer.locator('.qr-card').filter({has:organizer.getByRole('heading',{name:'Q001',exact:true})}).count(),0);
  assert.equal((await organizer.request.get(origin+'/api/admin/qr/10000000-0000-4000-8000-000000000001')).status(),404);
  await organizer.waitForFunction(()=>[...document.querySelectorAll('.qr-image')].every(image=>image.complete && image.naturalWidth>0));
  await organizer.emulateMedia({media:'print'});
  const print=await organizer.pdf({preferCSSPageSize:true,printBackground:true});assert.ok(print.length>1000);
  await organizer.emulateMedia({media:'screen'});
  console.log('PASS: hidden public admin link, retained authorization, MCQ create/edit, no category/difficulty controls, expired QR excluded and printing retained.');

  const students=await Promise.all(Array.from({length:100},async(_,i)=>{
    const response=await fetch(origin+'/api/registration',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name:'Burst Student '+i,rollNumber:'MCQ-LOAD-'+i})});
    assert.equal(response.status,201);return response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  }));
  const submit=(cookie,code,answer)=>fetch(origin+'/api/challenges/'+code,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({answer,points_awarded:999999,is_correct:true})});
  const raced=await Promise.all(students.map(cookie=>submit(cookie,'Q003','10')));
  assert.equal(raced.filter(r=>r.status===201).length,1);
  assert.equal(raced.filter(r=>r.status===410).length,99);
  const total=(await db.query("select sum(total_score)::int score from public.participants where roll_number like 'MCQ-LOAD-%'")).rows[0].score;
  assert.equal(total,10);
  const duplicate=await Promise.all([submit(students[0],'Q005','Hypertext Transfer Protocol'),submit(students[0],'Q005','Hypertext Transfer Protocol')]);
  assert.deepEqual(duplicate.map(r=>r.status).sort(),[201,409]);
  const distinct=await Promise.all([submit(students[1],'Q006','443'),submit(students[1],'Q007','def')]);
  assert.ok(distinct.every(r=>r.status===201));
  assert.equal((await submit(students[2],'Q008','injected choice')).status,400);
  const canonical=await student.request.get(origin+'/api/challenges/Q002');
  const canonicalBody=await canonical.json();assert.ok(!JSON.stringify(canonicalBody).includes('correct_answer'));
  assert.equal(canonicalBody.question.choices.length,4);
  const mismatch=(await db.query('select count(*)::int n from public.participants p where total_score<>(select coalesce(sum(points_awarded),0) from public.submissions s where s.participant_id=p.id)')).rows[0].n;
  assert.equal(mismatch,0);
  console.log('PASS: 100 competing correct answers produce exactly one winner/99 expired responses, duplicate protection, simultaneous distinct scores, invalid choice rejection and exact score reconciliation. Database execution is serialized locally; hosted lock contention remains to verify.');

  const scan=await window({width:390,height:844});
  await scan.context().addCookies(await other.context().cookies());
  const qrData='data:image/png;base64,'+(await qrPng(origin+'/challenge/Q004')).toString('base64');
  await scan.addInitScript(({qrData})=>{
    navigator.mediaDevices.getUserMedia=async()=>{
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=640;
      const image=new Image();image.src=qrData;await image.decode();
      const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,640,640);context.drawImage(image,40,40,560,560);
      const stream=canvas.captureStream(10);window.__scanTestStream=stream;window.__cameraCalls=(window.__cameraCalls||0)+1;return stream;
    };
  },{qrData});
  const homeResponse=await scan.goto(origin+'/challenge');
  assert.ok(homeResponse.headers()['permissions-policy'].includes('camera=(self)'));
  assert.equal(await scan.evaluate(()=>window.__cameraCalls||0),0);
  await scan.getByRole('button',{name:'Scan QR code',exact:true}).click();
  await scan.waitForURL('**/challenge/Q004',{timeout:30000});
  assert.equal(await scan.getByRole('radio').count(),4);
  const denied=await window({width:390,height:844});await denied.context().addCookies(await other.context().cookies());
  await denied.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');};});
  await denied.goto(origin+'/challenge');await denied.getByRole('button',{name:'Scan QR code',exact:true}).click();
  await denied.getByRole('alert').filter({hasText:'Camera permission was denied'}).waitFor();
  await denied.getByRole('button',{name:'Scan QR code',exact:true}).waitFor();
  await mkdir('test-results',{recursive:true});await scan.screenshot({path:'test-results/mcq-question-mobile.png',fullPage:true});
  console.log('PASS: actual QR decoder reads a generated QR from a simulated camera stream, opens the MCQ, requests no camera before clicking, and handles permission denial. Physical phone-camera testing is still required.');
  console.log('All transport uses an isolated test database and fake keys; no hosted event data was modified.');
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
