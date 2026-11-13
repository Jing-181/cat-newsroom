// Run: node --experimental-websocket scripts/quick-record-check.mjs
// Dedicated Vite + disposable Chrome profile; all page HTTP traffic restricted to that Vite origin.
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

if (typeof WebSocket === 'undefined') throw Error('Use node --experimental-websocket scripts/quick-record-check.mjs (Node 20), or Node 22+.');
const root = fileURLToPath(new URL('..', import.meta.url));
const out = resolve(root, '.artifacts/quick-record', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(out, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'cat-quick-record-'));
const results = { startedAt: new Date().toISOString(), cases: [], screenshots: [], errors: [], blockedRequests: [], overflow: [], sourceHashes: {}, uncovered: [
  'Real accounts, Supabase, real upload service, offline sync and cross-device synchronization',
  'Native file chooser and OS clipboard; file/paste payloads are synthetic browser File objects',
  'Real mobile soft keyboard, IME candidate UI and touch-device behavior',
  'Real Safari/WebKit and iPhone hardware: CDP viewport/touch/UA simulation is Chromium only',
  'Full App shell navigation and workout pages; Home/Insight tested only in isolated fixture',
] };
const tracked = ['src/modules/todo/TodoView.vue', 'src/modules/note/NoteView.vue', 'src/lib/editor.js', 'src/lib/task-groups.js', 'css/quick-editor.css', 'src/lib/mobile-viewport.js', 'src/lib/dialog-contract.js', 'src/lib/store.js', 'src/modules/home/HomeView.vue', 'src/components/QuickCapture.vue', 'src/modules/timeline/TimelineView.vue', 'src/lib/life-feed.js', 'css/life-home.css', 'src/modules/insight/InsightView.vue', 'src/lib/week-state.js', 'src/App.vue', 'src/responsive.css', 'src/styles.css', 'css/app-dialog.css'];
async function hashes() {
  return Object.fromEntries(await Promise.all(tracked.map(async path => [path, createHash('sha256').update(await readFile(resolve(root, path))).digest('hex')])));
}
results.sourceHashes.before = await hashes();
let server, chrome, ws;
try {
  server = await createServer({ root: resolve(root, 'src'), configFile: resolve(root, 'vite.config.js'),
    plugins: [{ name: 'quick-record-fixture', configureServer(vite) {
      // Register before Vite's SPA fallback; transform bare imports using its own pipeline.
      vite.middlewares.use('/quick-record.html', async (req, res, next) => {
        try {
          const html = await readFile(resolve(root, 'tests/fixtures/quick-record.html'), 'utf8');
          res.setHeader('Content-Type', 'text/html');
          res.end(await vite.transformIndexHtml('/quick-record.html', html));
        } catch (error) { next(error); }
      });
    } }], server: { host: '127.0.0.1', port: 5187, strictPort: true, open: false, fs: { allow: [root] } } });
  await server.listen();
  const origin = 'http://127.0.0.1:5187';
  chrome = spawn(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--disable-default-apps', '--metrics-recording-only',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost',
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    let log = '';
    const timeout = setTimeout(() => reject(Error('Chrome startup timed out: ' + log)), 15000);
    chrome.once('error', reject);
    chrome.once('exit', code => { clearTimeout(timeout); reject(Error('Chrome exited: ' + code)); });
    chrome.stderr.on('data', chunk => { log += chunk; const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
  });
  const debugOrigin = endpoint.replace(/^ws:/, 'http:').split('/devtools/')[0];
  const target = (await (await fetch(debugOrigin + '/json/list')).json()).find(t => t.type === 'page');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await once(ws, 'open');
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error('CDP timeout: ' + method)); }, 20000);
    pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params }));
  });
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = pending.get(m.id); if (!p) return;
      pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result);
    } else if (m.method === 'Fetch.requestPaused') {
      const allowed = m.params.request.url.startsWith(origin + '/');
      if (!allowed) results.blockedRequests.push(m.params.request.url);
      send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId: m.params.requestId, ...(allowed ? {} : { errorReason: 'BlockedByClient' }) }).catch(e => results.errors.push(e.message));
    } else if (m.method === 'Runtime.exceptionThrown') results.errors.push(m.params.exceptionDetails);
  });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: 'http*' }] });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression: `(async()=>{return await (${expression});})()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const wait = expression => evaluate(`new Promise((resolve,reject)=>{const start=performance.now(); const frame=()=>{if(${expression})resolve(true);else if(performance.now()-start>8000)reject(Error('Condition timed out: '+${JSON.stringify(expression)}));else requestAnimationFrame(frame);};frame();})`);
  const tick = () => evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const check = async (expression, message) => { if (!await evaluate(expression)) throw Error(message); };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const mouseClick = async selector => {
    const point = await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    await tick();
  };
  const evidence = async label => {
    results.diagnostics ||= [];
    results.diagnostics.push(await evaluate(`({label:${JSON.stringify(label)},owner:window.getCurrentUser?.()?.id||null,input:document.querySelector('.task-inline-add input')?.value,buttonDisabled:document.querySelector('.task-inline-add button')?.disabled,memory:fixture.store.getData().todo,disk:JSON.parse(localStorage.getItem(fixture.CONFIG.storageKey)).todo,rendered:[...document.querySelectorAll('.task-body')].map(e=>e.textContent),syncErrors:fixture.syncErrors.slice(),syncInputs:fixture.syncInputs.slice(),toasts:[...document.querySelectorAll('.cat-toast:not(.out)')].map(e=>e.textContent)})`));
  };
  const fill = async (selector, text) => {
    await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.focus();el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await send('Input.insertText', { text }); await tick();
    await check(`document.activeElement===document.querySelector(${JSON.stringify(selector)}) && document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(text)}`, 'Input/focus mismatch: ' + selector);
    results.inputSteps ||= [];
    results.inputSteps.push(await evaluate(`({selector:${JSON.stringify(selector)},length:document.activeElement.value.length,tag:document.activeElement.tagName,fontSize:getComputedStyle(document.activeElement).fontSize,scrollY,viewportHeight:visualViewport.height,viewportScale:visualViewport.scale})`));
  };
  const enter = async () => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await tick();
  };
  const shot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = `${name}.png`; await writeFile(join(out, file), Buffer.from(r.data, 'base64')); results.screenshots.push(file);
  };
  const run = async (name, fn) => {
    try { await fn(); results.cases.push({ name, status: 'passed' }); }
    catch (error) { results.cases.push({ name, status: 'failed', error: error.message }); await shot('failure-' + results.cases.length).catch(() => {}); }
  };
  const viewport = async (width, height = width > 820 ? 900 : 844) => {
    await send('Emulation.setTouchEmulationEnabled', { enabled: width <= 820, maxTouchPoints: 1 });
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 820 });
    await tick();
  };
  const fixtureURL = `${origin}/quick-record.html`;
  await viewport(390);
  await send('Page.navigate', { url: fixtureURL });
  await wait('window.ready === true && document.querySelector(".task-inline-add input")');
  await run('连续新增 3 条：Enter 提交、输入框节点及焦点保持', async () => {
    await evaluate(`window.originalInput=document.querySelector('.task-inline-add input')`);
    for (const title of ['连续事项一', '连续事项二', '连续事项三']) {
      await fill('.task-inline-add input', title); await enter();
      await check(`fixture.store.getData().todo.some(x=>x.title===${JSON.stringify(title)})`, 'Enter did not save ' + title);
      await check(`document.activeElement===originalInput && originalInput.isConnected && originalInput.value===''`, 'Input replaced, focus lost or draft not cleared');
      await evidence('enter-add-' + title);
    }
    await check('new Set(fixture.store.getData().todo.map(x=>x.id)).size===3', 'Duplicate record IDs');
  });
  await run('分组新增、分组内新增及折叠展开', async () => {
    await check(`document.querySelector('.task-group-form').getClientRects().length===0`, 'Mobile group form not collapsed');
    await click('.task-group-create');
    await fill('[aria-label="新分组名称"]', 'v2.18'); await enter();
    await fill('[aria-label="添加到v2.18"]', '分组里的目标事项'); await enter();
    await check(`fixture.store.getData().todo.some(x=>x.title==='分组里的目标事项' && x.group==='v2.18')`, 'Group field not saved');
    await evaluate(`[...document.querySelectorAll('.task-group-toggle')].find(e=>e.textContent.includes('v2.18')).click()`); await tick();
    await check(`document.querySelector('[aria-label="添加到v2.18"]').getClientRects().length===0`, 'Group did not fold');
    await evaluate(`[...document.querySelectorAll('.task-group-toggle')].find(e=>e.textContent.includes('v2.18')).click()`); await tick();
    await check(`document.querySelector('[aria-label="添加到v2.18"]').getClientRects().length>0`, 'Group did not unfold');
  });
  await run('事项搜索标题 / 分组 / 空结果并恢复', async () => {
    for (const q of ['目标事项', 'v2.18']) {
      await fill('[type="search"]', q);
      await check(`document.querySelectorAll('.task-body').length===1 && document.querySelector('.task-body').textContent.includes('目标事项')`, 'Search failed: ' + q);
    }
    await fill('[type="search"]', '没有这样的记录');
    await check(`document.querySelectorAll('.task-body').length===0`, 'Empty search leaked records');
    await fill('[type="search"]', '');
  });
  await run('完成事项后 Toast 撤销', async () => {
    await click('[aria-label="完成 连续事项一"]'); await tick();
    await check(`fixture.store.getData().todo.find(x=>x.title==='连续事项一').done`, 'Completion not persisted');
    await click('.cat-toast:not(.out) .cat-toast-action'); await tick();
    await check(`!fixture.store.getData().todo.find(x=>x.title==='连续事项一').done && !!document.querySelector('[aria-label="完成 连续事项一"]')`, 'Undo did not restore incomplete item');
  });
  await run('事项编辑器移动分组', async () => {
    await evaluate(`[...document.querySelectorAll('.task-body')].find(e=>e.textContent.includes('连续事项二')).click()`);
    await wait(`document.querySelector('#q-group')`);
    await fill('#q-group', 'v2.18'); await click('#q-save');
    await wait(`!document.querySelector('.quick-editor')`);
    await check(`fixture.store.getData().todo.find(x=>x.title==='连续事项二').group==='v2.18'`, 'Editor move failed');
  });
  await run('随记纯文本保存，无标题 / 图片亦可', async () => {
    await evaluate(`fixture.show('note')`); await click('.note-capture'); await wait(`document.querySelector('#q-content')`);
    await fill('#q-content', '窗边的猫睡着了。\n第二行随手记。'); await click('#q-save');
    await wait(`!document.querySelector('.quick-editor')`);
    await check(`fixture.store.getData().note.some(x=>x.content.includes('第二行随手记') && !x.image) && document.querySelector('.note-entry').textContent.includes('窗边的猫')`, 'Text note not saved/rendered');
  });
  const photo = `(()=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const c=canvas.getContext('2d');c.fillStyle='#e8d3a9';c.fillRect(0,0,640,360);c.fillStyle='#8a5a44';c.font='40px sans-serif';c.fillText('Local fixture photo',100,180);return new Promise(resolve=>canvas.toBlob(blob=>resolve(new File([blob],'fixture.png',{type:'image/png'}))));})()`;
  const attachPhoto = async paste => evaluate(`(async()=>{const file=await ${photo};const dt=new DataTransfer();dt.items.add(file);${paste ? "document.querySelector('.quick-editor').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,clipboardData:dt}));" : "const input=document.querySelector('#q-file');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));"}})()`);
  await run('随记文本 + 图片：文件选择桩上传及显示', async () => {
    await click('.note-capture'); await fill('#q-content', '文字配本地测试照片'); await attachPhoto(false);
    await check(`fixture.uploads.length===0`, 'Photo uploaded before save');
    await click('#q-save'); await wait(`!document.querySelector('.quick-editor')`);
    await check(`fixture.uploads.length===1 && fixture.uploads[0].options.moduleKey==='note'`, 'Upload stub not called');
    await wait(`[...document.querySelectorAll('.note-image img')].some(img=>img.complete && img.naturalWidth===640)`);
    await check(`fixture.store.getData().note.some(x=>x.content==='文字配本地测试照片' && x.image.startsWith('data:image/png'))`, 'Image note not persisted');
  });
  await run('随记仅图片：粘贴图片事件及保存', async () => {
    await click('.note-capture'); await attachPhoto(true);
    await click('#q-save'); await wait(`!document.querySelector('.quick-editor')`);
    await check(`fixture.store.getData().note.some(x=>!x.content && x.image)`, 'Image-only note rejected');
  });
  await run('随记搜索正文与清空', async () => {
    await fill('.note-search', '窗边的猫');
    await check(`document.querySelectorAll('.note-entry').length===1`, 'Note search failed');
    await fill('.note-search', '');
    await check(`document.querySelectorAll('.note-entry').length===3`, 'Note search reset failed');
  });
  await run('随记草稿：暂存关闭、重新打开、整页重载、保存清理', async () => {
    // 已有图片地址能随草稿恢复；未上传 File 不声称跨刷新保留。
    await click('.note-capture'); await fill('#q-content', '刷新后仍应保留的隔离草稿');
    await evaluate(`(()=>{const input=document.querySelector('#q-image');input.value=fixture.store.getData().note.find(x=>x.image).image;document.querySelector('#q-add-url').click();})()`);
    await click('#q-close'); await wait(`!document.querySelector('.quick-editor')`);
    await click('.note-capture');
    await check(`document.querySelector('#q-content').value==='刷新后仍应保留的隔离草稿' && document.querySelector('#q-images img')?.src.startsWith('data:image/png')`, 'Reopen lost draft');
    await send('Page.reload', { ignoreCache: true });
    // Page.reload acknowledges before the old execution context is destroyed; wait for load event via CDP.
    await new Promise(resolve => { const timer=setTimeout(done, 1500); function done(){clearTimeout(timer);ws.removeEventListener('message',listener);resolve();} function listener(e){if(JSON.parse(e.data).method==='Page.loadEventFired')done();} ws.addEventListener('message',listener); });
    await wait('window.ready === true'); await evaluate(`fixture.show('note')`); await click('.note-capture');
    await check(`document.querySelector('#q-content').value==='刷新后仍应保留的隔离草稿' && document.querySelector('#q-images img')?.src.startsWith('data:image/png')`, 'Reload lost draft text/image');
    await click('#q-save'); await wait(`!document.querySelector('.quick-editor')`);
    await check(`!localStorage.getItem('cat-newsroom-quick-draft-v1:quick-record-fixture-only:note')`, 'Saved draft not cleared');
  });
  await run('上传失败保留文本，重试上传后可保存', async () => {
    await click('.note-capture'); await fill('#q-content', '失败重试不能丢文字'); await evaluate('fixture.failUpload=true'); await attachPhoto(false); await click('#q-save');
    await wait(`document.querySelector('#q-upload-status').textContent.includes('fixture upload failed')`);
    await check(`document.querySelector('#q-content').value==='失败重试不能丢文字'`, 'Upload failure lost text');
    await evaluate('fixture.failUpload=false'); await click('#q-save'); await wait(`!document.querySelector('.quick-editor')`);
  });
  for (const width of [375, 390, 430, 1280]) {
    await viewport(width);
    for (const view of ['todo', 'note']) {
      await run(`${width}px ${view} 列表无横向溢出`, async () => {
        await evaluate(`fixture.show(${JSON.stringify(view)})`); await tick();
        await check(`!!document.querySelector(${JSON.stringify(view === 'todo' ? '.tasks-view' : '.notes-view')})`, 'Expected component not mounted');
        const measurement = await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,offenders:[...document.querySelectorAll('#fixture *')].filter(e=>{const r=e.getBoundingClientRect();return r.width && (r.right>innerWidth+1 || r.left < -1)}).map(e=>e.className)})`);
        results.overflow.push({ width, view, ...measurement }); await shot(`${view}-${width}`);
        if (measurement.scrollWidth > width || measurement.bodyWidth > width || measurement.offenders.length) throw Error('Horizontal overflow: ' + JSON.stringify(measurement));
      });
    }
    await run(`${width}px 随记编辑器无横向溢出`, async () => {
      await click('.note-capture'); await fill('#q-content', '窄屏编辑器换行检查 '.repeat(20)); await attachPhoto(false);
      await wait(`!!document.querySelector('#q-images img')`); await tick();
      const measurement = await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('.quick-editor,.quick-editor *')].filter(e=>{const r=e.getBoundingClientRect();return r.width && (r.right>innerWidth+1 || r.left < -1)}).map(e=>e.id||e.className)})`);
      results.overflow.push({ width, view: 'note-editor', ...measurement }); await shot(`note-editor-${width}`);
      await click('[data-photo-remove]'); await click('#q-close'); await wait(`!document.querySelector('.quick-editor')`);
      if (measurement.scrollWidth > width || measurement.offenders.length) throw Error('Editor overflow: ' + JSON.stringify(measurement));
    });
  }
  results.finalRecordCounts = await evaluate(`Object.fromEntries(['todo','note'].map(key=>[key,fixture.store.getData()[key].length]))`);
  results.computedIdentityProbe = await evaluate('fixture.computedIdentityProbe()');
  await viewport(1280);
  await evaluate(`fixture.show('todo')`);
  await run('真实鼠标：稳定账号新增、列表渲染和持久化', async () => {
    await evaluate(`fixture.resetTodo()`); await tick();
    await fill('.task-inline-add input', '鼠标点击新增');
    await mouseClick('.task-inline-add button');
    await evidence('stable-owner-mouse');
    await check(`fixture.store.getData().todo.length===1 && document.querySelector('.task-body')?.textContent.includes('鼠标点击新增') && document.querySelector('.task-inline-add input').value===''`, 'Real mouse add failed');
  });
  await run('中文 composition 提交后真实鼠标新增', async () => {
    await fill('.task-inline-add input', '');
    await send('Input.imeSetComposition', { text: '中文事项', selectionStart: 4, selectionEnd: 4 });
    await evidence('composition-active');
    await send('Input.insertText', { text: '中文事项' }); await tick();
    await mouseClick('.task-inline-add button');
    await evidence('composition-committed-mouse');
    await check(`fixture.store.getData().todo.some(x=>x.title==='中文事项') && document.querySelector('.task-inline-add input').value===''`, 'Committed composition failed to save');
    await check(`[...document.querySelectorAll('.task-body')].some(e=>e.textContent.includes('中文事项'))`, 'Composition saved but list did not render');
  });
  for (const notify of [false, true]) {
    await run(`延迟账号 null→id（bump=${notify}）不吞首次鼠标新增`, async () => {
      await evaluate(`(()=>{fixture.setOwner(null,true);fixture.resetTodo()})()`); await tick();
      await fill('.task-inline-add input', '账号延迟恢复事项');
      await evaluate(`fixture.setOwner('quick-record-fixture-only',${notify})`); await tick();
      await evidence('owner-restored-before-click-' + notify);
      await mouseClick('.task-inline-add button');
      await evidence('owner-restored-after-click-' + notify);
      await check(`fixture.store.getData().todo.some(x=>x.title==='账号延迟恢复事项')`, 'Owner recovery swallowed draft / first add');
    });
  }
  await run('真实 clone 同步边界：新增后完成事项', async () => {
    await evaluate(`(()=>{fixture.setOwner('quick-record-fixture-only',true);fixture.resetTodo()})()`); await tick();
    await fill('.task-inline-add input', '同步边界事项'); await mouseClick('.task-inline-add button');
    await evidence('new-item-before-remount');
    await evaluate(`fixture.show('note')`); await evaluate(`fixture.show('todo')`);
    await evidence('new-item-after-remount');
    await mouseClick('[aria-label="完成 同步边界事项"]');
    await evidence('toggle-with-structuredClone');
    await check(`fixture.store.getData().todo[0].done && JSON.parse(localStorage.getItem(fixture.CONFIG.storageKey)).todo[0].done`, 'Completion failed or memory/disk diverged');
  });
  // Extra scenarios follow the original 28 cases; all use the actual mounted SFC/editor.
  const geometry = label => evaluate(`({label:${JSON.stringify(label)},scrollY,bodyPosition:document.body.style.position,bodyTop:document.body.style.top,active:document.activeElement?.id||document.activeElement?.className,innerHeight,visualHeight:visualViewport.height,scale:visualViewport.scale,coarse:matchMedia('(any-pointer: coarse)').matches,cssHeight:document.documentElement.style.getPropertyValue('--mobile-viewport-height'),modal:(()=>{const r=document.querySelector('.quick-editor .modal')?.getBoundingClientRect();return r?{top:r.top,bottom:r.bottom,height:r.height}:null})()})`);
  results.geometry = [];
  await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  for (const width of [375,390,430]) {
    await run(`${width}px iPhone模拟：逐键输入、缩短视口、关闭恢复焦点与滚动`, async () => {
      await viewport(width); await evaluate(`fixture.show('note')`);
      await evaluate(`(()=>{const data=fixture.store.getData();data.note=Array.from({length:18},(_,i)=>({id:'scroll-'+i,date:'2026-11-09',content:'用于滚动验证的随记 '+i+' 内容'.repeat(20)}));fixture.store.save();fixture.store.bump();})()`);await tick();
      await evaluate(`(()=>{window.scrollTo(0,650);window.scrollTarget=document.querySelectorAll('.note-text')[4];scrollTarget.focus({preventScroll:true});window.beforeLayerScroll=scrollY;scrollTarget.click();})()`);
      await wait(`!!document.querySelector('#q-content')`);
      await check(`fixture.viewportInitialized && matchMedia('(any-pointer: coarse)').matches`, 'Mobile viewport runtime not initialized/coarse');
      await check(`document.activeElement.id==='q-content'`, 'Initial focus not in editor');
      await check(`parseFloat(getComputedStyle(document.activeElement).fontSize)>=16`, 'Mobile editor input smaller than 16px');
      results.geometry.push(await geometry(`opened-${width}`));
      await viewport(width,500);
      await wait(`Math.abs(parseFloat(document.documentElement.style.getPropertyValue('--mobile-viewport-height'))-visualViewport.height)<2`);
      await evaluate(`(()=>{const el=document.querySelector('#q-content');el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));window.inputNode=el;})()`);
      let typed='';
      for (const char of ['a','b','c']) {
        await send('Input.dispatchKeyEvent',{type:'keyDown',key:char,code:'Key'+char.toUpperCase(),text:char,windowsVirtualKeyCode:char.toUpperCase().charCodeAt(0)});
        await send('Input.dispatchKeyEvent',{type:'keyUp',key:char,code:'Key'+char.toUpperCase()});await tick();typed+=char;
        await check(`document.activeElement===inputNode && inputNode.value===${JSON.stringify(typed)}`, 'Per-key focus/value lost');
        results.geometry.push(await geometry(`typed-${width}-${char}`));
      }
      const box=await geometry(`short-viewport-${width}`);results.geometry.push(box);
      if(box.modal.top < -1 || box.modal.bottom > box.visualHeight+1)throw Error('Modal escapes shortened viewport: '+JSON.stringify(box));
      await shot(`iphone-sim-${width}-height500`);
      // Save editing note, then restore original viewport size as a dismissed keyboard would.
      await click('#q-save');await wait(`!document.querySelector('.quick-editor')`);await viewport(width);
      await check(`document.body.style.position!== 'fixed' && Math.abs(scrollY-beforeLayerScroll)<2`, 'Close failed to restore page scroll');
      results.geometry.push(await geometry(`saved-closed-${width}`));
      // Cancel without modifying: opener remains alive, so focus must return to identical DOM node.
      await evaluate(`(()=>{window.scrollTo(0,650);window.scrollTarget=document.querySelectorAll('.note-text')[4];scrollTarget.focus({preventScroll:true});window.beforeLayerScroll=scrollY;scrollTarget.click();})()`);
      await wait(`!!document.querySelector('#q-content')`);await viewport(width,500);await click('#q-close');await wait(`!document.querySelector('.quick-editor')`);await viewport(width);
      await check(`document.activeElement===scrollTarget && Math.abs(scrollY-beforeLayerScroll)<2`, 'Cancel lost opener identity/focus or scroll');
      results.geometry.push(await geometry(`cancelled-closed-${width}`));await shot(`iphone-sim-${width}-restored`);
    });
  }
  for(const view of ['insight']) {
    await run(`${view} 本地点击与trend-only bump保留真实七格/祖先节点及焦点`,async()=>{
      await viewport(390);
      await evaluate(`(()=>{fixture.store.getData().__trend=undefined;})()`);
      await evaluate(`fixture.show(${JSON.stringify(view)})`);await wait(`document.querySelectorAll('[data-trend-day]').length===7`);await tick();
      await evaluate(`(()=>{window.trendNodes=[...document.querySelectorAll('[data-trend-day]')];window.trendGrid=trendNodes[0].parentNode;window.trendRoot=trendGrid.parentNode;trendNodes[0].scrollIntoView({block:'center'});trendNodes[0].focus({preventScroll:true});})()`);
      for(let i=1;i<=6;i++){
        await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});
        await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await tick();
        await check(`trendNodes.every((node,i)=>node===document.querySelectorAll('[data-trend-day]')[i]) && trendNodes[0].parentNode===trendGrid && trendGrid.parentNode===trendRoot && document.activeElement===trendNodes[0]`, 'Local trend click replaced node/focus');
        await check(`trendNodes[0].getAttribute('aria-label').includes(${JSON.stringify(i===6?'未记录':i+'分')})`, 'Aria not updated');
        await check(i===6 ? `!document.querySelector('[data-week-chart] svg')` : `!!document.querySelector('[data-week-chart] svg')`, 'Weekly chart state incorrect');
      }
      await evaluate(`(()=>{fixture.store.getData().__trend.days[1]=4;window.beforeTrendScroll=scrollY;fixture.store.bump();})()`);await tick();
      await check(`trendNodes.every((node,i)=>node===document.querySelectorAll('[data-trend-day]')[i]) && trendGrid.parentNode===trendRoot && document.activeElement===trendNodes[0] && trendNodes[1].getAttribute('aria-label').includes('4分')`, 'Trend-only bump replaced nodes or failed to refresh');
      // Repeat unchanged bump when chart geometry is stable, verify scroll remains exact.
      await evaluate(`(()=>{window.beforeTrendScroll=scrollY;fixture.store.bump();})()`);await tick();
      await check(`Math.abs(scrollY-beforeTrendScroll)<2`, 'Unchanged bump moved scroll');
      await shot(`${view}-trend-stable`);
    });
  }
  await run('首页快捷随记保持Home节点，运动仍发navigate',async()=>{
    await evaluate(`fixture.show('home')`);await tick();
    // 低频入口先展开，关闭编辑器后仍须返回可见的触发按钮。
    await click('.capture-more summary');
    await evaluate(`(()=>{window.homeQuick=[...document.querySelectorAll('.capture-links button')].find(el=>el.textContent==='写图文日记');window.homeGrid=document.querySelector('.home-grid');homeQuick.focus({preventScroll:true});fixture.navigation.length=0;homeQuick.click();})()`);
    await wait(`!!document.querySelector('#q-content')`);
    await check(`fixture.navigation.length===0 && homeQuick.isConnected && homeGrid===document.querySelector('.home-grid')`,'Quick note navigated or replaced home');
    await click('#q-close');await wait(`!document.querySelector('.quick-editor')`);
    await check(`document.activeElement===homeQuick`,'Quick-note close lost opener focus');
    await evaluate(`[...document.querySelectorAll('.capture-links button')].find(el=>el.textContent==='记录运动').click()`);await check(`fixture.navigation.join(',')==='sport'`,'Sport quick entry no longer navigates');
  });
  // 新首页用稳定 Vue 表单；刷新与路由切换不得吞掉草稿。
  await run('随手记保留草稿并兼容局域网保存，时间线可回看',async()=>{
    await evaluate(`fixture.show('home')`);await tick();
    await evaluate(`(()=>{const el=document.querySelector('.home-capture textarea');el.value='生活首批回归记录';el.dispatchEvent(new Event('input',{bubbles:true}));fixture.store.bump();})()`);await tick();
    await check(`document.querySelector('.home-capture textarea').value==='生活首批回归记录'`, 'Refresh lost capture draft');
    await evaluate(`fixture.show('note')`);await evaluate(`fixture.show('home')`);await tick();
    await check(`document.querySelector('.home-capture textarea').value==='生活首批回归记录'`, 'Navigation lost capture draft');
    await evaluate(`(()=>{window.originalUUID=crypto.randomUUID;crypto.randomUUID=undefined;document.querySelector('.home-capture form').requestSubmit();crypto.randomUUID=window.originalUUID;})()`);await tick();
    await check(`document.querySelector('.home-capture textarea').value==='' && fixture.store.getData().note.filter(x=>x.content==='生活首批回归记录').length===1`, 'Capture did not save once without randomUUID');
    await evaluate(`fixture.show('timeline')`);await tick();
    await check(`[...document.querySelectorAll('.timeline-excerpt')].some(el=>el.textContent==='生活首批回归记录')`, 'Timeline missed saved record');
    await evaluate(`[...document.querySelectorAll('.timeline-tools button')].find(el=>el.textContent==='训练').click()`);await tick();
    await check(`![...document.querySelectorAll('.timeline-excerpt')].some(el=>el.textContent==='生活首批回归记录')`, 'Timeline filter leaked note');
    await shot('life-timeline');
  });
} catch (error) {
  results.fatal = error.stack;
} finally {
  results.sourceHashes.after = await hashes();
  results.sourcesChangedDuringRun = tracked.filter(path => results.sourceHashes.before[path] !== results.sourceHashes.after[path]);
  results.finishedAt = new Date().toISOString();
  results.summary = { passed: results.cases.filter(x => x.status === 'passed').length, failed: results.cases.filter(x => x.status === 'failed').length, runtimeErrors: results.errors.length };
  await writeFile(join(out, 'result.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ artifactDirectory: out, ...results }, null, 2));
  ws?.close();
  if (chrome && chrome.exitCode === null) { const exited = once(chrome, 'exit'); chrome.kill(); await exited; }
  await server?.close();
  await rm(profile, { recursive: true, force: true });
  if (results.fatal || results.summary.failed || results.summary.runtimeErrors || results.sourcesChangedDuringRun.length) process.exitCode = 1;
}
