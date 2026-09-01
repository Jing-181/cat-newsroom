/* 猫咪生活报同步模块：初始化/手动全量，其余操作均为单项原子同步。 */
const SUPABASE_CONFIG = {
  url: "https://qqtasmilusrpyxhrqptd.supabase.co",
  anonKey: "sb_publishable_xnVYIwduEPYcIpV0aLSC0Q_Lz8U7nf5",
  reportFunction: "generate-weekly-report",
  mediaBucket: "card-images",
};

const SYNC_OUTBOX_KEY = "cat-newsroom-sync-outbox-v1";
const META_FIELDS = { __avatar: "avatar", __pomo: "pomo_stats", __trend: "trend_data" };
let sb = null;
let syncStatus = "offline";
let currentUser = null;
let onSyncReady = null;
let onRemoteUpdate = null;
let syncChannel = null;
let processingOutbox = false;
let deferOutboxProcessing = false;
let retryTimer = null;
let lastSyncAt = null;
let pageInitSyncDone = false;

const isoNow = () => new Date().toISOString();
const operationId = () => `op-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const getLocalData = () => typeof data === "undefined" ? null : data;

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localWeekStartKey(date = new Date()) {
  const value = new Date(date);
  value.setDate(value.getDate() - (value.getDay() + 6) % 7);
  return localDateKey(value);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function readOutbox() {
  try { return JSON.parse(localStorage.getItem(SYNC_OUTBOX_KEY)) || []; } catch (_) { return []; }
}

function writeOutbox(outbox) {
  localStorage.setItem(SYNC_OUTBOX_KEY, JSON.stringify(outbox));
}

function queueOperation(operation) {
  const next = SyncCore.enqueue(readOutbox(), { operationId: operation.operationId || operationId(), createdAt: isoNow(), ...operation });
  writeOutbox(next);
  if (syncStatus === "online" && !deferOutboxProcessing) processOutbox();
  return next.at(-1);
}

async function initSupabase() {
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
    syncStatus = "offline"; updateSyncIndicator(); return false;
  }
  syncStatus = "connecting"; updateSyncIndicator();
  try {
    if (!window.supabase) await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/dist/umd/supabase.min.js");
    sb = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data: { session } } = await sb.auth.getSession();
    if (session) currentUser = session.user;
    else {
      const { data: anonymous, error } = await sb.auth.signInAnonymously();
      if (error) throw error;
      currentUser = anonymous.user;
    }
    syncStatus = "online";
    setupRealtime();
    updateSyncIndicator();
    return true;
  } catch (error) {
    console.error("[sync] 初始化失败:", error);
    syncStatus = "error"; updateSyncIndicator(); return false;
  }
}

async function fetchAllCloudData() {
  if (!sb || !currentUser) return null;
  const { data: records, error } = await sb.from("workbench_records")
    .select("module_key,id,data,updated_at,deleted_at").eq("user_id", currentUser.id);
  if (error) throw error;
  const result = {};
  CONFIG.modules.forEach(module => { result[module.key] = []; });
  (records || []).forEach(row => {
    if (row.deleted_at) {
      (result.__deleted ||= []).push({ module_key: row.module_key, record_id: row.id, deleted_at: row.deleted_at });
      return;
    }
    const value = { ...(row.data || {}), id: row.data?.id ?? row.id, updated_at: row.data?.updated_at || row.updated_at };
    (result[row.module_key] ||= []).push(value);
  });
  const { data: meta, error: metaError } = await sb.from("workbench_meta")
    .select("avatar,pomo_stats,trend_data").eq("user_id", currentUser.id).maybeSingle();
  if (metaError) throw metaError;
  if (meta) {
    result.__avatar = meta.avatar || "";
    result.__pomo = meta.pomo_stats || { count: 0, min: 0 };
    result.__trend = meta.trend_data || [];
  }
  return result;
}

function mergeDataWithCloud(cloudData) {
  const local = getLocalData();
  if (!local || !cloudData || typeof CONFIG === "undefined") return { added: 0, conflicts: 0 };
  const before = CONFIG.modules.reduce((sum, module) => sum + (local[module.key] || []).length, 0);
  SyncCore.mergeFull(local, cloudData, CONFIG.modules.map(module => module.key));
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(local));
  const after = CONFIG.modules.reduce((sum, module) => sum + (local[module.key] || []).length, 0);
  return { added: Math.max(0, after - before), conflicts: 0 };
}

function replaceLocalWithCloud(cloudData) {
  const local = getLocalData();
  if (!local || !cloudData || typeof CONFIG === "undefined") return;
  CONFIG.modules.forEach(module => { local[module.key] = Array.isArray(cloudData[module.key]) ? cloudData[module.key] : []; });
  (cloudData.__deleted || []).forEach(tombstone => {
    local[tombstone.module_key] = (local[tombstone.module_key] || []).filter(item => String(item.id) !== String(tombstone.record_id));
  });
  ["__avatar", "__pomo", "__trend"].forEach(key => {
    if (Object.prototype.hasOwnProperty.call(cloudData, key)) local[key] = cloudData[key];
    else delete local[key];
  });
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(local));
}

async function runFullSync(options = {}) {
  const reason = options.reason;
  if (!new Set(["page_init", "manual"]).has(reason)) throw new Error("不允许的全量同步原因");
  if (reason === "page_init" && pageInitSyncDone) return null;
  if (!sb || !currentUser) return null;
  if (reason === "page_init") pageInitSyncDone = true;
  try {
    await processOutbox();
    const cloudData = await fetchAllCloudData();
    if (!cloudData) return null;
    if (currentUser.is_anonymous) mergeDataWithCloud(cloudData);
    else replaceLocalWithCloud(cloudData);
    lastSyncAt = isoNow(); syncStatus = "online"; updateSyncIndicator();
    if (onSyncReady) onSyncReady(cloudData);
    return cloudData;
  } catch (error) {
    console.error("[sync] 全量同步失败:", error);
    syncStatus = "error"; updateSyncIndicator(); return null;
  }
}

async function executeOperation(operation) {
  if (operation.type === "record") {
    const record = operation.record;
    const row = { id: String(record.id), user_id: currentUser.id, module_key: operation.moduleKey, data: record, updated_at: record.updated_at || isoNow(), deleted_at: null };
    const { error } = await sb.from("workbench_records").upsert(row, { onConflict: "user_id,id" });
    if (error) throw error;
    return;
  }
  if (operation.type === "delete") {
    const row = { id: String(operation.recordId), user_id: currentUser.id, module_key: operation.moduleKey, data: {}, updated_at: operation.deletedAt, deleted_at: operation.deletedAt };
    const { error } = await sb.from("workbench_records").upsert(row, { onConflict: "user_id,id" });
    if (error) throw error;
    return;
  }
  if (operation.type === "meta") {
    const column = META_FIELDS[operation.field];
    if (!column) throw new Error(`未知元数据字段: ${operation.field}`);
    const { error } = await sb.from("workbench_meta").upsert({ user_id: currentUser.id, [column]: operation.value, updated_at: isoNow() }, { onConflict: "user_id" });
    if (error) throw error;
  }
}

async function processOutbox() {
  if (!sb || !currentUser || syncStatus !== "online" || processingOutbox) return false;
  processingOutbox = true;
  try {
    let outbox = readOutbox();
    while (outbox.length) {
      const current = outbox[0];
      await executeOperation(current);
      outbox = readOutbox().filter(item => item.operationId !== current.operationId);
      writeOutbox(outbox);
    }
    lastSyncAt = isoNow(); updateSyncIndicator(); return true;
  } catch (error) {
    console.error("[sync] 原子操作失败:", error);
    syncStatus = "error"; updateSyncIndicator();
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { syncStatus = "online"; updateSyncIndicator(); processOutbox(); }, 5000);
    return false;
  } finally {
    processingOutbox = false;
  }
}

function syncRecord(input, recordId) {
  const moduleKey = typeof input === "string" ? input : input.moduleKey;
  const record = typeof input === "string"
    ? (getLocalData()?.[moduleKey] || []).find(item => String(item.id) === String(recordId))
    : input.record;
  if (!record) return null;
  record.updated_at = isoNow();
  return queueOperation({ type: "record", moduleKey, record: structuredClone(record) });
}

function syncDelete(input, recordId) {
  const moduleKey = typeof input === "string" ? input : input.moduleKey;
  const id = typeof input === "string" ? recordId : input.recordId;
  const deletedAt = typeof input === "string" ? isoNow() : (input.deletedAt || isoNow());
  return queueOperation({ type: "delete", moduleKey, recordId: String(id), deletedAt });
}

function syncMetaField(input, value) {
  const field = typeof input === "string" ? input : input.field;
  const fieldValue = typeof input === "string" ? value : input.value;
  return queueOperation({ type: "meta", field, value: structuredClone(fieldValue) });
}

function markRecordDirty(moduleKey, recordId) { return syncRecord(moduleKey, recordId); }
function markRecordDeleted(moduleKey, recordId) { return syncDelete(moduleKey, recordId); }
function saveRecordCloud(moduleKey, recordId) { return syncRecord(moduleKey, recordId); }
function deleteRecordCloud(moduleKey, recordId) { return syncDelete(moduleKey, recordId); }
function saveMetaCloud(field, value) {
  const resolved = arguments.length > 1 ? value : getLocalData()?.[field];
  return syncMetaField(field, resolved);
}

function applyRealtimeChange(change) {
  const local = getLocalData();
  if (!local) return;
  SyncCore.applyRealtime(local, change);
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(local));
  if (onRemoteUpdate) onRemoteUpdate(change);
}

function setupRealtime() {
  if (!sb || !currentUser) return;
  if (syncChannel) sb.removeChannel(syncChannel);
  syncChannel = sb.channel(`workbench_changes_${currentUser.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "workbench_records", filter: `user_id=eq.${currentUser.id}` }, payload => {
      applyRealtimeChange({ table: "workbench_records", eventType: payload.eventType, oldRow: payload.old, newRow: payload.new });
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "workbench_meta", filter: `user_id=eq.${currentUser.id}` }, payload => {
      applyRealtimeChange({ table: "workbench_meta", eventType: payload.eventType, oldRow: payload.old, newRow: payload.new });
    }).subscribe();
}

