// 使用记录（埋点）：只回答「哪一步花时间、用不用、开几次」，纯本地、零网络。
//
// 三条硬约束（项目规矩）：
// 1. 不碰 cat-newsroom-data-v2（业务记录键），埋点走自己的键；
// 2. 不碰 workout_session 模型；
// 3. 不走 syncRecord / outbox，不改同步协议，全程不发请求。
//
// 手感约束：事件先进内存，只在「切到后台 / 页面卸载 / 合并定时器（10 秒）」三处落盘，
// 不在输入路径上写 localStorage；任何异常都吞掉，不弹提示、不挡保存。
//
// 不记录任何文字内容：待办标题、备注、心情词一律只记「有没有」，不记值。

const PREFIX = "cat-newsroom-trace-v1:";         // 按天分桶：cat-newsroom-trace-v1:YYYY-MM-DD
const INDEX_KEY = "cat-newsroom-trace-index-v1"; // 有哪几天，只有日期数组
const ENABLED_KEY = "cat-newsroom-trace-enabled-v1"; // 缺省视为开启
const KEEP_DAYS = 90;          // 保留 90 天，超过删最旧的桶
const MAX_EVENTS_PER_DAY = 8000; // 单桶上限，防止某一天把配额吃满
const FLUSH_DELAY = 10000;     // 合并写入间隔

let buffer = [];      // 待落盘事件
let timer = null;     // 合并定时器
let listening = false; // 关闭/卸载监听只挂一次
let enabledCache = null;

function storage() {
  try {
    const store = globalThis.localStorage;
    return store && typeof store.getItem === "function" && typeof store.setItem === "function" ? store : null;
  } catch (_) {
    return null;
  }
}

