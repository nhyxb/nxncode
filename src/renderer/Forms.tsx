import {useState} from 'react'
import {MessageCircle,ExternalLink,Check} from 'lucide-react'
import {bridge} from './bridge'
import type {Wire} from '../shared/types'
export function defaults(fields:Wire[]=[]){return Object.fromEntries(fields.filter(f=>f.default!==undefined).map(f=>[f.key,f.default]))}
export function activeFields(fields:Wire[],values:Wire){return fields.filter(f=>!f.hidden&&(f.when||[]).every((c:Wire)=>c.op==='neq'?values[c.key]!==c.value:values[c.key]===c.value))}
// Fields with engine-provided options render as one-tap choices: a question
// should offer its recommended answers directly instead of a dropdown.
function Options({field,value,onPick}:{field:Wire;value:unknown;onPick:(value:string)=>void}){
 return <span className="choice-row" role="radiogroup" aria-label={field.title||field.key}>{(field.options||[]).map((option:Wire)=><button type="button" role="radio" aria-checked={value===option.value} key={option.value} className={'choice '+(value===option.value?'selected':'')} title={option.description} onClick={()=>onPick(option.value)}>{option.label}{option.description&&<small>{option.description}</small>}</button>)}</span>
}
export function Fields({fields,values,onChange}:{fields:Wire[];values:Wire;onChange:(v:Wire)=>void}){
 return <div className="dynamic-fields">{activeFields(fields,values).map(f=><label key={f.key}><span>{f.title||f.key}{f.required?' *':''}</span>{f.description&&<small>{f.description}</small>}{f.type==='boolean'?<input type="checkbox" checked={!!values[f.key]} onChange={e=>onChange({...values,[f.key]:e.target.checked})}/>:f.type==='external'?<span><button className="text-button" type="button" onClick={()=>void bridge.invoke('external',{url:f.url})}><ExternalLink size={12}/>{f.title||'Open'}</button><input type="checkbox" required={f.required} checked={!!values[f.key]} onChange={e=>onChange({...values,[f.key]:e.target.checked})}/></span>:f.type==='multiselect'?<select multiple value={values[f.key]||[]} onChange={e=>onChange({...values,[f.key]:[...e.target.selectedOptions].map(o=>o.value)})}>{(f.options||[]).map((o:Wire)=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:f.options?.length&&!f.custom?<Options field={f} value={values[f.key]} onPick={value=>onChange({...values,[f.key]:value})}/>:<input required={f.required} type={f.type==='integer'||f.type==='number'?'number':f.format==='password'?'password':'text'} step={f.type==='integer'?1:'any'} min={f.minimum} max={f.maximum} pattern={f.pattern} autoComplete="off" placeholder={f.placeholder} value={values[f.key]??''} onChange={e=>onChange({...values,[f.key]:f.type==='integer'||f.type==='number'?Number(e.target.value):e.target.value})}/>}</label>)}</div>
}
function singleChoice(form:Wire){const fields=form.fields||[];return fields.length===1&&fields[0].options?.length&&!fields[0].custom?fields[0]:undefined}
export function QuestionCard({form,sessionID,onDone,onError,t}:{form:Wire;sessionID:string;onDone:()=>void;onError:(e:unknown)=>void;t:(a:string,b:string)=>string}){
 const [values,setValues]=useState<Wire>(()=>defaults(form.fields))
 const [error,setError]=useState('')
 const quick=singleChoice(form)
 function submit(answer:Wire){
  const missing=activeFields(form.fields||[],answer).find(f=>f.required&&(answer[f.key]===undefined||answer[f.key]===''))
  if(missing){setError(t('请选择或填写：','Choose or fill: ')+(missing.title||missing.key));return}
  setError('')
  void bridge.invoke('session.form',{id:sessionID,form:form.id,answer}).then(onDone).catch(onError)
 }
 return <section className="permission-card"><MessageCircle size={18}/><form onSubmit={e=>{e.preventDefault();submit(values)}}><strong>{form.title||t('需要补充信息','More information needed')}</strong>
 {quick?<span className="choice-row" role="radiogroup" aria-label={quick.title||quick.key}>{(quick.options||[]).map((option:Wire)=><button type="button" role="radio" aria-checked={values[quick.key]===option.value} className={'choice '+(values[quick.key]===option.value?'selected':'')} key={option.value} title={option.description} onClick={()=>{const answer={...values,[quick.key]:option.value};setValues(answer);submit(answer)}}>{option.label}{option.description&&<small>{option.description}</small>}</button>)}</span>:<Fields fields={form.fields||[]} values={values} onChange={setValues}/>}
 {error&&<p className="form-error">{error}</p>}
 <div className="row-actions">{!quick&&<button type="submit" className="button secondary"><Check size={13}/>{t('提交','Submit')}</button>}<button className="text-button" type="button" onClick={()=>void bridge.invoke('session.form',{id:sessionID,form:form.id,dismiss:true}).then(onDone).catch(onError)}>{t('稍后','Not now')}</button></div></form></section>
}
