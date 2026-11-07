// 登录 / 注册：小卡，切 Tab 不重建 DOM，空提交指到缺的那一格。
import { bindLayer } from "./dialog-contract.js";

export function openAuthModal(mode) {
  let isLogin = mode === "login";
  let dirty = false;
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `<div class="modal auth-modal" role="dialog" aria-modal="true" aria-label="登录或注册账号">
    <h3 id="auth-title">登录账号</h3>
    <p class="sub" id="auth-sub">登录后数据自动云端同步</p>
    <div class="auth-tabs">
      <button type="button" class="auth-tab" data-t="signup" aria-pressed="false">注册</button>
      <button type="button" class="auth-tab" data-t="login" aria-pressed="true">登录</button>
    </div>
    <div class="field"><label>用户名</label><input id="auth-email" type="text" placeholder="输入用户名" autocomplete="username"/></div>
    <div class="field"><label>密码</label><input id="auth-pass" type="password" placeholder="至少 6 位" autocomplete="current-password"/></div>
    <div class="sheet-error" id="auth-error" hidden></div>
    <div class="modal-actions">
      <button type="button" class="btn ghost" data-layer-close>取消</button>
      <button type="button" class="btn" id="auth-submit">登录</button>
    </div>
    <p class="auth-hint">不登录也能用，数据存在本机；登录后自动同步到云端。</p>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("input", () => { dirty = true; });

  const layer = bindLayer({
    element: overlay,
    confirmDiscard: true,
    isDirty: () => dirty,
    initialFocus: "#auth-email",
    onClose: () => { dirty = false; },
  });
  const modal = overlay.querySelector(".auth-modal");

  const sync = () => {
    modal.querySelector("#auth-title").textContent = isLogin ? "登录账号" : "注册账号";
    modal.querySelector("#auth-submit").textContent = isLogin ? "登录" : "注册";
    modal.querySelectorAll(".auth-tab").forEach(tab => {
      const on = (tab.dataset.t === "login") === isLogin;
      tab.classList.toggle("on", on);
      tab.setAttribute("aria-pressed", String(on));
    });
  };
  sync();
  modal.querySelectorAll(".auth-tab").forEach(tab => tab.onclick = () => {
    isLogin = tab.dataset.t === "login";
    sync();
  });

  const error = modal.querySelector("#auth-error");
  const submit = modal.querySelector("#auth-submit");
  submit.onclick = async () => {
    const email = modal.querySelector("#auth-email");
    const pass = modal.querySelector("#auth-pass");
    const username = email.value.trim();
    if (!username || !pass.value) {
      error.textContent = username ? "请填写密码" : "请填写用户名";
      error.hidden = false;
      (username ? pass : email).focus();
      return;
    }
    error.hidden = true;
    submit.textContent = "处理中…";
    submit.disabled = true;
    const fn = isLogin ? window.signIn : window.signUp;
    const { error: failure } = await fn(username, pass.value);
    if (failure) {
      submit.textContent = isLogin ? "登录" : "注册";
      submit.disabled = false;
      error.textContent = failure.message || "操作失败，请重试";
      error.hidden = false;
    } else {
      dirty = false; // 登录成功不该再问「放弃未保存的修改」
      layer.forceClose();
    }
  };
}

export default { openAuthModal };
