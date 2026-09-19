const test = require("node:test");
const assert = require("node:assert/strict");
const workoutPlan = require("../js/workout-plan.js");

test("训练计划统一保存为最多六天的版本化记录", () => {
  const result = workoutPlan.normalize({ plan: { days: [
    { day_index: 9, title: "胸", exercises: [{ name: "卧推" }] },
    { title: "背", exercises: [] },
    { title: "腿", exercises: [] },
    { title: "肩", exercises: [] },
    { title: "手臂", exercises: [] },
    { title: "恢复", exercises: [] },
    { title: "多余", exercises: [] },
  ] } }, { start_date: "2026-09-19", timezone: "Asia/Shanghai", preferences: { days_per_week: 3 } });
  assert.equal(result.schema_version, 1);
  assert.equal(result.kind, "workout_plan");
  assert.equal(result.days.length, 6);
  assert.equal(result.days[0].day_index, 9);
  assert.equal(result.days[1].day_index, 2);
  assert.equal(result.start_date, "2026-09-19");
});

test("训练计划可从隔离存储保存和读取", () => {
  const storage = { values: new Map(), getItem(key) { return this.values.get(key) || null; }, setItem(key, value) { this.values.set(key, value); } };
  const plan = workoutPlan.normalize({ days: [{ title: "胸", exercises: [] }] });
  assert.equal(workoutPlan.save(plan, storage), true);
  assert.deepEqual(workoutPlan.load(storage), plan);
  assert.equal(workoutPlan.isValid(workoutPlan.load(storage)), true);
});
