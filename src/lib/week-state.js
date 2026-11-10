// 本周状态共享逻辑：洞察页大格子 + 首页趋势卡下方紧凑条，读写 data().__trend
// 存储结构 { week: 本周周一ISO日期, days: [7 个数字] }，week 对不上就当作没记录，跨周自动归零
import { today, weekDates, weekStartKey, trendDays } from "./utils.js";
import { getData, save } from "./store.js";

const DOW = ["一", "二", "三", "四", "五", "六", "日"];

// 读当前 7 天趋势数组（缺省补 null）
export function readTrend() {
  return trendDays(getData().__trend);
}

// 点击循环：1→2→3→4→5→清空
export function nextTrendValue(current) {
  return current == null ? 1 : (current >= 5 ? null : current + 1);
}

// 写某天状态：连同本周标识一起写入本地存储并同步云端
export function writeTrendDay(index, value) {
  const d = getData();
  const trend = readTrend();
  trend[index] = value;
  d.__trend = { week: weekStartKey(), days: trend };
  save();
  if (typeof window.saveMetaCloud === "function") window.saveMetaCloud("__trend", d.__trend);
}

// 生成 7 天格子 HTML；compact=true 用于首页趋势卡下方的紧凑条
export function trendCellsHTML({ compact = false } = {}) {
  const wk = weekDates();
  const t = today();
  const trend = readTrend();
  return wk.map((day, i) => {
    const v = trend[i];
    const valueHTML = v == null ? `<span class="ws-empty">–</span>` : `<span class="ws-val">${v}</span>`;
    const todayCls = day === t ? " is-today" : "";
    return `<button type="button" class="ws-cell${compact ? " ws-compact" : ""}${todayCls}" data-trend-day="${i}" aria-label="周${DOW[i]}状态${v == null ? "未记录" : v + "分"}"><span class="ws-dow">${DOW[i]}</span>${valueHTML}</button>`;
  }).join("");
}

// 仅忽略顶层趋势字段；其余记录/配置仍走完整刷新。日期参与比较以处理跨日。
export function nonTrendSnapshot() {
  const data = getData();
  return JSON.stringify([today(), Object.keys(data).filter(key => key !== "__trend").sort().map(key => [key, data[key]])]);
}

// 保留按钮、网格和日期节点，只更新值与可访问名称。
export function refreshTrendCells(scope) {
  const trend = readTrend(), wk = weekDates(), t = today();
  scope.querySelectorAll("[data-trend-day]").forEach(el => {
    const i = +el.dataset.trendDay, value = trend[i];
    const label = el.querySelector(".ws-val, .ws-empty");
    if (label) {
      label.className = value == null ? "ws-empty" : "ws-val";
      label.textContent = value == null ? "–" : String(value);
    }
    el.setAttribute("aria-label", `周${DOW[i]}状态${value == null ? "未记录" : value + "分"}`);
    el.classList.toggle("is-today", wk[i] === t);
  });
}

// 绑定点击循环并局部刷新格子；onUpdate 回调（index, value）供外部联动
export function wireTrendCells(scope, { onUpdate } = {}) {
  scope.querySelectorAll("[data-trend-day]").forEach(el => el.onclick = () => {
    const i = +el.dataset.trendDay;
    const next = nextTrendValue(readTrend()[i]);
    writeTrendDay(i, next);
    refreshTrendCells(scope);
    if (typeof onUpdate === "function") onUpdate(i, next);
  });
}
