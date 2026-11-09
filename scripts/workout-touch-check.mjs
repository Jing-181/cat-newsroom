// Isolated Chromium/CDP regression. No external network, no app login or sync bootstrap.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
const out = new URL('../.artifacts/workout-touch/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--user-data-dir=${out}profile-${Date.now()}`,'--remote-debugging-port=9338','about:blank'], {stdio:'ignore'});
let ws;
try {
  let target;
  for (let i=0;i<60;i++) { try { target=(await (await fetch('http://127.0.0.1:9338/json')).json()).find(x=>x.type==='page'); if(target) break; } catch {} await new Promise(r=>setTimeout(r,100)); }
  if(!target) throw Error('Isolated Chrome did not start');
  ws=new WebSocket(target.webSocketDebuggerUrl); await once(ws,'open');
  let id=0; const pending=new Map();
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.id){const p=pending.get(m.id); pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);} else if(m.method==='Fetch.requestPaused'){const p=m.params; send(/^http:\/\/127\.0\.0\.1:5176\//.test(p.request.url)?'Fetch.continueRequest':'Fetch.failRequest', {requestId:p.requestId,...(/^http:\/\/127\.0\.0\.1:5176\//.test(p.request.url)?{}:{errorReason:'BlockedByClient'})});}});
  await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await send('Page.navigate',{url:'http://127.0.0.1:5176/@fs/Users/hugecore/Jing/cat-newsroom/tests/fixtures/workout-touch.html'});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression:`(async()=>{ return await eval(${JSON.stringify(expression)}); })()`,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  for(let i=0;i<60;i++){if(await evaluate('!!window.ready'))break;await new Promise(r=>setTimeout(r,100));}
  const touch=(type,x,y)=>send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y}]});
  const measure=()=>evaluate(`({set:document.querySelector('[data-focus-setpos]').textContent,scrollY,rects:Object.fromEntries(['.focus-head','.focus-fields','.focus-primary','.focus-dots'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,[r.x,r.y,r.width,r.height]];})),focus:document.activeElement?.tagName})`);
  const swipe=async()=>{await touch('touchStart',310,500);await touch('touchMove',230,500);await touch('touchMove',120,500);await touch('touchEnd');};
  const results={before:await measure()};
  await swipe();results.mid=await measure();await new Promise(r=>setTimeout(r,250));results.after=await measure();
  await evaluate(`document.querySelector('[data-focus-move-exercise="1"]').click()`);await new Promise(r=>setTimeout(r,250));results.longName=await measure();
  await evaluate(`window.originalField=document.querySelector('[data-focus-field]');document.querySelector('[data-focus-move-exercise="1"]').click()`);results.cardio={...(await measure()),sameInput:await evaluate(`originalField===document.querySelector('[data-focus-field]')`)};
  if (process.argv[2] !== 'before') {
    const assert = (ok, message) => { if (!ok) throw Error(message); };
    assert(results.mid.set.includes('2 / 4'), 'touch swipe must actually switch');
    assert(JSON.stringify(results.before.rects['.focus-fields']) === JSON.stringify(results.mid.rects['.focus-fields']), 'input moved during swipe');
    assert(results.cardio.sameInput, 'cross-type input was replaced');
    await evaluate('resetFixture(4)');
    await touch('touchStart',100,500);await touch('touchMove',290,500);await touch('touchEnd');
    assert((await measure()).set.includes('1 / 4'), 'edge swipe moved target');
    const group = await evaluate(`(()=>{const r=document.querySelector('[data-focus-group-menu]').getBoundingClientRect();return {x:r.x+20,y:r.y+18}})()`);
    await touch('touchStart',group.x,group.y);await new Promise(r=>setTimeout(r,650));await touch('touchEnd');
    assert(await evaluate(`document.querySelector('#workout-dialog').open`), 'long press did not open menu');
    await evaluate(`document.querySelector('[data-delete-current]').click()`);
    assert((await measure()).set.includes('1 / 3'), 'empty set deletion failed');
    await evaluate(`document.querySelector('[data-focus-addset]').click()`);
    assert((await measure()).set.includes('1 / 4'), 'cannot add after delete');
    await evaluate(`(()=>{const i=document.querySelector('[data-focus-field="reps"]');i.value='8';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await new Promise(r=>setTimeout(r,1200));
    results.typedDwell = await evaluate(`document.querySelector('[data-focus-dwell]').textContent`);
    assert(!results.typedDwell.endsWith('00:00'), 'typing reset dwell or changed its target');
    await evaluate(`document.querySelector('[data-focus-done]').click()`);
    assert((await measure()).set.includes('2 / 4'), 'cannot complete after delete');
    await evaluate(`document.querySelector('[data-focus-group-menu]').click();document.querySelector('[data-dialog-close]').click()`);
    await touch('touchStart',group.x,group.y);await touch('touchMove',group.x,group.y+65);await touch('touchEnd');await new Promise(r=>setTimeout(r,650));
    assert(!await evaluate(`document.querySelector('#workout-dialog').open`), 'vertical movement opened menu');
    await touch('touchStart',group.x,group.y);await touch('touchCancel');await new Promise(r=>setTimeout(r,650));
    assert(!await evaluate(`document.querySelector('#workout-dialog').open`), 'cancel opened menu');
    await evaluate('resetFixture(1)');
    await evaluate(`document.querySelector('[data-focus-group-menu]').click()`);
    assert(await evaluate(`document.querySelector('[data-delete-current]').disabled`), 'last set must be protected');
    await evaluate(`document.querySelector('[data-dialog-close]').click();resetFixture(3);const s=fixture.controller.getSession();s.exercises[0].sets[0].reps=8;fixture.controller.render();document.querySelector('[data-focus-overview-open]').click();document.querySelector('[data-focus-jump="0-0"]').click();document.querySelector('[data-focus-group-menu]').click();document.querySelector('[data-delete-current]').click()`);
    assert(await evaluate(`!!document.querySelector('[data-dialog-ok]')`), 'recorded deletion must confirm');
    await evaluate(`document.querySelector('[data-layer-close]').click()`);await new Promise(r=>setTimeout(r,250));
    assert(await evaluate(`fixture.controller.getSession().exercises[0].sets.length===3`), 'cancel deleted data');
    await evaluate(`document.querySelector('[data-focus-group-menu]').click();document.querySelector('[data-delete-current]').click();document.querySelector('[data-dialog-ok]').click()`);await new Promise(r=>setTimeout(r,250));
    assert(await evaluate(`fixture.controller.getSession().exercises[0].sets.length===2`), 'confirm did not delete');
    await evaluate(`const s=fixture.controller.getSession();s.exercises.forEach(e=>e.sets.forEach(x=>{if('duration_min' in x)x.duration_min=5;else x.reps=8}));fixture.controller.render();document.querySelector('[data-focus-finish]').click();document.querySelector('#workout-finish-save').click()`);await new Promise(r=>setTimeout(r,300));
    assert(await evaluate(`fixture.saved.length===1`), 'cannot save after delete');
    await evaluate('resetFixture(4)');
    await touch('touchStart',group.x,group.y);await evaluate('fixture.controller.destroy()');await new Promise(r=>setTimeout(r,650));await touch('touchEnd');
    assert(!await evaluate(`document.querySelector('#workout-dialog').open`), 'unmount did not cancel long press');
    await evaluate('resetFixture(24)');
    for (const width of [375,390,430]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
      assert(await evaluate(`document.querySelector('.focus-setbar').scrollWidth <= document.querySelector('.focus-setbar').clientWidth`), 'group row overflow at '+width);
    }
    await evaluate(`resetFixture(4);document.querySelector('[data-focus-group-menu]').focus()`);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    assert(await evaluate(`document.querySelector('#workout-dialog').open`), 'group menu not keyboard accessible');
    results.interactions = 'edge, long press, empty/recorded delete, confirm/cancel, add, complete, save, vertical/touchcancel/unmount, last-set protection, 24 sets at 375/390/430px, keyboard menu passed';
  }
  await writeFile(out+(process.argv[2]||'result')+'.json',JSON.stringify(results,null,2)); console.log(JSON.stringify(results,null,2));
} finally {ws?.close();chrome.kill();}
