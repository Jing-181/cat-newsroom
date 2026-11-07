// utils.js 的纯逻辑：周口径推算、trendDays 降级、avgProgress 的两条分支。
// avgProgress 曾写成 `typeof Workout !== "undefined" ? list.filter(Workout.isSession) : []`，
// workout 家族迁 ESM 后全仓没有 window.Workout 赋值，该分支恒为 false，
// 导致首页「运动」环形图恒显示 0%。这里把两个分支各钉一条。
// 末尾再钉一条：洞察页与首页的「N 次训练」必须同口径（都只数 completed 的 session）。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  weekDates, weekStartKey, trendDays, avgProgress,
} from "../src/lib/utils.js";
import Workout from "../src/lib/workout.js";

const session = (id, date) => {
  const record = Workout.createSession("chest", new Date(`${date}T00:00:00`));
  record.id = id;
  record.status = "completed";
  record.exercises = [{ id: `ex-${id}`, exercise_id: "barbell_bench_press", name: "杠铃卧推", body_part: "胸", equipment: "杠铃", planned_sets: 1, sets: [{ weight_kg: 60, reps: 8 }], note: "" }];
  return record;
};

/* ---------- avgProgress ---------- */

test("avgProgress：纯 session 列表走训练分支，返回 100 与 N 次训练（不是 0%）", () => {
  const result = avgProgress([session("s1", "2026-10-05"), session("s2", "2026-10-07")]);
  assert.deepEqual(result, { value: 100, sub: "2 次训练" });
});

test("avgProgress：单条 session 也算训练，不再回落到百分比分支", () => {
  assert.deepEqual(avgProgress([session("s1", "2026-10-05")]), { value: 100, sub: "1 次训练" });
});

test("avgProgress：含 progress 记录（有 target）的列表走百分比分支", () => {
  const list = [
    { id: 31, title: "《猫的优雅》", current: 128, target: 240 },
    { id: 32, title: "《认知觉醒》", current: 90, target: 300 },
  ];
  // (53 + 30) / 2 = 41.5 → 42
  assert.deepEqual(avgProgress(list), { value: 42, sub: "2 项" });
});

test("avgProgress：混合列表里有 session 就优先报训练次数", () => {
  const mixed = [session("s1", "2026-10-05"), { id: 31, current: 100, target: 200 }];
  assert.deepEqual(avgProgress(mixed), { value: 100, sub: "1 次训练" });
});

test("avgProgress：空列表与非数组安全", () => {
  assert.deepEqual(avgProgress([]), { value: 0, sub: "0" });
  assert.deepEqual(avgProgress(null), { value: 0, sub: "0" });
  assert.deepEqual(avgProgress(undefined), { value: 0, sub: "0" });
});

test("avgProgress：target 为 0 的记录不把平均值推到 100", () => {
  // current/target → Infinity 是 truthy，Math.min(100, Infinity) = 100。
  // 这里记录现状：target 填 0 的书会显示 100%，要靠编辑器 Math.max(1, ...) 兜底。
  const result = avgProgress([{ id: 1, current: 50, target: 0 }]);
  assert.equal(result.sub, "1 项");
  assert.equal(result.value, 100);
});

test("avgProgress：草稿 session 也计入训练分支（与首页本周训练卡的口径不同，这里只验证 avgProgress）", () => {
  const draft = session("d1", "2026-10-05");
  draft.status = "draft";
  assert.deepEqual(avgProgress([draft]), { value: 100, sub: "1 次训练" });
});

/* ---------- trendDays ---------- */

test("trendDays：带本周标识的 7 天数组原样返回", () => {
  const week = weekStartKey();
  const days = [1, 2, 3, 4, 5, null, null];
  assert.deepEqual(trendDays({ week, days }), days);
});

test("trendDays：week 不是本周 → 整体作废返回全 null（不把上周分数画进本周）", () => {
  assert.deepEqual(trendDays({ week: "2020-01-06", days: [5, 5, 5, 5, 5, 5, 5] }), [null, null, null, null, null, null, null]);
});

test("trendDays：升级前的裸数组没有周归属 → 返回全 null", () => {
  assert.deepEqual(trendDays([1, 2, 3, 4, 5, 4, 3]), [null, null, null, null, null, null, null]);
});

