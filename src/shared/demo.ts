export const demoOrders=Array.from({length:912},(_,i)=>({id:4821-i,name:['Linen Tote','Canvas Apron','Field Notebook','Wool Throw','Mug, Speckled'][i%5],day:[0,0,1,1,1,2,2,2,3,3,3,4,4,4,4,5,5,5,6,6,6][i%21],amount:(2500+(i*7919)%7800)/100,status:i%4?'Shipped':'Paid'}))
export const demoWeekly=Array.from({length:7},(_,d)=>Math.round(demoOrders.filter(o=>o.day===d).reduce((n,o)=>n+o.amount,0)*100)/100)
export const demoTotal=Math.round(demoWeekly.reduce((a,b)=>a+b,0)*100)/100

