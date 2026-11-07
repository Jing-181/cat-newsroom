import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("弹窗、Tab、折叠箭头、开关统一走设计 token，不再各写一条时长与缓动", () => {
  const desktop = read("src/desktop.css");
  assert.match(desktop, /animation: fade var\(--dur-fast\) var\(--ease-out\)/);
  assert.match(desktop, /animation: pop var\(--dur-base\) var\(--ease-out\)/);
  assert.match(desktop, /\.seg \.opt \{[^}]*transition: all var\(--dur-fast\) var\(--ease-out\)/s);
  assert.match(desktop, /\.modal-fold summary::after \{[^}]*transition:transform var\(--dur-fast\) var\(--ease-out\)/s);
  assert.match(desktop, /\.done-fold summary::after \{[^}]*transition:transform var\(--dur-fast\) var\(--ease-out\)/s);
  assert.match(desktop, /\.switch-track \{[^}]*transition:background var\(--dur-base\) var\(--ease-out\)/s);
  assert.match(desktop, /\.auth-tab \{[^}]*transition:all var\(--dur-fast\) var\(--ease-out\)/s);
  assert.doesNotMatch(desktop, /animation: fade \.16s|animation: pop \.18s|cubic-bezier\(\.2,\.8,\.3,1\)/);
});

test("抽屉、遮罩与底部 Tab 的反馈时长一致，Tab active 不再瞬时跳", () => {
  const responsive = read("src/responsive.css");
  assert.match(responsive, /\.sidebar \{[^}]*transition: transform var\(--dur-base\) var\(--ease-out\)/s);
  assert.match(responsive, /\.m-scrim \{[^}]*transition: opacity var\(--dur-fast\) var\(--ease-out\)/s);
  assert.match(
    responsive,
    /\.m-tabs button \{[^}]*transition: color var\(--dur-fast\) var\(--ease-out\), background-color var\(--dur-fast\) var\(--ease-out\)/s,
    "底部 Tab 的 active 变色要有过渡",
  );
  assert.doesNotMatch(responsive, /\.24s|\.2s ease/);
});

test("Toast 与共享按钮也用同一组 token", () => {
  const toast = read("src/lib/toast.js");
  assert.match(toast, /animation: cat-toast-in var\(--dur-base\) var\(--ease-out\)/);
  assert.match(toast, /animation: cat-toast-out var\(--dur-fast\) var\(--ease-out\) forwards/);
  assert.match(toast, /animationend/, "退场用标准事件跟 CSS 时长对齐，不再人工写毫秒数");
  assert.doesNotMatch(toast, /toast\.remove\(\), 180\)/);
  const components = read("css/components.css");
  assert.match(components, /\.shared-btn \{[^}]*transition: border-color var\(--dur-fast\) var\(--ease-out\)/s);
});

test("token 正本、全局减少动态效果与零依赖都没动", () => {
  const theme = read("css/theme.css");
  assert.match(theme, /--dur-fast: \.15s;/);
  assert.match(theme, /--dur-base: \.22s;/);
  assert.match(theme, /--ease-out: cubic-bezier\(\.16,1,\.3,1\);/);
  const desktop = read("src/desktop.css");
  assert.match(desktop, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(desktop, /animation-duration: \.001ms !important/);
  const pkg = JSON.parse(read("package.json"));
  assert.deepEqual(Object.keys(pkg.dependencies), ["vue"]);
});

test("设计系统正本写清了浮层分工", () => {
  const doc = read("docs/design-system.md");
  assert.match(doc, /浮层分工/);
  assert.match(doc, /--dur-base/);
  assert.match(doc, /--dur-fast/);
});
