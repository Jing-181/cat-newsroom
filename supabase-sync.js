/* ============================================================
   supabase-sync.js — 猫咪生活报同步模块 v3
   增量同步：只推送变更的那条记录，不全量推送
   ============================================================ */

const SUPABASE_CONFIG = {
  url: "https://qqtasmilusrpyxhrqptd.supabase.co",
  anonKey: "sb_publishable_xnVYIwduEPYcIpV0aLSC0Q_Lz8U7nf5",
  reportFunction: "generate-weekly-report",
};

let sb = null;
let syncStatus = "offline";
let currentUser = null;
let onSyncReady = null;
let onRemoteUpdate = null;
let syncChannel = null;
let pushTimer = null;
let retryTimer = null;
let remoteTimer = null;
let pushInFlight = false;
let lastSyncAt = null;

// 增量同步：记录快照 + 脏标记
let recordSnapshot = new Map();   // 上次同步时的记录内容快照
let dirtyRecords = new Set();     // 变更的记录 key: "moduleKey:recordId"
let dirtyMeta = false;            // 元数据是否变更
let pendingDeletes = [];          // 待推送的删除操作

const isoNow = () => new Date().toISOString();
const recordKey = (moduleKey, id) => `${moduleKey}:${id}`;

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function localWeekStartKey(date = new Date()) {
  const value = new Date(date);
  const mondayOffset = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - mondayOffset);
  return localDateKey(value);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function getLocalData() { return typeof data === "undefined" ? null : data; }

// 去掉时间字段后比较内容
function recordBody(record) {
  const copy = { ...record };
  delete copy.updated_at;
  return JSON.stringify(copy);
}

// 初始化快照：记录当前所有记录的内容
function resetRecordSnapshot() {
  const local = getLocalData();
  recordSnapshot = new Map();
  if (!local || typeof CONFIG === "undefined") return;
  CONFIG.modules.forEach(m => (local[m.key] || []).forEach(r => {
    recordSnapshot.set(recordKey(m.key, r.id), recordBody(r));
  }));
}

// 标记单条记录为脏（变更或新增）
function markRecordDirty(moduleKey, recordId) {
  dirtyRecords.add(recordKey(moduleKey, recordId));
  schedulePush();
}

// 标记记录删除
function markRecordDeleted(moduleKey, recordId) {
  const local = getLocalData();
  if (!local) return;
  pendingDeletes.push({ module_key: moduleKey, record_id: recordId, deleted_at: isoNow() });
  // 从快照中移除，避免被当作变更推送
  dirtyRecords.delete(recordKey(moduleKey, recordId));
  schedulePush();
}

// 扫描本地数据，找出与快照不同的记录
function scanDirtyRecords() {
  const local = getLocalData();
  if (!local || typeof CONFIG === "undefined") return;
  CONFIG.modules.forEach(m => {
    (local[m.key] || []).forEach(record => {
      const key = recordKey(m.key, record.id);
      const snapshot = recordSnapshot.get(key);
      const body = recordBody(record);
      if (snapshot !== body) {
        dirtyRecords.add(key);
        if (!record.updated_at) record.updated_at = isoNow();
      }
    });
  });
}

// 云端数据合并到本地：如果云端有该模块数据，整体替换本地（不追加）
function mergeDataWithCloud(cloudData) {
  const local = getLocalData();
  if (!local || !cloudData || typeof CONFIG === "undefined") return { added: 0, conflicts: 0 };
  let added = 0;
  CONFIG.modules.forEach(m => {
    const cloudList = Array.isArray(cloudData[m.key]) ? cloudData[m.key] : [];
    if (cloudList.length > 0) {
      // 云端有数据 → 整体替换本地，避免种子数据叠加
      const localList = Array.isArray(local[m.key]) ? local[m.key] : [];
      const localIds = new Set(localList.map(r => String(r.id)));
      cloudList.forEach(remote => { if (!localIds.has(String(remote.id))) added++; });
      local[m.key] = cloudList;
    }
  });
  // 合并 tombstones
  if (Array.isArray(cloudData.__deleted)) {
    local.__deleted = Array.isArray(local.__deleted) ? local.__deleted : [];
    cloudData.__deleted.forEach(tomb => {
      if (!local.__deleted.some(x => x.module_key === tomb.module_key && String(x.record_id) === String(tomb.record_id))) {
        local.__deleted.push(tomb);
      }
    });
  }
  if (cloudData.__avatar) local.__avatar = cloudData.__avatar;
  if (cloudData.__pomo) local.__pomo = cloudData.__pomo;
  if (cloudData.__trend) local.__trend = cloudData.__trend;
  resetRecordSnapshot();
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(local));
  return { added, conflicts: 0 };
}

