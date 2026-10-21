export interface EventState {
  running:boolean; is_open:boolean; duration_seconds:number;
  started_at:string|null; ends_at:string|null; version:number; server_time:string;
}
export function parseEventState(value:unknown):EventState {
  const v=value as EventState|null;
  if(!v || typeof v.running!=='boolean' || typeof v.is_open!=='boolean' || !Number.isInteger(v.duration_seconds) || v.duration_seconds<1 || v.duration_seconds>86400 || !Number.isSafeInteger(v.version) || v.version<0 || !Number.isFinite(Date.parse(v.server_time)) || (v.ends_at!==null && !Number.isFinite(Date.parse(v.ends_at))) || (v.started_at!==null && !Number.isFinite(Date.parse(v.started_at))) || (v.running && !v.ends_at)) throw new Error('Invalid event status.');
  return v;
}
export function eventRemaining(state:EventState|null,serverNow:number) {
  return state?.running && state.ends_at ? Math.max(0,Date.parse(state.ends_at)-serverNow):0;
}
export function formatEventTime(milliseconds:number) {
  const seconds=Math.max(0,Math.ceil(milliseconds/1000));
  return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
}
export function validateEventAction(value:unknown) {
  if(!value || typeof value!=='object')return null;
  const v=value as Record<string,unknown>;
  if(!['start','stop','set_time'].includes(String(v.action)) || !Number.isSafeInteger(v.version) || (v.version as number)<0)return null;
  if(v.action!=='stop' && (!Number.isInteger(v.durationSeconds) || (v.durationSeconds as number)<1 || (v.durationSeconds as number)>86400))return null;
  return {action:v.action as 'start'|'stop'|'set_time',seconds:v.action==='stop'?null:v.durationSeconds as number,version:v.version as number};
}
