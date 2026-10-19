import {test,expect} from '@playwright/test';
async function setup(page,mode='visible'){
  await page.goto('http://127.0.0.1:4173');await page.addScriptTag({path:'extension/core.js'});
  await page.evaluate(mode=>{window.lab=new NextClickLab.Predictor(document);window.lab.start(mode);},mode);
}
async function hover(page,id){await page.locator(id).hover();await expect.poll(()=>page.evaluate(()=>window.lab.prediction?.el.id)).toBe(id.slice(1));}
const stats=page=>page.evaluate(()=>window.lab.stats);
test('only visible enabled unoccluded clickables; score follows pointer and dwell',async({page})=>{
  await setup(page);
  expect(await page.evaluate(()=>['hidden','disabled','ariaDisabled','transparent','lowerButton'].map(id=>NextClickLab.eligible(document.getElementById(id),document)))).toEqual([false,false,false,false,false]);
  await page.evaluate(()=>{
    const form=document.createElement('form');form.innerHTML='<button id="form">Submit</button>';document.body.prepend(form);
    const cover=document.createElement('div');cover.id='cover';cover.style.cssText='position:fixed;inset:0;background:white;z-index:999';document.body.append(cover);
  });
  expect(await page.evaluate(()=>NextClickLab.eligible(document.getElementById('fern'),document))).toBe(false);
  expect(await page.evaluate(()=>NextClickLab.eligible(document.getElementById('form'),document))).toBe(false);
  await page.locator('#cover').evaluate(el=>el.remove());
  await hover(page,'#fern');const first=await page.evaluate(()=>window.lab.prediction.score);
  await page.waitForTimeout(450);expect(await page.evaluate(()=>window.lab.prediction.score)).toBeGreaterThan(first);
  await hover(page,'#moss');expect(await page.locator('[data-next-click-lab]').count()).toBe(1);
  expect(await page.locator('[data-next-click-lab]').evaluate(el=>getComputedStyle(el).pointerEvents)).toBe('none');
});
test('freeze previous guess before down; click coordinates never improve it',async({page})=>{
  await setup(page);await hover(page,'#fern');
  const rect=await page.locator('#moss').boundingBox();
  // A rapid move and down in one browser task leaves the already computed Fern guess intact.
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x+20,y:rect.y+20,button:'left',clickCount:1});
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x+20,y:rect.y+20,button:'left',clickCount:1});
  expect((await stats(page)).visible).toEqual({clicks:1,predictions:1,correct:0,keyboard:0});
  await hover(page,'#moss');await page.mouse.down();await page.waitForTimeout(200);await page.mouse.up();
  expect((await stats(page)).visible).toEqual({clicks:2,predictions:2,correct:1,keyboard:0});
  expect(await page.locator('#result').textContent()).toBe('Fixture action completed.');
});
test('no prediction counts as miss; keyboard separate; synthetic click ignored',async({page})=>{
  await setup(page);
  const r=await page.locator('#fern').boundingBox();
  const cdp=await page.context().newCDPSession(page);
  for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,x:r.x+20,y:r.y+20,button:'left',clickCount:1});
  expect((await stats(page)).visible).toEqual({clicks:1,predictions:0,correct:0,keyboard:0});
  await page.locator('#moss').focus();await page.keyboard.press('Enter');
  await page.locator('#moss').evaluate(el=>el.click());
  expect((await stats(page)).visible).toEqual({clicks:1,predictions:0,correct:0,keyboard:1});
});
test('hidden mode scores but reveals no guess or score',async({page})=>{
  await setup(page,'hidden');await hover(page,'#fern');
  expect(await page.locator('[data-next-click-lab]').isVisible()).toBe(false);
  expect(await page.evaluate(()=>window.lab.status().score)).toBeNull();
  await page.mouse.click((await page.locator('#fern').boundingBox()).x+30,(await page.locator('#fern').boundingBox()).y+30);
  expect((await stats(page)).hidden).toEqual({clicks:1,predictions:1,correct:1,keyboard:0});
  expect((await stats(page)).visible.clicks).toBe(0);
});
test('scroll, removal, disabled, opacity, SPA navigation invalidate; stale pointer expires',async({page})=>{
  await setup(page);await hover(page,'#fern');
  await page.locator('#fern').evaluate(el=>el.hidden=true);
  await expect.poll(()=>page.evaluate(()=>window.lab.prediction)).toBeNull();
  await hover(page,'#moss');await page.locator('#moss').evaluate(el=>el.disabled=true);
  await expect.poll(()=>page.evaluate(()=>window.lab.prediction)).toBeNull();
  await page.locator('#moss').evaluate(el=>el.disabled=false);await hover(page,'#moss');
  await page.evaluate(()=>history.pushState({},'','?new-view'));
  await expect.poll(()=>page.evaluate(()=>window.lab.prediction)).toBeNull();
  await hover(page,'#moss');await page.evaluate(()=>window.scrollTo(0,900));
  expect(await page.evaluate(()=>window.lab.validPrediction())).toBeNull();
  await hover(page,'#lowerButton');await page.locator('#lowerButton').evaluate(el=>el.remove());
  await expect.poll(()=>page.evaluate(()=>window.lab.prediction)).toBeNull();
  await page.evaluate(()=>window.scrollTo(0,0));await hover(page,'#moss');
  await page.waitForTimeout(1900);expect(await page.evaluate(()=>window.lab.validPrediction())).toBeNull();
});
test('teardown and repeated starts retain one overlay and no scoring while off',async({page})=>{
  await setup(page);await page.evaluate(()=>{for(let i=0;i<20;i++)window.lab.start();});
  expect(await page.locator('[data-next-click-lab]').count()).toBe(1);
  await hover(page,'#fern');await page.mouse.down();await page.mouse.up();
  expect((await stats(page)).visible.clicks).toBe(1);
  await page.evaluate(()=>window.lab.stop());expect(await page.locator('[data-next-click-lab]').count()).toBe(0);
  const ticks=await page.evaluate(()=>window.lab.work.ticks);await page.waitForTimeout(250);
  await page.locator('#moss').click();expect((await stats(page)).visible.clicks).toBe(1);
  expect(await page.evaluate(()=>window.lab.work.ticks)).toBe(ticks);
  await page.goto('http://127.0.0.1:4173/second.html');expect(await page.locator('[data-next-click-lab]').count()).toBe(0);
});
test('password page is blocked without reading field contents',async({page})=>{
  await setup(page);await page.evaluate(()=>{const input=document.createElement('input');input.type='password';document.body.append(input);});
  await expect.poll(()=>page.evaluate(()=>window.lab.enabled)).toBe(false);
  expect(await page.locator('[data-next-click-lab]').count()).toBe(0);
});