// 初始化
async function initSupabase() {
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) { syncStatus = "offline"; updateSyncIndicator(); return false; }
  syncStatus = "connecting"; updateSyncIndicator();
  try {
    if (!window.supabase) await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/dist/umd/supabase.min.js");
    sb = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data: { session } } = await sb.auth.getSession();
    if (session) currentUser = session.user;
    else {
      const { data: anon, error } = await sb.auth.signInAnonymously();
      if (error) throw error;
      currentUser = anon.user;
    }
    syncStatus = "online"; updateSyncIndicator(); setupRealtime(); return true;
  } catch (e) {
    console.error("[sync] 初始化失败:", e); syncStatus = "error"; updateSyncIndicator(); return false;
  }
}

// 从云端加载全部数据
async function loadFromCloud() {
  if (!sb || !currentUser) return null;
  try {
    const { data: records, error } = await sb.from("workbench_records").select("module_key,id,data,updated_at,deleted_at").eq("user_id", currentUser.id);
    if (error) throw error;
    const result = {};
    CONFIG.modules.forEach(m => result[m.key] = []);
    (records || []).forEach(row => {
      if (row.deleted_at) {
        result.__deleted = Array.isArray(result.__deleted) ? result.__deleted : [];
        result.__deleted.push({ module_key: row.module_key, record_id: row.id, deleted_at: row.deleted_at });
        return;
      }
      const value = { ...(row.data || {}) };
      if (!value.updated_at) value.updated_at = row.updated_at;
      if (!result[row.module_key]) result[row.module_key] = [];
      result[row.module_key].push(value);
    });
    const { data: meta, error: metaError } = await sb.from("workbench_meta").select("avatar,pomo_stats,trend_data").eq("user_id", currentUser.id).maybeSingle();
    if (metaError) throw metaError;
    if (meta) {
      if (meta.avatar) result.__avatar = meta.avatar;
      if (meta.pomo_stats) result.__pomo = meta.pomo_stats;
      if (meta.trend_data) result.__trend = meta.trend_data;
    }
    return result;
  } catch (e) {
    console.error("[sync] 加载失败:", e); syncStatus = "error"; updateSyncIndicator(); return null;
  }
}

// 防抖调度：先扫描变更再推送
function schedulePush() {
  if (!sb || !currentUser || syncStatus !== "online") return;
  scanDirtyRecords();
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => flushPush(), 1200);
}

// 增量推送：只推送变更的记录 + 删除操作
async function flushPush(force = false) {
  if (!sb || !currentUser || pushInFlight) return false;
  pushInFlight = true;
  try {
    const local = getLocalData();
    if (!local || typeof CONFIG === "undefined") return false;

    // force=true 时扫描全部记录找出差异（网络恢复后的补发）
    if (force) scanDirtyRecords();

    // 1. 推送删除操作
    if (pendingDeletes.length) {
      const deleteRows = pendingDeletes.map(tomb => ({
        id: tomb.record_id,
        user_id: currentUser.id,
        module_key: tomb.module_key,
        data: {},
        updated_at: tomb.deleted_at,
        deleted_at: tomb.deleted_at,
      }));
      const { error: delErr } = await sb.from("workbench_records").upsert(deleteRows, { onConflict: "user_id,id" });
      if (delErr) throw delErr;
      pendingDeletes = [];
    }

    // 2. 推送变更的记录（增量）
    if (dirtyRecords.size > 0) {
      const rows = [];
      for (const key of dirtyRecords) {
        const [moduleKey, ...idParts] = key.split(":");
        const recordId = idParts.join(":");
        const record = (local[moduleKey] || []).find(r => String(r.id) === recordId);
        if (record) {
          if (!record.updated_at) record.updated_at = isoNow();
          rows.push({
            id: record.id,
            user_id: currentUser.id,
            module_key: moduleKey,
            data: record,
            updated_at: record.updated_at,
            deleted_at: null,
          });
        }
      }
      if (rows.length) {
        const { error: upsertErr } = await sb.from("workbench_records").upsert(rows, { onConflict: "user_id,id" });
        if (upsertErr) throw upsertErr;
      }
    }

    // 3. 推送元数据
    if (dirtyMeta || force) {
      const meta = {};
      if (local.__avatar) meta.avatar = local.__avatar;
      if (local.__pomo) meta.pomo_stats = local.__pomo;
      if (local.__trend) meta.trend_data = local.__trend;
      if (Object.keys(meta).length) {
        const { error: metaErr } = await sb.from("workbench_meta").upsert({ user_id: currentUser.id, ...meta, updated_at: isoNow() }, { onConflict: "user_id" });
        if (metaErr) throw metaErr;
      }
      dirtyMeta = false;
    }

    // 4. 清理脏标记 + 更新快照
    dirtyRecords.clear();
    if (local.__deleted) local.__deleted = [];
    resetRecordSnapshot();
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(local));

    lastSyncAt = isoNow(); syncStatus = "online"; updateSyncIndicator(); return true;
  } catch (e) {
    console.error("[sync] 推送失败:", e); syncStatus = "error"; updateSyncIndicator();
    clearTimeout(retryTimer); retryTimer = setTimeout(() => { syncStatus = "online"; updateSyncIndicator(); flushPush(true); }, 5000);
    return false;
  } finally { pushInFlight = false; }
}

