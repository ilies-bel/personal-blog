import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const PORT=4469, URL=`http://localhost:${PORT}/personal-blog/`;
const srv=spawn('npx',['astro','preview','--port',String(PORT)],{cwd:process.cwd(),stdio:'ignore'});
const done=()=>{try{srv.kill('SIGTERM');}catch{}}; process.on('exit',done);
async function wait(){for(let i=0;i<60;i++){try{const r=await fetch(URL);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,400));}throw new Error('no server');}
try{
  await wait();
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1280,height:800}});
  await p.goto(URL,{waitUntil:'networkidle'}); await p.waitForTimeout(1200);
  // scroll all the way down progressively
  for(let i=1;i<=10;i++){
    await p.evaluate(y=>window.scrollTo(0,y), i*420);
    await p.waitForTimeout(120);
  }
  await p.waitForTimeout(800);
  const info = await p.evaluate(()=>{const m=document.documentElement.scrollHeight-window.innerHeight; return {scrollY:window.scrollY, max:m, progress:window.scrollY/m};});
  console.log('bottom:', JSON.stringify(info));
  await p.screenshot({path:'scratchpad/scroll-bottom.png',animations:'disabled'});
  await b.close();
}finally{done();}
