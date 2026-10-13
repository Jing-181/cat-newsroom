// 演示数据（seed）守卫：样板记录不上云，用户新增/改过的记录照常同步。
// 分两层验证：纯判定逻辑（demo-data.js）与同步出口（supabase-sync.js 的 syncRecord / outbox）。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { CONFIG } from "../src/lib/config.js";
import DemoData from "../src/lib/demo-data.js";

const OUTBOX_KEY = "cat-newsroom-sync-outbox-v1";
const readSource = relative => fs.readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const seedOf = key => structuredClone(CONFIG.modules.find(module => module.key === key).seed);
const markedSeed = key => DemoData.markSeedRecords(seedOf(key));

/* ---------- 判定逻辑 ---------- */

test("样板记录带 __seed 标识，且内容与模板一致时判为演示数据", () => {
  const todo = markedSeed("todo")[0];
  assert.equal(todo.__seed, true, "load() 造出来的样板记录应带标识");
  assert.equal(DemoData.isDemoRecord("todo", todo), true);
});

test("同步层反复改写的 updated_at 不影响判定", () => {
  const todo = { ...markedSeed("todo")[0], updated_at: "2026-10-09T00:00:00.000Z" };
  assert.equal(DemoData.isDemoRecord("todo", todo), true);
});

test("字段顺序不同的同一份样板（云端回来会长成另一个顺序）仍判为演示数据", () => {
  const template = seedOf("todo")[0];
  const reordered = Object.fromEntries([...Object.entries(template), ["__seed", true]].reverse());
  assert.deepEqual(Object.keys(reordered), ["__seed", "note", "done", "priority", "title", "id"]);
  assert.equal(DemoData.isDemoRecord("todo", reordered), true);
});

test("用户改过的样板记录不再算演示数据", () => {
  const todo = { ...markedSeed("todo")[0], done: true };
  assert.equal(DemoData.isDemoRecord("todo", todo), false);
});

test("用户新增的记录（id 不在样板里）不算演示数据", () => {
  assert.equal(DemoData.isDemoRecord("todo", { id: 1780000000000, title: "自己加的", done: false }), false);
});

test("训练记录连嵌套的动作实例一起比对", () => {
  const session = markedSeed("sport").find(record => record.id === "seed-workout-chest-1");
  assert.equal(DemoData.isDemoRecord("sport", session), true);
  const edited = structuredClone(session);
  edited.exercises[0].sets.push({ weight: 20, reps: 12, done: true });
  assert.equal(DemoData.isDemoRecord("sport", edited), false, "改过组数就不再是演示数据");
});

test("样板日期随「今天」漂移（相对日期）仍判为演示数据", () => {
  // 运动 seed 的 date 由 daysAgo(n) 生成、记账/日记/收藏由 isoToday() 生成：
  // 昨天的样板今天再比对，日期已经不同。若把日期算进比对，这些老样板会被当成用户记录同步上云。
  const sport = markedSeed("sport").find(record => record.id === "seed-workout-legs-1");
  assert.equal(DemoData.isDemoRecord("sport", { ...sport, date: "2026-10-02" }), true, "跨天的训练样板仍应被识别");
  const money = { ...markedSeed("money")[0], date: "2026-10-02" };
  assert.equal(DemoData.isDemoRecord("money", money), true, "跨天的记账样板仍应被识别");
  const note = { ...markedSeed("note")[0], date: "2026-10-02" };
  assert.equal(DemoData.isDemoRecord("note", note), true, "跨天的日记样板仍应被识别");
});

test("上云前去掉 __seed 标识，且不改动本地记录", () => {
  const todo = markedSeed("todo")[0];
  const uploaded = DemoData.stripSeedFlag(todo);
  assert.equal("__seed" in uploaded, false);
  assert.equal(todo.__seed, true, "本地那条仍保留标识");
});

/* ---------- 同步出口 ---------- */

