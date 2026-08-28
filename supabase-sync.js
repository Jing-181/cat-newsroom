/* ============================================================
   supabase-sync.js — 猫咪生活报云端同步模块
   GitHub Pages + Supabase 架构的数据同步层
   ============================================================ */

const SUPABASE_CONFIG = {
  url: "https://qqtasmilusrpyxhrqptd.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxdGFzbWlsdXNycHl4aHJxcHRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMDMzNTUsImV4cCI6MjA4NzU3OTM1NX0.o_vSX2cDD07MzNxIi05WrWyn6dx2u9_4jaG_K9YMJ-0",
};

// Supabase 客户端实例
let sb = null;

// 同步状态：offline | connecting | online | error
let syncStatus = "offline";

// 当前用户信息
let currentUser = null;

// 云端加载完成回调
let onSyncReady = null;

// 数据变更回调（云端推送更新时触发）
let onRemoteUpdate = null;

// 写操作防抖队列
let saveQueue = {};
let saveTimer = null;

// 初始化 Supabase 客户端
async function initSupabase() {
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
    console.log("[sync] 未配置 Supabase，使用本地模式");
    syncStatus = "offline";
    return false;
  }

  syncStatus = "connecting";
  updateSyncIndicator();

  try {
    // 动态加载 Supabase JS SDK
    if (!window.supabase) {
      await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js");
    }
    sb = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

    // 检查现有会话
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      currentUser = session.user;
      syncStatus = "online";
    } else {
      // 尝试匿名登录
      const { data, error } = await sb.auth.signInAnonymously();
      if (error) throw error;
      currentUser = data.user;
      syncStatus = "online";
    }

    updateSyncIndicator();
    setupRealtime();
    return true;
  } catch (e) {
    console.error("[sync] 初始化失败:", e);
    syncStatus = "error";
    updateSyncIndicator();
    return false;
  }
}

// 动态加载脚本
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// 从云端加载全部数据
async function loadFromCloud() {
  if (!sb || !currentUser) return null;
  try {
    const { data: records, error } = await sb
      .from("workbench_records")
      .select("module_key, data")
      .eq("user_id", currentUser.id);

    if (error) throw error;

    const result = {};
    const moduleKeys = CONFIG.modules.map(m => m.key);
    moduleKeys.forEach(k => result[k] = []);

    records.forEach(r => {
      if (!result[r.module_key]) result[r.module_key] = [];
      result[r.module_key].push(r.data);
    });

    // 加载元数据（头像、番茄钟、趋势）
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
    console.error("[sync] 加载云端数据失败:", e);
    return null;
  }
}

// 防抖保存单条记录到云端
function saveRecordCloud(moduleKey, record) {
  if (!sb || !currentUser || syncStatus !== "online") return;

  saveQueue[`${moduleKey}:${record.id}`] = { moduleKey, record };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSaveQueue, 800);
}

// 批量推送保存队列
async function flushSaveQueue() {
  if (!sb || !currentUser) return;
  const items = Object.values(saveQueue);
  saveQueue = {};
  if (!items.length) return;

  for (const { moduleKey, record } of items) {
    try {
      await sb
        .from("workbench_records")
        .upsert({
          id: record.id,
          user_id: currentUser.id,
          module_key: moduleKey,
          data: record,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });
    } catch (e) {
      console.error("[sync] 保存失败:", moduleKey, record.id, e);
    }
  }
}

// 删除云端记录
async function deleteRecordCloud(moduleKey, recordId) {
  if (!sb || !currentUser || syncStatus !== "online") return;
  try {
    await sb
      .from("workbench_records")
      .delete()
      .eq("user_id", currentUser.id)
      .eq("id", recordId);
  } catch (e) {
    console.error("[sync] 删除失败:", recordId, e);
  }
}

// 保存元数据（头像、番茄钟等）
async function saveMetaCloud(key, value) {
  if (!sb || !currentUser || syncStatus !== "online") return;
  try {
    const update = {};
    if (key === "__avatar") update.avatar = value;
    else if (key === "__pomo") update.pomo_stats = value;
    else if (key === "__trend") update.trend_data = value;

    await sb
      .from("workbench_meta")
      .upsert({
        user_id: currentUser.id,
        ...update,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
  } catch (e) {
    console.error("[sync] 元数据保存失败:", key, e);
  }
}

// 设置实时监听
function setupRealtime() {
  if (!sb || !currentUser) return;
  sb.channel("workbench_changes")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "workbench_records", filter: `user_id=eq.${currentUser.id}` },
      (payload) => {
        if (onRemoteUpdate) onRemoteUpdate(payload);
      }
    )
    .on("postgres_changes",
      { event: "*", schema: "public", table: "workbench_meta", filter: `user_id=eq.${currentUser.id}` },
      (payload) => {
        if (onRemoteUpdate) onRemoteUpdate(payload);
      }
    )
    .subscribe();
}

// 邮箱注册
async function signUp(email, password) {
  if (!sb) return { error: "Supabase 未初始化" };
  const { data, error } = await sb.auth.signUp({ email, password });
  if (!error && data.user) {
    currentUser = data.user;
    syncStatus = "online";
    updateSyncIndicator();
  }
  return { data, error };
}

// 邮箱登录
async function signIn(email, password) {
  if (!sb) return { error: "Supabase 未初始化" };
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (!error && data.user) {
    currentUser = data.user;
    syncStatus = "online";
    updateSyncIndicator();
    // 登录后重新加载云端数据
    const cloudData = await loadFromCloud();
    if (cloudData && onSyncReady) onSyncReady(cloudData);
  }
  return { data, error };
}

// 登出
async function signOut() {
  if (!sb) return;
  await sb.auth.signOut();
  currentUser = null;
  syncStatus = "offline";
  updateSyncIndicator();
}

// 升级匿名账号为正式账号
async function upgradeAnonymous(email, password) {
  if (!sb || !currentUser) return { error: "未登录" };
  const { data, error } = await sb.auth.updateUser({ email, password });
  if (!error) {
    currentUser = data.user;
  }
  return { data, error };
}

// 更新同步状态指示器
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

// 获取当前同步状态
function getSyncStatus() { return syncStatus; }
function getCurrentUser() { return currentUser; }