// 注册/登录后推送（只推变更，不强制全量）
async function pushAllLocalToCloud() {
  // 扫描差异后增量推送
  scanDirtyRecords();
  return flushPush(false);
}

// 兼容旧接口
function deleteRecordCloud(moduleKey, recordId) { markRecordDeleted(moduleKey, recordId); }
function saveMetaCloud() { dirtyMeta = true; schedulePush(); }
function saveRecordCloud(moduleKey, recordId) { markRecordDirty(moduleKey, recordId); }

function setupRealtime() {
  if (!sb || !currentUser) return;
  if (syncChannel) sb.removeChannel(syncChannel);
  syncChannel = sb.channel(`workbench_changes_${currentUser.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "workbench_records", filter: `user_id=eq.${currentUser.id}` }, () => queueRemoteRefresh())
    .on("postgres_changes", { event: "*", schema: "public", table: "workbench_meta", filter: `user_id=eq.${currentUser.id}` }, () => queueRemoteRefresh())
    .subscribe();
}

function queueRemoteRefresh() {
  clearTimeout(remoteTimer);
  remoteTimer = setTimeout(async () => {
    const remote = await loadFromCloud();
    if (!remote) return;
    mergeDataWithCloud(remote);
    if (onRemoteUpdate) onRemoteUpdate(remote);
  }, 700);
}

function usernameToEmail(username) { return `${String(username || "").trim()}@cat-newsroom.local`; }

async function signUp(username, password) {
  if (!sb) return { error: new Error("Supabase 未初始化") };
  const { data: authData, error } = await sb.auth.signUp({ email: usernameToEmail(username), password });
  if (!error && authData.user) {
    currentUser = authData.user; syncStatus = "online"; updateSyncIndicator(); setupRealtime();
    // 注册后把所有本地数据推到新账号（force=true 全量扫描）
    recordSnapshot.clear();
    await flushPush(true);
  }
  return { data: authData, error };
}

async function signIn(username, password) {
  if (!sb) return { error: new Error("Supabase 未初始化") };
  const { data: authData, error } = await sb.auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (!error && authData.user) {
    currentUser = authData.user; syncStatus = "online"; updateSyncIndicator(); setupRealtime();
    // 登录后以服务端数据为准，完全替换本地
    const cloudData = await loadFromCloud();
    if (cloudData) { replaceLocalWithCloud(cloudData); if (onSyncReady) onSyncReady(cloudData); }
  }
  return { data: authData, error };
}

// 用云端数据完全替换本地（服务端为准）
function replaceLocalWithCloud(cloudData) {
  const local = getLocalData();
  if (!local || !cloudData || typeof CONFIG === "undefined") return;
  CONFIG.modules.forEach(m => {
    local[m.key] = Array.isArray(cloudData[m.key]) ? cloudData[m.key] : [];
  });
  if (cloudData.__deleted) local.__deleted = cloudData.__deleted;
  else if (local.__deleted) delete local.__deleted;
  if (cloudData.__avatar) local.__avatar = cloudData.__avatar;
  else if (local.__avatar) delete local.__avatar;
  if (cloudData.__pomo) local.__pomo = cloudData.__pomo;
  else if (local.__pomo) delete local.__pomo;
  if (cloudData.__trend) local.__trend = cloudData.__trend;
  else if (local.__trend) delete local.__trend;
  resetRecordSnapshot();
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(local));
}

async function signOut() {
  if (sb) await sb.auth.signOut();
  if (syncChannel) { sb.removeChannel(syncChannel); syncChannel = null; }
  currentUser = null; syncStatus = "offline"; updateSyncIndicator();
}

async function getAccessToken() {
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  return session?.access_token || null;
}

async function generateWeeklyReport(options = {}) {
  if (!currentUser || currentUser.is_anonymous) throw new Error("登录正式账号后才能生成 AI 生活报");
  const token = await getAccessToken();
  if (!token) throw new Error("登录状态已过期，请重新登录");
  const requestBody = { week_start: localWeekStartKey(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...options };
  const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/${SUPABASE_CONFIG.reportFunction}`, {
    method: "POST",
    headers: { apikey: SUPABASE_CONFIG.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "AI 生活报生成失败");
  return payload;
}

function updateSyncIndicator() {
  const el = document.getElementById("sync-indicator");
  if (!el) return;
  const map = { offline: { text: "本地模式", cls: "sync-off" }, connecting: { text: "连接中…", cls: "sync-connecting" }, online: { text: lastSyncAt ? "已同步" : "已连接", cls: "sync-on" }, error: { text: "同步异常", cls: "sync-error" } };
  const state = map[syncStatus] || map.offline;
  el.textContent = state.text; el.className = `sync-indicator ${state.cls}`;
  el.title = lastSyncAt ? `最近同步：${new Date(lastSyncAt).toLocaleString()}` : state.text;
}

function getSyncStatus() { return syncStatus; }
function getCurrentUser() { return currentUser; }
