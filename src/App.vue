<script setup>
// 应用外壳：侧栏（品牌/导航/同步区/备份/设备切换）+ 主视区（按导航切换模块组件）
import { ref, computed, onMounted } from "vue";
import { CONFIG } from "./lib/config.js";
import { icon } from "./lib/icons.js";
import { getData, save, bump, renderAfterWorkoutDialog } from "./lib/store.js";
import { ensurePomodoroController } from "./lib/pomodoro.js";
import { openAuthModal } from "./lib/auth-modal.js";
import { updateAuthUI } from "./lib/auth-ui.js";
import HomeView from "./modules/home/HomeView.vue";
import InsightView from "./modules/insight/InsightView.vue";
import TodoView from "./modules/todo/TodoView.vue";
import CheckinView from "./modules/checkin/CheckinView.vue";
import ReadView from "./modules/read/ReadView.vue";
import SportView from "./modules/workout/SportView.vue";
import MoneyView from "./modules/money/MoneyView.vue";
import NoteView from "./modules/note/NoteView.vue";
import HotView from "./modules/hot/HotView.vue";

const VIEWS = {
  home: HomeView, insight: InsightView, todo: TodoView, checkin: CheckinView,
  read: ReadView, sport: SportView, money: MoneyView, note: NoteView, hot: HotView,
};

const saved = typeof window.DeviceMode?.restoreView === "function" ? window.DeviceMode.restoreView() : "home";
const view = ref(VIEWS[saved] ? saved : "home");
const current = computed(() => VIEWS[view.value] || HomeView);

function go(key) {
  if (!VIEWS[key]) return;
  view.value = key;
  window.DeviceMode?.saveView?.(key);
  window.scrollTo({ top: 0 });
}

function onNavigate(key) { go(key); }

const avatarRef = ref(null);
const avatarInputRef = ref(null);
const deviceSwitcherRef = ref(null);

async function syncNow() {
  await window.runFullSync?.({ reason: "manual" });
  renderAfterWorkoutDialog();
}

onMounted(() => {
  ensurePomodoroController();

  // 头像：读本地已存头像
  const avatar = getData().__avatar;
  if (avatar && avatarRef.value) avatarRef.value.src = avatar;
  // 同步指示器点击：在线→登出/登录，离线→重连
  document.getElementById("sync-indicator").onclick = async () => {
    const s = window.getSyncStatus?.();
    if (s === "online") {
      const user = window.getCurrentUser?.();
      if (user && user.is_anonymous) openAuthModal("login");
      else if (user && user.email) {
        if (await window.AppDialog.confirm("确定登出？", { title: "退出当前账号", danger: true, okText: "退出登录" })) window.signOut?.().then(() => updateAuthUI());
      }
    } else if (s === "offline" || s === "error") {
      window.initSupabase?.().then(ok => { if (ok) syncNow(); });
    }
  };
  document.getElementById("sync-now").onclick = () => syncNow();
  // 备份导入导出
  window.DataBackup?.mount({
    exportButton: document.getElementById("backup-export"),
    importButton: document.getElementById("backup-import"),
    input: document.getElementById("backup-input"),
    getData: () => getData(),
    setData: next => { window.data = next; save(); bump(); updateAuthUI(); },
    storageKey: CONFIG.storageKey,
    moduleKeys: CONFIG.modules.map(module => module.key),
    confirm: message => window.AppDialog.confirm(message, { title: "导入本地备份", danger: true, okText: "覆盖本地数据" }),
  });
  // 设备模式切换（桌面/移动/自动）
  window.DeviceMode?.mountSwitcher?.(deviceSwitcherRef.value, "desktop", () => view.value);
  updateAuthUI();
});

function onAvatarClick() { avatarInputRef.value?.click(); }
function onAvatarChange(e) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    const data = getData();
    data.__avatar = reader.result;
    if (avatarRef.value) avatarRef.value.src = reader.result;
    save();
    if (window.getSyncStatus?.() === "online") window.saveMetaCloud?.("__avatar", reader.result);
  };
  reader.readAsDataURL(f);
  e.target.value = "";
}
</script>

<template>
  <div class="layout">
    <!-- sidebar -->
    <aside class="sidebar">
      <div class="brand">
        <div class="ava" title="点击更换头像" @click="onAvatarClick"><img src="/assets/avatar.jpg" alt="头像" ref="avatarRef"/><span class="cam" v-html="icon('camera', 18)"></span></div>
        <input type="file" accept="image/*" hidden ref="avatarInputRef" @change="onAvatarChange"/>
        <div><h1 id="brandName">{{ CONFIG.owner }}</h1><p id="brandSlogan">{{ CONFIG.slogan }}</p></div>
      </div>
      <nav class="nav">
        <a class="navi" :class="{ active: view === 'home' }" @click="go('home')"><span v-html="icon('home', 19)"></span>首页</a>
        <div class="nav-sep">功能模块</div>
        <a v-for="m in CONFIG.modules" :key="m.key" class="navi" :class="{ active: view === m.key }" @click="go(m.key)"><span v-html="icon(m.icon, 19)"></span>{{ m.name }}</a>
        <div class="nav-sep">统计</div>
        <a class="navi" :class="{ active: view === 'insight' }" @click="go('insight')"><span v-html="icon('chart', 19)"></span>洞察复盘</a>
      </nav>
      <div class="sync-area" id="syncArea">
        <div ref="deviceSwitcherRef"></div>
        <span class="sync-indicator sync-off" id="sync-indicator">本地模式</span>
        <span class="sync-user-email" id="syncEmail"></span>
        <button class="sync-now" id="sync-now" type="button">立即同步</button>
        <div class="backup-actions"><button class="sync-now" id="backup-export" type="button">导出备份</button><button class="sync-now" id="backup-import" type="button">导入备份</button></div>
        <input id="backup-input" type="file" accept="application/json,.json" hidden>
      </div>
      <div class="foot" id="foot">猫咪编辑部 · 云端同步版</div>
    </aside>
    <!-- main -->
    <main class="main">
      <component :is="current" :key="view" @navigate="onNavigate" />
    </main>
  </div>
</template>
