// Read-only full-app layout check in a disposable profile; external HTTP is blocked.
// node --experimental-websocket scripts/page-shell-check.mjs [baseline]
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
const origin = 'http://127.0.0.1:5176';
const baseline = process.argv.includes('baseline');
const out = new URL('../.artifacts/page-shell/', import.meta.url);
await mkdir(out, { recursive: true });
const profile = await mkdtemp(tmpdir() + '/cat-layout-');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-sync', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let ws;
const results = [];
try {
  const endpoint = await new Promise((resolve, reject) => {
    let log = ''; const timer = setTimeout(() => reject(Error('Chrome timeout')), 15000);
    chrome.on('error', reject);
    chrome.stderr.on('data', chunk => { log += chunk; const m = log.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(timer); resolve(m[1]); } });
  });
  const debug = endpoint.replace('ws:', 'http:').split('/devtools/')[0];
  const target = (await (await fetch(debug + '/json/list')).json()).find(t => t.type === 'page');
  ws = new WebSocket(target.webSocketDebuggerUrl); await once(ws, 'open');
  let id = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
  ws.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    else if (m.method === 'Fetch.requestPaused') { const allowed = m.params.request.url.startsWith(origin + '/'); void send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId: m.params.requestId, ...(allowed ? {} : { errorReason: 'BlockedByClient' }) }); }
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: 'http*' }] });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const wait = selector => evaluate(`new Promise((resolve,reject)=>{let start=performance.now();function frame(){if(document.querySelector(${JSON.stringify(selector)}))resolve(true);else if(performance.now()-start>15000)reject(Error('view timeout'));else requestAnimationFrame(frame)}frame()})`);
  for (const width of [1440, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    for (const route of baseline ? ['sport'] : ['sport', 'todo', 'note', 'hot', 'timeline', 'insight', 'settings', 'home', 'checkin', 'read', 'money']) {
      await send('Page.navigate', { url: `${origin}/#/${route}` });
      await wait(route === 'sport' ? '.workout-mast' : route === 'home' ? '.home-edition' : '.page-header');
      await evaluate('document.fonts.ready');
      await evaluate('new Promise(r=>setTimeout(r,350))');
      const result = await evaluate(`(()=>{const head=[...document.querySelectorAll('.workout-mast,.page-header')].find(el=>el.getBoundingClientRect().height>0);const title=head?.querySelector('h2');const main=document.querySelector('.main');const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};return {width:${width},route:${JSON.stringify(route)},main:rect(main),header:head&&rect(head),title:title&&{...rect(title),font:getComputedStyle(title).fontSize},overflow:[...main.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect();return e.checkVisibility()&&r.width>0&&r.right>innerWidth+1&&getComputedStyle(e).position!=='fixed'&&!e.closest('.workout-days')}).map(e=>({tag:e.tagName,cls:e.className,parent:e.parentElement?.className,rect:rect(e)})).slice(0,15),accountAfterTitle:!document.querySelector('.settings-account')||${JSON.stringify(route)}!=='settings'||document.querySelector('.settings-account').getBoundingClientRect().top>head.getBoundingClientRect().bottom}})()`);
      results.push(result);
      if (['sport','todo','note','hot','timeline','insight','settings','home'].includes(route)) {
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        await writeFile(new URL(`${baseline ? 'baseline-' : ''}${route}-${width}.png`, out), Buffer.from(shot.data, 'base64'));
      }
      // DOM-only stress: no app actions and no writes to records/storage.
      if (route === 'note' || route === 'hot' || route === 'timeline') {
        const stress = await evaluate(`(()=>{let el=document.querySelector('.note-text,.rnote,.timeline-excerpt');if(!el&&document.querySelector('.life-timeline')){el=document.createElement('p');el.className='timeline-excerpt';document.querySelector('.life-timeline').append(el)}if(!el)return null;el.textContent='https://example.com/'+ 'a'.repeat(500);return {client:el.clientWidth,scroll:el.scrollWidth}})()`);
        result.longURL = stress;
      }
    }
  }
  await writeFile(new URL(baseline ? 'baseline.json' : 'results.json', out), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (results.some(r => r.overflow.length || !r.accountAfterTitle || r.longURL && r.longURL.scroll > r.longURL.client + 1)) process.exitCode = 1;
} finally { ws?.close(); if (chrome.exitCode === null) { chrome.kill(); await once(chrome, 'exit').catch(()=>{}); } await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
