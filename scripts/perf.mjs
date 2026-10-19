import {chromium} from '@playwright/test';import {writeFile} from 'node:fs/promises';import {server} from './serve.mjs';
const browser=await chromium.launch({channel:process.env.CHROME_CHANNEL||'chrome',headless:true});
const samples=[];
try{
 for(let repeat=0;repeat<3;repeat++)for(const mode of (repeat%2?['visible','hidden','off']:['off','hidden','visible'])){
  const page=await browser.newPage({viewport:{width:1280,height:900}});await page.goto('http://127.0.0.1:4173');
  await page.evaluate(()=>{document.body.innerHTML='<div id="grid" style="display:grid;grid-template-columns:repeat(20,1fr);gap:2px;padding:12px"></div>';const grid=document.getElementById('grid');for(let i=0;i<400;i++){const b=document.createElement('button');b.textContent=String(i);b.style.cssText='height:36px;padding:2px';grid.append(b);}});
  await page.addScriptTag({path:'extension/core.js'});
  await page.evaluate(mode=>{window.lab=new NextClickLab.Predictor(document);if(mode!=='off')window.lab.start(mode);},mode);
  const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
  const get=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  const start=await get(),wall=performance.now();
  for(let i=0;i<180;i++){await page.mouse.move(20+(i*19)%1200,20+(i*13)%740);await page.waitForTimeout(16);}
  const end=await get(),work=await page.evaluate(()=>window.lab.work);
  const sample={repeat,mode,wallMs:Math.round(performance.now()-wall),taskMs:+((end.TaskDuration-start.TaskDuration)*1000).toFixed(2),ticks:work.ticks,tickMeanMs:+(work.totalMs/(work.ticks||1)).toFixed(3),tickMaxMs:+work.maxMs.toFixed(3)};
  if(mode!=='off'&&(sample.ticks===0||sample.tickMeanMs>40))throw new Error(`Performance regression: ${JSON.stringify(sample)}`);
  samples.push(sample);await page.close();
 }
 const result={at:new Date().toISOString(),browser:browser.version(),platform:process.platform,method:'Three alternating rounds, identical 400-button page, 180 pointer moves each with 16ms requested spacing; fresh page each sample. CDP renderer TaskDuration delta includes fixture, automation and extension work. No navigation during sample. Tick mean budget <40ms (loose regression tripwire).',samples,limitations:'Microbenchmark, not production latency or memory proof. Wall time depends on input/automation scheduling. Native querySelectorAll scans page DOM; only first 400 matching candidates are evaluated. Compare task time and ticks across modes; never infer prediction accuracy.'};
 await writeFile('evidence/performance.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await browser.close();server.close();}
