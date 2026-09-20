// 番茄钟：共享状态 + 全局控制器（一次挂载，首页与全站共用）
import { CONFIG } from "./config.js";
import { getData, bump } from "./store.js";
import { pad2 } from "./utils.js";

export const pomo = { running: false, remain: 25 * 60, total: 25 * 60 };

let controller = null;

export function ensurePomodoroController() {
  if (controller || typeof window.Pomodoro === "undefined") return controller;
  controller = window.Pomodoro.mount({
    onComplete: async durationSec => {
      const data = getData();
      data.__pomo = data.__pomo || { count: 0, min: 0 };
      data.__pomo.count++; data.__pomo.min += Math.round(durationSec / 60);
      window.WorkbenchCore?.saveMeta?.(CONFIG.storageKey, data, "__pomo", data.__pomo);
      bump();
    },
    onState: state => {
      pomo.running = !!(state && state.status === "running");
      pomo.remain = state?.remain ?? pomo.total;
      pomoUpdate();
    },
  });
  return controller;
}

// 更新首页番茄钟 DOM（页面不在时静默跳过）
export function pomoUpdate() {
  const t = document.getElementById("pomo-time");
  if (t) t.textContent = `${pad2(Math.floor(pomo.remain / 60))}:${pad2(pomo.remain % 60)}`;
  const fg = document.getElementById("pomo-fg");
  if (fg) { const r = 64, c = 2 * Math.PI * r; fg.style.strokeDashoffset = c * (1 - pomo.remain / pomo.total); }
  const st = document.getElementById("pomo-status");
  if (st) st.textContent = pomo.running ? "专注中" : "已暂停";
  const b = document.getElementById("pomo-toggle");
  if (b) b.textContent = pomo.running ? "暂停" : "开始";
}
