// Vue 入口：副作用导入共享领域库，设置全局 CONFIG/data，
// 桥接 supabase-sync 回调，并初始化应用。
// 同步层与 API 客户端仍是根目录 js/ 下的经典脚本（UMD/IIFE 挂到 window），
// 其余领域库都在 src/lib/ 下，是标准 ESM；与经典脚本之间只剩几个明确契约：
// window.CONFIG / window.data / window.store / window.updateAuthUI / window.DemoData。
import "./styles.css";

// 经典脚本（与主站相同的加载顺序与全局契约，顺序不要动）
import "../js/sync-core.js";       // window.SyncCore
import "../js/api-client.js";      // window.ApiClient

// 领域库：都是纯定义、不依赖加载顺序，消费方（视图 / 其他 lib）也各自直接 import，
// 这里列全是让入口处保留一份完整的模块清单
import "./lib/app-dialog.js";
import "./lib/data-backup.js";
import "./lib/device-mode.js";
import "./lib/record-list.js";
import "./lib/record-media.js";
import "./lib/toast.js";
import "./lib/workout-catalog.js"; // 训练日与动作库
import "./lib/workout.js";         // 训练领域逻辑
import "./lib/workout-plan.js";    // 训练计划生成与进度
import "./lib/workout-view.js";    // 训练界面模板
import "./lib/workout-ui.js";      // 训练界面控制器

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

import { createAppRouter } from './lib/app-router.js';
import { settleAuthCallback, cleanAuthCallbackUrl } from './lib/route-auth.js';

async function bootstrap() {
  const callback = await settleAuthCallback({
    location: window.location,
    initialize: options => window.initSupabase?.({ authCallback:true, ...options }),
    beforeActivate: () => history.replaceState(history.state, '', cleanAuthCallbackUrl(window.location)),
  });
  if (!callback.ready) {
    // Keep callback URL intact for retry; never hand tokens/errors to router or display them.
    const root = document.querySelector('#app');
    const message = document.createElement('p'); message.textContent = '登录回调尚未完成。请检查网络后重试；业务记录未同步；登录会话可能已由认证服务保存。';
    const retry = document.createElement('button'); retry.textContent = '重新加载并重试'; retry.onclick = () => window.location.reload();
    root.replaceChildren(message,retry);
    return;
  }
  const router = createAppRouter();
  router.onError(() => { /* Caller shows generic retry message; never log URL or callback payload. */ });
  const app = createApp(App); app.use(router);
  try { await router.isReady(); }
  catch {
    const root=document.querySelector('#app'),text=document.createElement('p'),retry=document.createElement('button');
    text.textContent='页面资源加载失败，请检查网络后刷新。';retry.textContent='刷新';retry.onclick=()=>window.location.reload();root.replaceChildren(text,retry);return;
  }
  app.mount('#app');
  // Ordinary deep links/offline startup mount before any network authentication.
  const ok = callback.callback || await window.initSupabase?.();
  if (ok) {
    const cd = await window.runFullSync?.({ reason: "page_init" });
    if (cd) {
      bump();
      if (typeof window.updateAuthUI === "function") window.updateAuthUI();
    }
  }
}
void bootstrap();
