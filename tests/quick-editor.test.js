import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/lib/editor.js', import.meta.url), 'utf8');
function harness() {
  const storage = new Map(), data = { note: [], todo: [], hot: [] }, layers = [], notices = [];
  let user = { id: 'account-a' }, failSave = false, failDraft = false, confirms = 0;
  class Element {
    constructor() { this.nodes = new Map(); this.listeners = {}; this.value = ''; this.hidden = false; this.disabled = false; this.classList = { add() {} }; }
    set innerHTML(html) {
      this.html = html;
      for (const match of html.matchAll(/<(input|textarea|button|select|img|p|datalist)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
        const e = new Element();
        e.value = /value="([^"]*)"/.exec(match[0])?.[1] || '';
        if (match[1] === 'textarea') e.value = html.slice(match.index + match[0].length).split('</textarea>')[0];
        this.nodes.set(`#${match[2]}`, e);
      }
    }
    get innerHTML() { return this.html || ''; }
    querySelector(id) { return this.nodes.get(id) || null; }
    addEventListener(type, cb) { (this.listeners[type] ||= []).push(cb); }
    emit(type, e = {}) { for (const cb of this.listeners[type] || []) cb(e); }
    removeAttribute(name) { delete this[name]; }
    click() { return this.onclick?.(); }
  }
  const sandbox = {
    window: { getCurrentUser: () => user, uploadCardImage: async () => ({ url: 'https://image.test/photo.jpg' }) },
    document: { createElement: () => new Element(), body: { appendChild() {} } },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => { if (failDraft) throw Error('quota'); storage.set(k, v); }, removeItem: k => storage.delete(k) },
    modOf: key => ({ key, name: key, priorities: [{ key: 'P1', label: '普通' }] }),
    icon: () => '', esc: s => String(s), attr: s => String(s), isoToday: () => '2026-11-09',
    getData: () => data, persist: () => { if (failSave) throw Error('disk full'); }, save() { if (failSave) throw Error('disk full'); }, bump() {},
    AppDialog: { confirm: async () => { confirms++; return true; } },
    RecordList: { placeNewAtTop() {} }, RecordMedia: {}, Trace: { track() {} },
    Toast: { show: (text, options) => notices.push({ text, options }) },
    bindLayer: config => {
      let open = true;
      const close = () => { open = false; config.onClose?.(); };
      const layer = { requestClose: () => { if (!config.isDirty()) close(); }, forceClose: close, isOpen: () => open, config };
      layers.push(layer); return layer;
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source.replace(/^import .*;\n/gm, '').replace(/export /g, ''), sandbox);
  return { api: sandbox, storage, data, layers, notices, setUser: v => { user = v; }, failSave: v => { failSave = v; }, failDraft: v => { failDraft = v; }, confirms: () => confirms };
}
const field = (overlay, name) => overlay.querySelector(`#q-${name}`);
const type = (overlay, name, value) => { field(overlay, name).value = value; overlay.emit('input'); };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('note accepts text or image only, keeps legacy fields, defaults date without a preset', () => {
  const { api } = harness();
  assert.throws(() => api.quickRecord('note', {}, {}), /内容或/);
  const text = api.quickRecord('note', {}, { content: ' text ' });
  assert.equal(text.content, 'text'); assert.equal(text.date, '2026-11-09');
  assert.equal(text.title, undefined); assert.equal(text.image_preset, undefined);
  const old = { title: '旧标题', mood: '晴', date: '2020-01-01', layout: 'quote', image_preset: 'legacy' };
  const photo = api.quickRecord('note', old, { image: 'https://image.test/a' });
  for (const k of Object.keys(old)) assert.equal(photo[k], old[k]);
});

test('drafts isolate accounts and unknown identity never writes a shared draft', () => {
  const { api, storage } = harness();
  assert.equal(api.writeQuickDraft('note', null, { content: 'secret' }), false);
  assert.equal(storage.size, 0);
  api.writeQuickDraft('note', 'a', { content: 'secret', image: 'uploaded' });
  assert.equal(api.readQuickDraft('note', 'b'), null);
  assert.equal(api.readQuickDraft('note', 'a').image, 'uploaded');
  storage.set(api.quickDraftKey('note', 'a'), '{broken');
  assert.equal(api.readQuickDraft('note', 'a'), null);
});

test('new note restores after close and successful save clears the account draft', async () => {
  const h = harness(); let overlay = h.api.openEditor('note');
  assert.equal(field(overlay, 'title'), null);
  type(overlay, 'content', 'remember'); type(overlay, 'image', 'https://image.test/a');
  field(overlay, 'close').click();
  overlay = h.api.openEditor('note');
  assert.equal(field(overlay, 'content').value, 'remember');
  assert.equal(field(overlay, 'image').value, 'https://image.test/a');
  await field(overlay, 'save').click();
  assert.equal(h.data.note.length, 1); assert.equal(h.storage.size, 0);
});

