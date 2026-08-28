/* ============================================================
   supabase-sync.js — 猫咪生活报云端同步模块 v2
   重构：全量批量同步，最少 API 请求
   ============================================================ */

const SUPABASE_CONFIG = {
  url: "https://qqtasmilusrpyxhrqptd.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxdGFzbWlsdXNycHl4aHJxcHRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMDMzNTUsImV4cCI6MjA4NzU3OTM1NX0.o_vSX2cDD07MzNxIi05WrWyn6dx2u9_4jaG_K9YMJ-0",
};

let sb = null;
let syncStatus = "offline";
let currentUser = null;
let onSyncReady = null;
let onRemoteUpdate = null;

// 防抖定时器：攒一批改动后一次推送
let pushTimer = null;
let pendingPush = false;

// 初始化
async function initSupabase() {
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
    syncStatus = "offline";
    return false;
  }
  syncStatus = "connecting";
  updateSyncIndicator();
  try {
    if (!window.supabase) {
      await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js");
    }
    sb = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      currentUser = session.user;
    } else {
      const { data, error } = await sb.auth.signInAnonymously();
      if (error) throw error;
      currentUser = data.user;
    }
    syncStatus = "online";
    updateSyncIndicator();
    return true;
  } catch (e) {
    console.error("[sync] 初始化失败:", e);
    syncStatus = "error";
    updateSyncIndicator();
    return false;
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// 从云端加载全部数据（1 次请求）
async function loadFromCloud() {
  if (!sb || !currentUser) return null;
  try {
    const { data: records, error } = await sb
      .from("workbench_records")
      .select("module_key, data")
      .eq("user_id", currentUser.id);
    if (error) throw error;
    const result = {};
    CONFIG.modules.forEach(m => result[m.key] = []);
    records.forEach(r => {
      if (!result[r.module_key]) result[r.module_key] = [];
      result[r.module_key].push(r.data);
    });
    const { data: meta } = await sb
      .from("workbench_meta")
      .select("*")
      .eq("user_id", currentUser.id)
      .maybeSingle();
    if (meta) {
      if (meta.avatar) result.__avatar = meta.avatar;
      if (meta.pomo_stats) result.__pomo = meta.pomo_stats;
      if (meta.trend_data) result.__trend = meta.trend_data;
    }
    return result;
  } catch (e) {
    console.error("[sync] 加载失败:", e);
    return null;
  }
}

// 防抖推送：标记需要推送，2 秒后批量执行
function schedulePush() {
  if (!sb || !currentUser || syncStatus !== "online") return;
  pendingPush = true;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(flushPush, 2000);
}

// 全量批量推送：1 次 upsert 推完所有数据
async function flushPush() {
  if (!sb || !currentUser || !pendingPush) return;
  pendingPush = false;
  if (typeof CONFIG === "undefined" || typeof data === "undefined") return;
  try {
    const rows = [];
    CONFIG.modules.forEach(m => {
      (data[m.key] || []).forEach(record => {
        rows.push({
          id: record.id,
          user_id: currentUser.id,
          module_key: m.key,
          data: record,
          updated_at: new Date().toISOString(),
        });
      });
    });
    if (rows.length) {
      const { error } = await sb.from("workbench_records")
        .upsert(rows, { onConflict: "id" });
      if (error) console.error("[sync] 推送记录失败:", error);
    }
    const meta = {};
    if (data.__avatar) meta.avatar = data.__avatar;
    if (data.__pomo) meta.pomo_stats = data.__pomo;
    if (data.__trend) meta.trend_data = data.__trend;
    if (Object.keys(meta).length) {
      await sb.from("workbench_meta").upsert({
        user_id: currentUser.id,
        ...meta,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }
  } catch (e) {
    console.error("[sync] 批量推送失败:", e);
  }
}

// 立即推送并等待完成（注册/登录时调用）
async function pushAllLocalToCloud() {
  pendingPush = false;
  clearTimeout(pushTimer);
  await flushPush();
}

// 删除云端记录（标记后防抖推送，不单独发请求）
function deleteRecordCloud() {
  schedulePush();
}

// 保存元数据
function saveMetaCloud() {
  schedulePush();
}

// 旧接口兼容（不再逐条推送，改为防抖全量）
function saveRecordCloud() {
  schedulePush();
}

function setupRealtime() {
  if (!sb || !currentUser) return;
  sb.channel("workbench_changes")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "workbench_records", filter: `user_id=eq.${currentUser.id}` },
      () => { if (onRemoteUpdate) onRemoteUpdate(); })
    .on("postgres_changes",
      { event: "*", schema: "public", table: "workbench_meta", filter: `user_id=eq.${currentUser.id}` },
      () => { if (onRemoteUpdate) onRemoteUpdate(); })
    .subscribe();
}

function usernameToEmail(username) {
  return `${username}@cat-newsroom.local`;
}

async function signUp(username, password) {
  if (!sb) return { error: "Supabase 未初始化" };
  const email = usernameToEmail(username);
  const { data, error } = await sb.auth.signUp({ email, password });
  if (!error && data.user) {
    currentUser = data.user;
    syncStatus = "online";
    updateSyncIndicator();
    await pushAllLocalToCloud();
  }
  return { data, error };
}

async function signIn(username, password) {
  if (!sb) return { error: "Supabase 未初始化" };
  const email = usernameToEmail(username);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (!error && data.user) {
    currentUser = data.user;
    syncStatus = "online";
    updateSyncIndicator();
    const cloudData = await loadFromCloud();
    if (cloudData && onSyncReady) onSyncReady(cloudData);
    await pushAllLocalToCloud();
  }
  return { data, error };
}

async function signOut() {
  if (!sb) return;
  await sb.auth.signOut();
  currentUser = null;
  syncStatus = "offline";
  updateSyncIndicator();
}

async function upgradeAnonymous(email, password) {
  if (!sb || !currentUser) return { error: "未登录" };
  const { data, error } = await sb.auth.updateUser({ email, password });
  if (!error) currentUser = data.user;
  return { data, error };
}

function updateSyncIndicator() {
  const el = document.getElementById("sync-indicator");
  if (!el) return;
  const map = {
    offline: { text: "本地模式", cls: "sync-off" },
    connecting: { text: "连接中…", cls: "sync-connecting" },
    online: { text: "已同步", cls: "sync-on" },
    error: { text: "同步异常", cls: "sync-error" },
  };
  const s = map[syncStatus] || map.offline;
  el.textContent = s.text;
  el.className = `sync-indicator ${s.cls}`;
}

function getSyncStatus() { return syncStatus; }
function getCurrentUser() { return currentUser; }
