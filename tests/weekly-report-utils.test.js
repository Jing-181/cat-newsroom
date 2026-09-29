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
    errorReports: [{ week_start: "2026-09-21" }],
  });
  assert.deepEqual(options.map(o => [o.weekStart, o.state]), [
    ["2026-09-28", "ready"],
    ["2026-09-21", "error"],
    ["2026-09-14", "ready"],
  ]);
  assert.equal(options[0].report.week_start, "2026-09-28");
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
