import test from 'node:test';
import assert from 'node:assert/strict';
const storage = new Map();
let failSave = false;
globalThis.localStorage = { getItem: key => storage.get(key), setItem: (key, value) => { if (failSave) throw Error('quota'); storage.set(key, value); } };
globalThis.window = { addEventListener() {} };
globalThis.document = { addEventListener() {} };
const { insertRecord, replaceData, getData, subscribe } = await import('../src/lib/store.js');
const { CONFIG } = await import('../src/lib/config.js');

test('快速保存本机成功、同步失败仍保留一条记录并通知界面', () => {
  replaceData({ note: [] }); let changed = 0;
  const off = subscribe(() => changed++);
  window.syncRecord = () => { throw Error('offline'); };
  assert.deepEqual(insertRecord('note', { id: 'a', content: '一笔' }), { syncPending: true });
  assert.equal(getData().note.length, 1);
  assert.equal(JSON.parse(storage.get(CONFIG.storageKey)).note.length, 1);
  assert.equal(changed, 1); off();
});
test('本机保存失败恢复原数组且不发送同步', () => {
  const original = [{ id: 'old' }]; replaceData({ todo: original }); failSave = true;
  let calls = 0; window.syncRecord = () => calls++;
  assert.throws(() => insertRecord('todo', { id: 'new' }), /quota/);
  assert.equal(getData().todo, original); assert.equal(calls, 0);
  assert.throws(() => insertRecord('note', { id: 'note' }), /quota/);
  assert.equal(Object.hasOwn(getData(), 'note'), false); failSave = false;
});
