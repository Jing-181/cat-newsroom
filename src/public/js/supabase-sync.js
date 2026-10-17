/* 猫咪生活报同步模块：初始化/手动全量，其余操作均为单项原子同步。 */
const SUPABASE_CONFIG = {
  url: "https://qqtasmilusrpyxhrqptd.supabase.co",
  anonKey: "sb_publishable_xnVYIwduEPYcIpV0aLSC0Q_Lz8U7nf5",
  mediaBucket: "card-images",
};

const SYNC_OUTBOX_KEY = "cat-newsroom-sync-outbox-v1";
const META_FIELDS = { __avatar: "avatar", __pomo: "pomo_stats", __trend: "trend_data", __homeOrder: "home_order" };
// 本机最近登录过的正式账号：用于区分「新访客」与「会话失效的老用户」，
// 避免老用户被静默降级成匿名账号后，新记录写进别的账号。
const LAST_ACCOUNT_KEY = "cat-newsroom-last-account";
const SUPABASE_PROJECT_REF = (SUPABASE_CONFIG.url.split("//")[1] || "").split(".")[0];
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
let explicitSignOut = false;
let authStateUnsubscribe = null;

const isoNow = () => new Date().toISOString();
const operationId = () => `op-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const getLocalData = () => typeof data === "undefined" ? null : data;

// 演示数据守卫（实现在 src/lib/demo-data.js）：没被动过的样板记录不上云。
// 经典脚本没有模块系统，走 window.DemoData 桥；桥不在时退回到只看 __seed 标识。
function isDemoRecord(moduleKey, record) {
  const api = typeof window !== "undefined" ? window.DemoData : null;
  if (api && typeof api.isDemoRecord === "function") return api.isDemoRecord(moduleKey, record);
  return !!(record && typeof record === "object" && record.__seed === true);
}

function stripSeedFlag(record) {
  const api = typeof window !== "undefined" ? window.DemoData : null;
  return api && typeof api.stripSeedFlag === "function" ? api.stripSeedFlag(record) : record;
}

// 交给 ESM 侧的只读出口（src/lib/training-review.js 读训练复盘视图时用）。
// SUPABASE_CONFIG 是顶层 const，经典脚本里不会成为 window 属性，所以显式吐一个函数。
function getSupabaseConfig() {
  return { url: SUPABASE_CONFIG.url, anonKey: SUPABASE_CONFIG.anonKey };
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
    const clientUrl = normalizeHeaderValue(SUPABASE_CONFIG.url, "Supabase 地址");
    const clientKey = normalizeHeaderValue(SUPABASE_CONFIG.anonKey, "Supabase 公钥");
    sb = supabase.createClient(clientUrl, clientKey, { auth: { persistSession: true, autoRefreshToken: true } });
    // 监听认证状态变化：会话过期/登出/切换时及时更新 currentUser，
    // 避免用户在不知情的情况下以匿名身份记录数据（记录被写进别的账号）。
    // initSupabase 可能被重复调用（如离线时点击同步指示器重连），先退订旧监听避免累积。
    if (authStateUnsubscribe) authStateUnsubscribe();
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (event === "TOKEN_REFRESHED" && !session)) {
        currentUser = null;
        syncStatus = "offline";
        if (syncChannel) { sb.removeChannel(syncChannel); syncChannel = null; }
        updateSyncIndicator();
        if (typeof window.updateAuthUI === "function") window.updateAuthUI();
        if (!explicitSignOut) notifyLoginRequired();
      } else if (session?.user) {
        const userChanged = !currentUser || currentUser.id !== session.user.id;
        currentUser = session.user;
        if (!session.user.is_anonymous) markRealAccount(session.user.id);
        if (userChanged) setupRealtime();
        updateSyncIndicator();
        if (typeof window.updateAuthUI === "function") window.updateAuthUI();
      }
    });
    authStateUnsubscribe = () => subscription.unsubscribe();
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      currentUser = session.user;
      if (!session.user.is_anonymous) markRealAccount(session.user.id);
    } else if (!localStorage.getItem(LAST_ACCOUNT_KEY)) {
      const { data: anonymous, error } = await sb.auth.signInAnonymously();
      if (error) throw error;
      currentUser = anonymous.user;
    } else {
      // 本机登录过正式账号但会话已失效：不静默降级成匿名账号，数据保留在本机，
      // 提示用户重新登录；登录成功后再把本地数据迁移上云。
      syncStatus = "offline"; updateSyncIndicator();
      notifyLoginRequired();
      return false;
    }
    syncStatus = "online";
    setupRealtime();
    updateSyncIndicator();
    return true;
  } catch (error) {
    console.error("[sync] 初始化失败:", error);
    if (/ByteString|invalid character/i.test(String(error?.message || error))) {
      // 只清理本项目损坏的持久化会话，避免误删其它 Supabase 项目的登录态。
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index) || "";
        if (key.startsWith("sb-") && key.includes(SUPABASE_PROJECT_REF) && key.endsWith("-auth-token")) localStorage.removeItem(key);
      }
    }
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

function replaceLocalWithCloud(cloudData, pendingOperations = []) {
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
  SyncCore.applyPending(local, pendingOperations);
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
    const pendingOperations = readOutbox();
    const cloudData = await fetchAllCloudData();
    if (!cloudData) return null;
    if (currentUser.is_anonymous) mergeDataWithCloud(cloudData);
    else replaceLocalWithCloud(cloudData, pendingOperations);
    lastSyncAt = isoNow(); syncStatus = "online"; updateSyncIndicator();
    if (onSyncReady) onSyncReady(cloudData);
    return cloudData;
  } catch (error) {
    console.error("[sync] 全量同步失败:", error);
    syncStatus = "error"; updateSyncIndicator(); return null;
  }
}

// 一次性清理：把已经混进账号的演示数据（内容与样板模板完全一致的行）删掉。
// 默认只看不删；确认后传 { commit: true } 才真删。用户编辑过的记录不会命中。
async function purgeDemoRecords(options = {}) {
  const commit = options.commit === true;
  if (!sb || !currentUser) throw new Error("云端未连接");
  if (currentUser.is_anonymous) throw new Error("请先登录正式账号再清理");
  const cloudData = await fetchAllCloudData();
  const targets = [];
  CONFIG.modules.forEach(module => {
    (cloudData?.[module.key] || []).forEach(record => {
      if (!isDemoRecord(module.key, record)) return;
      targets.push({ moduleKey: module.key, id: String(record.id), title: record.title || record.name || String(record.id) });
    });
  });
  if (!commit) return { commit: false, found: targets.length, targets };
  for (const target of targets) {
    const { error } = await sb.from("workbench_records").delete().eq("user_id", currentUser.id).eq("id", target.id);
    if (error) throw error;
  }
  const local = getLocalData();
  if (local) {
    targets.forEach(({ moduleKey, id }) => {
      local[moduleKey] = (local[moduleKey] || []).filter(item => String(item.id) !== id);
    });
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(local));
  }
  if (onRemoteUpdate) onRemoteUpdate({ table: "workbench_records", eventType: "DELETE" });
  return { commit: true, removed: targets.length, targets };
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

// 从 outbox 里剔掉演示数据的上传操作（修复前排队的老样板数据没有 __seed 标识，靠内容比对识别）
function dropDemoOperations(outbox) {
  return (outbox || []).filter(operation => {
    const demo = operation.type === "record" && isDemoRecord(operation.moduleKey, operation.record);
    if (demo) console.info("[sync] 跳过演示数据操作:", operation.moduleKey, operation.record?.id);
    return !demo;
  });
}

async function processOutbox() {
  if (!sb || !currentUser || syncStatus !== "online" || processingOutbox) return false;
  processingOutbox = true;
  try {
    let outbox = readOutbox();
    while (outbox.length) {
      const cleaned = dropDemoOperations(outbox);
      if (cleaned.length !== outbox.length) {
        outbox = cleaned;
        writeOutbox(outbox);
        if (!outbox.length) break;
      }
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
  // 样板记录不上云（用户改过 / 新加的记录内容与样板不同，照常同步）
  if (isDemoRecord(moduleKey, record)) return null;
  record.updated_at = isoNow();
  return queueOperation({ type: "record", moduleKey, record: stripSeedFlag(structuredClone(record)) });
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

// 记住本机最近登录的正式账号，用于区分「新访客」与「会话失效的老用户」。
function markRealAccount(userId) {
  try { localStorage.setItem(LAST_ACCOUNT_KEY, userId); } catch (_) {}
}

// 会话失效时提示用户重新登录：只发事件，提示不再依赖全局垫片（Toast 已收进 src/lib/toast.js）；
// App 层监听到事件后弹提示并打开登录弹窗。
function notifyLoginRequired() {
  try { window.dispatchEvent(new CustomEvent("cat-newsroom:login-required", { detail: { message: "登录状态已失效，数据已保留在本机，请重新登录" } })); } catch (_) {}
}

function queueLocalAccountMigration() {
  const local = getLocalData();
  if (!local || typeof CONFIG === "undefined") return;
  // 只把用户自己新增/改过的记录迁到新账号，样板数据留在本地
  CONFIG.modules.forEach(module => (local[module.key] || []).forEach(record => {
    if (isDemoRecord(module.key, record)) return;
    syncRecord({ moduleKey: module.key, record });
  }));
  ["__avatar", "__pomo", "__trend"].forEach(field => {
    if (Object.prototype.hasOwnProperty.call(local, field)) syncMetaField({ field, value: local[field] });
  });
}

// 登录正式账号后，只把「本地有、但该账号云端还没有」的记录迁移上云：
// 既保住匿名/离线期间产生的新记录，又不会用本地旧数据覆盖其它设备的新记录。
async function queueMissingLocalRecords() {
  const local = getLocalData();
  if (!local || !sb || !currentUser || typeof CONFIG === "undefined") return;
  const { data: rows, error } = await sb.from("workbench_records")
    .select("id").eq("user_id", currentUser.id);
  if (error) return;
  const existing = new Set((rows || []).filter(row => !row.deleted_at).map(row => String(row.id)));
  CONFIG.modules.forEach(module => (local[module.key] || []).forEach(record => {
    if (!existing.has(String(record.id))) syncRecord({ moduleKey: module.key, record });
  }));
  const { data: meta } = await sb.from("workbench_meta")
    .select("avatar,pomo_stats,trend_data").eq("user_id", currentUser.id).maybeSingle();
  if (!meta) {
    ["__avatar", "__pomo", "__trend"].forEach(field => {
      if (Object.prototype.hasOwnProperty.call(local, field)) syncMetaField({ field, value: local[field] });
    });
  }
}

async function signUp(username, password) {
  if (!sb) return { error: new Error("Supabase 未初始化") };
  const { data: authData, error } = await sb.auth.signUp({ email: usernameToEmail(username), password });
  if (!error && authData.user) {
    currentUser = authData.user; syncStatus = "online"; setupRealtime();
    markRealAccount(authData.user.id);
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
  if (!error && authData.user) {
    // 登录成功后：先记住正式账号，再把本地存在但云端缺失的记录迁移上云，
    // 避免 reload 后 replaceLocalWithCloud 用云端数据覆盖掉匿名/离线期间产生的记录。
    currentUser = authData.user; syncStatus = "online"; setupRealtime();
    markRealAccount(authData.user.id);
    deferOutboxProcessing = true;
    await queueMissingLocalRecords();
    deferOutboxProcessing = false;
    await processOutbox();
    window.location.reload();
  }
  return { data: authData, error };
}

async function signOut() {
  explicitSignOut = true;
  try { localStorage.removeItem(LAST_ACCOUNT_KEY); } catch (_) {}
  if (sb) await sb.auth.signOut();
  if (syncChannel) { sb.removeChannel(syncChannel); syncChannel = null; }
  window.location.reload();
}

async function getAccessToken() {
  if (!sb) return null;
  try {
    const { data: { session } } = await sb.auth.getSession();
    return typeof session?.access_token === "string" ? session.access_token : null;
  } catch (error) {
    if (/ByteString|invalid character/i.test(String(error?.message || error))) {
      await sb.auth.signOut({ scope: "local" }).catch(() => {});
      throw new Error("登录状态已损坏，请重新登录后再生成周报");
    }
    throw error;
  }
}

// 仅允许可安全放入 HTTP 请求头的 ASCII 值，避免浏览器抛出 ByteString 异常。
function normalizeHeaderValue(value, label) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || !/^[\x21-\x7E]+$/.test(text)) throw new Error(`${label}格式异常，请重新登录`);
  return text;
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
  if (error) {
    // 未部署存储迁移时，Supabase 会返回 NoSuchBucket，给出可执行的修复提示。
    const message = String(error.message || "").toLowerCase();
    if (error.code === "NoSuchBucket" || error.statusCode === 404 || message.includes("bucket not found")) {
      throw new Error("图片存储桶尚未初始化，请在 Supabase SQL Editor 执行 supabase/migrations/20260907000000_repair_card_images_storage.sql");
    }
    throw error;
  }
  const { data: publicData } = sb.storage.from(SUPABASE_CONFIG.mediaBucket).getPublicUrl(path);
  return { path, url: publicData.publicUrl };
}

async function generateWorkoutPlan(options = {}) {
  if (!currentUser || currentUser.is_anonymous) throw new Error("登录正式账号后才能生成训练计划");
  const token = normalizeHeaderValue(await getAccessToken(), "登录令牌");
  const headers = { apikey: SUPABASE_CONFIG.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  return ApiClient.requestJson({ url: `${SUPABASE_CONFIG.url}/functions/v1/generate-workout-plan`, headers, body: options, timeoutMs: 50000 });
}

// 每日一卡：一次生成一批（count 条）存入 daily_cards，仅正式账号可调用。
async function generateDailyCopy(options = {}) {
  if (!currentUser || currentUser.is_anonymous) throw new Error("登录正式账号后才能生成每日一卡");
  const token = normalizeHeaderValue(await getAccessToken(), "登录令牌");
  const headers = { apikey: SUPABASE_CONFIG.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  return ApiClient.requestJson({ url: `${SUPABASE_CONFIG.url}/functions/v1/generate-daily-copy`, headers, body: options, timeoutMs: 120000 });
}

// 读取当前用户每日一卡批次（不调 AI，只查表）
async function fetchDailyCards() {
  if (!sb || !currentUser) return null;
  try {
    const { data } = await sb.from("daily_cards").select("*").eq("user_id", currentUser.id).maybeSingle();
    return data || null;
  } catch (_) {
    return null;
  }
}

// 读取用户网站配置（当前：首页排序 home_order）
async function fetchUserSettings() {
  if (!sb || !currentUser) return null;
  try {
    const { data } = await sb.from("workbench_meta").select("home_order").eq("user_id", currentUser.id).maybeSingle();
    return data || null;
  } catch (_) {
    return null;
  }
}

function updateSyncIndicator() {
  const elements = document.querySelectorAll("#sync-indicator");
  if (!elements.length) return;
  const map = {
    offline: { text: "本地模式", cls: "sync-off" }, connecting: { text: "连接中…", cls: "sync-connecting" },
    online: { text: readOutbox().length ? "等待同步" : (lastSyncAt ? "已同步" : "已连接"), cls: "sync-on" },
    error: { text: "同步异常", cls: "sync-error" },
  };
  const state = map[syncStatus] || map.offline;
  const title = lastSyncAt ? `最近同步：${new Date(lastSyncAt).toLocaleString()}` : state.text;
  elements.forEach(element => {
    element.textContent = state.text;
    element.className = `sync-indicator ${state.cls}`;
    element.title = title;
  });
}

function getSyncStatus() { return syncStatus; }
function getCurrentUser() { return currentUser; }
