// 周报历史补生成：周序列 / 状态标注 / 下拉选项 纯逻辑测试
const test = require("node:test");
const assert = require("node:assert/strict");

const utilsPromise = import("../src/lib/weekly-report-utils.js");
const utils = async () => await utilsPromise;

test("currentWeekStart 返回本地本周一（周二归本周、周日归上周）", async () => {
  const { currentWeekStart } = await utils();
  assert.equal(currentWeekStart(new Date(2026, 8, 29, 12)), "2026-09-28");
  assert.equal(currentWeekStart(new Date(2026, 8, 21, 12)), "2026-09-21");
  assert.equal(currentWeekStart(new Date(2026, 8, 27, 12)), "2026-09-21");
});

test("addDays 返回偏移后的日期字符串", async () => {
  const { addDays } = await utils();
  assert.equal(addDays("2026-09-28", 6), "2026-10-04");
  assert.equal(addDays("2026-09-28", -7), "2026-09-21");
});

test("buildWeekSeries 默认生成最近 12 周并按新到旧排列", async () => {
  const { buildWeekSeries } = await utils();
  const series = buildWeekSeries({ earliestWeekStart: null, currentWeekStart: "2026-09-28" });
  assert.equal(series.length, 12);
  assert.deepEqual(series[0], { weekStart: "2026-09-28", weekEnd: "2026-10-04" });
  assert.deepEqual(series[11], { weekStart: "2026-07-13", weekEnd: "2026-07-19" });
  assert.equal(series[1].weekStart, "2026-09-21");
});

test("buildWeekSeries 以 earliestWeekStart 截断早期范围并处理越界", async () => {
  const { buildWeekSeries } = await utils();
  const series = buildWeekSeries({ earliestWeekStart: "2026-08-10", currentWeekStart: "2026-09-28" });
  assert.equal(series.length, 8);
  assert.equal(series[series.length - 1].weekStart, "2026-08-10");
  const single = buildWeekSeries({ earliestWeekStart: "2026-09-28", currentWeekStart: "2026-09-28" });
  assert.deepEqual(single, [{ weekStart: "2026-09-28", weekEnd: "2026-10-04" }]);
  // earliest 晚于 current 属异常数据，回退最近 12 周
  assert.equal(buildWeekSeries({ earliestWeekStart: "2026-10-05", currentWeekStart: "2026-09-28" }).length, 12);
});

test("buildWeekOptions 按已生成列表标注 ready / missing / error", async () => {
  const { buildWeekSeries, buildWeekOptions } = await utils();
  const series = buildWeekSeries({ earliestWeekStart: "2026-09-14", currentWeekStart: "2026-09-28" });
  const options = buildWeekOptions({
    series,
    readyReports: [{ week_start: "2026-09-28" }, { week_start: "2026-09-14" }],
    errorReports: [{ week_start: "2026-09-21", error: "AI 上游超时" }],
  });
  assert.deepEqual(options.map(o => [o.weekStart, o.state]), [
    ["2026-09-28", "ready"],
    ["2026-09-21", "error"],
    ["2026-09-14", "ready"],
  ]);
  assert.equal(options[0].report.week_start, "2026-09-28");
  // 失败周同样透出元数据，前端可展示上次失败原因
  assert.equal(options[1].report.week_start, "2026-09-21");
  assert.equal(options[1].report.error, "AI 上游超时");
});

test("weekOptionLabel 按状态输出选项文本", async () => {
  const { weekOptionLabel } = await utils();
  assert.equal(weekOptionLabel({ weekStart: "2026-09-28", weekEnd: "2026-10-04", state: "ready" }), "2026-09-28 ~ 2026-10-04");
  assert.equal(weekOptionLabel({ weekStart: "2026-09-21", weekEnd: "2026-09-27", state: "missing" }), "2026-09-21 ~ 2026-09-27（未生成，点击生成）");
  assert.equal(weekOptionLabel({ weekStart: "2026-09-21", weekEnd: "2026-09-27", state: "error" }), "2026-09-21 ~ 2026-09-27（生成失败，点击重试）");
});

test("weekOptionsHTML 渲染选择器与全部选项且状态文本被转义", async () => {
  const { weekOptionsHTML } = await utils();
  const options = [
    { weekStart: "2026-09-28", weekEnd: "2026-10-04", state: "ready" },
    { weekStart: "2026-09-21", weekEnd: "2026-09-27", state: "missing" },
  ];
  const html = weekOptionsHTML(options, "");
  assert.match(html, /<select id="report-history">/);
  assert.match(html, /选择生活报/);
  assert.match(html, /value="2026-09-28"/);
  assert.match(html, /value="2026-09-21"/);
  assert.match(html, /未生成/);
  assert.doesNotMatch(html, /<script/);
  // 选中值回显
  assert.match(weekOptionsHTML(options, "2026-09-21"), /option value="2026-09-21" selected/);
});

test("todayKey 返回本地日期字符串", async () => {
  const { todayKey } = await utils();
  assert.equal(todayKey(new Date(2026, 8, 29, 12)), "2026-09-29");
  assert.equal(todayKey(new Date(2026, 0, 5, 12)), "2026-01-05");
});

test("buildWeekOverview 统计本周各模块数据（无日期待办全量计入）", async () => {
  const { buildWeekOverview } = await utils();
  const data = {
    todo: [{ id: 1, done: true }, { id: 2, done: false }],
    checkin: [{ id: 21, log: { "2026-09-28": true, "2026-09-25": true } }],
    money: [
      { type: "expense", amount: 100, date: "2026-09-28" },
      { type: "income", amount: 500, date: "2026-09-29" },
      { type: "expense", amount: 50, date: "2026-09-20" },
    ],
    note: [{ date: "2026-09-28" }, { date: "2026-08-01" }],
    hot: [{ date: "2026-09-27" }],
    sport: [
      { kind: "workout_session", date: "2026-09-29" },
      { kind: "workout_session", date: "2026-09-15" },
    ],
  };
  const overview = buildWeekOverview(data, "2026-09-21", "2026-09-29");
  assert.equal(overview.todoDone, 1);
  assert.equal(overview.todoTotal, 2);
  assert.equal(overview.checkinCount, 2);
  assert.equal(overview.income, 500);
  assert.equal(overview.expenses, 100);
  assert.equal(overview.workoutCount, 1);
  assert.equal(overview.noteCount, 1);
  assert.equal(overview.hotCount, 1);
  assert.equal(overview.recordCount, 7);
});

test("buildWeekOverview 对空数据返回全零统计", async () => {
  const { buildWeekOverview } = await utils();
  const overview = buildWeekOverview({}, "2026-09-21", "2026-09-29");
  assert.deepEqual(overview, { recordCount: 0, todoDone: 0, todoTotal: 0, checkinCount: 0, income: 0, expenses: 0, workoutCount: 0, noteCount: 0, hotCount: 0 });
});
