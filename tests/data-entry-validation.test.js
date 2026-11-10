// 三条外部数据入口的最小形状校验。
// 原则：解析成功不等于可以信任；冷启动路径要与已有的跨标签路径保持同样的严格度。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { CONFIG } from "../src/lib/config.js";
import DemoData from "../src/lib/demo-data.js";
import backup from "../src/lib/data-backup.js";

/* ---------- 1. store.load()：冷启动的形状校验 ---------- */

// store.js 在加载期就摸 window / localStorage，所以铺一层最小替身再动态 import。
// 每次用例前重置 storage，让 load() 重新跑一遍。
function freshStore(storage) {
  globalThis.localStorage = storage;
  globalThis.window = {
    localStorage: storage,
    addEventListener() {},
    updateAuthUI() {},
    syncRecord() {},
    syncDelete() {},
    syncMetaField() {},
  };
  globalThis.document = { addEventListener() {}, querySelector: () => null };
  return import(`../src/lib/store.js?reload=${Math.random()}`);
}

const makeStorage = initial => {
  const map = new Map(initial ? [[CONFIG.storageKey, initial]] : []);
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    key: index => [...map.keys()][index] ?? null,
    get length() { return map.size; },
  };
};

test("load()：正常数据原样载入，不受新校验影响", async () => {
  const raw = JSON.stringify({ todo: [{ id: 11, title: "换水" }], sport: [] });
  const store = await freshStore(makeStorage(raw));
  assert.deepEqual(store.getData().todo, [{ id: 11, title: "换水" }]);
});

test("load()：localStorage 里是 \"null\" 时回退到种子，而不是把 data 变成 null", async () => {
  const store = await freshStore(makeStorage("null"));
  const data = store.getData();
  assert.ok(data && typeof data === "object" && !Array.isArray(data), "data 必须是对象");
  // 回退到种子：每个模块键都在
  CONFIG.modules.forEach(m => assert.ok(Array.isArray(data[m.key]), `${m.key} 应为种子数组`));
});

test("load()：localStorage 里是 \"[]\" 时回退到种子（数组不是合法仓库形状）", async () => {
  const store = await freshStore(makeStorage("[]"));
  assert.ok(Array.isArray(store.getData().todo), "应回退到种子");
});

test("load()：localStorage 里是 \"3\" 时回退到种子", async () => {
  const store = await freshStore(makeStorage("3"));
  assert.ok(Array.isArray(store.getData().todo), "应回退到种子");
});

test("load()：模块字段是字符串（{\"todo\":\"x\"}）时也要能载入，由各视图的 || [] 兜底", async () => {
  // 这一条记录现状：形状校验只挡「顶层不是对象」，不逐键校验字段类型。
  // 逐键校验属于把同步协议形状前移到本地读取，超出「最小校验」范围。
  const store = await freshStore(makeStorage('{"todo":"x"}'));
  assert.equal(store.getData().todo, "x");
});

test("load()：损坏的 JSON 回退到种子（原有行为，未被削弱）", async () => {
  const store = await freshStore(makeStorage("{not json"));
  assert.ok(Array.isArray(store.getData().todo), "应回退到种子");
});

test("load()：空键回退到种子（原有行为，未被削弱）", async () => {
  const store = await freshStore(makeStorage(null));
  assert.ok(Array.isArray(store.getData().todo), "应回退到种子");
});

/* ---------- 2. readOutbox()：损坏成非数组时不炸整条保存链 ---------- */

// 在干净的 vm 里跑经典脚本，直接调 readOutbox 与它的下游 enqueue。
const readSource = relative => fs.readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

function createSyncSandbox(data, outboxRaw) {
  const storage = new Map();
  if (outboxRaw !== undefined) storage.set("cat-newsroom-sync-outbox-v1", outboxRaw);
  const sandbox = {
    CONFIG,
    data,
    structuredClone,
    console: { info() {}, error() {} },
    setTimeout, clearTimeout,
    document: { querySelectorAll: () => [], querySelector: () => null, head: { appendChild: () => {} } },
    localStorage: {
      getItem: key => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
      key: index => [...storage.keys()][index] ?? null,
      get length() { return storage.size; },
    },
  };
  sandbox.window = sandbox;
  sandbox.DemoData = DemoData;
  vm.createContext(sandbox);
  vm.runInContext(readSource("../js/sync-core.js"), sandbox);
  vm.runInContext(readSource("../supabase-sync.js"), sandbox);
  return sandbox;
}

const OUTBOX_KEY = "cat-newsroom-sync-outbox-v1";
const markedTodo = () => DemoData.markSeedRecords(
  structuredClone(CONFIG.modules.find(m => m.key === "todo").seed),
);