function usernameToEmail(username) { return `${String(username || "").trim()}@cat-newsroom.local`; }

function queueLocalAccountMigration() {
  const local = getLocalData();
  if (!local || typeof CONFIG === "undefined") return;
  CONFIG.modules.forEach(module => (local[module.key] || []).forEach(record => syncRecord({ moduleKey: module.key, record })));
  ["__avatar", "__pomo", "__trend"].forEach(field => {
    if (Object.prototype.hasOwnProperty.call(local, field)) syncMetaField({ field, value: local[field] });
  });
}

async function signUp(username, password) {
  if (!sb) return { error: new Error("Supabase 未初始化") };
  const { data: authData, error } = await sb.auth.signUp({ email: usernameToEmail(username), password });
  if (!error && authData.user) {
    currentUser = authData.user; syncStatus = "online"; setupRealtime();
    deferOutboxProcessing = true;
    queueLocalAccountMigration();
    deferOutboxProcessing = false;
    await processOutbox();
    window.location.reload();
  }
  return { data: authData, error };
}

async function signIn(username, password) {
  if (!sb) return { error: new Error("Supabase 未初始化") };
  const { data: authData, error } = await sb.auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (!error && authData.user) window.location.reload();
  return { data: authData, error };
}

async function signOut() {
  if (sb) await sb.auth.signOut();
  if (syncChannel) { sb.removeChannel(syncChannel); syncChannel = null; }
  window.location.reload();
}

