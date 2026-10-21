import type {BrowserWindow} from 'electron'
import type {BrowserService} from './browser'
// Animate the app surface while the native browser is represented by one still frame.
// The live browser and its automation session remain intact throughout the transition.
export class WindowMotion{
 private token=0;private phase:'opening'|'closing'|undefined;private timeout?:NodeJS.Timeout;private frame?:string
 constructor(private window:()=>BrowserWindow|undefined,private browser:BrowserService,private emit:(event:string,value:unknown)=>void){}
 private finish(token:number){if(token!==this.token||!this.phase)return;clearTimeout(this.timeout);if(this.phase==='closing')this.window()?.hide();this.phase=undefined;this.browser.freeze(false)}
 private async start(phase:'opening'|'closing'){
  const win=this.window();if(!win||win.isDestroyed())return
  const token=++this.token;this.phase=phase;clearTimeout(this.timeout)
  // A slow or unavailable capture must never block closing the window.
  this.frame=await Promise.race([this.browser.preview().catch(()=>undefined),new Promise<undefined>(resolve=>setTimeout(resolve,80))])||this.frame
  if(token!==this.token)return
  this.browser.freeze(true)
  if(phase==='opening'){win.show();win.focus()}
  this.emit('window-motion',{token,phase,image:this.frame})
  this.timeout=setTimeout(()=>this.finish(token),450)
 }
 hide(){if(this.phase==='closing')return;void this.start('closing')}
 show(){const win=this.window();if(!win)return;if(win.isMinimized())win.restore();if(win.isVisible()&&!this.phase){win.focus();return}void this.start('opening')}
 ready(token:number){this.finish(token)}
 dispose(){++this.token;clearTimeout(this.timeout)}
}
