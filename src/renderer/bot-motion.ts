// Motion equations adapted from Kuvo BotAvatar.swift; see THIRD_PARTY_NOTICES.md.
export type Pose={lift:number;x:number;y:number;tilt:number;spin:number;glance:number;blink:number;face?:string}
const random=(n:number,seed:number)=>{const x=Math.sin(n*12.9898+seed*78.233)*43758.5453;return x-Math.floor(x)}
function keys(p:number,points:number[][]){for(let i=1;i<points.length;i++){const [a,b]=[points[i-1],points[i]];if(p<=b[0]){const x=Math.max(0,Math.min(1,(p-a[0])/(b[0]-a[0])));return a[1]+(b[1]-a[1])*x*x*(3-2*x)}}return points.at(-1)![1]}
export function botPose(mood:string,t:number,seed:number,noticed=false,small=true):Pose{
 const p:Pose={lift:0,x:1,y:1,tilt:0,spin:0,glance:0,blink:0}
 const breathe=(depth:number,period:number)=>{const s=Math.sin(t*2*Math.PI/period);p.y*=1+depth*s;p.x*=1-depth*.5*s}
 const hop=(time:number,height:number,period:number)=>{const up=Math.abs(Math.sin(time*Math.PI/period));const land=(1-up)**8;p.lift=-height*up;p.y*=1+.06*up-.09*land;p.x*=1-.03*up+.08*land}
 const blink=(period:number)=>{const c=t%period;const shut=(at:number)=>Math.max(0,1-Math.abs(c-at)/.09);p.blink=Math.max(shut(period-.12),random(Math.floor(t/period),seed+3)<.3?shut(period-.42):0)}
 if(mood==='working'){
  const c=t%2.8;if(c<.62){hop(c,small?.14:.18,.62);p.tilt=Math.sin(c/.62*2*Math.PI)*9}else hop(c-.62,small?.045:.055,(2.8-.62)/5)
  const r=t%1.2/1.2;p.glance=r<.8?-.13+.26*r/.8:.13-.26*(r-.8)/.2;p.spin=t*60%360;blink(2.9)
 }else if(mood==='sleeping'){breathe(.045,3.6);p.tilt=Math.sin(t*2*Math.PI/7.2)*3;p.face='sleepy'
 }else if(mood==='watching'){
  breathe(.03,4.2);blink(3.8+seed%1.2);if(noticed)p.face='happy';else{const look=keys((t+seed*3)%6.4/6.4,[[0,0],[.1,0],[.2,-1],[.42,-1],[.52,1],[.78,1],[.88,0],[1,0]]);p.glance=.21*look;p.tilt=-7*look}
 }else if(mood==='waiting'){
  p.face='bright';const c=t%2.4;if(c<.4)hop(c,.12,.4);else if(c<1){const f=(c-.4)/.6;p.tilt=Math.sin(f*Math.PI*4)*11*(1-f)}blink(3.1)
 }else if(mood==='news'){
  p.face='happy';breathe(.03,2.6);const c=t%3.6;if(c<.9)hop(c,.12,.45)
 }else{
  breathe(.035,3.8);blink(3.4+seed%1.6)
  if(noticed){p.face='happy';hop(t,.08,.5)}else{
   const index=Math.floor(t/4.2),c=t-index*4.2,pick=random(index,seed)
   if(pick<.18){if(c<2.4)p.glance=.14*keys(c/2.4,[[0,0],[.12,-1],[.42,-1],[.56,1],[.84,1],[1,0]])}
   else if(pick<.3){if(c<.55)hop(c,.13,.55)}
   else if(pick<.44){if(c<1.7){const e=keys(c/1.7,[[0,0],[.22,1],[.78,1],[1,0]]);p.tilt=11*e*(random(index+7,seed)<.5?1:-1);p.glance=.06*e;if(e>.4)p.face='curious'}}
   else if(pick<.56){if(c<1.1){p.face='happy';hop(c,.06,.55)}}
   else if(pick<.66){if(c<2){const e=keys(c/2,[[0,0],[.3,1],[.65,1],[.85,-.35],[1,0]]);p.y*=1+.1*e;p.x*=1-.05*e;if(e>.4)p.face='sleepy'}}
   else if(pick<.76){if(c<.8)p.tilt=Math.sin(c/.8*Math.PI*4)*8*(1-c/.8)}
   else if(pick<.86){if(c<.9){p.spin=360*keys(c/.9,[[0,0],[1,1]]);hop(c,.07,.9)}}
  }
 }
 return p
}

// One clock for all visible avatars. No React render loop, no hidden-window work.
const subscribers=new Set<(seconds:number)=>void>()
let request=0,last=0
const reduced=matchMedia('(prefers-reduced-motion: reduce)')
function tick(now:number){request=0;if(document.hidden||reduced.matches||!subscribers.size)return;if(now-last>=1000/30){last=now;for(const frame of subscribers)frame(now/1000)}request=requestAnimationFrame(tick)}
function resume(){if(!request&&!document.hidden&&!reduced.matches&&subscribers.size)request=requestAnimationFrame(tick);else if((document.hidden||reduced.matches)&&request){cancelAnimationFrame(request);request=0}}
export function observeMotion(frame:(seconds:number)=>void){
 if(!subscribers.size){document.addEventListener('visibilitychange',resume);reduced.addEventListener('change',resume)}
 subscribers.add(frame);resume()
 return()=>{subscribers.delete(frame);if(!subscribers.size){cancelAnimationFrame(request);request=0;document.removeEventListener('visibilitychange',resume);reduced.removeEventListener('change',resume)}}
}
