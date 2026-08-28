/* ============================================================
   supabase-sync.js - 猫咪生活报同步与 AI 接口
   说明：浏览器只保存 Supabase anon key，AI key 只在 Edge Function。
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
let pendingPush = false;
let pushInFlight = false;
let lastSyncAt = null;
let recordSnapshot = new Map();

const isoNow = () => new Date().toISOString();
const recordKey = (moduleKey, id) => `${moduleKey}:${id}`;

// 使用浏览器本地日期，避免东八区凌晨被 UTC 日期带偏。
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

// 去掉时间字段后比较内容，避免同步自身触发无限更新。
function recordBody(record) {
  const copy = { ...record };
  delete copy.updated_at;
  return JSON.stringify(copy);
}

function resetRecordSnapshot() {
  const local = getLocalData();
  recordSnapshot = new Map();
  if (!local || typeof CONFIG === "undefined") return;
  CONFIG.modules.forEach(m => (local[m.key] || []).forEach(r => {
    recordSnapshot.set(recordKey(m.key, r.id), recordBody(r));
  }));
}

// 在本地保存前给新增或已修改记录打时间戳。
function touchDataForSync() {
  const local = getLocalData();
  if (!local || typeof CONFIG === "undefined") return;
  CONFIG.modules.forEach(m => (local[m.key] || []).forEach(record => {
    const key = recordKey(m.key, record.id);
    const body = recordBody(record);
    if (!record.updated_at || !recordSnapshot.has(key) || recordSnapshot.get(key) !== body) record.updated_at = isoNow();
    recordSnapshot.set(key, recordBody(record));
  }));
}

function addDeletedTombstone(moduleKey, id) {
  const local = getLocalData();
  if (!local) return;
  local.__deleted = Array.isArray(local.__deleted) ? local.__deleted : [];
  local.__deleted = local.__deleted.filter(x => !(x.module_key === moduleKey && String(x.record_id) === String(id)));
  local.__deleted.push({ module_key: moduleKey, record_id: id, deleted_at: isoNow() });
}

// 将本地与云端按更新时间合并，冲突时保留副本。
function mergeDataWithCloud(cloudData) {
  const local = getLocalData();
  if (!local || !cloudData || typeof CONFIG === "undefined") return { added: 0, conflicts: 0 };
  let added = 0, conflicts = 0;
  const tombstones = Array.isArray(local.__deleted) ? local.__deleted : [];
  const remoteTombstones = Array.isArray(cloudData.__deleted) ? cloudData.__deleted : [];
  CONFIG.modules.forEach(m => {
    const localList = Array.isArray(local[m.key]) ? local[m.key] : [];
    const cloudList = Array.isArray(cloudData[m.key]) ? cloudData[m.key] : [];
    const byId = new Map(localList.map(r => [String(r.id), r]));
    // 云端软删除时间更新时，清理本地旧记录并保留 tombstone。
    remoteTombstones.filter(t => t.module_key === m.key).forEach(tomb => {
      const id = String(tomb.record_id);
      const localRecord = byId.get(id);
      const deletedAt = new Date(tomb.deleted_at || 0).getTime();
      if (localRecord && deletedAt >= new Date(localRecord.updated_at || 0).getTime()) {
        const index = localList.indexOf(localRecord);
        if (index >= 0) localList.splice(index, 1);
        byId.delete(id);
      }
      if (!tombstones.some(x => x.module_key === m.key && String(x.record_id) === id && x.deleted_at === tomb.deleted_at)) tombstones.push(tomb);
    });
    cloudList.forEach(remote => {
      const id = String(remote.id);
      const tomb = tombstones.find(t => t.module_key === m.key && String(t.record_id) === id);
      if (tomb && new Date(tomb.deleted_at) >= new Date(remote.updated_at || 0)) return;
      const localRecord = byId.get(id);
      if (!localRecord) {
        localList.push(remote); byId.set(id, remote); added++; return;
      }
      const localTime = new Date(localRecord.updated_at || 0).getTime();
      const remoteTime = new Date(remote.updated_at || 0).getTime();
      if (remoteTime > localTime) Object.assign(localRecord, remote);
      else if (remoteTime === localTime && recordBody(localRecord) !== recordBody(remote)) {
        localList.push({ ...remote, id: `${remote.id}-conflict-${Date.now()}`, conflict_of: remote.id, updated_at: isoNow() });
        conflicts++;
      }
    });
    local[m.key] = localList;
  });
  if (cloudData.__avatar) local.__avatar = cloudData.__avatar;
  if (cloudData.__pomo) local.__pomo = cloudData.__pomo;
  if (cloudData.__trend) local.__trend = cloudData.__trend;
  resetRecordSnapshot();
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(local));
  return { added, conflicts };
}

// 初始化 Supabase 并恢复同站点登录会话。
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

// 从云端读取记录和元数据。
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

function schedulePush() {
  if (!sb || !currentUser || syncStatus !== "online") return;
  pendingPush = true; clearTimeout(pushTimer); pushTimer = setTimeout(() => flushPush(), 1500);
}

// 全量上传当前快照，并删除本地明确标记的云端记录。
async function flushPush(force = false) {
  if (!sb || !currentUser || pushInFlight || (!force && !pendingPush)) return false;
  pushInFlight = true; pendingPush = false;
  try {
    const local = getLocalData(); touchDataForSync();
    const rows = [];
    CONFIG.modules.forEach(m => (local?.[m.key] || []).forEach(record => rows.push({ id: record.id, user_id: currentUser.id, module_key: m.key, data: record, updated_at: record.updated_at || isoNow(), deleted_at: null })));
    const tombstones = Array.isArray(local?.__deleted) ? local.__deleted : [];
    // tombstone 作为软删除行上传，避免离线设备重新上传旧记录。
    const deletedRows = tombstones.map(tomb => ({
      id: tomb.record_id,
      user_id: currentUser.id,
      module_key: tomb.module_key,
      data: {},
      updated_at: tomb.deleted_at || isoNow(),
      deleted_at: tomb.deleted_at || isoNow(),
    }));
    if (deletedRows.length) {
      const { error } = await sb.from("workbench_records").upsert(deletedRows, { onConflict: "user_id,id" });
      if (error) throw error;
    }
    if (rows.length) {
      const { error } = await sb.from("workbench_records").upsert(rows, { onConflict: "user_id,id" });
      if (error) throw error;
    }
    const meta = {};
    if (local?.__avatar) meta.avatar = local.__avatar;
    if (local?.__pomo) meta.pomo_stats = local.__pomo;
    if (local?.__trend) meta.trend_data = local.__trend;
    if (Object.keys(meta).length) {
      const { error } = await sb.from("workbench_meta").upsert({ user_id: currentUser.id, ...meta, updated_at: isoNow() }, { onConflict: "user_id" });
      if (error) throw error;
    }
    if (local) { local.__deleted = []; localStorage.setItem(CONFIG.storageKey, JSON.stringify(local)); }
    lastSyncAt = isoNow(); syncStatus = "online"; updateSyncIndicator(); return true;
  } catch (e) {
    console.error("[sync] 推送失败:", e); syncStatus = "error"; pendingPush = true; updateSyncIndicator();
    clearTimeout(retryTimer); retryTimer = setTimeout(() => { syncStatus = "online"; updateSyncIndicator(); flushPush(true); }, 5000);
    return false;
  } finally { pushInFlight = false; }
}

// 登录、注册或手动同步时强制执行上传。
async function pushAllLocalToCloud() { clearTimeout(pushTimer); pendingPush = true; return flushPush(true); }
function deleteRecordCloud() { schedulePush(); }
function saveMetaCloud() { schedulePush(); }
function saveRecordCloud() { schedulePush(); }

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
  if (!error && authData.user) { currentUser = authData.user; syncStatus = "online"; updateSyncIndicator(); setupRealtime(); await pushAllLocalToCloud(); }
  return { data: authData, error };
}

async function signIn(username, password) {
  if (!sb) return { error: new Error("Supabase 未初始化") };
  const { data: authData, error } = await sb.auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (!error && authData.user) {
    currentUser = authData.user; syncStatus = "online"; updateSyncIndicator(); setupRealtime();
    const cloudData = await loadFromCloud();
    if (cloudData) { mergeDataWithCloud(cloudData); if (onSyncReady) onSyncReady(cloudData); }
    await pushAllLocalToCloud();
  }
  return { data: authData, error };
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

// 调用 Edge Function 生成本周 AI 生活报。
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
