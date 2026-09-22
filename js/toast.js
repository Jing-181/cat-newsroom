// 轻量 toast 提示：自动消失、不打断操作，用于「复制成功」等只需瞥一眼的反馈，替代模态弹窗。
(function (root) {
  const STYLE_ID = "cat-toast-style";
  const CONTAINER_ID = "cat-toast-container";
  const DURATION = 2000; // 默认展示时长
  const MAX_VISIBLE = 3; // 同时最多堆叠条数

  function esc(value) {
    return String(value ?? "").replace(/[&<>"]/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
    }[character]));
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #cat-toast-container { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2000;
        display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
      .cat-toast { pointer-events: auto; display: flex; align-items: center; gap: 8px; max-width: min(78vw, 340px);
        padding: 10px 16px; border-radius: 12px; background: var(--surface-card); color: var(--text);
        border: 1px solid var(--border); box-shadow: var(--shadow-overlay);
        font-size: 13px; font-weight: 600; line-height: 1.4;
        animation: cat-toast-in .2s cubic-bezier(.2,.8,.3,1); }
      .cat-toast .cat-toast-ic { display: inline-grid; place-items: center; color: var(--module-1); flex: 0 0 auto; }
      .cat-toast.out { animation: cat-toast-out .18s ease forwards; }
      @keyframes cat-toast-in { from { opacity: 0; transform: translateY(8px) scale(.97); } }
      @keyframes cat-toast-out { to { opacity: 0; transform: translateY(4px) scale(.97); } }
      @media (max-width: 820px) {
        #cat-toast-container { bottom: calc(72px + env(safe-area-inset-bottom)); }
      }`;
    document.head.appendChild(style);
  }

  function show(message, options = {}) {
    ensureStyle();
    let container = document.getElementById(CONTAINER_ID);
    if (!container) {
      container = document.createElement("div");
      container.id = CONTAINER_ID;
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = "cat-toast";
    toast.setAttribute("role", "status");
    if (options.icon) toast.innerHTML = `<span class="cat-toast-ic">${options.icon}</span><span>${esc(message)}</span>`;
    else toast.textContent = message;
    container.appendChild(toast);
    while (container.children.length > MAX_VISIBLE) container.firstElementChild?.remove();
    const dismiss = () => {
      if (toast.classList.contains("out")) return;
      toast.classList.add("out");
      setTimeout(() => toast.remove(), 180);
    };
    setTimeout(dismiss, options.duration ?? DURATION);
    toast.addEventListener("click", dismiss);
    return { dismiss };
  }

  root.Toast = { show };
})(typeof window !== "undefined" ? window : globalThis);