// 让经典脚本 supabase-sync.js 在一个干净的 vm 里跑起来，再直接调用它的全局函数
function createSyncSandbox(data) {
  const storage = new Map();
  const sandbox = {
    CONFIG,
    data,
    structuredClone,
    console,
    setTimeout,
    clearTimeout,
    document: { querySelectorAll: () => [], querySelector: () => null, head: { appendChild: () => {} } },
    localStorage: {
      getItem: key => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
      key: index => [...storage.keys()][index] ?? null,
      get length() { return storage.size; },
    },
  };
  // 经典脚本之间靠全局对象通信（window.SyncCore / window.DemoData），window 就是全局对象本身
  sandbox.window = sandbox;
  sandbox.DemoData = DemoData;
  vm.createContext(sandbox);
  vm.runInContext(readSource("../js/sync-core.js"), sandbox);
  vm.runInContext(readSource("../supabase-sync.js"), sandbox);
  return sandbox;
}

const outboxOf = sandbox => JSON.parse(sandbox.localStorage.getItem(OUTBOX_KEY) || "[]");

test("未动过的样板记录不会被排进 outbox", () => {
  const data = { todo: markedSeed("todo") };
  const sandbox = createSyncSandbox(data);
  assert.equal(sandbox.syncRecord({ moduleKey: "todo", record: data.todo[0] }), null);
  assert.equal(outboxOf(sandbox).length, 0);
});

test("用户新加的记录照常排进 outbox", () => {
  const mine = { id: 1780000000000, title: "买猫砂", done: false };
  const data = { todo: [...markedSeed("todo"), mine] };
  const sandbox = createSyncSandbox(data);
  sandbox.syncRecord({ moduleKey: "todo", record: mine });
  const outbox = outboxOf(sandbox);
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].record.title, "买猫砂");
});

test("用户改过的样板记录照常入队，上云副本不带 __seed", () => {
  const data = { todo: markedSeed("todo") };
  const sandbox = createSyncSandbox(data);
  data.todo[0].done = true;
  sandbox.syncRecord({ moduleKey: "todo", record: data.todo[0] });
  const outbox = outboxOf(sandbox);
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].record.done, true);
  assert.equal("__seed" in outbox[0].record, false);
  assert.ok(outbox[0].record.updated_at, "上云副本应带更新时间");
});

test("注册账号迁移只推用户记录，不推样板数据", () => {
  const mine = { id: 1780000000001, title: "猫砂 6L", type: "expense", amount: 99, category: "猫物", date: "2026-10-09" };
  const data = { todo: markedSeed("todo"), money: [...markedSeed("money"), mine] };
  const sandbox = createSyncSandbox(data);
  sandbox.queueLocalAccountMigration();
  const outbox = outboxOf(sandbox);
  assert.equal(outbox.length, 1, "只有手动新增的那条该被迁移");
  assert.equal(outbox[0].moduleKey, "money");
  assert.equal(outbox[0].record.title, "猫砂 6L");
});

test("修复前排在 outbox 里的老样板操作会被丢掉，用户操作保留", () => {
  const legacy = {
    todo: { id: 11, title: "给猫主子换水换粮", priority: "P0", done: false, note: "记得检查自动喂食器余量" },
    note: { id: 1780000000002, title: "今天的小确幸", content: "橘座趴键盘", mood: "开心", date: "2026-10-09" },
  };
  const sandbox = createSyncSandbox(legacy);
  const kept = sandbox.dropDemoOperations([
    { operationId: "op-legacy-seed", type: "record", moduleKey: "todo", record: legacy.todo },
    { operationId: "op-legacy-mine", type: "record", moduleKey: "note", record: legacy.note },
    { operationId: "op-legacy-del", type: "delete", moduleKey: "todo", recordId: "11", deletedAt: "2026-10-09T00:00:00.000Z" },
  ]);
  assert.deepEqual(kept.map(item => item.operationId), ["op-legacy-mine", "op-legacy-del"]);
});