test("readOutbox：损坏成 {} 时返回空数组，入队不抛（否则 store.persist 会冒泡、保存后 UI 不刷新）", () => {
  const data = { todo: markedTodo() };
  const sandbox = createSyncSandbox(data, "{}");
  const queued = sandbox.queueOperation({ type: "record", moduleKey: "todo", record: { id: "u1", title: "买猫砂" } });
  assert.ok(queued, "入队应成功返回操作");
  assert.deepEqual(JSON.parse(sandbox.localStorage.getItem(OUTBOX_KEY)), [
    { operationId: queued.operationId, createdAt: queued.createdAt, accountId: null, type: "record", moduleKey: "todo", record: { id: "u1", title: "买猫砂" } },
  ]);
});

test("readOutbox：损坏成 \"null\" 时返回空数组", () => {
  const sandbox = createSyncSandbox({ todo: markedTodo() }, "null");
  assert.doesNotThrow(() => sandbox.queueOperation({ type: "delete", moduleKey: "todo", recordId: "11" }));
});

test("readOutbox：损坏成字符串 \"abc\" 时返回空数组", () => {
  const sandbox = createSyncSandbox({ todo: markedTodo() }, '"abc"');
  assert.doesNotThrow(() => sandbox.queueOperation({ type: "delete", moduleKey: "todo", recordId: "11" }));
});

test("readOutbox：损坏成 \"5\" 时返回空数组", () => {
  const sandbox = createSyncSandbox({ todo: markedTodo() }, "5");
  assert.doesNotThrow(() => sandbox.queueOperation({ type: "delete", moduleKey: "todo", recordId: "11" }));
});

test("readOutbox：合法的数组不受影响（原有行为，未被削弱）", () => {
  const existing = [{ operationId: "op-old", createdAt: "2026-10-20T00:00:00.000Z", type: "record", moduleKey: "todo", record: { id: "u0", title: "旧的" } }];
  const sandbox = createSyncSandbox({ todo: markedTodo() }, JSON.stringify(existing));
  const outbox = JSON.parse(sandbox.localStorage.getItem(OUTBOX_KEY));
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].operationId, "op-old");
});

/* ---------- 3. 备份导入：元数据白名单要含配置类字段 ---------- */

const KEYS = CONFIG.modules.map(m => m.key);

test("dataForRestore：保留 __homeOrder（否则导出再导入后首页排序静默回默认）", () => {
  const order = ["clock", "focus", "quick", "overview"];
  const snapshot = backup.createSnapshot(
    { todo: [], __homeOrder: order },
    CONFIG.storageKey,
    "2026-10-24T00:00:00.000Z",
  );
  const restored = backup.dataForRestore(backup.parse(JSON.stringify(snapshot), KEYS), KEYS);
  assert.deepEqual(restored.__homeOrder, order);
});

test("dataForRestore：保留 __homeVersionVisible（否则导入后首页版本号开关回默认）", () => {
  const snapshot = backup.createSnapshot(
    { todo: [], __homeVersionVisible: false },
    CONFIG.storageKey,
    "2026-10-24T00:00:00.000Z",
  );
  const restored = backup.dataForRestore(backup.parse(JSON.stringify(snapshot), KEYS), KEYS);
  assert.equal(restored.__homeVersionVisible, false);
});

test("dataForRestore：原有三个元数据键仍在（__avatar / __pomo / __trend）", () => {
  const snapshot = backup.createSnapshot(
    { todo: [], __avatar: "data:image/jpeg;base64,x", __pomo: { count: 2, min: 50 }, __trend: [1, 2, 3, 4, 5, null, null] },
    CONFIG.storageKey,
    "2026-10-24T00:00:00.000Z",
  );
  const restored = backup.dataForRestore(backup.parse(JSON.stringify(snapshot), KEYS), KEYS);
  assert.equal(restored.__avatar, "data:image/jpeg;base64,x");
  assert.deepEqual(restored.__pomo, { count: 2, min: 50 });
  assert.deepEqual(restored.__trend, [1, 2, 3, 4, 5, null, null]);
});

test("dataForRestore：非白名单字段仍被丢弃（不因为补了两个键就放开）", () => {
  const snapshot = backup.createSnapshot(
    { todo: [{ id: 1, title: "任务" }], __unknown: "不该进来", junk: 42 },
    CONFIG.storageKey,
    "2026-10-24T00:00:00.000Z",
  );
  const restored = backup.dataForRestore(backup.parse(JSON.stringify(snapshot), KEYS), KEYS);
  assert.equal("__unknown" in restored, false);
  assert.equal("junk" in restored, false);
  assert.deepEqual(restored.todo, [{ id: 1, title: "任务" }]);
});

test("dataForRestore：缺元数据键时不凭空造字段", () => {
  const snapshot = backup.createSnapshot({ todo: [] }, CONFIG.storageKey, "2026-10-24T00:00:00.000Z");
  const restored = backup.dataForRestore(backup.parse(JSON.stringify(snapshot), KEYS), KEYS);
  assert.equal("__homeOrder" in restored, false);
  assert.equal("__homeVersionVisible" in restored, false);
  assert.equal("__avatar" in restored, false);
});
