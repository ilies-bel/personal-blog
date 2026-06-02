import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const PORT=4466, URL=`http://localhost:${PORT}/personal-blog/`;
const srv=spawn('npx',['astro','preview','--port',String(PORT)],{cwd:process.cwd(),stdio:'ignore'});
const done=()=>{try{srv.kill('SIGTERM');}catch{}}; process.on('exit',done);
async function wait(){for(let i=0;i<60;i++){try{const r=await fetch(URL);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,400));}throw new Error('no server');}
const errs=[];
try{
  await wait();
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1280,height:800}});
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());}); p.on('pageerror',e=>errs.push('pageerror: '+e.message));
  await p.goto(URL,{waitUntil:'networkidle'}); await p.waitForTimeout(1500);
  const states=[['4-yellow',3/6+0.02],['5-nebula',4/6+0.02],['6-paleblue',5/6+0.05]];
  for(const [name,frac] of states){
    await p.evaluate(f=>{const m=document.documentElement.scrollHeight-window.innerHeight;window.scrollTo(0,m*f);},frac);
    await p.waitForTimeout(1100);
    await p.screenshot({path:`scratchpad/state-${name}.png`,animations:'disabled',timeout:6000}).catch(()=>{});
  }
  await b.close();
}finally{done();}
console.log(JSON.stringify({errors:errs},null,2));
