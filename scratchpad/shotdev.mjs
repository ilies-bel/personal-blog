import { chromium } from 'playwright';
const URL='http://localhost:4321/personal-blog/';
const errs=[];
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1280,height:800}});
p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
p.on('pageerror',e=>errs.push('pageerror: '+e.message));
try{
  await p.goto(URL,{waitUntil:'networkidle',timeout:15000});
  await p.waitForTimeout(1500);
  // force the yellow-star stage directly via the debug hook (no scrolling)
  await p.evaluate(()=>{ window.__bhMorph = 2.6; });
  await p.waitForTimeout(1200);
  await p.screenshot({path:'scratchpad/dev-yellow-forced.png',animations:'disabled'});
  // also via real scroll to the 4th state
  await p.evaluate(()=>{ window.__bhMorph = undefined; const m=document.documentElement.scrollHeight-window.innerHeight; window.scrollTo(0,m*(3/6+0.02)); });
  await p.waitForTimeout(1400);
  await p.screenshot({path:'scratchpad/dev-yellow-scroll.png',animations:'disabled'});
}catch(e){errs.push('FATAL: '+e.message);}
await b.close();
console.log(JSON.stringify({errors:errs},null,2));
