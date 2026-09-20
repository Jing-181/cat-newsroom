// 认证状态 UI：侧栏同步邮箱展示（主站 updateAuthUI 的独立版）
export function updateAuthUI() {
  const user = window.getCurrentUser?.();
  const emailEl = document.getElementById("syncEmail");
  if (!emailEl) return;
  if (user && user.email) {
    const username = user.email.split("@")[0];
    emailEl.textContent = username;
  } else if (user && user.is_anonymous) {
    emailEl.textContent = "匿名用户 · 点击登录升级";
  } else {
    emailEl.textContent = "";
  }
}

window.updateAuthUI = updateAuthUI;