async function getAccessToken() {
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  return session?.access_token || null;
}

function sanitizeStoragePart(value, fallback = "item") {
  return String(value || fallback).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
}

async function uploadCardImage(file, options = {}) {
  if (!sb || !currentUser) throw new Error("云端未连接，暂时不能上传图片");
  if (currentUser.is_anonymous) throw new Error("请登录正式账号后上传图片");
  if (!file || !/^image\//.test(file.type || "")) throw new Error("请选择图片文件");
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type || "")) throw new Error("仅支持 JPG、PNG、WebP 或 GIF 图片");
  if (file.size > 6 * 1024 * 1024) throw new Error("图片不能超过 6MB");
  const moduleKey = sanitizeStoragePart(options.moduleKey, "record");
  const recordId = sanitizeStoragePart(options.recordId || operationId(), "record");
  const ext = sanitizeStoragePart((file.name || "image").split(".").pop() || "jpg", "jpg").toLowerCase();
  const path = `${currentUser.id}/${moduleKey}/${recordId}/${Date.now()}.${ext}`;
  const { error } = await sb.storage.from(SUPABASE_CONFIG.mediaBucket).upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  const { data: publicData } = sb.storage.from(SUPABASE_CONFIG.mediaBucket).getPublicUrl(path);
  return { path, url: publicData.publicUrl };
}

async function generateWeeklyReport(options = {}) {
  if (!currentUser || currentUser.is_anonymous) throw new Error("登录正式账号后才能生成 AI 生活报");
  const token = await getAccessToken();
  if (!token) throw new Error("登录状态已过期，请重新登录");
  const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/${SUPABASE_CONFIG.reportFunction}`, {
    method: "POST",
    headers: { apikey: SUPABASE_CONFIG.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ week_start: localWeekStartKey(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...options }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "AI 生活报生成失败");
  return payload;
}

function updateSyncIndicator() {
  const element = document.getElementById("sync-indicator");
  if (!element) return;
  const map = {
    offline: { text: "本地模式", cls: "sync-off" }, connecting: { text: "连接中…", cls: "sync-connecting" },
    online: { text: readOutbox().length ? "等待同步" : (lastSyncAt ? "已同步" : "已连接"), cls: "sync-on" },
    error: { text: "同步异常", cls: "sync-error" },
  };
  const state = map[syncStatus] || map.offline;
  element.textContent = state.text;
  element.className = `sync-indicator ${state.cls}`;
  element.title = lastSyncAt ? `最近同步：${new Date(lastSyncAt).toLocaleString()}` : state.text;
}

function getSyncStatus() { return syncStatus; }
function getCurrentUser() { return currentUser; }
