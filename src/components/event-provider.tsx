'use client';
import { createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode } from 'react';
import { eventRemaining,formatEventTime,parseEventState,type EventState } from '@/lib/event-types';

interface EventContextValue {event:EventState|null;available:boolean;open:boolean;remaining:number;refresh:()=>Promise<void>}
const EventContext=createContext<EventContextValue>({event:null,available:false,open:false,remaining:0,refresh:async()=>{}});
export const useEvent=()=>useContext(EventContext);

export default function EventProvider({children}:{children:ReactNode}) {
  const [event,setEvent]=useState<EventState|null>(null),[available,setAvailable]=useState(false),[loading,setLoading]=useState(true);
  const [now,setNow]=useState(0);
  const anchor=useRef({server:0,performance:0});
  const refreshRef=useRef<()=>Promise<void>>(async()=>{});
  const refresh=useCallback(()=>refreshRef.current(),[]);
  useEffect(()=>{
    let active=true,inFlight=false,queued=false,lastStarted=0;
    let controller:AbortController|undefined,scheduled:ReturnType<typeof setTimeout>|undefined;
    let removeChannel=()=>{};
    function schedule() {
      if(!active || scheduled)return;
      scheduled=setTimeout(()=>{scheduled=undefined;void fetchState();},Math.max(200+Math.random()*300,750-(performance.now()-lastStarted)));
    }
    async function fetchState() {
      if(!active || document.hidden)return;
      if(inFlight){queued=true;return;}
      inFlight=true;lastStarted=performance.now();controller=new AbortController();
      const deadline=setTimeout(()=>controller?.abort(),10000);
      try {
        const response=await fetch('/api/event',{cache:'no-store',signal:controller.signal});
        if(!response.ok)throw new Error('Unavailable');
        const state=parseEventState((await response.json()).event);
        if(active){
          const sampledNow=performance.now();
          anchor.current={server:Date.parse(state.server_time)+(sampledNow-lastStarted)/2,performance:sampledNow};
          setNow(anchor.current.server);setEvent(state);setAvailable(true);
        }
      }catch{if(active)setAvailable(false);}
      finally{clearTimeout(deadline);inFlight=false;if(active)setLoading(false);if(queued){queued=false;schedule();}}
    }
    refreshRef.current=fetchState;
    const ticker=setInterval(()=>{if(anchor.current.server)setNow(anchor.current.server+performance.now()-anchor.current.performance);},250);
    const poll=setInterval(schedule,6000+Math.random()*2000);
    const visible=()=>{if(!document.hidden)schedule();};
    document.addEventListener('visibilitychange',visible);window.addEventListener('focus',schedule);
    void fetchState();
    void (async()=>{
      try {
        const {getBrowserSupabaseClient}=await import('@/lib/supabase/browser');
        if(!active)return;
        const client=getBrowserSupabaseClient();
        const channel=client.channel('techno-utsav:event',{config:{private:false}})
          .on('broadcast',{event:'changed'},schedule).subscribe(status=>{if(status==='SUBSCRIBED')schedule();});
        removeChannel=()=>{void client.removeChannel(channel);};
      }catch{/* Polling remains authoritative if Realtime is unavailable. */}
    })();
    return ()=>{active=false;controller?.abort();clearInterval(ticker);clearInterval(poll);if(scheduled)clearTimeout(scheduled);document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',schedule);removeChannel();};
  },[]);
  const remaining=eventRemaining(event,now);
  const open=Boolean(available && event?.running && event.is_open && remaining>0);
  const value=useMemo(()=>({event,available,open,remaining,refresh}),[event,available,open,remaining,refresh]);
  const status=loading?'Checking challenge status…':!available?'Challenge status unavailable — reconnecting…':open?'Challenge is live':!event?.started_at?'Waiting for the organizer to start':!event.running?'Challenge stopped':'Time is up';
  return <EventContext.Provider value={value}><aside className={'event-clock qr-no-print'+(open?' is-running':'')} aria-label="Challenge timer">
    <span role="status">{status}</span><strong role="timer" aria-live="off" aria-label="Time remaining">{formatEventTime(remaining)}</strong>
  </aside>{children}</EventContext.Provider>;
}
