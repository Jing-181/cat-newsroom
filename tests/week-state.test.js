import test from "node:test";
import assert from "node:assert/strict";

// week-state 依赖 store.js（加载期就摸 window / localStorage / document），先铺最小替身再动态 import
const storage = new Map();
const metaCalls = [];

globalThis.localStorage = {
  getItem: key => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => { storage.set(key, String(value)); },
  removeItem: key => { storage.delete(key); },
};
globalThis.window = {
  localStorage: globalThis.localStorage,
  addEventListener() {},
  saveMetaCloud: (field, value) => metaCalls.push([field, value]),
};
globalThis.document = { addEventListener() {}, querySelector: () => null };

const { CONFIG } = await import("../src/lib/config.js");
const store = await import("../src/lib/store.js");
const { weekStartKey, trendDays } = await import("../src/lib/utils.js");
const { readTrend, writeTrendDay, trendCellsHTML } = await import("../src/lib/week-state.js");

const BLANK = [null, null, null, null, null, null, null];
const lastWeek = weekStartKey(new Date(Date.now() - 7 * 86400000));

test("本周标识取的就是周一", () => {
  assert.equal(weekStartKey(new Date("2026-10-08T10:00:00")), "2026-10-05");
  assert.equal(weekStartKey(new Date("2026-10-05T10:00:00")), "2026-10-05");
  assert.equal(weekStartKey(new Date("2026-10-11T23:00:00")), "2026-10-05");
});

test("周标识对不上本周时读出来是空的一周（跨周自动归零）", () => {
  assert.deepEqual(trendDays({ week: lastWeek, days: [5, 4, 3, 2, 1, null, null] }), BLANK);
  assert.deepEqual(trendDays({ week: weekStartKey(), days: [5, 4, 3, 2, 1, null, null] }), [5, 4, 3, 2, 1, null, null]);
});

test("升级前的裸数组没有周归属，按空处理，不再把上周的分带进本周", () => {
  assert.deepEqual(trendDays([5, 4, 3, 2, 1, null, null]), BLANK);
  assert.deepEqual(trendDays(undefined), BLANK);
  assert.deepEqual(trendDays({ week: weekStartKey(), days: [1, 2] }), BLANK);
});

test("写某天会带上本周标识并同步云端，上周的分数不会被继承", () => {
  const data = store.getData();
  data.__trend = { week: lastWeek, days: [5, 5, 5, 5, 5, 5, 5] };
  store.save();

  writeTrendDay(2, 3);

  const stored = JSON.parse(storage.get(CONFIG.storageKey)).__trend;
  assert.equal(stored.week, weekStartKey());
  assert.deepEqual(stored.days, [null, null, 3, null, null, null, null]);
  assert.deepEqual(readTrend(), [null, null, 3, null, null, null, null]);
  assert.equal(metaCalls.at(-1)[0], "__trend");
  assert.deepEqual(metaCalls.at(-1)[1], stored);
});

test("同一周内继续记，不会清掉已经点过的天", () => {
  writeTrendDay(0, 4);
  assert.deepEqual(readTrend(), [4, null, 3, null, null, null, null]);
});

test("首页趋势卡读同一份数据：上周的分数不会出现在本周曲线上", () => {
  const data = store.getData();
  data.__trend = { week: lastWeek, days: [5, 4, 3, 2, 1, 4, 5] };
  assert.deepEqual(CONFIG.trend.series(data), BLANK);
});

test("趋势格子在跨周后回到未记录，重新点了才出新值", () => {
  const data = store.getData();
  data.__trend = { week: lastWeek, days: [5, 4, 3, 2, 1, 4, 5] };
  store.save();

  const before = trendCellsHTML();
  assert.equal((before.match(/ws-empty/g) || []).length, 7, "跨周后 7 个格子都应当是未记录");
  assert.doesNotMatch(before, /ws-val/);

  writeTrendDay(1, 3);
  const after = trendCellsHTML();
  assert.equal((after.match(/ws-val/g) || []).length, 1);
  assert.match(after, /aria-label="周二状态3分"/);
});
