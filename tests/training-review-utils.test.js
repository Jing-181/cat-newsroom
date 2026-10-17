// 训练周复盘的纯逻辑：周期排序、缺字段降级、空态判定
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMetrics, normalizeSections, normalizePayload, normalizeReport, normalizeReports,
  resolveReport, formatPeriod, formatGeneratedAt, resolveViewState, hasPayloadContent,
} from "../src/lib/training-review-utils.js";

const row = (weekStart, extra = {}) => ({
  week_start: weekStart,
  week_end: weekStart,
  payload: {},
  markdown: "",
  generated_at: "2026-10-12T00:30:00+00:00",
  ...extra,
});

test("周期排序：week_start 倒序，最新一期在最前", () => {
  const sorted = normalizeReports([
    row("2026-09-28"), row("2026-10-12"), row("2026-10-05"),
  ]);
  assert.deepEqual(sorted.map(item => item.weekStart), ["2026-10-12", "2026-10-05", "2026-09-28"]);
});

test("周期排序：同一周重复行时按生成时间倒序，保留最新一条", () => {
  const sorted = normalizeReports([
    row("2026-10-05", { generated_at: "2026-10-05T01:00:00Z" }),
    row("2026-10-05", { generated_at: "2026-10-06T01:00:00Z" }),
  ]);
  assert.equal(sorted.length, 2);
  assert.equal(sorted[0].generatedAt, "2026-10-06T01:00:00Z");
});

test("周期排序：没有 week_start 的行无法定位，直接丢掉而不是渲染成空卡片", () => {
  const sorted = normalizeReports([row(""), row(undefined), null, { week_start: "not-a-date" }, row("2026-10-12")]);
  assert.deepEqual(sorted.map(item => item.weekStart), ["2026-10-12"]);
});

test("payload 缺字段降级：整份 payload 缺失时四个字段都落到空值", () => {
  assert.deepEqual(normalizePayload(undefined), { conclusion: "", metrics: [], sections: [], suggestions: [] });
  assert.deepEqual(normalizePayload(null), { conclusion: "", metrics: [], sections: [], suggestions: [] });
  assert.deepEqual(normalizePayload("坏数据"), { conclusion: "", metrics: [], sections: [], suggestions: [] });
});

test("payload 缺字段降级：字段类型不对时不抛错，只当成缺", () => {
  const payload = normalizePayload({ conclusion: 123, metrics: "x", sections: {}, suggestions: null });
  assert.equal(payload.conclusion, "123"); // 数字转字符串，仍可渲染
  assert.deepEqual(payload.metrics, []);
  assert.deepEqual(payload.sections, []);
  assert.deepEqual(payload.suggestions, []);
});

test("metrics：保留已格式化字符串，不重算数字，空单元格保留为空", () => {
  const metrics = normalizeMetrics([
    { label: "训练次数", week: "3", prev: "5", delta: "−2" },
    { label: "总容量", week: "12,480 kg", prev: "11,200 kg", delta: "+1,280 kg" },
    { label: "时长", week: "4h 20m" }, // prev / delta 缺失
    { label: "", week: "", prev: "", delta: "" }, // 整行空，丢掉
    null,
  ]);
  assert.deepEqual(metrics[0], { label: "训练次数", week: "3", prev: "5", delta: "−2" });
  assert.equal(metrics[1].week, "12,480 kg"); // 字符串原样保留，不当数字解析
  assert.deepEqual(metrics[2], { label: "时长", week: "4h 20m", prev: "", delta: "" });
  assert.equal(metrics.length, 3);
});

test("sections：条目里的空串与非字符串被剔除，没有条目的节整节丢掉", () => {
  const sections = normalizeSections([
    { title: "结构与重量", items: ["深蹲 上到 100kg", "", null, 42, "卧推 维持"] },
    { title: "无条目", items: [] },
    { title: "", items: [] },
    { title: "", items: ["只有条目没有标题"] },
    "坏节",
  ]);
  assert.deepEqual(sections[0], { title: "结构与重量", items: ["深蹲 上到 100kg", "42", "卧推 维持"] });
  assert.deepEqual(sections[1], { title: "", items: ["只有条目没有标题"] });
  assert.equal(sections.length, 2);
});

test("normalizeReport：markdown 非字符串按空串处理，week_end 缺失不致命", () => {
  const report = normalizeReport({ week_start: "2026-10-12", markdown: 123, payload: {} });
  assert.equal(report.markdown, "");
  assert.equal(report.weekEnd, "");
});

test("resolveReport：选中的周不存在时回落到最新一期", () => {
  const list = normalizeReports([row("2026-09-28"), row("2026-10-12")]);
  assert.equal(resolveReport(list, "2026-09-28").weekStart, "2026-09-28");
  assert.equal(resolveReport(list, "2026-01-05").weekStart, "2026-10-12");
  assert.equal(resolveReport(list, null).weekStart, "2026-10-12");
  assert.equal(resolveReport([], "2026-10-12"), null);
  assert.equal(resolveReport(null), null);
});

test("formatPeriod：两端齐全才显示区间，只有一端就显示那一端", () => {
  assert.equal(formatPeriod("2026-10-12", "2026-10-18"), "2026-10-12 ~ 2026-10-18");
  assert.equal(formatPeriod("2026-10-12", ""), "2026-10-12");
  assert.equal(formatPeriod("", ""), "");
});

test("formatGeneratedAt：合法时间格式化为本地 YYYY-MM-DD HH:mm，非法值返回空串", () => {
  assert.match(formatGeneratedAt("2026-10-12T00:30:00Z"), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal(formatGeneratedAt(""), "");
  assert.equal(formatGeneratedAt("昨天"), "");
  assert.equal(formatGeneratedAt(null), "");
});

test("空态判定：加载中 / 视图为空 / 请求失败 / 有数据", () => {
  assert.equal(resolveViewState({ loading: true, reports: null }), "loading");
  assert.equal(resolveViewState({ loading: false, reports: [] }), "empty");
  // 请求失败（reports 仍为 null）与视图为空走同一空态，不单列错误状态
  assert.equal(resolveViewState({ loading: false, reports: null }), "empty");
  assert.equal(resolveViewState({ loading: false, reports: [row("2026-10-12")] }), "ready");
  // 已有数据时后台重拉失败不清空页面，仍按 ready 渲染
  assert.equal(resolveViewState({ loading: true, reports: [row("2026-10-12")] }), "ready");
});

test("hasPayloadContent：四个字段全空时卡片要换成降级提示", () => {
  assert.equal(hasPayloadContent(normalizePayload({})), false);
  assert.equal(hasPayloadContent(normalizePayload({ conclusion: "本周稳定" })), true);
  assert.equal(hasPayloadContent(normalizePayload({ metrics: [{ label: "次数", week: "3" }] })), true);
  assert.equal(hasPayloadContent(normalizePayload({ sections: [{ title: "结构", items: ["深蹲 100kg"] }] })), true);
  assert.equal(hasPayloadContent(normalizePayload({ suggestions: ["下周加一次腿部"] })), true);
  assert.equal(hasPayloadContent(null), false);
});
