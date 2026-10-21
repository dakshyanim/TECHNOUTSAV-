'use client';
import {useEffect,useState} from 'react';
import {useEvent} from '@/components/event-provider';

export default function AdminEventControl() {
  const {event,available,open,remaining,refresh}=useEvent();
  const [minutes,setMinutes]=useState('30'),[dirty,setDirty]=useState(false),[pending,setPending]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{if(event && !dirty)setMinutes(String(Math.ceil((open?remaining/1000:event.duration_seconds)/60)));},[event,dirty,open,remaining]);
  async function control(action:'start'|'stop'|'set_time') {
    if(pending || !event || !available)return;
    const duration=Number(minutes);
    if(action!=='stop' && (!Number.isInteger(duration) || duration<1 || duration>1440)){setMessage('Enter 1–1440 whole minutes.');return;}
    setPending(true);setMessage('');
    try {
      const response=await fetch('/api/admin/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,durationSeconds:duration*60,version:event.version}),signal:AbortSignal.timeout(30000)});
      const data=await response.json();
      if(!response.ok){setMessage(data.message || 'Unable to update the event.');return;}
      setDirty(false);setMessage(action==='start'?'Challenge started.':action==='stop'?'Challenge stopped.':'Timer updated.');
    }catch{setMessage('Unable to confirm the change. Refresh event status before trying again.');}
    finally{await refresh();setPending(false);}
  }
  return <section className="admin-event-control"><h2>Challenge timer and access</h2>
    <p>Current status: <strong>{open?'Live':event?.started_at?'Closed':'Not started'}</strong></p>
    {!available && <p role="alert">Event controls unavailable. Check the database connection and apply migration <code>202610220011_event_timer.sql</code>.</p>}
    <label htmlFor="event-minutes">{open?'Remaining time (minutes)':'Challenge duration (minutes)'}</label>
    <input id="event-minutes" type="number" min={1} max={1440} step={1} value={minutes} disabled={pending || !available} onChange={e=>{setMinutes(e.target.value);setDirty(true);}}/>
    <p>Changing the timer while live sets the remaining time from now. Starting again does not reset scores, attempts or expired QR codes.</p>
    <div className="admin-nav"><button type="button" disabled={pending || !available || open} onClick={()=>void control('start')}>Start challenge</button>
      <button type="button" disabled={pending || !available} onClick={()=>void control('set_time')}>{open?'Set remaining time':'Save duration'}</button>
      <button type="button" disabled={pending || !available || !open} onClick={()=>void control('stop')}>Stop challenge</button></div>
    {message && <p role="status">{message}</p>}
  </section>;
}
