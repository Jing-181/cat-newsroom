// 样式入口：共享主题、通用组件、运动模块、弹窗
import "./styles.css";

// 副作用导入共享领域库（UMD/IIFE，挂载到 window）
import "../js/sync-core.js"; // window.SyncCore
import "../js/api-client.js"; // window.ApiClient
import "../js/workout-catalog.js"; // window.WorkoutCatalog
import "../js/workout.js"; // window.Workout
import "../js/workout-plan.js"; // window.WorkoutPlan
import "../js/workout-view.js"; // window.WorkoutView
import "../js/app-dialog.js"; // window.AppDialog
import "../js/workout-ui.js"; // window.WorkoutUI

// CONFIG 与主站保持一致：本地数据键 + 模块键列表（同步层依赖）
window.CONFIG = {
  storageKey: "cat-newsroom-data-v2",
  modules: [
    { key: "todo", name: "今日待办" },
    { key: "checkin", name: "习惯打卡" },
    { key: "read", name: "阅读进度" },
    { key: "sport", name: "运动健身" },
    { key: "money", name: "记账本" },
    { key: "note", name: "猫咪日记" },
    { key: "hot", name: "今日收藏" },
  ],
};

import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#app");
// 启动 Supabase 会话恢复/匿名登录（supabase-sync.js 的全局函数）
window.initSupabase?.();