test('todo stores group with datalist and leaves optional details collapsed', async () => {
  const h = harness(); h.data.todo.push({ id: 1, group: 'v1' });
  const overlay = h.api.openEditor('todo');
  assert.match(overlay.innerHTML, /datalist id="q-groups"><option value="v1"/);
  assert.match(overlay.innerHTML, /<details class="modal-fold"><summary>备注/);
  type(overlay, 'title', 'task'); type(overlay, 'group', ' v2 ');
  await field(overlay, 'save').click();
  assert.equal(h.data.todo[0].group, 'v2'); assert.equal(h.data.todo[0].note, '');
});

test('failed save rolls back list, keeps draft and permits retry without duplicates', async () => {
  const h = harness(), overlay = h.api.openEditor('note');
  type(overlay, 'content', 'keep me'); h.failSave(true);
  await field(overlay, 'save').click();
  assert.equal(h.data.note.length, 0); assert.equal(h.storage.size, 1);
  assert.equal(field(overlay, 'save').disabled, false);
  assert.match(field(overlay, 'error').textContent, /disk full/);
  h.failSave(false); await field(overlay, 'save').click();
  assert.equal(h.data.note.length, 1); assert.equal(h.storage.size, 0);
});

test('editing preserves original data if persistence fails', async () => {
  const h = harness(), original = { id: 7, content: 'old', title: 'legacy', mood: '晴' };
  h.data.note.push(original);
  const overlay = h.api.openEditor('note', original);
  type(overlay, 'content', 'new'); h.failSave(true);
  await field(overlay, 'save').click();
  assert.equal(h.data.note[0], original); assert.equal(original.content, 'old');
  assert.equal(h.storage.size, 0);
});

test('desktop paste uses existing uploader, failure retains file and text for retry', async () => {
  const h = harness(), overlay = h.api.openEditor('note'); let calls = 0;
  const file = { name: 'clipboard.png' };
  h.api.window.uploadCardImage = async (picked, opts) => {
    calls++; assert.equal(picked, file); assert.equal(opts.moduleKey, 'note');
    if (calls === 1) throw Error('offline');
    return { url: 'https://image.test/retry' };
  };
  type(overlay, 'content', 'keep text');
  overlay.emit('paste', { clipboardData: { items: [{ type: 'image/png', getAsFile: () => file }] }, preventDefault() {} });
  await tick();
  assert.match(field(overlay, 'upload-status').textContent, /offline/);
  assert.equal(field(overlay, 'content').value, 'keep text');
  await field(overlay, 'save').click(); assert.equal(h.data.note.length, 0);
  await field(overlay, 'upload').click();
  assert.equal(calls, 2);
  assert.equal(h.api.readQuickDraft('note', 'account-a').image, 'https://image.test/retry');
});

test('account switch blocks save and async upload writes only original owner draft', async () => {
  const h = harness(), overlay = h.api.openEditor('note'); let done;
  h.api.window.uploadCardImage = () => new Promise(resolve => { done = resolve; });
  type(overlay, 'content', 'private');
  field(overlay, 'file').files = [{}]; field(overlay, 'file').onchange();
  h.setUser({ id: 'account-b' }); done({ url: 'https://image.test/private' }); await tick();
  await field(overlay, 'save').click();
  assert.equal(h.data.note.length, 0);
  assert.equal(h.api.readQuickDraft('note', 'account-b'), null);
  assert.equal(h.api.readQuickDraft('note', 'account-a').image, 'https://image.test/private');
  assert.match(field(overlay, 'error').textContent, /账号已变化/);
});

test('unknown identity and quota failure leave dirty close protection enabled', () => {
  const h = harness(); h.setUser(null);
  let overlay = h.api.openEditor('note'); type(overlay, 'content', 'text');
  assert.equal(h.layers[0].config.isDirty(), true); assert.equal(h.storage.size, 0);
  const other = harness(); other.failDraft(true);
  overlay = other.api.openEditor('note'); type(overlay, 'content', 'text');
  assert.equal(other.layers[0].config.isDirty(), true);
  assert.match(field(overlay, 'draft-status').textContent, /保存失败/);
});

test('note/todo delete skips confirmation, undo once; hot still confirms', async () => {
  const h = harness();
  h.data.note.push({ id: 1, content: 'note' });
  await h.api.confirmDelete('note', 1);
  assert.equal(h.confirms(), 0); assert.equal(h.data.note.length, 0);
  const undo = h.notices.at(-1).options.action.onClick;
  undo(); undo(); assert.equal(h.data.note.length, 1);
  h.data.hot.push({ id: 2, title: 'hot' });
  await h.api.confirmDelete('hot', 2); assert.equal(h.confirms(), 1);
});

