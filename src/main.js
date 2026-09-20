// Vue 入口：副作用导入共享领域库（UMD/IIFE 挂到 window），设置全局 CONFIG/data，
// 桥接 supabase-sync 回调，并初始化应用
import "./styles.css";

// 共享领域库（与主站相同的加载顺序与全局契约）
import "../js/sync-core.js";       // window.SyncCore
import "../js/api-client.js";      // window.ApiClient
import "../js/workbench-core.js";  // window.WorkbenchCore
import "../js/data-backup.js";     // window.DataBackup
import "../js/app-dialog.js";      // window.AppDialog
import "../js/pomodoro.js";        // window.Pomodoro
import "../js/device-mode.js";     // window.DeviceMode
import "../js/workout-catalog.js"; // window.WorkoutCatalog
import "../js/workout.js";         // window.Workout
import "../js/workout-plan.js";    // window.WorkoutPlan
import "../js/workout-view.js";    // window.WorkoutView
import "../js/workout-ui.js";      // window.WorkoutUI
import "../js/record-media.js";    // window.RecordMedia
import "../js/record-list.js";     // window.RecordList

// 全局 CONFIG（supabase-sync.js 通过全局词法作用域读取）；store.js 已设置 window.data
import { CONFIG } from "./lib/config.js";
window.CONFIG = CONFIG;

// 同步钩子桥接：src/public/js/sync-hooks.js（经典脚本）会把 supabase-sync 的
// onSyncReady / onRemoteUpdate 转发到这里
import { applyCloud, applyRemote, bump } from "./lib/store.js";
window.__onSyncReady = applyCloud;
window.__onRemoteUpdate = applyRemote;

import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#app");

// 启动 Supabase 会话恢复/匿名登录 + 首次全量同步（与主站 initSync 一致）
(async () => {
  const ok = await window.initSupabase?.();
  if (ok) {
    const cd = await window.runFullSync?.({ reason: "page_init" });
    if (cd) {
      bump();
      if (typeof window.updateAuthUI === "function") window.updateAuthUI();
    }
  }
})();
