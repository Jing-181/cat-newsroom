const test = require("node:test");
const assert = require("node:assert/strict");
const workout = require("../js/workout.js");

test("胸日包含卧推动作和任意日小肌群动作", () => {
  const names = workout.catalog.forDay("chest").map(item => item.name);
  assert.ok(names.includes("哑铃卧推"));
  assert.ok(names.includes("绳索下压"));
});

test("腿日包含保加利亚分腿蹲和常见基础动作", () => {
  const names = workout.catalog.forDay("legs").map(item => item.name);
  assert.ok(names.includes("保加利亚分腿蹲"));
  assert.ok(names.includes("传统硬拉"));
  assert.ok(names.includes("行走弓步"));
});

test("训练容量按有记录的组计算，空组不计入", () => {
  const session = workout.createSession("chest", new Date(2026, 7, 31));
  workout.addExercise(session, "dumbbell_bench_press");
  session.exercises[0].sets = [
    { weight_kg: 20, reps: 10 },
    { weight_kg: 20, reps: 8 },
    { weight_kg: 0, reps: 0 },
  ];
  assert.deepEqual(workout.calculateStats(session), { exerciseCount: 1, setCount: 2, reps: 18, volume: 360 });
});

test("新增动作会带入最近一组数据，并默认只创建一组", () => {
  const history = [workout.createSession("chest", new Date(2026, 7, 20))];
  workout.addExercise(history[0], "dumbbell_bench_press");
  history[0].status = "completed";
  history[0].exercises[0].sets = [{ weight_kg: 24, reps: 8, rpe: 9 }];
  const session = workout.createSession("chest", new Date(2026, 7, 21));
  workout.addExercise(session, "dumbbell_bench_press", history);
  assert.deepEqual(session.exercises[0].sets, [{ weight_kg: 24, reps: 8, rpe: 9, note: "" }]);
  assert.equal(session.exercises[0].planned_sets, 1);
  assert.equal(workout.previousPerformance(history, "dumbbell_bench_press").date, "2026-08-20");
});

test("有氧动作使用时长、距离和配速字段", () => {
  const session = workout.createSession("cardio", new Date(2026, 7, 21));
  workout.addExercise(session, "treadmill");
  assert.deepEqual(session.exercises[0].sets, [{ duration_min: 0, distance_km: 0, pace: "", rpe: "", note: "" }]);
  assert.equal(workout.calculateStats(session).volume, 0);
});

test("加一组会继承上一组数据并同步计划组数", () => {
  const session = workout.createSession("chest", new Date(2026, 7, 31));
  workout.addExercise(session, "dumbbell_bench_press");
  session.exercises[0].sets[0] = { weight_kg: 20, reps: 10 };
  const set = workout.addSet(session, 0);
  assert.deepEqual(set, { weight_kg: 20, reps: 10, rpe: "", note: "" });
  assert.equal(session.exercises[0].planned_sets, 2);
});

test("删组会同步下调计划组数", () => {
  const session = workout.createSession("chest", new Date(2026, 7, 31));
  workout.addExercise(session, "dumbbell_bench_press");
  workout.addSet(session, 0);
  workout.addSet(session, 0);
  assert.equal(session.exercises[0].planned_sets, 3);
  workout.removeSet(session, 0, 1);
  assert.equal(session.exercises[0].sets.length, 2);
  assert.equal(session.exercises[0].planned_sets, 2);
});

test("保存时清理空组：没有数值的组不算训练记录", () => {
  const session = workout.createSession("chest", new Date(2026, 7, 31));
  workout.addExercise(session, "dumbbell_bench_press");
  session.exercises[0].sets = [
    { weight_kg: 20, reps: 10 },
    { weight_kg: 0, reps: 0 },
  ];
  const saved = workout.upsertSession([], session);
  assert.equal(saved.exercises[0].sets.length, 1);
});

test("组间歇只按大/小肌群给推荐值，不倒计时也不写入数据", () => {
  // 大肌群恢复慢，推荐间歇长；小肌群恢复快，推荐间歇短。
  assert.equal(workout.restAdvice({ body_part: "胸", name: "哑铃卧推" }).label, "大肌群");
  assert.equal(workout.restAdvice({ body_part: "二头", name: "哑铃弯举" }).label, "小肌群");
  assert.ok(workout.restAdvice({ body_part: "背", name: "引体向上" }).seconds > workout.restAdvice({ body_part: "二头", name: "哑铃弯举" }).seconds);
  // 推荐只是填表参考：动作数据里不带休息字段，历史里也不会多出这一项。
  const session = workout.createSession("chest", new Date(2026, 7, 31));
  workout.addExercise(session, "dumbbell_bench_press");
  assert.equal("rest_seconds" in session.exercises[0], false);
});

test("训练时长完全由用户填写，不从开始时间推算", () => {
  const session = workout.createSession("chest", new Date(2026, 7, 31));
  // 新建草稿默认 0，起训时间不参与时长计算。
  session.started_at = new Date(2026, 7, 1).toISOString();
  assert.equal(session.duration_min, 0);
  session.duration_min = 45;
  const saved = workout.upsertSession([], session);
  assert.equal(saved.duration_min, 45);
});

test("组记录紧凑格式用于上次每组明细展示", () => {
  const sets = [{ weight_kg: 20, reps: 10 }, { weight_kg: 20, reps: 10 }, { weight_kg: 17.5, reps: 12 }];
  assert.equal(workout.formatSetList(sets, "杠铃"), "20×10 / 20×10 / 17.5×12");
  assert.equal(workout.formatSetCompact({ weight_kg: 0, reps: 12 }, "杠铃"), "自重×12");
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
