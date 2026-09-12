const test = require("node:test");
const assert = require("node:assert/strict");
const pomo = require("../js/pomodoro.js");

test("番茄钟使用绝对结束时间计算剩余时间", () => {
  const state = pomo.createRunning("focus", 1000);
  assert.equal(pomo.remainingSec(state, 61_000), 1440);
});

test("暂停和继续保持剩余时间", () => {
  const state = pomo.createRunning("focus", 0);
  const paused = pomo.pause(state, 10_000);
  assert.equal(paused.pausedRemainSec, 1490);
  const resumed = pomo.resume(paused, 30_000);
  assert.equal(pomo.remainingSec(resumed, 35_000), 1485);
});
