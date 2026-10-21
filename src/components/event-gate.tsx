'use client';
import {useEffect,useRef,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {useEvent} from '@/components/event-provider';

export default function EventGate({children,refreshOnOpen=false}:{children:ReactNode;refreshOnOpen?:boolean}) {
  const {open,event,available}=useEvent();const router=useRouter();const refreshed=useRef(false);
  useEffect(()=>{if(open && refreshOnOpen && !refreshed.current){refreshed.current=true;router.refresh();}},[open,refreshOnOpen,router]);
  if(open)return children;
  return <section className="event-waiting"><h2>{!available?'Checking challenge status':!event?.started_at?'The challenge has not started':'The challenge is closed'}</h2>
    <p>{!available?'Please wait while we reconnect. Questions and answers stay locked until the server confirms the event is live.':'Questions and submissions are available only while the organizer has started the challenge and time remains.'}</p>
    <p>This page updates automatically when the challenge starts.</p>
  </section>;
}