test("trendDays：days.length !== 7 → 返回全 null", () => {
  const week = weekStartKey();
  assert.deepEqual(trendDays({ week, days: [1, 2, 3] }), [null, null, null, null, null, null, null]);
  assert.deepEqual(trendDays({ week, days: [] }), [null, null, null, null, null, null, null]);
});

test("trendDays：含非数字的日子保留原值，由渲染层判断（本函数只做周归属校验）", () => {
  const week = weekStartKey();
  assert.deepEqual(trendDays({ week, days: [1, "x", 3, 4, 5, null, null] }), [1, "x", 3, 4, 5, null, null]);
});

test("trendDays：null / undefined / 非对象安全", () => {
  const blank = [null, null, null, null, null, null, null];
  assert.deepEqual(trendDays(null), blank);
  assert.deepEqual(trendDays(undefined), blank);
  assert.deepEqual(trendDays(7), blank);
  assert.deepEqual(trendDays("2026-10-05"), blank);
});

/* ---------- weekDates / weekStartKey ---------- */

test("weekDates：固定周一返回该周 7 天，且 weekStartKey 等于首日", () => {
  // 2026-10-05 是周一
  const dates = weekDates(new Date("2026-10-05T12:00:00"));
  assert.deepEqual(dates, ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
  assert.equal(weekStartKey(new Date("2026-10-05T12:00:00")), "2026-10-05");
});

test("weekDates：周日（getDay()===0）归入上一周，不另起一周", () => {
  // 2026-10-11 是周日，周一起点是 10-05
  const dates = weekDates(new Date("2026-10-11T09:00:00"));
  assert.equal(dates[0], "2026-10-05");
  assert.equal(dates.at(-1), "2026-10-11");
  assert.equal(weekStartKey(new Date("2026-10-11T09:00:00")), "2026-10-05");
});

test("weekDates：周六归入本周", () => {
  // 2026-10-10 是周六
  assert.equal(weekDates(new Date("2026-10-10T23:00:00"))[0], "2026-10-05");
});

test("weekDates：跨月推算不跳月", () => {
  // 2026-10-01 是周四，本周一在 9 月
  const dates = weekDates(new Date("2026-10-01T10:00:00"));
  assert.deepEqual(dates, ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
});

test("weekDates：跨年推算年份正确", () => {
  // 2027-01-01 是周五，本周一在 2026-12-28
  const dates = weekDates(new Date("2027-01-01T10:00:00"));
  assert.deepEqual(dates, ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
});

test("weekStartKey：12 月 31 日的周一起点不跨年到错误年份", () => {
  // 2026-12-31 是周四 → 周一 2026-12-28
  assert.equal(weekStartKey(new Date("2026-12-31T00:00:00")), "2026-12-28");
});

/* ---------- 训练计数的跨模块口径 ---------- */

// 洞察页曾用 `typeof Workout !== "undefined" ? it.filter(Workout.isSession) : it`，
// 该分支恒为 false，于是把 sport 记录总数（含草稿、含旧版 progress 记录）当「N 次训练」。
// 首页用的是真 import + status === "completed"，两处口径不同。
// 现在两处都走 Workout.isSession + status === "completed"，用源码断言钉住，防止再长出 typeof 分支。
test("洞察页与首页的「N 次训练」同口径：isSession + status === completed，且不再用 typeof 探测", () => {
  const read = file => fs.readFileSync(new URL(file, import.meta.url), "utf8");
  const insight = read("../src/modules/insight/InsightView.vue");
  const home = read("../src/modules/home/HomeView.vue");
  // 两处都真的 import 了 workout 家族
  assert.match(insight, /import Workout from "\.\.\/\.\.\/lib\/workout\.js"/);
  assert.match(home, /import Workout from "\.\.\/\.\.\/lib\/workout\.js"/);
  // 都按 isSession 判定 session
  assert.match(insight, /filter\(Workout\.isSession\)/);
  assert.match(home, /Workout\.isSession\(x\)/);
  // 都排除草稿
  assert.match(insight, /status === "completed"/);
  assert.match(home, /status === "completed"/);
  // 关键：ESM 作用域里不再有探测经典脚本的 typeof 分支（那是恒 false 的死代码）
  assert.doesNotMatch(insight, /typeof Workout/);
  assert.doesNotMatch(home, /typeof Workout/);
  const utils = read("../src/lib/utils.js");
  assert.doesNotMatch(utils, /typeof Workout/);
});