function dayKey(timestamp = Date.now()) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readJson(store, key, fallback) {
  try {
    const raw = store.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch (_) {
    return fallback;
  }
}

function readIndex(store) {
  const value = readJson(store, INDEX_KEY, []);
  return Array.isArray(value) ? value.filter(day => typeof day === "string") : [];
}

function writeIndex(store, days) {
  try { store.setItem(INDEX_KEY, JSON.stringify(days)); } catch (_) { /* 索引写不进去就当没这回事 */ }
}

function readDay(store, day) {
  const value = readJson(store, PREFIX + day, []);
  return Array.isArray(value) ? value : [];
}

// 删掉一天的桶（同时从索引里摘掉）
function dropDay(store, day) {
  try { store.removeItem(PREFIX + day); } catch (_) { /* 删不掉留在索引外也无害 */ }
  writeIndex(store, readIndex(store).filter(item => item !== day));
}

// 写一个键；配额满就丢最旧的一天再试一次，仍失败则静默放弃这次写入
function put(store, key, value) {
  try {
    store.setItem(key, value);
    return true;
  } catch (_) {
    const oldest = readIndex(store)[0];
    if (!oldest) return false;
    dropDay(store, oldest);
    try {
      store.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }
}

export function isEnabled() {
  if (enabledCache !== null) return enabledCache;
  const store = storage();
  if (!store) { enabledCache = false; return enabledCache; }
  try {
    enabledCache = store.getItem(ENABLED_KEY) !== "0";
  } catch (_) {
    enabledCache = false;
  }
  return enabledCache;
}

// 关闭只停采集，不删已有数据；关闭时连内存缓冲一起丢掉，避免下次打开被偷偷补写
export function setEnabled(on) {
  const next = on !== false;
  enabledCache = next;
  const store = storage();
  if (store) {
    try { store.setItem(ENABLED_KEY, next ? "1" : "0"); } catch (_) { /* 记不住开关也不阻断 */ }
  }
  if (!next) {
    buffer = [];
    if (timer && typeof clearTimeout === "function") { clearTimeout(timer); timer = null; }
  }
  return next;
}

function schedule() {
  if (timer != null) return; // 10 秒内的事件合并成一次写
  if (typeof setTimeout !== "function") return;
  timer = setTimeout(() => { timer = null; flush(); }, FLUSH_DELAY);
  // Node 里跑测试时别让这个定时器吊着进程（浏览器没有 unref，无影响）
  if (timer && typeof timer.unref === "function") timer.unref();
}

function listen() {
  if (listening) return;
  listening = true;
  try {
    globalThis.document?.addEventListener?.("visibilitychange", () => {
      if (globalThis.document.visibilityState === "hidden") flush();
    });
    globalThis.addEventListener?.("pagehide", () => flush());
  } catch (_) { /* 环境不支持就算了，还有定时器兜底 */ }
}

// 记一条事件。永远同步、永远不抛、永远不发请求。
export function track(name, fields) {
  try {
    if (!name || !isEnabled()) return;
    const event = { t: Date.now(), e: String(name) };
    if (fields && typeof fields === "object") {
      for (const key of Object.keys(fields)) {
        const value = fields[key];
        // 只收标量；字符串统一截断，防止有人顺手把正文带进来
        if (typeof value === "string") event[key] = value.slice(0, 32);
        else if (typeof value === "number" && Number.isFinite(value)) event[key] = value;
        else if (typeof value === "boolean") event[key] = value;
      }
    }
    buffer.push(event);
    listen();
    schedule();
  } catch (_) { /* 埋点永不打断业务 */ }
}

// 把内存缓冲写进当天桶：按事件时间分组，单桶封顶，写完清索引里的过期天
export function flush() {
  try {
    if (timer != null && typeof clearTimeout === "function") { clearTimeout(timer); timer = null; }
    if (!buffer.length) return 0;
    const store = storage();
    if (!store) { buffer = []; return 0; }
    const pending = buffer;
    buffer = [];
    const byDay = new Map();
    for (const event of pending) {
      const day = dayKey(event.t);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(event);
    }
    let written = 0;
    for (const [day, events] of byDay) {
      const existing = readDay(store, day);
      const room = MAX_EVENTS_PER_DAY - existing.length;
      if (room <= 0) continue; // 这天到顶了就不再追加
      const next = existing.concat(events.slice(0, room));
      if (!put(store, PREFIX + day, JSON.stringify(next))) continue;
      const index = readIndex(store);
      if (!index.includes(day)) {
        index.push(day);
        index.sort();
        writeIndex(store, index);
      }
      written += Math.min(events.length, room);
    }
    prune(store);
    return written;
  } catch (_) {
    return 0;
  }
}

// 只留最近 KEEP_DAYS 天（含今天）
function prune(store) {
  try {
    const cutoff = dayKey(Date.now() - (KEEP_DAYS - 1) * 86400000);
    for (const day of readIndex(store)) {
      if (day >= cutoff) continue;
      try { store.removeItem(PREFIX + day); } catch (_) { /* 删不掉下次再说 */ }
      writeIndex(store, readIndex(store).filter(item => item !== day));
    }
  } catch (_) { /* 清理失败不影响主流程 */ }
}

// 清空：桶与索引一起删，开关状态保留
export function clear() {
  try {
    buffer = [];
    if (timer && typeof clearTimeout === "function") { clearTimeout(timer); timer = null; }
    const store = storage();
    if (!store) return 0;
    let removed = 0;
    for (const day of readIndex(store)) {
      try { store.removeItem(PREFIX + day); removed += 1; } catch (_) { /* 单天失败继续删其余 */ }
    }
    try { store.removeItem(INDEX_KEY); } catch (_) { /* 索引删不掉下次 flush 会重建 */ }
    return removed;
  } catch (_) {
    return 0;
  }
}

// 导出用：返回结构，由调用方自己决定怎么落文件（这一层不碰 DOM）
export function exportPayload() {
  const store = storage();
  if (!store) return { exported_at: new Date().toISOString(), days: [] };
  const days = readIndex(store).map(day => ({ day, events: readDay(store, day) }));
  return { exported_at: new Date().toISOString(), days };
}

// 个人配置页显示用：几天、几条、占多大
export function stats() {
  const store = storage();
  if (!store) return { days: 0, events: 0, bytes: 0 };
  let events = 0;
  let bytes = 0;
  for (const day of readIndex(store)) {
    const list = readDay(store, day);
    events += list.length;
    try { bytes += (store.getItem(PREFIX + day) || "").length; } catch (_) { /* 读不到就不算体积 */ }
  }
  return { days: readIndex(store).length, events, bytes };
}

const Trace = { track, flush, isEnabled, setEnabled, clear, exportPayload, stats };
export default Trace;
