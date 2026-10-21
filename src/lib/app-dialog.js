// 统一应用内确认与提示弹窗，替代浏览器原生对话框。
//
// ESM 模块：import { confirm, alert } from "./app-dialog.js"。

function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
  }[character]));
}

function open(options = {}) {
  const confirmMode = options.type === "confirm";
  const overlay = document.createElement("div");
  overlay.className = "overlay app-dialog-overlay";
  overlay.innerHTML = `<div class="modal app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" aria-describedby="app-dialog-message">
    <div class="grab"></div>
    <div class="app-dialog-mark ${confirmMode ? "is-confirm" : "is-alert"}">${confirmMode ? "?" : "!"}</div>
    <h2 id="app-dialog-title">${esc(options.title || (confirmMode ? "请确认" : "提示"))}</h2>
    <div class="sub" id="app-dialog-message">${esc(options.message || "")}</div>
    <div class="modal-actions">
      ${confirmMode ? `<button type="button" class="btn ghost" data-dialog-cancel>${esc(options.cancelText || "取消")}</button>` : ""}
      <button type="button" class="btn ${options.danger ? "danger" : ""}" data-dialog-ok>${esc(options.okText || "知道了")}</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  const dialog = overlay.querySelector(".app-dialog");
  const ok = overlay.querySelector("[data-dialog-ok]");
  const cancel = overlay.querySelector("[data-dialog-cancel]");
  let settled = false;
  const close = value => {
    if (settled) return;
    settled = true;
    overlay.remove();
    options.onClose?.(value);
    return value;
  };
  ok.addEventListener("click", () => close(confirmMode ? true : undefined));
  cancel?.addEventListener("click", () => close(false));
  overlay.addEventListener("click", event => {
    if (confirmMode && event.target === overlay) close(false);
  });
  dialog.addEventListener("keydown", event => {
    if (event.key === "Escape" && confirmMode) close(false);
    if (event.key === "Enter" && event.target === dialog) close(confirmMode ? true : undefined);
  });
  queueMicrotask(() => (confirmMode ? cancel : ok)?.focus());
  return { overlay, close };
}

export function confirm(message, options = {}) {
  return new Promise(resolve => open({ ...options, type: "confirm", message, onClose: resolve }));
}

export function alert(message, options = {}) {
  return new Promise(resolve => open({ ...options, type: "alert", message, onClose: resolve }));
}

const AppDialog = { confirm, alert };
export default AppDialog;
