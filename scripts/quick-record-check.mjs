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
  'Full App shell navigation, home and workout pages (fixture mounts TodoView/NoteView only)',
] };
const tracked = ['src/modules/todo/TodoView.vue', 'src/modules/note/NoteView.vue', 'src/lib/editor.js', 'src/lib/task-groups.js', 'css/quick-editor.css'];
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
  const fill = async (selector, text) => {
    await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.focus();el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await send('Input.insertText', { text }); await tick();
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
  const viewport = async width => {
    await send('Emulation.setDeviceMetricsOverride', { width, height: width > 820 ? 900 : 844, deviceScaleFactor: 1, mobile: width <= 820 });
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
    }
    await check('new Set(fixture.store.getData().todo.map(x=>x.id)).size===3', 'Duplicate record IDs');
  });
  await run('分组新增、分组内新增及折叠展开', async () => {
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
    await wait(`document.querySelector('#q-upload-status').textContent.includes('已上传')`);
    await check(`fixture.uploads.length===1 && fixture.uploads[0].options.moduleKey==='note'`, 'Upload stub not called');
    await click('#q-save'); await wait(`!document.querySelector('.quick-editor')`);
    await wait(`[...document.querySelectorAll('.note-image img')].some(img=>img.complete && img.naturalWidth===640)`);
    await check(`fixture.store.getData().note.some(x=>x.content==='文字配本地测试照片' && x.image.startsWith('data:image/png'))`, 'Image note not persisted');
  });
  await run('随记仅图片：粘贴图片事件及保存', async () => {
    await click('.note-capture'); await attachPhoto(true);
    await wait(`document.querySelector('#q-upload-status').textContent.includes('已上传')`);
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
    await click('.note-capture'); await fill('#q-content', '刷新后仍应保留的隔离草稿'); await attachPhoto(false);
    await wait(`document.querySelector('#q-upload-status').textContent.includes('已上传')`);
    await click('#q-close'); await wait(`!document.querySelector('.quick-editor')`);
    await click('.note-capture');
    await check(`document.querySelector('#q-content').value==='刷新后仍应保留的隔离草稿' && document.querySelector('#q-image').value.startsWith('data:image/png')`, 'Reopen lost draft');
    await send('Page.reload', { ignoreCache: true });
    // Page.reload acknowledges before the old execution context is destroyed; wait for load event via CDP.
    await new Promise(resolve => { const timer=setTimeout(done, 1500); function done(){clearTimeout(timer);ws.removeEventListener('message',listener);resolve();} function listener(e){if(JSON.parse(e.data).method==='Page.loadEventFired')done();} ws.addEventListener('message',listener); });
    await wait('window.ready === true'); await evaluate(`fixture.show('note')`); await click('.note-capture');
    await check(`document.querySelector('#q-content').value==='刷新后仍应保留的隔离草稿' && document.querySelector('#q-image').value.startsWith('data:image/png')`, 'Reload lost draft text/image');
    await click('#q-save'); await wait(`!document.querySelector('.quick-editor')`);
    await check(`!localStorage.getItem('cat-newsroom-quick-draft-v1:quick-record-fixture-only:note')`, 'Saved draft not cleared');
  });
  await run('上传失败保留文本，重试上传后可保存', async () => {
    await click('.note-capture'); await fill('#q-content', '失败重试不能丢文字'); await evaluate('fixture.failUpload=true'); await attachPhoto(false);
    await wait(`document.querySelector('#q-upload-status').textContent.includes('fixture upload failed')`);
    await check(`document.querySelector('#q-content').value==='失败重试不能丢文字'`, 'Upload failure lost text');
    await evaluate('fixture.failUpload=false'); await click('#q-upload');
    await wait(`document.querySelector('#q-upload-status').textContent.includes('已上传')`);
    await click('#q-save'); await wait(`!document.querySelector('.quick-editor')`);
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
      await wait(`document.querySelector('#q-upload-status').textContent.includes('已上传')`); await tick();
      const measurement = await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('.quick-editor,.quick-editor *')].filter(e=>{const r=e.getBoundingClientRect();return r.width && (r.right>innerWidth+1 || r.left < -1)}).map(e=>e.id||e.className)})`);
      results.overflow.push({ width, view: 'note-editor', ...measurement }); await shot(`note-editor-${width}`);
      await click('#q-close'); await wait(`!document.querySelector('.quick-editor')`);
      if (measurement.scrollWidth > width || measurement.offenders.length) throw Error('Editor overflow: ' + JSON.stringify(measurement));
    });
  }
  results.finalRecordCounts = await evaluate(`Object.fromEntries(['todo','note'].map(key=>[key,fixture.store.getData()[key].length]))`);
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
  if (results.fatal || results.summary.failed || results.summary.runtimeErrors) process.exitCode = 1;
}
