import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const PORT=4467, URL=`http://localhost:${PORT}/personal-blog/`;
const srv=spawn('npx',['astro','preview','--port',String(PORT)],{cwd:process.cwd(),stdio:'ignore'});
const done=()=>{try{srv.kill('SIGTERM');}catch{}}; process.on('exit',done);
async function wait(){for(let i=0;i<60;i++){try{const r=await fetch(URL);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,400));}throw new Error('no server');}
try{
  await wait();
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1280,height:800}});
  await p.goto(URL,{waitUntil:'networkidle'}); await p.waitForTimeout(1500);
  for(const frac of [2/6+0.02, 3/6+0.02]){
    await p.evaluate(f=>{const m=document.documentElement.scrollHeight-window.innerHeight;window.scrollTo(0,m*f);},frac);
    await p.waitForTimeout(1400);
    const info = await p.evaluate(()=>{
      const m=document.documentElement.scrollHeight-window.innerHeight;
      return {progress: window.scrollY/m, stageGuess: (window.scrollY/m)*6};
    });
    console.log(frac.toFixed(3), JSON.stringify(info));
  }
  await b.close();
}finally{done();}
