import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import workout from "../src/lib/workout.js";

test("动作库 id 与名称唯一、字段齐全，BADGE 短名不留死键", () => {
  const exercises = workout.catalog.exercises;
  const ids = exercises.map(item => item.id);
  const names = exercises.map(item => item.name);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(names).size, names.length);
  const days = new Set(workout.catalog.trainingDays.map(day => day.id));
  exercises.forEach(item => {
    assert.ok(item.name && item.bodyPart && item.equipment && item.muscles && item.tips && item.icon, `字段不全：${item.id}`);
    assert.ok(item.trainingDays.length && item.trainingDays.every(day => days.has(day)), `训练日非法：${item.id}`);
  });
  const source = readFileSync(new URL("../src/lib/workout-catalog.js", import.meta.url), "utf8");
  const badgeStart = source.indexOf("const BADGE = {");
  const badgeBlock = source.slice(badgeStart, source.indexOf("};", badgeStart));
  const badgeIds = [...badgeBlock.matchAll(/([a-z0-9_]+):"/g)].map(match => match[1]);
  assert.deepEqual(badgeIds.filter(badgeId => !ids.includes(badgeId)), []);
});

test("腿日补齐内收与外展，有氧日补齐常用项目", () => {
  const legs = workout.catalog.forDay("legs").map(item => item.name);
  ["坐姿腿内收", "坐姿腿外展", "侧弓步", "单腿罗马尼亚硬拉", "北欧腿弯举", "坐姿提踵"].forEach(name => assert.ok(legs.includes(name), name));
  const cardio = workout.catalog.forDay("cardio").map(item => item.name);
  ["坡度快走", "跳绳", "越野跑", "羽毛球"].forEach(name => assert.ok(cardio.includes(name), name));
});

test("自定义动作：id 由名称派生，同名动作在历史里连成同一条轨迹", () => {
  const session = workout.createSession("legs", new Date(2026, 9, 8));
  workout.addCustomExercise(session, "  器械内收  ");
  assert.equal(session.exercises.length, 1);
  const entry = session.exercises[0];
  assert.equal(entry.name, "器械内收");
  assert.equal(entry.exercise_id, "custom_器械内收");
  assert.equal(entry.body_part, "自定义");
  assert.equal(entry.equipment, "自定义");
  assert.equal(entry.planned_sets, 1);
  // 重名与空名都不再加一条
  workout.addCustomExercise(session, "器械内收");
  workout.addCustomExercise(session, "   ");
  assert.equal(session.exercises.length, 1);
  // 下次再练同一个动作：id 一致；新动作留空，上次的数字只做提示、不算已记录
  entry.sets[0] = { weight_kg: 40, reps: 12 };
  session.status = "completed";
  const next = workout.createSession("legs", new Date(2026, 9, 10));
  workout.addCustomExercise(next, "器械内收", [session]);
  assert.equal(next.exercises[0].exercise_id, entry.exercise_id);
  assert.equal(next.exercises[0].sets[0].weight_kg, 0);
  assert.equal(next.exercises[0].sets[0].reps, 0);
  assert.equal(workout.previousPerformance([session], entry.exercise_id).set.weight_kg, 40);
});

test("有氧恢复日的自定义动作按有氧形态记录，其余训练日按力量形态记录", () => {
  const cardio = workout.createSession("cardio", new Date(2026, 9, 8));
  workout.addCustomExercise(cardio, "爬坡走");
  assert.equal(cardio.exercises[0].equipment, "有氧");
  assert.ok("duration_min" in cardio.exercises[0].sets[0]);
  const legs = workout.createSession("legs", new Date(2026, 9, 8));
  workout.addCustomExercise(legs, "器械内收");
  assert.ok("reps" in legs.exercises[0].sets[0]);
});

test("用过的自定义动作从历史记录里回捞，最近用过的排在前面", () => {
  const older = workout.createSession("legs", new Date(2026, 8, 1));
  workout.addCustomExercise(older, "器械内收");
  older.status = "completed";
  older.updated_at = "2026-09-01T10:00:00.000Z";
  const newer = workout.createSession("legs", new Date(2026, 9, 1));
  workout.addCustomExercise(newer, "农夫行走");
  newer.status = "completed";
  newer.updated_at = "2026-10-01T10:00:00.000Z";
  const list = workout.customExercises([older, newer]);
  assert.deepEqual(list.map(item => item.name), ["农夫行走", "器械内收"]);
  assert.equal(list[1].id, "custom_器械内收");
  // 预置动作不进自定义清单，已删除的记录也不回捞
  assert.deepEqual(workout.customExercises([{ kind: "workout_session", schema_version: 2, exercises: [{ exercise_id: "calf_raise", name: "站姿提踵" }] }]), []);
  newer.deleted_at = "2026-10-02T10:00:00.000Z";
  assert.deepEqual(workout.customExercises([newer]).map(item => item.name), []);
});

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

test("力量组以次数为准：只填了重量没练次数不算有效组", () => {
  const session = workout.createSession("chest", new Date(2026, 7, 31));
  workout.addExercise(session, "dumbbell_bench_press");
  session.exercises[0].sets = [
    { weight_kg: 20, reps: 0 },   // 摆了重量但一次没练，不算
    { weight_kg: 20, reps: 10 },
    { weight_kg: 0, reps: 12 },   // 自重（重量为 0）也算练过
  ];
  assert.equal(workout.setHasRecord(session.exercises[0].sets[0]), false);
  assert.equal(workout.setHasRecord(session.exercises[0].sets[1]), true);
  assert.equal(workout.setHasRecord(session.exercises[0].sets[2]), true);
  assert.equal(workout.setHasRecord(null), false);
  assert.deepEqual(workout.calculateStats(session), { exerciseCount: 1, setCount: 2, reps: 22, volume: 200 });
});

test("有氧组按时长或距离任一项判定有效", () => {
  assert.equal(workout.setHasRecord({ duration_min: 0, distance_km: 0, pace: "6'00\"" }), false);
  assert.equal(workout.setHasRecord({ duration_min: 12, distance_km: 0 }), true);
  assert.equal(workout.setHasRecord({ duration_min: 0, distance_km: 2.5 }), true);
});

test("草稿开始时间只用于估时长，不写进记录", () => {
  const session = workout.createSession("chest", new Date());
  assert.ok(session.started_at);
  assert.ok(workout.elapsedMinutes(session) >= 0);
  // 跨天的草稿不估算，避免把隔夜时间算进训练
  const old = workout.createSession("chest", new Date());
  old.started_at = new Date(Date.now() - 3 * 86400000).toISOString();
  assert.equal(workout.elapsedMinutes(old), 0);
  // 保存后不留在记录里
  session.status = "completed";
  const saved = workout.upsertSession([], session);
  assert.equal("started_at" in saved, false);
});

test("新增动作留空只建一组，上次数据只做提示", () => {
  const history = [workout.createSession("chest", new Date(2026, 7, 20))];
  workout.addExercise(history[0], "dumbbell_bench_press");
  history[0].status = "completed";
  history[0].exercises[0].sets = [{ weight_kg: 24, reps: 8, rpe: 9 }];
  const session = workout.createSession("chest", new Date(2026, 7, 21));
  workout.addExercise(session, "dumbbell_bench_press", history);
  // 新动作留空，不把上次的数字直接当成已记录；上次数值由组行的灰色提示给出
  assert.deepEqual(session.exercises[0].sets, [{ weight_kg: 0, reps: 0, rpe: "", note: "" }]);
  assert.equal(workout.previousPerformance(history, "dumbbell_bench_press").set.weight_kg, 24);
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

test("自重动作：重量 0 显示自重，负数显示助力", () => {
  const pullUp = { equipment: "自重" };
  assert.equal(workout.allowsAssist(pullUp), true);
  assert.equal(workout.allowsAssist({ equipment: "杠铃" }), false);
  assert.equal(workout.formatSetText({ weight_kg: 0, reps: 8 }, "自重"), "自重 × 8");
  assert.equal(workout.formatSetText({ weight_kg: -20, reps: 8 }, "自重"), "助力 20 kg × 8");
  assert.equal(workout.formatSetText({ weight_kg: 10, reps: 8 }, "自重"), "10 kg × 8");
  assert.equal(workout.formatSetCompact({ weight_kg: -20, reps: 8 }, "自重"), "助力20×8");
  // 非自重动作没填重量时仍保留 0 kg，不假装成自重
  assert.equal(workout.formatSetText({ weight_kg: 0, reps: 8 }, "杠铃"), "0 kg × 8");
});

test("助力组不进容量统计（避免负数把总容量抵消掉）", () => {
  const session = {
    kind: "workout_session", schema_version: 2, status: "completed",
    exercises: [{
      exercise_id: "pull_up", name: "引体向上", equipment: "自重",
      sets: [{ weight_kg: -20, reps: 8 }, { weight_kg: 0, reps: 5 }],
    }],
  };
  assert.equal(workout.calculateStats(session).volume, 0);
  assert.equal(workout.exerciseHistory([session], "pull_up")[0].volume, 0);
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

test("训练状态词随记录保存，旧记录缺字段按空处理", () => {
  const session = workout.createSession("chest", new Date(2026, 9, 18));
  session.mood = "不错";
  const records = [];
  const saved = workout.upsertSession(records, session);
  assert.equal(saved.mood, "不错");
  // 旧记录没有 mood 字段：不补造值，界面读到 undefined 时按空串处理
  const legacy = workout.createSession("chest", new Date(2026, 9, 17));
  delete legacy.mood;
  const oldSaved = workout.upsertSession(records, legacy);
  assert.equal("mood" in oldSaved, false);
});

test("动作进展按估算强度取代表组，减重加次不会读成退步", () => {
  const heavy = { weight_kg: 90, reps: 2 };
  const volume = { weight_kg: 70, reps: 8 };
  // 90×2 ≈ 96，70×8 ≈ 89：强度差远小于直接看重量时 20kg 的断崖
  assert.ok(workout.setIntensity(heavy) > workout.setIntensity(volume));
  assert.ok(workout.setIntensity(heavy) - workout.setIntensity(volume) < 10);
  assert.equal(workout.bestSet([volume, heavy]).weight_kg, 90);
  // 自重动作按次数排序
  assert.ok(workout.setIntensity({ weight_kg: 0, reps: 10 }) > workout.setIntensity({ weight_kg: 0, reps: 5 }));
});

test("上次这一练按训练日取最近一条完成记录", () => {
  const make = (day, date, status = "completed") => {
    const session = workout.createSession(day, new Date(`${date}T00:00:00`));
    session.status = status;
    session.date = date;
    return session;
  };
  const records = [
    make("chest", "2026-10-13"),
    make("chest", "2026-10-09"),
    make("back", "2026-10-18"),
    make("chest", "2026-10-18", "draft"),
  ];
  workout.sortRecords(records);
  assert.equal(workout.lastSessionForDay(records, "chest").date, "2026-10-13");
  assert.equal(workout.lastSessionForDay(records, "legs"), null);
});

test("同日记录查询用于补记提示", () => {
  const make = (day, date) => {
    const session = workout.createSession(day, new Date(`${date}T00:00:00`));
    session.status = "completed";
    session.date = date;
    return session;
  };
  const records = [make("chest", "2026-10-02"), make("back", "2026-10-02"), make("legs", "2026-10-03")];
  assert.equal(workout.sessionsOnDate(records, "2026-10-02").length, 2);
  assert.equal(workout.sessionsOnDate(records, "2026-10-04").length, 0);
});
