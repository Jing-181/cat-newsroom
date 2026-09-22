// 每日一卡：AI 生成的趣味文案/知识/金句卡片，每天自动换新，可点按钮立即换一条（与主站逻辑一致）
import { icon, esc } from "./icons.js";

const STORAGE_KEY = "cat-daily-copy-v1";

let dailyCopy = null;          // { type, title, content }
let dailyCopyMeta = null;
let dailyCopyLoading = false;
let dailyCopyError = "";
let dailyCopyRequestSeq = 0;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && parsed.date === todayKey() ? parsed : null;
  } catch (_) {
    return null;
  }
}

function writeCache() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: todayKey(), item: dailyCopy, meta: dailyCopyMeta }));
  } catch (_) { /* 存储失败不影响本次展示 */ }
}

function tagColor(type) {
  return type === "知识" ? "var(--module-2)" : type === "金句" ? "var(--module-3)" : "var(--accent)";
}

function headHTML(dateText) {
  return `<div class="tile-h"><span class="tic">${icon("quote", 16)}</span><div class="tt"><span class="en">DAILY CARD</span><span class="zh">每日一卡</span></div><span class="r">${dateText}</span></div>`;
}

export function dailyCopySlotHTML() {
  const dateText = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
  if (dailyCopyLoading) {
    return `<div class="tile b12 daily-card" id="daily-copy-slot">${headHTML(dateText)}
      <div class="dc-loading">正在为你写今天的卡片…</div></div>`;
  }
  if (dailyCopyError) {
    return `<div class="tile b12 daily-card" id="daily-copy-slot">${headHTML(dateText)}
      <div class="dc-body"><div class="dc-error">${esc(dailyCopyError)}</div><button class="dc-btn" id="daily-copy-generate">再试一次</button></div></div>`;
  }
  if (!dailyCopy) {
    return `<div class="tile b12 daily-card" id="daily-copy-slot">${headHTML(dateText)}
      <div class="dc-body"><div class="dc-empty">今天还没有卡片，点一下生成。</div><button class="dc-btn" id="daily-copy-generate">生成今日一卡</button></div></div>`;
  }
  const metaText = dailyCopyMeta?.generated_at ? `生成于 ${new Date(dailyCopyMeta.generated_at).toLocaleString()}` : "";
  const color = tagColor(dailyCopy.type);
  return `<div class="tile b12 daily-card" id="daily-copy-slot">${headHTML(`${dateText}${metaText ? ` · ${esc(metaText)}` : ""}`)}
    <div class="dc-body"><span class="dc-tag" style="color:${color};background:color-mix(in srgb, ${color} 14%, transparent)">${esc(dailyCopy.type || "趣味")}</span>
    <div class="dc-content">${esc(dailyCopy.content || "")}</div>
    <button class="dc-btn" id="daily-copy-refresh">换一条</button></div></div>`;
}

export function refreshDailyCopySlot(container = document) {
  const slot = container.querySelector("#daily-copy-slot");
  if (!slot) return;
  slot.innerHTML = dailyCopySlotHTML();
  const refreshButton = slot.querySelector("#daily-copy-refresh, #daily-copy-generate");
  if (refreshButton) refreshButton.onclick = () => maybeGenerateDailyCopy(true);
}

// 初始化：读当天缓存直接展示；没有则自动生成（每天换新，无需手动）
export async function initDailyCopy(container = document) {
  const cached = readCache();
  if (cached) {
    dailyCopy = cached.item;
    dailyCopyMeta = cached.meta;
    refreshDailyCopySlot(container);
    return;
  }
  await maybeGenerateDailyCopy(false, container);
}

export async function maybeGenerateDailyCopy(force = false, container = document) {
  if (dailyCopyLoading) return;
  const requestSeq = ++dailyCopyRequestSeq;
  dailyCopyLoading = true;
  dailyCopyError = "";
  refreshDailyCopySlot(container);
  try {
    if (typeof window.generateDailyCopy !== "function") throw new Error("AI 服务未就绪，请稍后重试");
    const result = await window.generateDailyCopy({});
    if (requestSeq !== dailyCopyRequestSeq) return;
    dailyCopy = result.item || null;
    dailyCopyMeta = result.meta || null;
    if (dailyCopy) writeCache();
  } catch (error) {
    if (requestSeq === dailyCopyRequestSeq) {
      dailyCopyLoading = false;
      dailyCopyError = error && error.message ? error.message : "今日一卡生成失败";
    }
  } finally {
    if (requestSeq === dailyCopyRequestSeq) {
      dailyCopyLoading = false;
      refreshDailyCopySlot(container);
    }
  }
}
