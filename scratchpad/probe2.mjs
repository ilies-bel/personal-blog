import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const PORT=4468, URL=`http://localhost:${PORT}/personal-blog/`;
const srv=spawn('npx',['astro','preview','--port',String(PORT)],{cwd:process.cwd(),stdio:'ignore'});
const done=()=>{try{srv.kill('SIGTERM');}catch{}}; process.on('exit',done);
async function wait(){for(let i=0;i<60;i++){try{const r=await fetch(URL);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,400));}throw new Error('no server');}
try{
  await wait();
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1280,height:800}});
  await p.goto(URL,{waitUntil:'networkidle'}); await p.waitForTimeout(1500);
  const info = await p.evaluate(()=>{
    const track=document.querySelector('.scene-track');
    const stage=document.querySelector('.scene-stage');
    return {
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      bodyHeight: document.body.scrollHeight,
      trackH: track? track.getBoundingClientRect().height : null,
      stageH: stage? stage.getBoundingClientRect().height : null,
      stageCount: document.querySelectorAll('.scene-stage').length,
      bodyClass: document.body.className,
      trackDisplay: track? getComputedStyle(track).display : null,
    };
  });
  console.log(JSON.stringify(info,null,2));
  await b.close();
}finally{done();}
