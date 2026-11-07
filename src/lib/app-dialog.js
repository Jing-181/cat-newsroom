// 二次确认 / 提示：top-layer 原生 dialog，居中轻卡，一句标题一句说明两个按钮。
// 用原生 dialog 是因为训练页的 <dialog> 在 top-layer，确认框必须也在顶层才看得见。
import { bindLayer } from "./dialog-contract.js";

function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;",
  }[character]));
}

function open(options = {}) {
  const confirmMode = options.type === "confirm";
  const dialog = document.createElement("dialog");
  dialog.className = "sheet-confirm";
  dialog.setAttribute("aria-label", options.title || (confirmMode ? "请确认" : "提示"));
  dialog.innerHTML = `
    <h2>${esc(options.title || (confirmMode ? "请确认" : "提示"))}</h2>
    <p class="sub">${esc(options.message || "")}</p>
    <div class="modal-actions">
      ${confirmMode ? `<button type="button" class="btn ghost" data-layer-close>${esc(options.cancelText || "取消")}</button>` : ""}
      <button type="button" class="btn ${options.danger ? "danger" : ""}" data-dialog-ok>${esc(options.okText || "知道了")}</button>
    </div>`;
  document.body.appendChild(dialog);
  dialog.showModal();

  const layer = bindLayer({
    element: dialog,
    closeValue: confirmMode ? false : undefined,
    confirmDiscard: false, // 确认框本身就是「问」，不再套一层问
    initialFocus: confirmMode ? "[data-layer-close]" : "[data-dialog-ok]",
    onClose: value => options.onClose?.(value),
  });
  dialog.querySelector("[data-dialog-ok]").addEventListener("click", () => layer.requestClose(confirmMode ? true : undefined));
  return { overlay: dialog, close: layer.requestClose };
}

export function confirm(message, options = {}) {
  return new Promise(resolve => open({ ...options, type: "confirm", message, onClose: resolve }));
}

export function alert(message, options = {}) {
  return new Promise(resolve => open({ ...options, type: "alert", message, onClose: resolve }));
}

const AppDialog = { confirm, alert };
export default AppDialog;
