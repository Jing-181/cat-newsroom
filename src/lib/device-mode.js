// 视图记忆：记住用户上次停留的模块（sessionStorage），并保留视口判定规则。
//
// ESM 模块：import DeviceMode from "./device-mode.js"。
// 旧的 auto / desktop / mobile 界面偏好、device-switcher 与 HTML 跳转已随响应式单页化退役：
// 现在窄屏外壳由 CSS 媒体查询切换，localStorage 里的 cat-newsroom-ui-mode-v1 不再读取。

const VIEW_KEY = "cat-newsroom-last-view-v1";

// 纯函数：按视口宽度与输入能力判定该用哪种外壳（当前由 CSS 承担，保留规则供判定与测试复用）
export function resolveMode(options = {}) {
  const valid = new Set(["auto", "desktop", "mobile"]);
  const preference = valid.has(options.preference) ? options.preference : "auto";
  if (preference !== "auto") return preference;
  const width = Number(options.width || 0);
  return width <= 820 || (Boolean(options.coarsePointer) && width <= 1024) ? "mobile" : "desktop";
}

export function saveView(view, storage = window.sessionStorage) {
  if (view) storage.setItem(VIEW_KEY, view);
}

export function restoreView(storage = window.sessionStorage) {
  return storage.getItem(VIEW_KEY) || "home";
}

const DeviceMode = { VIEW_KEY, resolveMode, saveView, restoreView };
export default DeviceMode;
