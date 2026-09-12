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
