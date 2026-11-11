<script setup>
// 应用外壳：侧栏（品牌/导航/同步区/备份/设备切换）+ 主视区（按导航切换模块组件）
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { CONFIG } from "./lib/config.js";
import { icon } from "./lib/icons.js";
import { COLLAPSED_MODULE_KEYS, isPrimaryModule } from "./lib/home-layout.js";
import { dateStr } from "./lib/utils.js";
import { getData, save, bump, renderAfterWorkoutDialog } from "./lib/store.js";
import { ensurePomodoroController } from "./lib/pomodoro.js";
import { openAuthModal } from "./lib/auth-modal.js";
import { updateAuthUI } from "./lib/auth-ui.js";
import Toast from "./lib/toast.js";
import AppDialog from "./lib/app-dialog.js";
import DataBackup from "./lib/data-backup.js";
import DeviceMode from "./lib/device-mode.js";
import { mountLeafShade } from "./lib/leaf-shade.js";
import Trace from "./lib/trace.js";
import { initMobileViewport } from "./lib/mobile-viewport.js";
import HomeView from "./modules/home/HomeView.vue";
import InsightView from "./modules/insight/InsightView.vue";
import TodoView from "./modules/todo/TodoView.vue";
import CheckinView from "./modules/checkin/CheckinView.vue";
import ReadView from "./modules/read/ReadView.vue";
import SportView from "./modules/workout/SportView.vue";
import ExerciseAtlasView from "./modules/workout/ExerciseAtlasView.vue";
import MoneyView from "./modules/money/MoneyView.vue";
import NoteView from "./modules/note/NoteView.vue";
import HotView from "./modules/hot/HotView.vue";
import SettingsView from "./modules/settings/SettingsView.vue";

const VIEWS = {
  home: HomeView, insight: InsightView, todo: TodoView, checkin: CheckinView,
  read: ReadView, sport: SportView, money: MoneyView, note: NoteView, hot: HotView,
  settings: SettingsView, exerciseAtlas: ExerciseAtlasView,
};

const primaryModules = CONFIG.modules.filter(m => isPrimaryModule(m.key));
const collapsedModules = CONFIG.modules.filter(m => COLLAPSED_MODULE_KEYS.includes(m.key));
const saved = DeviceMode.restoreView();
// 旧版停留在记账时回到首页；保留 MoneyView 及其数据契约。
const view = ref(VIEWS[saved] && saved !== "money" ? saved : "home");
const current = computed(() => VIEWS[view.value] || HomeView);

// 切模块：原生 View Transitions 管快照与换页时机，WAAPI 在新快照上做墨迹圆形揭示。
// 旧的交叉淡出让两层都半透明，中间帧会透出纸底发白；CSS 里已按 MDN 的做法
// 关掉默认动画与混合，让新帧整块盖在旧帧之上。没有 GPU 设备、定时器和额外监听。
const canViewTransition = () =>
  typeof document !== "undefined" &&
  typeof document.startViewTransition === "function" &&
  !window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

let pendingKey = null;
let inkPoint = { x: 0, y: 0 };
let unmountLeafShade = null;

function pointFrom(event) {
  if (event?.clientX > 0 || event?.clientY > 0) return { x: event.clientX, y: event.clientY };
  const rect = event?.currentTarget?.getBoundingClientRect?.();
  return rect
    ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    : { x: window.innerWidth / 2, y: window.innerHeight * 0.78 };
}

