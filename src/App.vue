<script setup>
// 应用外壳：侧栏（品牌/导航/同步区/备份/设备切换）+ 主视区（按导航切换模块组件）
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
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
import { useRoute, useRouter, RouterView } from 'vue-router';
import { moduleRoutes } from './lib/app-router.js';
import AssistantCrew from './components/AssistantCrew.vue';

const route = useRoute(), router = useRouter();
const primaryModules = CONFIG.modules.filter(m => isPrimaryModule(m.key));
const collapsedModules = CONFIG.modules.filter(m => COLLAPSED_MODULE_KEYS.includes(m.key));
const view = computed(() => route.meta.module || 'home');
let unmountLeafShade = null;
let inkPoint = { x: 0, y: 0 };
let transition;
const canViewTransition = () => typeof document.startViewTransition === 'function' && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
function go(key, event) {
  if (!moduleRoutes.some(([name]) => name === key)) return;
  inkPoint = { x: event?.clientX || window.innerWidth/2, y: event?.clientY || window.innerHeight*.78 };
  const navigate = async () => {
    try { await router.push({ name:key }); await nextTick(); }
    catch { Toast.show('页面暂时无法加载，请检查网络后刷新重试'); }
  };
  if (!canViewTransition()) { void navigate(); return; }
  transition?.skipTransition();
  transition = document.startViewTransition(navigate);
  const activeTransition = transition;
  transition.ready.then(() => {
    if (transition !== activeTransition) return;
    const {x,y}=inkPoint;
    const radius=Math.hypot(Math.max(x,window.innerWidth-x),Math.max(y,window.innerHeight-y));
    document.documentElement.animate({clipPath:[`circle(0px at ${x}px ${y}px)`,`circle(${radius}px at ${x}px ${y}px)`]}, {duration:420,easing:"cubic-bezier(.22,.72,.2,1)",fill:"both",pseudoElement: "::view-transition-new(root)"});
  }).catch(()=>{});
  transition.finished.finally(()=>{ if (transition === activeTransition) transition=null; }).catch(()=>{});
}
function navClick(key, event) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault(); go(key,event);
}
function onNavigate(key) { go(key); }
watch(() => route.fullPath, () => {
  drawerOpen.value = false;
  try { DeviceMode.saveView(view.value); } catch { /* storage unavailable must not block navigation */ }
}, { flush:'post' });

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
  transition?.skipTransition();
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
      <AssistantCrew compact toolbar :module="view" @navigate="onNavigate" />
    </header>
    <!-- sidebar（PC 常驻；窄屏收起为抽屉） -->
    <aside class="sidebar" :class="{ 'm-open': drawerOpen }">
      <div class="brand">
        <div class="ava" title="点击更换头像" @click="onAvatarClick"><img class="js-avatar" :src="avatarSrc" alt="头像"/><span class="cam" v-html="icon('camera', 18)"></span></div>
        <input type="file" accept="image/*" hidden ref="avatarInputRef" @change="onAvatarChange"/>
        <div><h1 id="brandName">{{ CONFIG.owner }}</h1><p id="brandSlogan">{{ CONFIG.slogan }}</p></div>
      </div>
      <nav class="nav">
        <a :href="router.resolve({name:'home'}).href" class="navi" :class="{ active: view === 'home' }" @click="navClick('home', $event)"><span v-html="icon('home', 19)"></span>首页</a>
        <div class="nav-sep">功能模块</div>
        <a v-for="m in primaryModules" :key="m.key" :href="router.resolve({name:m.key}).href" class="navi" :class="{ active: view === m.key }" @click="navClick(m.key, $event)"><span v-html="icon(m.icon, 19)"></span>{{ m.name }}</a>
        <a :href="router.resolve({name:'timeline'}).href" class="navi" :class="{ active: view === 'timeline' }" @click="navClick('timeline', $event)"><span v-html="icon('calendar', 19)"></span>生活时间线</a>
        <details>
          <summary class="navi">更多模块</summary>
          <a v-for="m in collapsedModules" :key="m.key" :href="router.resolve({name:m.key}).href" class="navi" :class="{ active: view === m.key }" @click="navClick(m.key, $event)"><span v-html="icon(m.icon, 19)"></span>{{ m.name }}</a>
        </details>
        <div class="nav-sep">统计</div>
        <a :href="router.resolve({name:'insight'}).href" class="navi" :class="{ active: view === 'insight' }" @click="navClick('insight', $event)"><span v-html="icon('chart', 19)"></span>洞察复盘</a>
        <div class="nav-sep">配置</div>
        <a :href="router.resolve({name:'settings'}).href" class="navi" :class="{ active: view === 'settings' }" @click="navClick('settings', $event)"><span v-html="icon('settings', 19)"></span>个人配置</a>
      </nav>
      <!-- 助手归入导航，让各模块直接从内容标题开始。 -->
      <AssistantCrew class="sidebar-assistant" compact :module="view" @navigate="onNavigate" />
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
        <RouterView v-slot="{ Component }"><component :is="Component" :key="view" @navigate="onNavigate" /></RouterView>
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