test('delete undo cannot insert the original account record into a new account', async () => {
  const h = harness(); h.data.todo.push({ id: 1, title: 'private' });
  await h.api.confirmDelete('todo', 1);
  h.setUser({ id: 'account-b' }); h.notices.at(-1).options.action.onClick();
  assert.equal(h.data.todo.length, 0);
});

test('failed delete restores exact position and skips sync, then can retry', async () => {
  const h = harness(), original = { id: 2, content: 'keep', updated_at: 'old' };
  h.data.note.push({ id: 1 }, original, { id: 3 });
  const events = [];
  h.api.window.markRecordDeleted = () => events.push('sync-delete');
  h.failSave(true);
  assert.equal(await h.api.confirmDelete('note', 2), false);
  assert.deepEqual(h.data.note.map(x => x.id), [1, 2, 3]);
  assert.equal(h.data.note[1], original); assert.deepEqual(events, []);
  assert.match(h.notices.at(-1).text, /删除失败/);
  h.failSave(false);
  h.api.save = () => events.push('saved');
  assert.equal(await h.api.confirmDelete('note', 2), true);
  assert.deepEqual(events, ['saved', 'sync-delete']);
});

test('failed undo restores timestamp and absence, exposes retry, syncs only after save', async () => {
  for (const timestamp of [undefined, '2020-01-01']) {
    const h = harness(), original = { id: 2, content: 'restore' };
    if (timestamp !== undefined) original.updated_at = timestamp;
    h.data.note.push({ id: 1 }, original, { id: 3 });
    await h.api.confirmDelete('note', 2);
    const undo = h.notices.at(-1).options.action.onClick;
    let syncs = 0;
    h.api.window.syncRecord = () => { syncs++; };
    h.failSave(true);
    assert.equal(undo(), false);
    assert.deepEqual(h.data.note.map(x => x.id), [1, 3]);
    assert.equal(original.updated_at, timestamp);
    assert.equal(Object.hasOwn(original, 'updated_at'), timestamp !== undefined);
    assert.equal(syncs, 0);
    const retry = h.notices.at(-1).options.action;
    assert.equal(retry.label, '重试恢复');
    h.failSave(false);
    const events = [];
    h.api.save = () => events.push('saved');
    h.api.window.syncRecord = () => { syncs++; events.push('sync-restore'); };
    assert.equal(retry.onClick(), true);
    undo();
    assert.deepEqual(h.data.note.map(x => x.id), [1, 2, 3]);
    assert.equal(syncs, 1); assert.deepEqual(events, ['saved', 'sync-restore']);
  }
});

test('failed undo retry still enforces account boundary', async () => {
  const h = harness(); h.data.todo.push({ id: 1, title: 'private' });
  await h.api.confirmDelete('todo', 1);
  h.failSave(true); h.notices.at(-1).options.action.onClick();
  const retry = h.notices.at(-1).options.action.onClick;
  h.failSave(false); h.setUser({ id: 'account-b' }); retry();
  assert.equal(h.data.todo.length, 0);
  h.setUser({ id: 'account-a' }); retry();
  assert.equal(h.data.todo.length, 1);
});

test('editor delete failure keeps editor and unsaved text open for retry', async () => {
  const h = harness(), original = { id: 1, content: 'original' };
  h.data.note.push(original);
  const overlay = h.api.openEditor('note', original);
  type(overlay, 'content', 'unsaved text');
  h.failSave(true); await field(overlay, 'delete').click();
  assert.equal(h.layers[0].isOpen(), true);
  assert.equal(field(overlay, 'content').value, 'unsaved text');
  assert.equal(h.data.note[0], original);
  h.failSave(false); await field(overlay, 'delete').click();
  assert.equal(h.layers[0].isOpen(), false); assert.equal(h.data.note.length, 0);
});

test('sync errors do not roll back a committed delete or consume undo prematurely', async () => {
  const h = harness(); h.data.note.push({ id: 1, content: 'restore' });
  h.api.window.markRecordDeleted = () => { throw Error('sync unavailable'); };
  assert.equal(await h.api.confirmDelete('note', 1), true);
  assert.equal(h.data.note.length, 0);
  const undo = h.notices.at(-1).options.action.onClick;
  h.api.window.syncRecord = async () => { throw Error('offline'); };
  assert.equal(undo(), true); await tick();
  assert.equal(h.data.note.length, 1);
  assert.match(h.notices.at(-1).text, /记录已恢复到本机/);
  undo(); assert.equal(h.data.note.length, 1);
});

test('only note and todo route to quick editor, hot retains original fields', () => {
  assert.match(source, /if \(key === "note" \|\| key === "todo"\) return openQuickEditor/);
  assert.match(source, /id="f-mood"/);
  assert.match(source, /mediaFieldHTML\(key, d\)/);
});
