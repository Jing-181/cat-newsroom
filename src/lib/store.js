// 数据仓库：全局 data 绑定（同步层 supabase-sync.js 通过全局词法作用域直接读写）、
// 持久化、同步、跨标签 storage 刷新与订阅通知（Vue 组件按需重渲染）
import { CONFIG } from "./config.js";

function load() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (raw) return JSON.parse(raw);
  } catch (_) { /* 损坏数据回退到种子 */ }
  const d = {};
  CONFIG.modules.forEach(m => { d[m.key] = structuredClone(m.seed || []); });
  return d;
}

// 与主站一致：全局词法变量 data 供 supabase-sync.js 的 getLocalData() 直接读取
window.data = load();
window.store = {
  load() { return load(); },
  save() { localStorage.setItem(CONFIG.storageKey, JSON.stringify(getData())); },
};

export function getData() {
  return window.data;
}

export function replaceData(next) {
  window.data = next;
}

export function save() {
  window.store.save();
}

// 订阅：组件在 onMounted 注册渲染函数，数据变化时收到通知
const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function bump() {
  listeners.forEach(fn => { try { fn(); } catch (_) { /* 单个订阅者出错不影响其余 */ } });
}

// 同步去重：远端回环时跳过（与主站 pendingSyncRecords 一致）
const pendingSyncRecords = new Map();
export function persist(moduleKey, record, { render: shouldRender = true } = {}) {
  save();
  if (moduleKey && record) {
    const key = `${moduleKey}:${record.id}`;
    pendingSyncRecords.set(key, Date.now());
    setTimeout(() => pendingSyncRecords.delete(key), 3000);
    if (typeof window.syncRecord === "function") window.syncRecord({ moduleKey, record });
  }
  if (shouldRender) bump();
}

// 跨标签页同步刷新
window.addEventListener("storage", event => {
  if (event.key !== CONFIG.storageKey || !event.newValue) return;
  try {
    const next = JSON.parse(event.newValue);
    if (!next || typeof next !== "object" || Array.isArray(next)) return;
    replaceData(next);
    bump();
  } catch (_) { /* 忽略异常跨标签值，保持当前视图 */ }
});

// 云端全量/增量同步完成后的本地刷新（供 sync-hooks.js 桥接）
let deferredSyncRender = false;
export function workoutDialogOpen() {
  return !!document.querySelector("#workout-dialog[open]");
}
export function renderAfterWorkoutDialog() {
  if (workoutDialogOpen()) { deferredSyncRender = true; return; }
  deferredSyncRender = false;
  bump();
  if (typeof window.updateAuthUI === "function") window.updateAuthUI();
}
document.addEventListener("close", event => {
  if (event.target?.id === "workout-dialog" && deferredSyncRender) renderAfterWorkoutDialog();
}, true);

export function applyCloud(cloudData) {
  if (typeof window.mergeDataWithCloud === "function") window.mergeDataWithCloud(cloudData);
  renderAfterWorkoutDialog();
}
export function applyRemote(change) {
  const row = change?.newRow || change?.oldRow;
  const key = row?.module_key && row?.data?.id != null ? `${row.module_key}:${row.data.id}` : "";
  if (key && pendingSyncRecords.has(key)) { if (typeof window.updateAuthUI === "function") window.updateAuthUI(); return; }
  renderAfterWorkoutDialog();
}