function go(key, event) {
  if (!VIEWS[key]) return;
  pendingKey = key;
  inkPoint = pointFrom(event);
  const swap = () => {
    view.value = pendingKey; // 读最新值：连续点击时浏览器会 skip 前一个转场
    drawerOpen.value = false; // 移动端选完模块后收起抽屉
    // 运动页的全屏开关只管那一页，切走时要撤回，不然别的页面也没导航栏
    document.documentElement.classList.remove("workout-fullscreen");
    DeviceMode.saveView(pendingKey);
  };
  if (!canViewTransition()) {
    swap();
    window.scrollTo({ top: 0 });
    return;
  }
  const transition = document.startViewTransition(async () => {
    swap();
    await nextTick(); // 等 Vue 把新 DOM 写进去，浏览器截到的才不是旧一帧
  });
  // ready 之后伪元素树才存在。在 new 快照上做 clip-path，旧帧保持不透明，
  // 新帧从落点铺开盖上去，中途任何一帧都不会透出底色。
  transition.ready.then(() => {
    const { x, y } = inkPoint;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      {
        duration: 420,
        easing: "cubic-bezier(.22,.72,.2,1)",
        fill: "both",
        pseudoElement: "::view-transition-new(root)",
      },
    );
  }).catch(() => { /* 被后续点击 skip 时 ready 会 reject，页面状态已落地，无需补偿 */ });
  // 滚动放到动画之后：中途跳位置会把揭示弄成一次跳动
  transition.finished.finally(() => window.scrollTo({ top: 0 }));
}

function onNavigate(key) { go(key); }

const avatarInputRef = ref(null);
const backupExportRef = ref(null);
const backupImportRef = ref(null);
const backupInputRef = ref(null);
const drawerOpen = ref(false);
const avatarSrc = ref("/assets/avatar.jpg");
const todayText = dateStr();

function toggleDrawer(open) { drawerOpen.value = open ?? !drawerOpen.value; }

function applyAvatar(src) { avatarSrc.value = src; }

async function syncNow() {
  await window.runFullSync?.({ reason: "manual" });
  renderAfterWorkoutDialog();
}

// 同步指示器的文字与颜色由同步层写（它是那两个 <span> 的宿主），这里只接点击
async function onSyncIndicatorClick() {
  const s = window.getSyncStatus?.();
  if (s === "online") {
    const user = window.getCurrentUser?.();
    if (user && user.is_anonymous) openAuthModal("login");
    else if (user && user.email) {
      if (await AppDialog.confirm("确定登出？", { title: "退出当前账号", danger: true, okText: "退出登录" })) window.signOut?.().then(() => updateAuthUI());
    }
  } else if (s === "offline" || s === "error") {
    window.initSupabase?.().then(ok => { if (ok) syncNow(); });
  }
}

let cleanupMobileViewport;
onMounted(() => {
  cleanupMobileViewport = initMobileViewport();
  ensurePomodoroController();
  // 树影层：挂在 .layout 最底下（由 mountLeafShade 自己 prepend），只负责一层气氛，不接任何交互
  // 存下 teardown，App 卸载时别把 canvas 和 visibility/resize 监听留在页面上
  unmountLeafShade = mountLeafShade({ parent: document.querySelector(".layout") || document.body });

  // 开应用记一次：冷启动与切回用 sessionStorage 区分（只记形状，不记内容）
  const launchedKey = "cat-newsroom-trace-launched";
  let warm = false;
  try {
    warm = sessionStorage.getItem(launchedKey) === "1";
    sessionStorage.setItem(launchedKey, "1");
  } catch (_) { /* 隐私模式下拿不到 sessionStorage 就当冷启动 */ }
  Trace.track("app_open", {
    launch: warm ? "warm" : "cold",
    platform: matchMedia("(max-width: 820px)").matches ? "mobile" : "desktop",
    hour: new Date().getHours(),
    dow: (new Date().getDay() + 6) % 7,
  });

  // 头像：读本地已存头像
  const avatar = getData().__avatar;
  if (avatar) applyAvatar(avatar);
  // 备份导入导出（三个按钮都是模板里的 ref，不再按 id 去 DOM 里找）
  DataBackup.mount({
    exportButton: backupExportRef.value,
    importButton: backupImportRef.value,
    input: backupInputRef.value,
    getData: () => getData(),
    setData: next => { window.data = next; save(); bump(); updateAuthUI(); },
    storageKey: CONFIG.storageKey,
    moduleKeys: CONFIG.modules.map(module => module.key),
    confirm: message => AppDialog.confirm(message, { title: "导入本地备份", danger: true, okText: "覆盖本地数据" }),
  });
  updateAuthUI();
  // 同步层检测到正式账号会话失效时，提示并自动弹出登录框（数据已保留在本机）；
  // 提示文案由同步层事件带过来，Toast 由 App 层用 ESM 模块调，不再走全局垫片。
  window.addEventListener("cat-newsroom:login-required", event => {
    Toast.show(event.detail?.message || "登录状态已失效，请重新登录", { duration: 6000 });
    openAuthModal("login");
  });
});

