// 每日一卡 v2：云端一批文案（7/14 条）顺序循环轮换；每天自动显示当天那一条，绝不自动请求 AI。
// 「换一条」只在池内切换（不消耗 token）；生成入口在首页空态（7 条）与个人配置页（14 条）。
// 拉取成功后结果写入 localStorage（按用户隔离）；进页面先渲染本地缓存，接口返回后再静默刷新，避免等待与整页闪动。
import { icon, esc } from "./icons.js";

let batch = null;        // { item_count, items, status, generated_at, error }
let batchLoading = false;
let batchError = "";
let waitingForSync = false; // 同步服务（Supabase 会话恢复）尚未就绪，暂缓拉取
let batchRequestSeq = 0;
let offset = 0;          // 当天池内偏移（换一条用，跨天重置）
let lastFetchedAt = 0;   // 最近一次成功拉取时间，页面反复 render 时避免重复请求
const REFETCH_MIN_MS = 30 * 1000;          // 同会话内重复拉取的间隔阈值
const CACHE_PREFIX = "cat-daily-copy-batch-v1"; // 本地缓存 key 前缀（按用户 id 隔离）

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 缓存 key：仅正式账号读写本地缓存（按用户隔离，避免跨账号串数据）
function cacheKey() {
  const user = window.getCurrentUser?.();
  return user && !user.is_anonymous ? `${CACHE_PREFIX}:${user.id}` : null;
}

// 读本地缓存批次
function readBatchCache() {
  const key = cacheKey();
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

// 写本地缓存批次
function writeBatchCache(data) {
  const key = cacheKey();
  if (!key || !data) return;
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) { /* 忽略 */ }
}

// 批次标识：接口返回与当前渲染一致时跳过刷新，避免无谓闪动
function batchKey(b) {
  if (!b || !Array.isArray(b.items) || !b.items.length) return "";
  return `${b.generated_at || b.created_at || ""}:${b.items.length}`;
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

// 只返回插槽内部内容（头部 + 主体），外层 .tile 由首页统一包裹，避免重复嵌套
export function dailyCopySlotHTML() {
  const dateText = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
  const body = inner => `${headHTML(dateText)}${inner}`;
  const hasBatch = batch && Array.isArray(batch.items) && batch.items.length;
  if (!hasBatch) {
    if (batchLoading) return body(`<div class="dc-loading">正在加载每日一卡…</div>`);
    if (waitingForSync) return body(`<div class="dc-loading">正在加载每日一卡…</div>`);
    if (!isLoggedIn()) return body(`<div class="dc-body"><div class="dc-empty">登录正式账号后使用每日一卡。</div><button class="dc-btn" id="daily-copy-login">登录账号</button></div>`);
    if (batchError) return body(`<div class="dc-body"><div class="dc-error">${esc(batchError)}</div><button class="dc-btn" id="daily-copy-generate">再试一次</button></div>`);
    return body(`<div class="dc-body"><div class="dc-empty">还没有每日一卡，点一下生成本周 7 条。</div><button class="dc-btn" id="daily-copy-generate">生成本周文案</button></div>`);
  }
  if (batch.status === "generating") return body(`<div class="dc-loading">正在生成一批文案…</div>`);
  const { item, index } = currentItem();
  if (!item) return body(`<div class="dc-body"><div class="dc-empty">这批文案还没有内容。</div><button class="dc-btn" id="daily-copy-generate">重新生成</button></div>`);
  const color = tagColor(item.type);
  const metaText = batch.generated_at ? `生成于 ${new Date(batch.generated_at).toLocaleDateString("zh-CN")}` : "";
  return body(`<div class="dc-body"><span class="dc-tag" style="color:${color};background:color-mix(in srgb, ${color} 14%, transparent)">${esc(item.type || "趣味")}</span>
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

// 初始化：先渲染本地缓存（无需等待接口），再静默拉云端刷新，失败保留缓存内容
export async function initDailyCopy(container = document) {
  if (batchLoading) return;
  const requestSeq = ++batchRequestSeq;
  if (!batch) batch = readBatchCache() || null;   // 缓存先行
  const prevKey = batchKey(batch);
  // 同步服务未就绪（Supabase 会话恢复/匿名登录尚未完成）：先渲染缓存或加载占位，
  // 不把「暂时取不到」当成加载失败；同步就绪后由 main.js 调用 reloadDailyCopy 补拉。
  if (typeof window.fetchDailyCards !== "function" || !window.getCurrentUser?.()) {
    waitingForSync = true;
    refreshDailyCopySlot(container);
    return;
  }
  waitingForSync = false;
  batchLoading = true;
  refreshDailyCopySlot(container);
  // 同会话内已有数据且刚拉取过，跳过重复请求（页面反复 render 时）
  if (prevKey && Date.now() - lastFetchedAt < REFETCH_MIN_MS) {
    batchLoading = false;
    return;
  }
  try {
    const data = await window.fetchDailyCards();
    if (requestSeq !== batchRequestSeq) return;
    if (data) {
      writeBatchCache(data);          // 请求成功后写本地，下次进页面直接命中
      lastFetchedAt = Date.now();
      batch = data;
      batchError = "";
    }
    // data 为 null 表示表里还没有批次，属于空态而非失败：正式账号显示生成按钮，
    // 匿名账号显示登录提示（dailyCopySlotHTML 内按登录状态分别处理），无需置错误。
  } catch (error) {
    if (requestSeq === batchRequestSeq) batchError = error && error.message ? error.message : "加载每日一卡失败";
  } finally {
    if (requestSeq === batchRequestSeq) {
      batchLoading = false;
      // 内容变化（或无旧内容）才刷新插槽，避免闪动
      if (!prevKey || batchKey(batch) !== prevKey) refreshDailyCopySlot(container);
    }
  }
}

// 同步服务就绪后由 main.js 调用：补拉此前因会话未恢复而跳过的每日一卡
export function reloadDailyCopy(container = document) {
  if (waitingForSync || !batch) {
    waitingForSync = false;
    initDailyCopy(container);
  }
}

// 暴露全局钩子，供 main.js 在首次全量同步完成后调用
window.__reloadDailyCopy = reloadDailyCopy;

// 生成一批（首页 7 条 / 个人配置页 14 条），成功后写入缓存并刷新
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
    if (data) writeBatchCache(data);   // 生成结果同样写本地缓存
    batch = data || null;
    lastFetchedAt = Date.now();
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
