import test from "node:test";
import assert from "node:assert/strict";

// trace.js 只依赖 localStorage 与可选的 document，所以这里铺一层最小替身就能单测。
// 注意：模块级缓存（enabled / buffer / timer）在整个文件内共享，每个用例自己收拾干净。
const storage = new Map();
let quotaThrows = 0; // 配额满时抛出次数：模拟「第一次写失败、腾出位置后重试成功」

globalThis.localStorage = {
  getItem: key => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => {
    if (quotaThrows > 0) {
      quotaThrows -= 1;
      const error = new Error("quota");
      error.name = "QuotaExceededError";
      throw error;
    }
    storage.set(key, String(value));
  },
  removeItem: key => { storage.delete(key); },
  get size() { return storage.size; },
};

const trace = await import("../src/lib/trace.js");

const PREFIX = "cat-newsroom-trace-v1:";
const INDEX_KEY = "cat-newsroom-trace-index-v1";
const ENABLED_KEY = "cat-newsroom-trace-enabled-v1";

const reset = () => {
  storage.clear();
  quotaThrows = 0;
  trace.setEnabled(true);
  trace.clear();
};
const days = () => [...storage.keys()].filter(key => key.startsWith(PREFIX)).sort();
const bucket = day => JSON.parse(storage.get(PREFIX + day) || "[]");
// 取「有事件的那一天」的键（今天是唯一会写入的桶）
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const eventDays = () => [...storage.keys()].filter(key => key.startsWith(PREFIX)).sort();

test("track 先进内存，不碰 localStorage；flush 后才按天落桶", () => {
  reset();
  trace.track("workout_page_open", { entry_from: "home", has_draft: false });
  assert.equal(eventDays().length, 0, "track 不应直接写存储（训练中每次输入都写会拖手感）");

  const written = trace.flush();
  assert.equal(written, 1);
  const key = todayKey();
  const events = bucket(key);
  assert.equal(events.length, 1);
  assert.equal(events[0].e, "workout_page_open");
  assert.equal(events[0].entry_from, "home");
  assert.equal(events[0].has_draft, false);
  assert.equal(typeof events[0].t, "number");
  // 索引里记了这一天
  assert.deepEqual(JSON.parse(storage.get(INDEX_KEY)), [key]);
  reset();
});

test("只收标量与短字符串，正文类内容不会被顺手记进去", () => {
  reset();
  trace.track("record_saved", {
    module: "todo",
    field_count: 3,
    ok: true,
    missing: null,
    nested: { title: "给猫主子换水换粮" },
    long: "x".repeat(200),
  });
  trace.flush();
  const [event] = bucket(todayKey());
  assert.equal(event.module, "todo");
  assert.equal(event.field_count, 3);
  assert.equal(event.ok, true);
  assert.equal("missing" in event, false);
  assert.equal("nested" in event, false, "对象一律不收，避免把记录内容带进去");
  assert.equal(event.long.length, 32, "字符串统一截断");
  reset();
});

test("不改业务数据键，也不碰同步协议（源码层面断言）", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("../src/lib/trace.js", import.meta.url), "utf8");
  // 只看代码，不看注释（注释里本来就写着这些约束的名字）
  const code = source.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /cat-newsroom-data-v2/, "不许写业务记录键");
  assert.doesNotMatch(code, /syncRecord|syncDelete|syncMetaField|outbox/, "不许走同步层");
  assert.doesNotMatch(code, /fetch\(|XMLHttpRequest|supabase/i, "零网络");
  assert.doesNotMatch(code, /workout_session/, "不许碰训练记录模型");
  reset();
});

test("总开关：关掉后所有记录函数空操作，且不删已有数据", () => {
  reset();
  trace.track("app_open", { launch: "cold" });
  trace.flush();
  const before = storage.get(PREFIX + todayKey());
  assert.ok(before);

  trace.setEnabled(false);
  assert.equal(trace.isEnabled(), false);
  trace.track("app_open", { launch: "warm" });
  assert.equal(trace.flush(), 0, "关闭后 flush 不应写入");
  assert.equal(storage.get(PREFIX + todayKey()), before, "关闭不删已有数据");

  // 关闭期间 buffer 也被丢掉，重新打开不会把停用期的事件补写进来
  trace.setEnabled(true);
  trace.flush();
  assert.equal(storage.get(PREFIX + todayKey()), before);

  // 开关落在自己的键上，不进业务数据
  assert.ok(storage.has(ENABLED_KEY));
  assert.equal(storage.has("cat-newsroom-data-v2"), false);
  reset();
});

