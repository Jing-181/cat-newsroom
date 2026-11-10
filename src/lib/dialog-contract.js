// 弹窗关闭契约：只管「关掉会发生什么」，不管长相。
// 四类形态各自用自己的 DOM 与 CSS，这里把 Esc、点遮罩、[data-layer-close]、
// 调 requestClose() 四条路收到同一个出口；表单有改动时暗路先问一句。
import AppDialog from "./app-dialog.js";
import { lockPageScroll, focusWithoutScroll } from "./mobile-viewport.js";

const stack = [];
const EXIT_FALLBACK_MS = 400;

export function bindLayer({
  element, onClose, closeValue, isDirty = () => false,
  confirmDiscard = false, initialFocus,
} = {}) {
  const previous = document.activeElement;
  const unlock = lockPageScroll();
  let phase = "open";
  let fallback = 0;
  stack.push(element);

  function finish() {
    if (phase === "closed") return;
    phase = "closed";
    clearTimeout(fallback);
    element.removeEventListener("animationend", onEnd);
    if (element.tagName === "DIALOG" && element.open) element.close();
    element.remove();
    const wasTop = stack.at(-1) === element;
    const at = stack.lastIndexOf(element);
    if (at >= 0) stack.splice(at, 1);
    document.removeEventListener("keydown", onKeydown, true);
    unlock();
    if (wasTop) focusWithoutScroll(previous);
  }

  function onEnd(event) {
    if (event.target !== element || event.pseudoElement) return; // 子元素与 ::backdrop 的动画不算
    finish();
  }

  function exit(value) {
    if (phase !== "open") return;
    phase = "closing";
    onClose?.(value); // 业务状态立刻落地，不等离场动画
    element.classList.add("is-closing");
    element.addEventListener("animationend", onEnd);
    fallback = setTimeout(finish, EXIT_FALLBACK_MS);
  }

  function requestClose(value = closeValue) {
    if (phase !== "open") return;
    if (confirmDiscard && isDirty()) {
      AppDialog.confirm("放弃未保存的修改？", {
        title: "未保存的修改", danger: true, okText: "放弃", cancelText: "继续编辑",
      }).then(ok => { if (ok) exit(value); });
      return;
    }
    exit(value);
  }

  function onKeydown(event) {
    if (event.key !== "Escape" || stack.at(-1) !== element) return; // 只响应最上层
    event.preventDefault();
    requestClose();
  }

  if (element.tagName === "DIALOG") {
    element.addEventListener("cancel", event => { event.preventDefault(); requestClose(); });
  } else {
    document.addEventListener("keydown", onKeydown, true);
  }
  element.addEventListener("click", event => {
    const closer = event.target.closest?.("[data-layer-close]");
    if (closer && element.contains(closer)) { requestClose(); return; }
    if (event.target === element) requestClose(); // 点遮罩
  });
  if (initialFocus) queueMicrotask(() => {
    if (phase !== "open" || stack.at(-1) !== element) return;
    const target = typeof initialFocus === "string" ? element.querySelector(initialFocus) : initialFocus;
    focusWithoutScroll(target || element.querySelector("input, textarea, button"));
  });

  return { requestClose, forceClose: exit, isOpen: () => phase === "open" };
}

export default { bindLayer };
