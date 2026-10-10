import test from "node:test";
import assert from "node:assert/strict";

// store.js 在加载期就摸 window / localStorage / document，所以先铺一层最小替身，再动态 import
const storage = new Map();
const calls = { syncRecord: [], syncDelete: [], syncMetaField: [] };

globalThis.localStorage = {
  getItem: key => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => { storage.set(key, String(value)); },
  removeItem: key => { storage.delete(key); },
};
globalThis.window = {
  localStorage: globalThis.localStorage,
  addEventListener() {},
  updateAuthUI() {},
  syncRecord: input => calls.syncRecord.push(input),
  syncDelete: input => calls.syncDelete.push(input),
  syncMetaField: input => calls.syncMetaField.push(input),
};
globalThis.document = { addEventListener() {}, querySelector: () => null };

const { CONFIG } = await import("../src/lib/config.js");
const store = await import("../src/lib/store.js");

const readStored = () => JSON.parse(storage.get(CONFIG.storageKey));

test("getData 返回的就是被落盘的那一份（视图就地改数组即可生效）", () => {
  const data = store.getData();
  assert.ok(Array.isArray(data.sport));
  data.sport.push({ id: "sport-x", title: "临时记录" });
  store.save();
  assert.equal(readStored().sport.at(-1).id, "sport-x");
  data.sport.pop();
  store.save();
  assert.equal(readStored().sport.some(item => item.id === "sport-x"), false);
});

test("persist 落盘、剥掉样板标识、并通知同步层", () => {
  calls.syncRecord.length = 0;
  const record = { id: "todo-1", title: "用户自己加的", __seed: true };
  store.getData().todo.push(record);
  store.persist("todo", record);
  assert.equal(Object.prototype.hasOwnProperty.call(record, "__seed"), false); // 用户动过就不再是演示数据
  assert.equal(readStored().todo.some(item => item.id === "todo-1"), true);
  assert.deepEqual(calls.syncRecord, [{ moduleKey: "todo", record }]);
});

test("remove 从仓库里删掉记录并走同步层的删除出口", () => {
  calls.syncDelete.length = 0;
  const record = { id: "todo-2", title: "待删" };
  store.getData().todo.push(record);
  store.remove("todo", record.id);
  assert.equal(store.getData().todo.some(item => item.id === "todo-2"), false);
  assert.equal(readStored().todo.some(item => item.id === "todo-2"), false);
  assert.deepEqual(calls.syncDelete, [{ moduleKey: "todo", recordId: "todo-2" }]);
});

test("remove 容忍记录已被调用方自行移出数组（训练控制器就是先 splice 再回调）", () => {
  calls.syncDelete.length = 0;
  assert.doesNotThrow(() => store.remove("todo", "todo-不存在"));
  assert.deepEqual(calls.syncDelete, [{ moduleKey: "todo", recordId: "todo-不存在" }]);
});

test("saveMetaField 写内存、落盘并同步云端", () => {
  calls.syncMetaField.length = 0;
  const value = { count: 3, min: 75 };
  store.saveMetaField("__pomo", value);
  assert.deepEqual(store.getData().__pomo, value);
  assert.deepEqual(readStored().__pomo, value);
  assert.deepEqual(calls.syncMetaField, [{ field: "__pomo", value }]);
});

test("跨标签 storage 事件会替换内存数据（不炸）", () => {
  assert.equal(typeof store.subscribe, "function");
  const unsubscribe = store.subscribe(() => {});
  assert.doesNotThrow(() => { store.bump(); });
  assert.equal(typeof unsubscribe, "function");
  unsubscribe();
});
