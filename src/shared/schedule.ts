import type { Schedule } from './types'
export function localParts(time: number, timeZone: string) {
 const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23' }).formatToParts(time)
 return Object.fromEntries(parts.map(p=>[p.type,p.value]))
}
export function nextOccurrence(schedule: Pick<Schedule,'kind'|'at'|'timeZone'>, after: number): number {
 const start=Date.parse(schedule.at)
 if (!Number.isFinite(start)) throw new Error('Invalid schedule time')
 if(schedule.kind==='once') return start > after ? start : Infinity
 const target=localParts(start,schedule.timeZone)
 const weekday=new Intl.DateTimeFormat('en',{timeZone:schedule.timeZone,weekday:'short'}).format(start)
 // Search actual minutes: preserves local wall clock across DST, skipping nonexistent times.
 const from=Math.floor(Math.max(start,after+60000)/60000)*60000
 for(let t=from;t<from+9*86400000;t+=60000){
  const p=localParts(t,schedule.timeZone)
  if(p.hour===target.hour&&p.minute===target.minute&&(schedule.kind==='daily'||new Intl.DateTimeFormat('en',{timeZone:schedule.timeZone,weekday:'short'}).format(t)===weekday)) return t
 }
 throw new Error('No next occurrence')
}
export function due(schedule: Schedule, now: number) { return schedule.enabled&&schedule.nextRunAt<=now&&(!schedule.retryAt||schedule.retryAt<=now) }
export function retryDelay(attempts: number) { return Math.min(30,2**Math.max(0,attempts-1))*60000 }

