// 周报历史补生成：周序列、状态标注与下拉选项的纯逻辑（不依赖浏览器 API，可单测）
import { esc } from "./icons.js";

// 本地日期转 YYYY-MM-DD（避免 toISOString 的 UTC 偏移）
function localDateKey(date) {
  const value = new Date(date);
  const pad = n => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

// 当前日期所在周的周一（本地时区）
export function currentWeekStart(date = new Date()) {
  const value = new Date(date);
  value.setDate(value.getDate() - (value.getDay() + 6) % 7);
  return localDateKey(value);
}

// 日期字符串按本地偏移 N 天
export function addDays(iso, days) {
  const value = new Date(`${iso}T12:00:00`);
  value.setDate(value.getDate() + days);
  return localDateKey(value);
}

function weekEndOf(weekStart) {
  return addDays(weekStart, 6);
}

// 生成可选周序列（降序）：从 currentWeekStart 往前最多 maxWeeks 周，earliestWeekStart 更晚时从 earliest 起算
export function buildWeekSeries({ earliestWeekStart = null, currentWeekStart: current, maxWeeks = 12 }) {
  const earliest = earliestWeekStart && earliestWeekStart <= current ? earliestWeekStart : null;
  const oldest = earliest && earliest > addDays(current, -(maxWeeks - 1) * 7) ? earliest : addDays(current, -(maxWeeks - 1) * 7);
  const series = [];
  for (let weekStart = oldest; weekStart <= current; weekStart = addDays(weekStart, 7)) {
    series.push({ weekStart, weekEnd: weekEndOf(weekStart) });
  }
  return series.reverse();
}

// 合并服务端状态：已生成(ready) / 生成失败(error) / 未生成(missing)
export function buildWeekOptions({ series, readyReports = [], errorReports = [] }) {
  const readyMap = new Map(readyReports.map(report => [report.week_start, report]));
  const errorSet = new Set(errorReports.map(report => report.week_start));
  return series.map(item => {
    const state = readyMap.has(item.weekStart) ? "ready" : errorSet.has(item.weekStart) ? "error" : "missing";
    return { ...item, state, report: readyMap.get(item.weekStart) || null };
  });
}

// 选项文本：已生成周只显示范围，缺失/失败周带操作提示
export function weekOptionLabel({ weekStart, weekEnd, state }) {
  const base = `${weekStart} ~ ${weekEnd}`;
  if (state === "missing") return `${base}（未生成，点击生成）`;
  if (state === "error") return `${base}（生成失败，点击重试）`;
  return base;
}

// 下拉框 HTML：id 保持 report-history，选中值回显
export function weekOptionsHTML(options, selectedWeek = "") {
  const optionsHTML = options.map(option => `<option value="${esc(option.weekStart)}"${option.weekStart === selectedWeek ? " selected" : ""}>${esc(weekOptionLabel(option))}</option>`).join("");
  return `<div class="report-history"><label for="report-history">选择生活报</label><select id="report-history"><option value="">选择周</option>${optionsHTML}</select></div>`;
}
