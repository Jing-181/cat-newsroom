// 每日一卡 v2：云端一批文案（7/14 条）顺序循环轮换；每天自动显示当天那一条，绝不自动请求 AI。
// 「换一条」只在池内切换（不消耗 token）；生成入口在首页空态（7 条）与个人配置页（14 条）。
import { icon, esc } from "./icons.js";

let batch = null;        // { item_count, items, status, generated_at, error }
let batchLoading = false;
let batchError = "";
let batchRequestSeq = 0;
let offset = 0;          // 当天池内偏移（换一条用，跨天重置）

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 读/写当天偏移（sessionStorage，跨天自动归零）
function readOffset() {
  try {
    const raw = sessionStorage.getItem("cat-daily-copy-offset-v1");
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && parsed.date === todayKey() ? parsed.offset || 0 : 0;
  } catch (_) {
    return 0;
  }
}

function writeOffset() {
  try {
    sessionStorage.setItem("cat-daily-copy-offset-v1", JSON.stringify({ date: todayKey(), offset }));
  } catch (_) { /* 忽略 */ }
}

// 顺序循环：自批创建日起的天数 % 条数（多设备同一天显示同一条）
function dayIndex() {
  if (!batch?.generated_at && !batch?.created_at) return 0;
  const base = new Date(batch.generated_at || batch.created_at);
  const now = new Date();
  const startDay = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((nowDay - startDay) / 86400000);
}

function currentItem() {
  const items = Array.isArray(batch?.items) ? batch.items : [];
  if (!items.length) return null;
  offset = readOffset();
  const index = ((dayIndex() + offset) % items.length + items.length) % items.length;
  return { item: items[index], index };
}

function tagColor(type) {
  return type === "知识" ? "var(--module-2)" : type === "金句" ? "var(--module-3)" : "var(--accent)";
}

function headHTML(dateText) {
  return `<div class="tile-h"><span class="tic">${icon("quote", 16)}</span><div class="tt"><span class="en">DAILY CARD</span><span class="zh">每日一卡</span></div><span class="r">${dateText}</span></div>`;
}

function isLoggedIn() {
  const user = window.getCurrentUser?.();
  return !!user && !user.is_anonymous;
}

export function dailyCopySlotHTML() {
  const dateText = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
  const frame = inner => `<div class="tile b12 daily-card" id="daily-copy-slot">${headHTML(dateText)}${inner}</div>`;
  if (batchLoading) return frame(`<div class="dc-loading">正在加载每日一卡…</div>`);
  if (!isLoggedIn()) return frame(`<div class="dc-body"><div class="dc-empty">登录正式账号后使用每日一卡。</div><button class="dc-btn" id="daily-copy-login">登录账号</button></div>`);
  if (batchError) return frame(`<div class="dc-body"><div class="dc-error">${esc(batchError)}</div><button class="dc-btn" id="daily-copy-generate">再试一次</button></div>`);
  if (!batch || batch.status === "error" || !Array.isArray(batch.items) || !batch.items.length) {
    return frame(`<div class="dc-body"><div class="dc-empty">还没有每日一卡，点一下生成本周 7 条。</div><button class="dc-btn" id="daily-copy-generate">生成本周文案</button></div>`);
  }
  if (batch.status === "generating") return frame(`<div class="dc-loading">正在生成一批文案…</div>`);
  const { item, index } = currentItem();
  if (!item) return frame(`<div class="dc-body"><div class="dc-empty">这批文案还没有内容。</div><button class="dc-btn" id="daily-copy-generate">重新生成</button></div>`);
  const color = tagColor(item.type);
  const metaText = batch.generated_at ? `生成于 ${new Date(batch.generated_at).toLocaleDateString("zh-CN")}` : "";
  return frame(`<div class="dc-body"><span class="dc-tag" style="color:${color};background:color-mix(in srgb, ${color} 14%, transparent)">${esc(item.type || "趣味")}</span>
    <div class="dc-content">${esc(item.content || "")}</div>
    <div class="dc-foot"><span class="dc-meta">${esc(metaText)} · 第 ${index + 1}/${batch.items.length} 条</span><button class="dc-btn" id="daily-copy-refresh">换一条</button></div></div>`);
}

export function refreshDailyCopySlot(container = document) {
  const slot = container.querySelector("#daily-copy-slot");
  if (!slot) return;
  slot.innerHTML = dailyCopySlotHTML();
  const scope = slot;
  scope.querySelector("#daily-copy-refresh")?.addEventListener("click", () => {
    offset = (readOffset() + 1) % (Array.isArray(batch?.items) ? batch.items.length : 1);
    writeOffset();
    refreshDailyCopySlot(container);
  });
  scope.querySelector("#daily-copy-generate")?.addEventListener("click", () => generateDailyCopyBatch(7, container));
  scope.querySelector("#daily-copy-login")?.addEventListener("click", () => window.openAuthModalRef?.current?.("login") || (window.openAuthModal && window.openAuthModal("login")));
}

// 初始化：只读云端批次（不调 AI），失败静默
export async function initDailyCopy(container = document) {
  if (batchLoading) return;
  const requestSeq = ++batchRequestSeq;
  batchLoading = true;
  refreshDailyCopySlot(container);
  try {
    if (typeof window.fetchDailyCards !== "function") throw new Error("同步服务未就绪");
    const data = await window.fetchDailyCards();
    if (requestSeq !== batchRequestSeq) return;
    batch = data || null;
    batchError = "";
  } catch (error) {
    if (requestSeq === batchRequestSeq) batchError = error && error.message ? error.message : "加载每日一卡失败";
  } finally {
    if (requestSeq === batchRequestSeq) {
      batchLoading = false;
      refreshDailyCopySlot(container);
    }
  }
}

// 生成一批（首页 7 条 / 个人配置页 14 条），成功后刷新
export async function generateDailyCopyBatch(count = 7, container = document) {
  const requestSeq = ++batchRequestSeq;
  batchLoading = true;
  batchError = "";
  refreshDailyCopySlot(container);
  try {
    if (!isLoggedIn()) throw new Error("登录正式账号后才能生成每日一卡");
    if (typeof window.generateDailyCopy !== "function") throw new Error("AI 服务未就绪");
    await window.generateDailyCopy({ count });
    if (requestSeq !== batchRequestSeq) return;
    const data = await window.fetchDailyCards();
    if (requestSeq !== batchRequestSeq) return;
    batch = data || null;
    offset = 0;
    writeOffset();
  } catch (error) {
    if (requestSeq === batchRequestSeq) batchError = error && error.message ? error.message : "生成失败，请稍后重试";
  } finally {
    if (requestSeq === batchRequestSeq) {
      batchLoading = false;
      refreshDailyCopySlot(container);
    }
  }
}

// 个人配置页使用：返回当前批次信息（条数、生成时间、状态）
export function getDailyBatchInfo() {
  if (batchLoading) return { loading: true };
  if (!batch) return { loading: false, exists: false };
  return {
    loading: false,
    exists: true,
    count: Array.isArray(batch.items) ? batch.items.length : 0,
    generatedAt: batch.generated_at || null,
    status: batch.status,
    error: batch.error || null,
  };
}
