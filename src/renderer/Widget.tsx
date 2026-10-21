export function Widget({html,title}:{html:string;title?:string}){
 const safe='<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;; script-src &apos;unsafe-inline&apos;; style-src &apos;unsafe-inline&apos;; img-src data:; connect-src &apos;none&apos;; form-action &apos;none&apos;;"><style>body{margin:0;padding:16px;color:#e8eaed;background:#181a1f;font:14px system-ui;color-scheme:dark}*{box-sizing:border-box}</style></head><body>'+html+'</body></html>'
 return <section className="widget-card"><div className="widget-head">{title||'可视化'}</div><iframe title={title||'可视化'} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={safe}/></section>
}

