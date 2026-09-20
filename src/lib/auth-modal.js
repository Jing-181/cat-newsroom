// 登录/注册弹窗（与主站一致），并回填周报里的登录入口
import { esc } from "./icons.js";
import { openAuthModalRef } from "./weekly-report.js";

export function openAuthModal(mode) {
  const overlay = document.createElement("div"); overlay.className = "overlay";
  const isLogin = mode === "login";
  overlay.innerHTML = `<div class="modal auth-modal"><h3>${isLogin ? "登录账号" : "注册账号"}</h3>
    <div class="sub">登录后数据自动云端同步，多设备共享</div>
    <div class="auth-tabs"><div class="auth-tab ${isLogin ? "" : "on"}" data-t="signup">注册</div><div class="auth-tab ${isLogin ? "on" : ""}" data-t="login">登录</div></div>
    <div class="field"><label>用户名</label><input id="auth-email" type="text" placeholder="输入用户名" autocomplete="username"/></div>
    <div class="field"><label>密码</label><input id="auth-pass" type="password" placeholder="至少 6 位" autocomplete="current-password"/></div>
    <div class="modal-actions"><div class="spacer"></div><button class="btn ghost" id="auth-cancel">取消</button><button class="btn" id="auth-submit">${isLogin ? "登录" : "注册"}</button></div>
    <div class="auth-hint"><b>匿名模式</b>：不登录也能用，数据存在本机。登录后自动同步到云端，换设备也不丢。</div></div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) close(); };
  overlay.querySelectorAll(".auth-tab").forEach(t => t.onclick = () => {
    const m = t.dataset.t; overlay.remove(); openAuthModal(m);
  });
  overlay.querySelector("#auth-cancel").onclick = close;
  overlay.querySelector("#auth-submit").onclick = async () => {
    const username = overlay.querySelector("#auth-email").value.trim();
    const pass = overlay.querySelector("#auth-pass").value;
    if (!username || !pass) return;
    const btn = overlay.querySelector("#auth-submit");
    btn.textContent = "处理中…"; btn.disabled = true;
    const fn = isLogin ? window.signIn : window.signUp;
    const { error } = await fn(username, pass);
    if (error) {
      btn.textContent = isLogin ? "登录" : "注册"; btn.disabled = false;
      const sub = overlay.querySelector(".sub");
      sub.textContent = error.message || "操作失败，请重试"; sub.style.color = "var(--danger)";
    } else { close(); }
  };
}

// 周报卡片的「登录账号」入口复用同一个弹窗
openAuthModalRef.current = openAuthModal;
