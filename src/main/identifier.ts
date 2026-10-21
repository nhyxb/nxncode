import {randomInt} from 'node:crypto'
let last=0,counter=0
export function messageID(now=Date.now()){counter=now===last?counter+1:1;last=now;const time=((BigInt(now)*4096n+BigInt(counter))&0xffffffffffffn).toString(16).padStart(12,'0');const alphabet='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';return 'msg_'+time+Array.from({length:14},()=>alphabet[randomInt(62)]).join('')}

