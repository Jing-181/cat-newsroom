const test = require("node:test");
const assert = require("node:assert/strict");
const workout = require("../js/workout.js");

test("胸日包含卧推动作和任意日小肌群动作", () => {
  const names = workout.catalog.forDay("chest").map(item => item.name);
  assert.ok(names.includes("哑铃卧推"));
  assert.ok(names.includes("绳索下压"));
});

test("训练容量按完成组计算", () => {
  const session = workout.createSession("chest", new Date(2026, 7, 31));
  workout.addExercise(session, "dumbbell_bench_press");
  session.exercises[0].sets = [
    { weight_kg: 20, reps: 10, completed: true },
    { weight_kg: 20, reps: 8, completed: true },
    { weight_kg: 20, reps: 10, completed: false },
  ];
  assert.deepEqual(workout.calculateStats(session), { exerciseCount: 1, setCount: 2, reps: 18, volume: 360 });
});

test("新增动作会带入最近完成组，并默认勾选本次训练组", () => {
  const history = [workout.createSession("chest", new Date(2026, 7, 20))];
  workout.addExercise(history[0], "dumbbell_bench_press");
  history[0].status = "completed";
  history[0].exercises[0].sets[2] = { weight_kg: 24, reps: 8, rpe: 9, completed: true };
  const session = workout.createSession("chest", new Date(2026, 7, 21));
  workout.addExercise(session, "dumbbell_bench_press", history);
  assert.deepEqual(session.exercises[0].sets, [
    { weight_kg: 24, reps: 8, rpe: 9, completed: true },
    { weight_kg: 24, reps: 8, rpe: 9, completed: true },
    { weight_kg: 24, reps: 8, rpe: 9, completed: true },
  ]);
  assert.equal(workout.previousPerformance(history, "dumbbell_bench_press").date, "2026-08-20");
});

test("旧运动记录保持兼容", () => {
  assert.equal(workout.summary({ id: 1, title: "跑步", current: 20, target: 30 }).legacy, true);
});

test("编辑训练记录会原地更新并支持修改日期", () => {
  const original = workout.createSession("shoulders", new Date(2026, 7, 31));
  original.status = "completed";
  const records = [original];
  const editing = workout.cloneRecord(original);
  editing._editing_record_id = original.id;
  editing.date = "2026-08-20";
  editing.duration_min = 45;

  const saved = workout.upsertSession(records, editing);
  assert.equal(records.length, 1);
  assert.equal(records[0].date, "2026-08-20");
  assert.equal(saved.duration_min, 45);
  assert.equal("_editing_record_id" in saved, false);
});