test("clear 清空所有日桶与索引，开关状态保留", () => {
  reset();
  trace.track("app_open", {});
  trace.flush();
  assert.ok(days().length > 0);

  const removed = trace.clear();
  assert.equal(removed, 1);
  assert.equal(eventDays().length, 0);
  assert.equal(storage.has(INDEX_KEY), false);
  assert.equal(trace.isEnabled(), true, "清空数据不等于关掉开关");
  reset();
});

test("exportPayload 按天分组导出，结构可序列化", () => {
  reset();
  trace.track("quick_add_click", { module: "sport" });
  trace.track("report_more_click", {});
  trace.flush();

  const payload = trace.exportPayload();
  assert.equal(typeof payload.exported_at, "string");
  assert.equal(payload.days.length, 1);
  assert.equal(payload.days[0].events.length, 2);
  assert.equal(payload.days[0].events[0].e, "quick_add_click");
  assert.doesNotThrow(() => JSON.stringify(payload));
  reset();
});

test("单桶 8000 条封顶，超出部分丢弃且不报错", () => {
  reset();
  const today = todayKey();
  const full = Array.from({ length: 8000 }, (_, i) => ({ t: Date.now(), e: "filler", i }));
  storage.set(PREFIX + today, JSON.stringify(full));
  storage.set(INDEX_KEY, JSON.stringify([today]));

  trace.track("app_open", {});
  assert.equal(trace.flush(), 0, "到顶后不再追加");
  assert.equal(bucket(today).length, 8000);
  reset();
});

test("超过 90 天的桶会被清掉", () => {
  reset();
  const iso = offset => {
    const d = new Date(Date.now() + offset * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const old = iso(-120);
  const recent = iso(-10);
  storage.set(PREFIX + old, JSON.stringify([{ t: Date.now(), e: "old" }]));
  storage.set(PREFIX + recent, JSON.stringify([{ t: Date.now(), e: "recent" }]));
  storage.set(INDEX_KEY, JSON.stringify([old, recent]));

  trace.track("app_open", {});
  trace.flush();

  assert.equal(storage.has(PREFIX + old), false, "120 天前的桶应被删除");
  assert.equal(storage.has(PREFIX + recent), true, "10 天前的桶要留着");
  reset();
});

test("配额满时删最旧的一天重试一次，仍失败就静默放弃", () => {
  reset();
  const iso = offset => {
    const d = new Date(Date.now() + offset * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const oldest = iso(-3);
  const today = iso(0);
  storage.set(PREFIX + oldest, JSON.stringify([{ t: Date.now(), e: "oldest" }]));
  storage.set(INDEX_KEY, JSON.stringify([oldest]));

  quotaThrows = 1; // 第一次写今天的桶抛配额错

  trace.track("app_open", {});
  assert.doesNotThrow(() => trace.flush());
  assert.equal(storage.has(PREFIX + oldest), false, "应删掉最旧的一天腾位置");
  assert.equal(bucket(today).length, 1, "重试后写进去了");

  // 再来一次：索引已空，没有可删的了 → 静默放弃，不抛错
  reset();
  quotaThrows = 2;
  trace.track("app_open", {});
  assert.doesNotThrow(() => trace.flush());
  assert.equal(trace.flush(), 0);
  reset();
});

test("stats 汇总天数、条数与体积", () => {
  reset();
  trace.track("app_open", {});
  trace.track("quick_add_click", { module: "todo" });
  trace.flush();
  const info = trace.stats();
  assert.equal(info.days, 1);
  assert.equal(info.events, 2);
  assert.ok(info.bytes > 0);
  reset();
});

test("没有 localStorage 时所有接口安全空转", async () => {
  const saved = globalThis.localStorage;
  delete globalThis.localStorage;
  // 换一个模块实例，避免受已缓存的 enabled 影响
  const fresh = await import(`../src/lib/trace.js?no-storage=${Date.now()}`);
  assert.doesNotThrow(() => fresh.track("app_open", {}));
  assert.equal(fresh.flush(), 0);
  assert.deepEqual(fresh.stats(), { days: 0, events: 0, bytes: 0 });
  assert.deepEqual(fresh.exportPayload().days, []);
  assert.doesNotThrow(() => fresh.clear());
  globalThis.localStorage = saved;
  reset();
});
