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
  questions: ['id','challenge_code','question','category','difficulty','active','correct_answer','points'],
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
      const filters=[], args=[]; let ordering='';
      for (const [column,value] of url.searchParams) {
        if (column === 'select') continue;
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
      let sql=`select ${columns.join(',')} from public.${route}${filters.length?' where '+filters.join(' and '):''}${ordering}`;
      if (req.method==='POST' || req.method==='PATCH') {
        assert.equal(route,'questions');
        const keys=Object.keys(body); assert.ok(keys.every(k=>['question','category','difficulty','active','correct_answer','points'].includes(k)));
        const assignments=keys.map(key=>{args.push(body[key]); return `${key}=$${args.length}`;});
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
    env:{...process.env,NODE_ENV:'development',APP_ORIGIN:origin,NEXT_PUBLIC_SUPABASE_URL:backendOrigin,
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
    return context.newPage();
  }
  const display=await window({width:1920,height:1080});
  const phone=await window({width:390,height:844});
  const studentA=await window({width:390,height:844});
  const studentB=await window({width:390,height:844});
  await Promise.all([display.goto(`${origin}/leaderboard`),phone.goto(`${origin}/leaderboard`)]);
  await display.getByRole('status').filter({hasText:'Live'}).waitFor({timeout:60000});
  async function register(page,name,roll) {
    await page.goto(`${origin}/?next=${encodeURIComponent('/challenge/Q001')}`);
    await page.getByLabel('Name',{exact:true}).fill(name);
    await page.getByLabel('Roll Number').fill(roll);
    await page.getByRole('button',{name:'START CHALLENGE'}).click();
    await page.waitForURL('**/challenge/Q001',{timeout:60000});
    await page.getByLabel('Your answer').waitFor();
  }
  await register(studentA,'Earlier Student','UI-A');
  await register(studentB,'Later Student','UI-B');
  const snapshot=async(page,name,score)=>{
    const row=page.getByRole('row').filter({has:page.getByRole('cell',{name,exact:true})});
    await row.getByRole('cell',{name:String(score),exact:true}).waitFor({timeout:30000});
    return row;
  };
  await snapshot(display,'Earlier Student',0);
  const answer='Central Processing Unit';
  await studentA.getByLabel('Your answer').fill(answer); await studentA.getByRole('button',{name:'SUBMIT ANSWER'}).click();
  await studentA.getByRole('heading',{name:'Correct answer!'}).waitFor();
  await Promise.all([snapshot(display,'Earlier Student',10),snapshot(phone,'Earlier Student',10)]);
  await studentB.getByLabel('Your answer').fill(answer); await studentB.getByRole('button',{name:'SUBMIT ANSWER'}).click();
  await studentB.getByRole('heading',{name:'Correct answer!'}).waitFor();
  await Promise.all([snapshot(display,'Later Student',10),snapshot(phone,'Later Student',10)]);
  assert.deepEqual(await display.locator('.leaderboard-name').allTextContents(),['Earlier Student','Later Student']);
  const full=await display.request.get(`${origin}/api/leaderboard`);
  const publicSnapshot=await full.json(); assert.ok(!JSON.stringify(publicSnapshot).includes('roll_number'));
  assert.ok(!JSON.stringify(publicSnapshot).includes('correct_answer'));
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Mobile layout overflows');
  await mkdir('test-results',{recursive:true});
  await display.screenshot({path:'test-results/leaderboard-projector.png',fullPage:true});
  await phone.screenshot({path:'test-results/leaderboard-mobile.png',fullPage:true});
  console.log('PASS: separate participant windows registered/submitted; projector and mobile windows updated automatically without reload; reach-time tie order and private-field exclusion.');

  await studentA.goto(`${origin}/admin`); await studentA.waitForURL('**/admin/login');
  assert.equal((await studentA.request.get(`${origin}/api/admin/export`)).status(),401);
  assert.equal((await studentA.request.post(`${origin}/api/admin/questions`,{data:{question:'Unauthorized'}})).status(),401);
  const organizer=await window({width:1280,height:900});
  await organizer.goto(`${origin}/admin/login`);
  await organizer.getByLabel('Administrator password').fill('wrong');
  await organizer.getByRole('button',{name:'LOG IN',exact:true}).click();
  await organizer.getByRole('alert').filter({hasText:'Invalid administrator password.'}).waitFor();
  await organizer.getByLabel('Administrator password').fill(adminPassword);
  await organizer.getByRole('button',{name:'LOG IN',exact:true}).click();
  await organizer.waitForURL(`${origin}/admin`);
  await organizer.getByRole('heading',{name:'Admin dashboard',exact:true}).waitFor();
  assert.equal(await organizer.locator('.admin-stats strong').nth(0).textContent(),'2');
  assert.equal(await organizer.locator('.admin-stats strong').nth(1).textContent(),'10');
  assert.equal(await organizer.locator('.admin-stats strong').nth(2).textContent(),'2');
  assert.equal((await organizer.request.post(`${origin}/api/admin/questions`,{headers:{Origin:'https://untrusted.example'},data:{}})).status(),403);
  await organizer.getByRole('link',{name:'Add question',exact:true}).click();
  await organizer.getByLabel('Question text').fill('Admin test question?');
  await organizer.getByLabel('Category',{exact:true}).fill('Test category');
  await organizer.getByLabel('Difficulty').selectOption('medium');
  await organizer.getByLabel('Correct answer').fill('A');
  await organizer.getByLabel('Points',{exact:true}).fill('20');
  await organizer.getByRole('button',{name:'Save question',exact:true}).click();
  await organizer.waitForURL('**/admin?notice=saved');
  let questionRow=organizer.getByRole('row').filter({has:organizer.getByRole('cell',{name:'Admin test question?',exact:true})});
  await questionRow.getByRole('link',{name:'Edit',exact:true}).click();
  await organizer.getByLabel('Question text').fill('Edited admin question?');
  await organizer.getByLabel('Category',{exact:true}).fill('Coding');
  await organizer.getByLabel('Difficulty').selectOption('hard');
  await organizer.getByLabel('Correct answer').fill('B');
  await organizer.getByLabel('Points',{exact:true}).fill('25');
  await organizer.getByRole('button',{name:'Save question',exact:true}).click();
  await organizer.waitForURL('**/admin?notice=saved');
  questionRow=organizer.getByRole('row').filter({has:organizer.getByRole('cell',{name:'Edited admin question?',exact:true})});
  await questionRow.getByRole('cell',{name:'Coding',exact:true}).waitFor();
  await questionRow.getByRole('cell',{name:'25',exact:true}).waitFor();
  await questionRow.getByRole('button',{name:'Deactivate',exact:true}).click();
  await questionRow.getByRole('cell',{name:'Inactive',exact:true}).waitFor();
  await questionRow.getByRole('button',{name:'Activate',exact:true}).click();
  await questionRow.getByRole('cell',{name:'Active',exact:true}).waitFor();
  const exported=await organizer.request.get(`${origin}/api/admin/export`);
  assert.equal(exported.status(),200);
  assert.ok(exported.headers()['content-type'].includes('text/csv'));
  const csv=await exported.text(); assert.ok(csv.includes('Earlier Student') && csv.includes('UI-A'));
  await organizer.screenshot({path:'test-results/admin-dashboard.png',fullPage:true});
  const adminCookie=(await organizer.context().cookies()).find(c=>c.name==='techno-admin');
  assert.ok(adminCookie.httpOnly && adminCookie.sameSite==='Strict');
  const seedId='10000000-0000-4000-8000-000000000001';
  assert.equal((await studentA.request.get(`${origin}/api/admin/qr/${seedId}`)).status(),401);
  await studentA.goto(`${origin}/admin/qr`); await studentA.waitForURL('**/admin/login');
  const editedId=(await questionRow.getByRole('link',{name:'Edit',exact:true}).getAttribute('href')).split('/').at(-1);
  await questionRow.getByRole('button',{name:'Deactivate',exact:true}).click();
  await questionRow.getByRole('cell',{name:'Inactive',exact:true}).waitFor();
  await organizer.getByRole('link',{name:'Generate / print active QR codes',exact:true}).click();
  await organizer.getByRole('heading',{name:'Question QR codes',exact:true}).waitFor();
  assert.equal(await organizer.locator('.qr-card').count(),10);
  await organizer.waitForFunction(()=>[...document.querySelectorAll('.qr-image')].every(image=>image.complete && image.naturalWidth>0),{},{timeout:60000});
  assert.ok(!(await organizer.locator('.qr-card').allTextContents()).join('').includes('Central Processing Unit'));
  assert.equal((await organizer.request.get(`${origin}/api/admin/qr/${editedId}`)).status(),404);
  const pngResponse=await organizer.request.get(`${origin}/api/admin/qr/${seedId}?format=png&download=1`);
  assert.equal(pngResponse.status(),200);
  assert.ok(pngResponse.headers()['content-disposition'].includes('attachment; filename="qr-Q001.png"'));
  const qrImage=PNG.sync.read(await pngResponse.body());
  assert.equal(jsQR(new Uint8ClampedArray(qrImage.data),qrImage.width,qrImage.height)?.data,`${origin}/challenge/Q001`);
  const svgResponse=await organizer.request.get(`${origin}/api/admin/qr/${seedId}?format=svg&download=1`);
  assert.equal(svgResponse.status(),200); assert.ok((await svgResponse.text()).includes('<svg'));
  await organizer.screenshot({path:'test-results/admin-qr-codes.png',fullPage:true});
  await organizer.emulateMedia({media:'print'});
  const imageWidth=await organizer.locator('.qr-image').first().evaluate(image=>image.getBoundingClientRect().width);
  assert.ok(Math.abs(imageWidth-80*96/25.4)<1,'Print QR must be 80mm wide.');
  const renderedQr=PNG.sync.read(await organizer.locator('.qr-card').filter({has:organizer.getByRole('heading',{name:'Q001',exact:true})}).locator('.qr-image').screenshot());
  assert.equal(jsQR(new Uint8ClampedArray(renderedQr.data),renderedQr.width,renderedQr.height)?.data,`${origin}/challenge/Q001`,'Rendered print SVG must decode to the same URL.');
  const pdf=await organizer.pdf({path:'test-results/qr-print-sheet.pdf',preferCSSPageSize:true,printBackground:true});
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,10,'Print sheet must have one active question per A4 page.');
  await organizer.emulateMedia({media:'screen'});
  await organizer.goto(`${origin}/admin/qr/${seedId}`);
  await organizer.waitForFunction(()=>document.querySelector('.qr-image')?.naturalWidth>0);
  assert.equal(await organizer.locator('.qr-card').count(),1);
  assert.ok((await organizer.locator('.qr-question-id').textContent()).includes(seedId));
  await organizer.evaluate(()=>{window.print=()=>{window.__qrPrintCalled=true;};});
  await organizer.getByRole('button',{name:'Print / Save as PDF',exact:true}).click();
  assert.ok(await organizer.evaluate(()=>window.__qrPrintCalled===true));
  await organizer.goto(`${origin}/admin`);
  console.log('PASS: active-only QR list, participant denial, protected SVG/PNG downloads, decoded PNG and rendered print SVG URLs, associated IDs, single print and ten A4 print pages.');
  await studentA.context().addCookies([{name:'techno-admin',value:adminCookie.value+'x',url:origin}]);
  assert.equal((await studentA.request.get(`${origin}/api/admin/export`)).status(),401);
  await organizer.getByRole('button',{name:'Log out',exact:true}).click();
  await organizer.waitForURL('**/admin/login');
  assert.equal((await organizer.request.get(`${origin}/api/admin/export`)).status(),401);
  await studentA.context().addCookies([{name:'techno-admin',value:adminCookie.value,url:origin}]);
  assert.equal((await studentA.request.get(`${origin}/api/admin/export`)).status(),401,'Copied admin cookie must be rejected after logout.');
  const students=await Promise.all(Array.from({length:100},async(_,i)=>{
    const response=await fetch(`${origin}/api/registration`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name:`Load Student ${i}`,rollNumber:`LOAD-${i}`})});
    assert.equal(response.status,201);
    return response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  }));
  const submit=(cookie,answer='Central Processing Unit',extra={})=>fetch(`${origin}/api/challenges/Q001`,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({answer,...extra})});
  const openingStart=performance.now();
  const opened=await Promise.all(students.map(cookie=>fetch(`${origin}/api/challenges/Q001`,{headers:{Cookie:cookie}})));
  assert.ok(opened.every(response=>response.status===200));
  console.log(`EVENT: 100 simultaneous challenge opens completed in ${Math.round(performance.now()-openingStart)}ms (local development / serialized PostgreSQL).`);
  const queryStart=leaderboardQueries;
  const viewingStart=performance.now();
  const views=await Promise.all(Array.from({length:100},()=>fetch(`${origin}/api/leaderboard`)));
  assert.ok(views.every(response=>response.status===200));
  for(const response of views) assert.ok((await response.json()).entries.length>=100);
  console.log(`EVENT: 100 simultaneous leaderboard HTTP reads completed in ${Math.round(performance.now()-viewingStart)}ms; ${leaderboardQueries-queryStart} underlying public queries, including ongoing display refreshes.`);
  const signalStart=(await db.query('select count(*)::int n from realtime.test_broadcasts')).rows[0].n;
  const submissionStart=performance.now();
  const load=await Promise.all(students.map(cookie=>submit(cookie,'Central Processing Unit',{participant_id:seedId,points_awarded:999999,is_correct:false})));
  assert.ok(load.every(r=>r.status===201),'100 simultaneous HTTP submissions must succeed.');
  const submissionElapsed=performance.now()-submissionStart;
  const signalCount=(await db.query('select count(*)::int n from realtime.test_broadcasts')).rows[0].n-signalStart;
  assert.ok(signalCount<=Math.ceil(submissionElapsed/2000)+1,'Notification fan-out was not bounded.');
  console.log(`EVENT: 100 submissions completed in ${Math.round(submissionElapsed)}ms with ${signalCount} database broadcasts.`);
  const repeated=await Promise.all(Array.from({length:35},()=>submit(students[0])));
  assert.ok(repeated.some(r=>r.status===429),'Repeated requests must hit the shared limiter.');
  assert.ok(repeated.every(r=>[409,429].includes(r.status)),'Repeated requests must never earn additional points.');
  const totals=await db.query("select count(*)::int count,sum(total_score)::int score from public.participants where roll_number like 'LOAD-%'");
  assert.equal(totals.rows[0].count,100); assert.equal(totals.rows[0].score,1000);
  const distinct=await Promise.all(['Q002','Q003'].map(code=>fetch(`${origin}/api/challenges/${code}`,{method:'POST',headers:{Origin:origin,Cookie:students[98],'Content-Type':'application/json'},body:JSON.stringify({answer:code==='Q002'?'Stack':'10'})})));
  assert.ok(distinct.every(response=>response.status===201));
  const consistent=await db.query("select p.total_score=(select sum(s.points_awarded) from public.submissions s where s.participant_id=p.id) ok from public.participants p where roll_number='LOAD-98'");
  assert.equal(consistent.rows[0].ok,true,'Distinct simultaneous answers must not lose score increments.');
  const race=await Promise.all(Array.from({length:2},()=>fetch(`${origin}/api/challenges/Q002`,{method:'POST',headers:{Origin:origin,Cookie:students[99],'Content-Type':'application/json'},body:JSON.stringify({answer:'Stack',total_score:999999})})));
  assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);
  for (const code of ['INVALID!','Q-NOTFOUND']) {
    assert.equal((await fetch(`${origin}/api/challenges/${encodeURIComponent(code)}`,{headers:{Cookie:students[99]}})).status,404);
  }
  assert.equal((await fetch(`${origin}/api/challenges/Q001`,{headers:{Cookie:'techno-session='+ 'f'.repeat(64)}})).status,401);
  // Lose the HTTP response AFTER the server commits; reload must find the attempt.
  const recovery=await window({width:390,height:844});
  const [cookieName,cookieValue]=students[96].split(';')[0].split('=');
  await recovery.context().addCookies([{name:cookieName,value:cookieValue,url:origin}]);
  await recovery.goto(`${origin}/challenge/Q004`);
  await recovery.route('**/api/challenges/Q004',async route=>{await route.fetch(); await route.abort('failed');});
  await recovery.getByLabel('Your answer').fill('SELECT');
  await recovery.getByRole('button',{name:'SUBMIT ANSWER',exact:true}).click();
  await recovery.getByRole('alert').filter({hasText:'Unable to confirm submission'}).waitFor();
  await recovery.unroute('**/api/challenges/Q004');
  await recovery.reload();
  await recovery.getByText('You have already attempted this challenge.',{exact:true}).waitFor();
  const recorded=await db.query("select count(*)::int n from public.submissions s join public.participants p on p.id=s.participant_id join public.questions q on q.id=s.question_id where p.roll_number='LOAD-96' and q.challenge_code='Q004'");
  assert.equal(recorded.rows[0].n,1);
  // Keep old standings during an API outage, then recover by polling without reload.
  await display.route('**/api/leaderboard',route=>route.fulfill({status:503,contentType:'application/json',body:'{"message":"Test outage"}'}));
  await display.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await display.getByRole('status').filter({hasText:'Reconnecting'}).waitFor();
  assert.ok(await display.locator('tbody tr').count()>0);
  await display.unroute('**/api/leaderboard');
  sockets.clear(); // Simulate missing Realtime delivery; canonical polling must repair it.
  await display.getByRole('status').filter({hasText:'Live'}).waitFor({timeout:30000});
  await snapshot(display,'Load Student 96',20);
  console.log('PASS: lost submission response records exactly one attempt; leaderboard preserves old standings on 503 and polling recovers without Realtime or browser reload; distinct simultaneous score updates remain consistent.');
  console.log('PASS: 100 concurrent HTTP registrations/submissions, ignored forged grading/identity, repeated-request limits and copied admin cookie rejection after logout. PostgreSQL engine serializes queries; hosted lock contention remains a separate check.');
  console.log('PASS: participant denied admin/CSV/writes; wrong password; admin login/cookie; counts; add/edit/activate/deactivate; CSV; CSRF; tampered cookie; logout.');
  console.log('Transport is simulated; hosted Supabase Realtime delivery still needs configured credentials.');
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