onUnmounted(() => {
  cleanupMobileViewport?.();
  unmountLeafShade?.();
});

function onAvatarClick() { avatarInputRef.value?.click(); }

function readAsDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("这个图片格式浏览器打不开"));
    img.onload = () => resolve(img);
    img.src = src;
  });
}

// 头像统一先压到最长边 320px 的 JPEG：手机原图动辄几 MB，本地存会顶满配额，上传也慢。
// 压不动（老浏览器没有 canvas.toBlob）就返回 null，由调用方退回原图。
async function compressAvatar(file) {
  try {
    const img = await loadImage(await readAsDataURL(file));
    const scale = Math.min(1, 320 / Math.max(img.width || 1, img.height || 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((img.width || 1) * scale));
    canvas.height = Math.max(1, Math.round((img.height || 1) * scale));
    const ctx = canvas.getContext("2d");
    // JPEG 没有透明通道，先铺白底，否则 PNG 的透明区会变成黑块
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise(resolve => canvas.toBlob(blob => resolve(blob), "image/jpeg", 0.85));
  } catch (_) {
    return null;
  }
}

// 头像存什么：登录状态下传进 card-images 存储，拿到一个带 uid 的新 URL（每次上传路径都不同，天然不会命中缓存）；
// 未登录、离线或上传失败时退回压缩后的 dataURL 内联在本地，不依赖网络也能换头像。
async function avatarSource(file) {
  const blob = (await compressAvatar(file)) || file;
  const user = window.getCurrentUser?.();
  if (user && !user.is_anonymous && typeof window.uploadCardImage === "function") {
    try {
      const named = blob instanceof File ? blob : new File([blob], "avatar.jpg", { type: blob.type || "image/jpeg" });
      const uploaded = await window.uploadCardImage(named, { moduleKey: "avatar", recordId: "avatar" });
      if (uploaded?.url) return { src: `${uploaded.url}?v=${Date.now()}`, warning: "" };
    } catch (error) {
      // 上传失败不挡住换头像：这次先存在本地，并把原因说清楚
      return { src: await readAsDataURL(blob), warning: `云端上传失败，头像已先存在本机：${error?.message || "网络异常"}` };
    }
  }
  return { src: await readAsDataURL(blob), warning: "" };
}

async function onAvatarChange(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  if (file.type && !/^image\//.test(file.type)) { Toast.show("请选一张图片"); return; }
  const previous = avatarSrc.value;
  try {
    const { src, warning } = await avatarSource(file);
    applyAvatar(src);
    const data = getData();
    data.__avatar = src;
    save();
    if (window.getSyncStatus?.() === "online") window.saveMetaCloud?.("__avatar", src);
    Toast.show(warning || "头像已更新", warning ? { duration: 6000 } : undefined);
  } catch (error) {
    applyAvatar(previous);
    Toast.show(error?.message || "头像更新失败，换一张试试");
  }
}
</script>

<template>
  <div class="layout">
    <!-- 移动顶栏（≤820px 显示） -->
    <header class="m-topbar">
      <button class="m-menu-btn" type="button" aria-label="打开菜单" @click="toggleDrawer(true)"><span v-html="icon('menu', 20)"></span></button>
      <div class="m-brand"><img class="js-avatar" :src="avatarSrc" alt="头像"/><div class="m-brand-tx"><h1>{{ CONFIG.owner }}</h1><p>{{ todayText }}</p></div></div>
      <span class="sync-indicator sync-off" id="sync-indicator" @click="onSyncIndicatorClick">本地模式</span>
    </header>
    <!-- sidebar（PC 常驻；窄屏收起为抽屉） -->
    <aside class="sidebar" :class="{ 'm-open': drawerOpen }">
      <div class="brand">
        <div class="ava" title="点击更换头像" @click="onAvatarClick"><img class="js-avatar" :src="avatarSrc" alt="头像"/><span class="cam" v-html="icon('camera', 18)"></span></div>
        <input type="file" accept="image/*" hidden ref="avatarInputRef" @change="onAvatarChange"/>
        <div><h1 id="brandName">{{ CONFIG.owner }}</h1><p id="brandSlogan">{{ CONFIG.slogan }}</p></div>
      </div>
      <nav class="nav">
        <a class="navi" :class="{ active: view === 'home' }" @click="go('home', $event)"><span v-html="icon('home', 19)"></span>首页</a>
        <div class="nav-sep">功能模块</div>
        <a v-for="m in primaryModules" :key="m.key" class="navi" :class="{ active: view === m.key }" @click="go(m.key, $event)"><span v-html="icon(m.icon, 19)"></span>{{ m.name }}</a>
        <a href="#exercise-atlas" class="navi" :class="{ active: view === 'exerciseAtlas' }" @click.prevent="go('exerciseAtlas', $event)"><span v-html="icon('activity', 19)"></span>运动总览</a>
        <details>
          <summary class="navi">更多模块</summary>
          <a v-for="m in collapsedModules" :key="m.key" class="navi" :class="{ active: view === m.key }" @click="go(m.key, $event)"><span v-html="icon(m.icon, 19)"></span>{{ m.name }}</a>
        </details>
        <div class="nav-sep">统计</div>
        <a class="navi" :class="{ active: view === 'insight' }" @click="go('insight', $event)"><span v-html="icon('chart', 19)"></span>洞察复盘</a>
        <div class="nav-sep">配置</div>
        <a class="navi" :class="{ active: view === 'settings' }" @click="go('settings', $event)"><span v-html="icon('settings', 19)"></span>个人配置</a>
      </nav>
      <div class="sync-area" id="syncArea">
        <span class="sync-indicator sync-off" id="sync-indicator" @click="onSyncIndicatorClick">本地模式</span>
        <span class="sync-user-email" id="syncEmail"></span>
        <button class="sync-now" id="sync-now" type="button" @click="syncNow">立即同步</button>
        <div class="backup-actions"><button class="sync-now" id="backup-export" ref="backupExportRef" type="button">导出备份</button><button class="sync-now" id="backup-import" ref="backupImportRef" type="button">导入备份</button></div>
        <input id="backup-input" ref="backupInputRef" type="file" accept="application/json,.json" hidden>
      </div>
      <div class="foot" id="foot">猫咪编辑部 · 云端同步版</div>
    </aside>
    <!-- 主视区：切换模块时整块重建，靠 .view-swap 的入场动画把切换变成一次淡入，而不是硬闪 -->
    <main class="main">
      <div class="view-swap" :key="view">
        <component :is="current" :key="view" @navigate="onNavigate" />
      </div>
    </main>
    <!-- 移动底栏（≤820px 显示） -->
    <nav class="m-tabs">
      <button type="button" :class="{ active: view === 'home' }" @click="go('home', $event)"><span v-html="icon('home', 19)"></span>首页</button>
      <button type="button" :class="{ active: view === 'sport' }" @click="go('sport', $event)"><span v-html="icon('activity', 19)"></span>运动</button>
      <button type="button" :class="{ active: view === 'insight' }" @click="go('insight', $event)"><span v-html="icon('chart', 19)"></span>洞察</button>
      <button type="button" @click="toggleDrawer(true)"><span v-html="icon('grid', 19)"></span>更多</button>
    </nav>
    <!-- 抽屉遮罩 -->
    <div class="m-scrim" :class="{ open: drawerOpen }" @click="toggleDrawer(false)"></div>
  </div>
</template>
