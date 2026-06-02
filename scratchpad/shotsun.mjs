import { chromium } from 'playwright';
const URL='http://localhost:4321/personal-blog/';
const errs=[];
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1280,height:1280},deviceScaleFactor:2});
p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
p.on('pageerror',e=>errs.push('pageerror: '+e.message));
async function shoot(stage,name){
  await p.evaluate(s=>{ window.__bhMorph = s; }, stage);
  await p.waitForTimeout(1500);
  await p.screenshot({path:`scratchpad/${name}-full.png`,animations:'disabled'});
  await p.screenshot({path:`scratchpad/${name}-crop.png`,clip:{x:300,y:300,width:680,height:680},animations:'disabled'});
}
try{
  await p.goto(URL,{waitUntil:'networkidle',timeout:15000});
  await p.waitForTimeout(1200);
  await shoot(2.0,'redgiant');   // red giant (stage 2)
  await shoot(2.6,'sun');        // yellow sun (stage 2.6)
}catch(e){errs.push('FATAL: '+e.message);}
await b.close();
console.log(JSON.stringify({errors:errs},null,2));
