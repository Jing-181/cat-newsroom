// 每日一卡：本地月度原创短句，不依赖账号、云端批次或网络。
import { icon, esc } from "./icons.js";
import { localDateKey, selectDailyCopy } from "./daily-copy-content.js";

const OFFSET_KEY = ["cat", "daily", "copy", "local", "offset", "v1"].join("-");
let memoryOffset = { date: "", offset: 0 };

function readOffset(date) {
  const key = localDateKey(date);
  if (memoryOffset.date === key) return memoryOffset.offset;
  memoryOffset = { date: key, offset: 0 };
  try {
    const saved = JSON.parse(sessionStorage.getItem(OFFSET_KEY) || "null");
    if (saved?.date === key && Number.isSafeInteger(saved.offset) && saved.offset >= 0) {
      memoryOffset.offset = saved.offset;
    }
  } catch (_) { /* 存储不可用时仍可在内存中换条 */ }
  return memoryOffset.offset;
}

function nextCopy(date) {
  const current = selectDailyCopy(date, readOffset(date));
  memoryOffset = { date: current.dateKey, offset: (readOffset(date) + 1) % current.count };
  try { sessionStorage.setItem(OFFSET_KEY, JSON.stringify(memoryOffset)); } catch (_) { /* 内存兜底 */ }
}

// 保留首页公开渲染接口；外层 .tile 仍由首页包裹。
export function dailyCopySlotHTML(date = new Date()) {
  const current = selectDailyCopy(date, readOffset(date));
  const dateText = date.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
  const meta = current.fallback ? "日常小笺" : `${current.month} · 第 ${current.index + 1}/${current.count} 条`;
  return `<div class="tile-h"><span class="tic">${icon("quote", 16)}</span><div class="tt"><span class="en">DAILY CARD</span><span class="zh">每日一卡</span></div><span class="r">${esc(dateText)}</span></div>
    <div class="dc-body"><span class="dc-tag" style="color:var(--accent);background:color-mix(in srgb, var(--accent) 14%, transparent)">生活小笺</span>
    <div class="dc-content">${esc(current.content)}</div>
    <div class="dc-foot"><span class="dc-meta">${esc(meta)}</span>${current.count > 1 ? '<button class="dc-btn" id="daily-copy-refresh">换一条</button>' : ""}</div></div>`;
}

export function refreshDailyCopySlot(container = document) {
  const slot = container.querySelector("#daily-copy-slot");
  if (!slot) return;
  slot.innerHTML = dailyCopySlotHTML();
  slot.querySelector("#daily-copy-refresh")?.addEventListener("click", () => {
    nextCopy(new Date());
    refreshDailyCopySlot(container);
  });
}

export function initDailyCopy(container = document) {
  refreshDailyCopySlot(container);
}
