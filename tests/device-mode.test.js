const test = require("node:test");
const assert = require("node:assert/strict");
const mode = require("../js/device-mode.js");

test("自动模式按视口与输入能力选择界面", () => {
  assert.equal(mode.resolveMode({ preference: "auto", width: 390, coarsePointer: true }), "mobile");
  assert.equal(mode.resolveMode({ preference: "auto", width: 1440, coarsePointer: false }), "desktop");
  assert.equal(mode.resolveMode({ preference: "auto", width: 900, coarsePointer: true }), "mobile");
});

test("手动偏好优先于自动判断", () => {
  assert.equal(mode.resolveMode({ preference: "desktop", width: 390, coarsePointer: true }), "desktop");
  assert.equal(mode.resolveMode({ preference: "mobile", width: 1440, coarsePointer: false }), "mobile");
});

test("移动端页面使用移动模式标识", () => {
  const fs = require("node:fs");
  const html = fs.readFileSync(require.resolve("../workbench-mobile.html"), "utf8");
  assert.match(html, /<body class="mobile-shell">/);
  assert.match(html, /redirectIfNeeded\("mobile"\)/);
  assert.match(html, /mountSwitcher\(document\.getElementById\("device-switcher"\), "mobile"/);
});
