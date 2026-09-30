// 本周状态共享逻辑：洞察页大格子 + 首页趋势卡下方紧凑条，读写 data().__trend（7 个数字，null=未记录）
import { today, weekDates } from "./utils.js";
import { getData, save } from "./store.js";

const DOW = ["一", "二", "三", "四", "五", "六", "日"];

// 读当前 7 天趋势数组（缺省补 null）
export function readTrend() {
  const value = getData().__trend;
  return Array.isArray(value) && value.length === 7 ? value : [null, null, null, null, null, null, null];
}

// 点击循环：1→2→3→4→5→清空
export function nextTrendValue(current) {
  return current == null ? 1 : (current >= 5 ? null : current + 1);
}

// 写某天状态：更新本地存储并同步云端
export function writeTrendDay(index, value) {
  const d = getData();
  const trend = readTrend();
  trend[index] = value;
  d.__trend = trend;
  save();
  if (typeof window.saveMetaCloud === "function") window.saveMetaCloud("__trend", trend);
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

// 绑定点击循环并局部刷新格子；onUpdate 回调（index, value）供外部联动
export function wireTrendCells(scope, { onUpdate } = {}) {
  scope.querySelectorAll("[data-trend-day]").forEach(el => el.onclick = () => {
    const i = +el.dataset.trendDay;
    const next = nextTrendValue(readTrend()[i]);
    writeTrendDay(i, next);
    const dow = el.querySelector(".ws-dow");
    if (dow) el.innerHTML = `${dow.outerHTML}${next == null ? '<span class="ws-empty">–</span>' : `<span class="ws-val">${next}</span>`}`;
    if (typeof onUpdate === "function") onUpdate(i, next);
  });
}
