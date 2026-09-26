const test = require("node:test");
const assert = require("node:assert/strict");
const plan = require("../js/workout-plan.js");
const workout = require("../js/workout.js");

function fakeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
  };
}

function completedSession(date, entries) {
  const session = workout.createSession("chest", new Date(date));
  session.status = "completed";
  session.exercises = entries.map(([exerciseId, sets]) => ({
    id: `ex-${exerciseId}`, exercise_id: exerciseId, name: exerciseId,
    body_part: "胸", equipment: "杠铃", sets,
  }));
  return session;
}

test("生成 2 轮 × 3 天 PPL 结构", () => {
  const result = plan.generatePlan({ preferences: { goal: "hypertrophy" }, records: [] });
  assert.equal(result.days.length, 6);
  const splits = result.days.map(d => d.split_day);
  assert.deepEqual(splits, ["push", "pull", "legs", "push", "pull", "legs"]);
  assert.deepEqual(result.days.map(d => d.round), [1, 1, 1, 2, 2, 2]);
  assert.deepEqual(result.days.map(d => d.training_day), ["chest", "back", "legs", "chest", "back", "legs"]);
  assert.equal(result.days[0].title, "力量训练·推 · 第 1 轮");
  assert.equal(result.days[3].title, "力量训练·推 · 第 2 轮");
});

test("每天 4 复合 + 2 孤立，第 2 轮复合相同、孤立替换", () => {
  const result = plan.generatePlan({ preferences: { goal: "hypertrophy" }, records: [] });
  for (const day of result.days) {
    assert.equal(day.exercises.length, 6);
  }
  const first = result.days[0], second = result.days[3];
  const firstCompounds = first.exercises.slice(0, 4).map(e => e.exercise_id);
  const secondCompounds = second.exercises.slice(0, 4).map(e => e.exercise_id);
  assert.deepEqual(secondCompounds, firstCompounds);
  const firstIsolation = first.exercises.slice(4).map(e => e.exercise_id);
  const secondIsolation = second.exercises.slice(4).map(e => e.exercise_id);
  assert.ok(secondIsolation.some(id => !firstIsolation.includes(id)), "第 2 轮孤立应有替换");
  assert.ok(first.exercises.every(e => e.sets === 4 || e.sets === 3));
});

test("动作名从目录补齐且顺序为 1..6", () => {
  const result = plan.generatePlan({ preferences: {}, records: [] });
  for (const day of result.days) {
    day.exercises.forEach((e, index) => {
      assert.ok(e.name.length > 0, `${e.exercise_id} 应有动作名`);
      assert.equal(e.order, index + 1);
    });
  }
});

test("全部练满且 RPE≤8 → 建议 +2.5kg", () => {
  const records = [completedSession("2026-09-10", [["barbell_bench_press", [
    { weight_kg: 50, reps: 10, rpe: 8 },
    { weight_kg: 50, reps: 9, rpe: 7 },
  ]]])];
  const result = plan.generatePlan({ preferences: {}, records });
  const bench = result.days[0].exercises.find(e => e.exercise_id === "barbell_bench_press");
  assert.equal(bench.weight_kg, 52.5);
});

test("练满但 RPE≥9 → 维持上次重量", () => {
  const records = [completedSession("2026-09-10", [["barbell_bench_press", [
    { weight_kg: 50, reps: 10, rpe: 8 },
    { weight_kg: 50, reps: 6, rpe: 9 },
  ]]])];
  const result = plan.generatePlan({ preferences: {}, records });
  const bench = result.days[0].exercises.find(e => e.exercise_id === "barbell_bench_press");
  assert.equal(bench.weight_kg, 50);
});

test("没练满计划组数（记录组数 < planned_sets）→ 维持上次重量", () => {
  const records = [completedSession("2026-09-10", [["barbell_bench_press", [
    { weight_kg: 50, reps: 10 },
    { weight_kg: 50, reps: 9 },
  ]]])];
  // 上次打算练 3 组，实际只留下 2 组记录（有一组删掉了），视为没练满。
  records[0].exercises[0].planned_sets = 3;
  const result = plan.generatePlan({ preferences: {}, records });
  const bench = result.days[0].exercises.find(e => e.exercise_id === "barbell_bench_press");
  assert.equal(bench.weight_kg, 50);
});

test("无历史 → 建议重量为空", () => {
  const result = plan.generatePlan({ preferences: {}, records: [] });
  assert.equal(result.days[0].exercises[0].weight_kg, null);
});

test("上肢动作全部练满但未填 RPE → 仍 +2.5kg（少记 RPE 场景）", () => {
  const records = [completedSession("2026-09-10", [["barbell_bench_press", [
    { weight_kg: 50, reps: 10 },
    { weight_kg: 50, reps: 9 },
  ]]])];
  const result = plan.generatePlan({ preferences: {}, records });
  const bench = result.days[0].exercises.find(e => e.exercise_id === "barbell_bench_press");
  assert.equal(bench.weight_kg, 52.5);
});

test("下肢动作全部练满 → +5kg", () => {
  const records = [completedSession("2026-09-10", [["barbell_squat", [
    { weight_kg: 80, reps: 8 },
    { weight_kg: 80, reps: 7 },
  ]]])];
  const result = plan.generatePlan({ preferences: {}, records });
  const squat = result.days[2].exercises.find(e => e.exercise_id === "barbell_squat");
  assert.equal(squat.weight_kg, 85);
});

test("下肢动作没练满计划组数 → 维持上次重量", () => {
  const records = [completedSession("2026-09-10", [["barbell_squat", [
    { weight_kg: 80, reps: 8 },
    { weight_kg: 80, reps: 5 },
  ]]])];
  records[0].exercises[0].planned_sets = 3;
  const result = plan.generatePlan({ preferences: {}, records });
  const squat = result.days[2].exercises.find(e => e.exercise_id === "barbell_squat");
  assert.equal(squat.weight_kg, 80);
});

test("保存与读取完成进度", () => {
  const storage = fakeStorage();
  const saved = plan.saveProgress({ plan_generated_at: "2026-09-20T00:00:00.000Z", day_index: 1, session_id: "workout-1", date: "2026-09-20" }, storage);
  assert.equal(saved, true);
  const progress = plan.loadProgress(storage);
  assert.equal(progress.plan_generated_at, "2026-09-20T00:00:00.000Z");
  assert.deepEqual(progress.days["1"], { session_id: "workout-1", date: "2026-09-20", saved_at: progress.days["1"].saved_at });
});

test("计划版本不匹配时进度视为无效", () => {
  const storage = fakeStorage();
  plan.saveProgress({ plan_generated_at: "old", day_index: 1, session_id: "workout-1", date: "2026-09-20" }, storage);
  assert.equal(plan.isProgressValid(plan.loadProgress(storage), "new"), false);
  assert.equal(plan.isProgressValid(plan.loadProgress(storage), "old"), true);
});

test("清除进度", () => {
  const storage = fakeStorage();
  plan.saveProgress({ plan_generated_at: "old", day_index: 1, session_id: "w", date: "2026-09-20" }, storage);
  plan.clearProgress(storage);
  assert.equal(plan.loadProgress(storage), null);
});
