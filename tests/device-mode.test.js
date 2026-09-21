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

test("旧版移动端入口已退役并跳转到最新版", () => {
  const fs = require("node:fs");
  const html = fs.readFileSync(require.resolve("../workbench-mobile.html"), "utf8");
  assert.match(html, /url=\.\/index\.html/);
  assert.match(html, /location\.replace\("\.\/index\.html"\)/);
  assert.doesNotMatch(html, /mobile-shell/, "旧版移动外壳已随退役移除");
});
