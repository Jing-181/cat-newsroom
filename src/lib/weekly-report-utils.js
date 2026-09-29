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

// 本地日期字符串（YYYY-MM-DD）
export function todayKey(date = new Date()) {
  return localDateKey(date);
}

// 本周概览：未生成生活报时展示数据预览，统计口径与云端快照基本一致
// 待办无日期概念按全量计入；其余模块按 date 落在 [start, end] 过滤；打卡按 log 键日期计数
export function buildWeekOverview(data = {}, start, end) {
  const inRange = date => !!date && date >= start && date <= end;
  const rows = key => Array.isArray(data[key]) ? data[key] : [];
  const todo = rows("todo");
  const money = rows("money").filter(row => inRange(row.date));
  const notes = rows("note").filter(row => inRange(row.date));
  const hots = rows("hot").filter(row => inRange(row.date));
  const workouts = rows("sport").filter(row => inRange(row.date) && row.kind === "workout_session");
  let checkinCount = 0;
  rows("checkin").forEach(item => {
    const log = item.log || {};
    Object.keys(log).forEach(date => { if (inRange(date)) checkinCount += 1; });
  });
  const income = money.filter(row => row.type === "income").reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const expenses = money.filter(row => row.type === "expense").reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return {
    recordCount: todo.length + money.length + notes.length + hots.length + workouts.length,
    todoDone: todo.filter(row => row.done).length,
    todoTotal: todo.length,
    checkinCount,
    income,
    expenses,
    workoutCount: workouts.length,
    noteCount: notes.length,
    hotCount: hots.length,
  };
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

// 合并服务端状态：已生成(ready) / 生成失败(error) / 生成中(generating) / 未生成(missing)；失败与生成中周透出元数据
export function buildWeekOptions({ series, readyReports = [], errorReports = [], generatingReports = [] }) {
  const readyMap = new Map(readyReports.map(report => [report.week_start, report]));
  const errorMap = new Map(errorReports.map(report => [report.week_start, report]));
  const generatingMap = new Map(generatingReports.map(report => [report.week_start, report]));
  return series.map(item => {
    const ready = readyMap.get(item.weekStart);
    const failed = errorMap.get(item.weekStart);
    const generating = generatingMap.get(item.weekStart);
    const state = ready ? "ready" : failed ? "error" : generating ? "generating" : "missing";
    return { ...item, state, report: ready || failed || generating || null };
  });
}

// 选项文本：已生成周只显示范围，缺失/失败/生成中周带操作提示
export function weekOptionLabel({ weekStart, weekEnd, state }) {
  const base = `${weekStart} ~ ${weekEnd}`;
  if (state === "missing") return `${base}（未生成，点击生成）`;
  if (state === "error") return `${base}（生成失败，点击重试）`;
  if (state === "generating") return `${base}（生成中…）`;
  return base;
}

// 周报生成时的数据快照统计文案（展示在卡片 meta 区，便于核对生成依据）
export function buildSnapshotStatText(summary) {
  if (!summary) return "";
  const parts = [`基于 ${summary.record_count || 0} 条记录`];
  if (summary.workout_count) parts.push(`运动 ${summary.workout_count} 次`);
  return parts.join(" · ");
}

// 下拉框 HTML：id 保持 report-history，选中值回显
export function weekOptionsHTML(options, selectedWeek = "") {
  const optionsHTML = options.map(option => `<option value="${esc(option.weekStart)}"${option.weekStart === selectedWeek ? " selected" : ""}>${esc(weekOptionLabel(option))}</option>`).join("");
  return `<div class="report-history"><label for="report-history">选择生活报</label><select id="report-history"><option value="">选择周</option>${optionsHTML}</select></div>`;
}
