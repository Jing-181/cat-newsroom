import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { DAILY_COPY_MONTHS, DAILY_COPY_FALLBACK, selectDailyCopy } from "../src/lib/daily-copy-content.js";

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("十一月完整覆盖30天，短句不重复，日期逐条对应", () => {
  const items = DAILY_COPY_MONTHS["2026-11"];
  assert.equal(items.length, 30);
  assert.equal(new Set(items).size, 30);
  for (let day = 1; day <= 30; day++) {
    const selected = selectDailyCopy(new Date(2026, 10, day));
    assert.equal(selected.content, items[day - 1]);
    assert.equal(selected.index, day - 1);
    assert.ok(selected.content.length > 10);
    assert.equal(selected.fallback, false);
  }
});

test("月份与年份严格匹配，缺月不借用十一月，兜底不随偏移变化", () => {
  for (const date of [new Date(2026, 9, 31), new Date(2026, 11, 1), new Date(2027, 10, 1)]) {
    for (const offset of [0, 1, 99]) assert.equal(selectDailyCopy(date, offset).content, DAILY_COPY_FALLBACK);
  }
  assert.equal(selectDailyCopy(new Date(2026, 10, 30), 1).index, 0);
  for (const offset of [NaN, Infinity, "1", 1.2]) assert.equal(selectDailyCopy(new Date(2026, 10, 1), offset).index, 0);
});

test("按本地日期选取：UTC前后两侧时区的月边界", () => {
  const moduleURL = new URL("../src/lib/daily-copy-content.js", import.meta.url).href;
  for (const [tz, instant, expected] of [
    ["Asia/Shanghai", "2026-10-31T16:30:00Z", "2026-11-01"],
    ["America/Los_Angeles", "2026-12-01T01:00:00Z", "2026-11-30"],
  ]) {
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", `import { selectDailyCopy } from ${JSON.stringify(moduleURL)}; console.log(selectDailyCopy(new Date(${JSON.stringify(instant)})).dateKey);`], { env: { ...process.env, TZ: tz }, encoding: "utf8" });
    assert.equal(output.trim(), expected);
  }
});

test("渲染与换条不访问网络或账号，存储失败仍可换条、跨天重置", async t => {
  let now = new Date(2026, 10, 30, 12).getTime();
  const RealDate = Date;
  class Clock extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } }
  t.mock.method(globalThis, "fetch", () => { throw new Error("网络不应被调用"); });
  const originals = Object.fromEntries(["Date", "window", "sessionStorage", "localStorage"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => { for (const [key, descriptor] of Object.entries(originals)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  globalThis.Date = Clock;
  globalThis.window = new Proxy({}, { get() { throw new Error("不应依赖账号或云端"); } });
  globalThis.sessionStorage = { getItem() { throw new Error("禁用存储"); }, setItem() { throw new Error("禁用存储"); } };
  globalThis.localStorage = { getItem() { throw new Error("不应读取旧批次缓存"); } };
  const daily = await import(`../src/lib/daily-copy.js?test=${Date.now()}`);
  let click;
  const slot = { innerHTML: "", querySelector() { return this.innerHTML.includes('id="daily-copy-refresh"') ? { addEventListener(event, callback) { assert.equal(event, "click"); click = callback; } } : null; } };
  const container = { querySelector(selector) { assert.equal(selector, "#daily-copy-slot"); return slot; } };
  daily.initDailyCopy(container);
  assert.ok(slot.innerHTML.includes(DAILY_COPY_MONTHS["2026-11"][29]));
  click();
  assert.ok(slot.innerHTML.includes(DAILY_COPY_MONTHS["2026-11"][0]));
  daily.initDailyCopy(container);
  assert.ok(slot.innerHTML.includes(DAILY_COPY_MONTHS["2026-11"][0]));
  now = new RealDate(2026, 10, 29, 12).getTime();
  daily.refreshDailyCopySlot(container);
  assert.ok(slot.innerHTML.includes(DAILY_COPY_MONTHS["2026-11"][28]));
  now = new RealDate(2026, 11, 1, 12).getTime();
  daily.refreshDailyCopySlot(container);
  assert.ok(slot.innerHTML.includes(DAILY_COPY_FALLBACK));
  assert.doesNotMatch(slot.innerHTML, /daily-copy-refresh|daily-copy-generate|daily-copy-login/);
  daily.initDailyCopy({ querySelector: () => null });
  assert.equal(globalThis.fetch.mock.calls.length, 0);
});

test("当日偏移可恢复，过期与损坏偏移忽略", async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  t.after(() => { if (original) Object.defineProperty(globalThis, "sessionStorage", original); else delete globalThis.sessionStorage; });
  const cases = [
    [JSON.stringify({ date: "2026-11-10", offset: 2 }), 11],
    [JSON.stringify({ date: "2026-11-09", offset: 2 }), 9],
    [JSON.stringify({ date: "2026-11-10", offset: "2" }), 9],
    [JSON.stringify({ date: "2026-11-10", offset: -1 }), 9],
    ["broken-json", 9],
  ];
  for (const [i, [saved, expected]] of cases.entries()) {
    globalThis.sessionStorage = { getItem() { return saved; } };
    const daily = await import(`../src/lib/daily-copy.js?storage-case=${i}`);
    assert.ok(daily.dailyCopySlotHTML(new Date(2026, 10, 10)).includes(DAILY_COPY_MONTHS["2026-11"][expected]));
  }
});

test("每日一卡入口已断开生成、补拉与旧批次接口", () => {
  const daily = read("src/lib/daily-copy.js");
  assert.doesNotMatch(daily, /fetchDailyCards|generateDailyCopy|reloadDailyCopy|getDailyBatchInfo|localStorage|openAuthModal/);
  assert.doesNotMatch(read("src/main.js"), /__reloadDailyCopy/);
  const settings = read("src/modules/settings/SettingsView.vue");
  assert.doesNotMatch(settings, /generateDailyCopy|refreshBatch|regenerate|batchInfo|initDailyCopy/);
  assert.match(settings, /本地月度小笺/);
  const home = read("src/modules/home/HomeView.vue");
  assert.match(home, /dailyCopySlotHTML\(\)/);
  assert.match(home, /initDailyCopy\(root\.value\)/);
});
