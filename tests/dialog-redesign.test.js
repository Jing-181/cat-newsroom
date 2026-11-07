import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("关闭契约：四条路一个出口，暗路有改动先问，快速连点幂等", () => {
  const contract = read("src/lib/dialog-contract.js");
  assert.match(contract, /addEventListener\("cancel"/);
  assert.match(contract, /onKeydown/);
  assert.match(contract, /data-layer-close/);
  assert.match(contract, /event\.target === element\) requestClose\(\)/);
  assert.match(contract, /confirmDiscard && isDirty\(\)/);
  assert.match(contract, /放弃未保存的修改/);
  assert.match(contract, /if \(phase !== "open"\) return/);
  assert.match(contract, /stack\.at\(-1\) !== element/, "Esc 只响应最上层");
  assert.match(contract, /forceClose: exit/, "保存成功可跳过弃稿确认");
  assert.match(contract, /animationend/);
  assert.match(contract, /EXIT_FALLBACK_MS/);
  assert.match(contract, /previous.*focus/, "关闭后焦点还位");
});

test("确认 / 提示：top-layer 原生 dialog，轻卡去装饰，不再和表单共用一张卡", () => {
  const app = read("src/lib/app-dialog.js");
  assert.match(app, /createElement\("dialog"\)/);
  assert.match(app, /showModal\(\)/);
  assert.match(app, /bindLayer/);
  assert.match(app, /confirmDiscard: false/, "确认框本身就是问，不套第二层");
  assert.match(app, /export function confirm/);
  assert.match(app, /export function alert/);
  assert.doesNotMatch(app, /app-dialog-mark|\.grab|overlay\.remove\(\)/, "去掉装饰图标与旧骨架");
  const css = read("css/app-dialog.css");
  assert.match(css, /dialog\.sheet-confirm \{[^}]*position: fixed;[^}]*margin: auto;[^}]*height: fit-content;/s);
  assert.match(css, /width: min\(340px/, "明显小于表单弹窗");
  assert.match(css, /sheet-confirm-out/, "确认框有自己的离场");
});

test("登录：小卡，Tab 不重建，错误有专位，空提交有提示", () => {
  const auth = read("src/lib/auth-modal.js");
  assert.match(auth, /bindLayer/);
  assert.match(auth, /confirmDiscard: true/);
  assert.match(auth, /initialFocus: "#auth-email"/);
  assert.doesNotMatch(auth, /openAuthModal\(m\)|overlay\.remove\(\); openAuthModal/);
  assert.match(auth, /aria-pressed/);
  assert.match(auth, /sheet-error/);
  assert.match(auth, /请填写用户名/);
  assert.match(auth, /dirty = false;[\s\S]*layer\.forceClose\(\)/, "登录成功不误问弃稿");
});

test("记录编辑：三区保留，字段分组，图片预设默认可见，删除统一先问", () => {
  const editor = read("src/lib/editor.js");
  assert.match(editor, /bindLayer/);
  assert.match(editor, /confirmDiscard: true/);
  assert.match(editor, /initialFocus: "#f-title"/);
  assert.match(editor, /form-essential/);
  assert.match(editor, /form-advanced/);
  assert.match(editor, /id="f-media-advanced">/, "默认图不再藏在第二层点击后面");
  assert.match(editor, /export async function confirmDelete/);
  assert.match(editor, /删除这条记录？/);
  assert.match(editor, /cancelText: "保留"/);
  const moduleView = read("src/components/ModuleView.vue");
  assert.match(moduleView, /confirmDelete\(props\.moduleKey/, "记录卡删除走同一个确认入口");
});

test("四类形态各定各的：训练弹窗保持独立，样式入口引入表单样式", () => {
  const forms = read("css/dialog-forms.css");
  assert.match(forms, /\.overlay\.is-closing/);
  assert.match(forms, /@keyframes modal-out/);
  assert.match(forms, /\.auth-modal \{ width: 360px/);
  const workout = read("src/lib/workout-ui.js");
  assert.match(workout, /showModal\(\)/);
  assert.match(workout, /is-list/, "动作库的头固定单滚动区保持");
  assert.doesNotMatch(workout, /bindLayer/, "训练弹窗不套通用契约");
  assert.match(workout, /cancelText:"保留"/, "删除问法对齐");
  const styles = read("src/styles.css");
  assert.match(styles, /@import "\.\.\/css\/dialog-forms\.css";/);
});

test("零依赖", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.deepEqual(Object.keys(pkg.dependencies), ["vue"]);
});
