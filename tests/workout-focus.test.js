import test from "node:test";
import assert from "node:assert/strict";
import workout from "../src/lib/workout.js";
import workoutView from "../src/lib/workout-view.js";

const sessionWith = (...ids) => {
  const session = workout.createSession("chest", new Date(2026, 10, 8));
  ids.forEach(id => workout.addExercise(session, id));
  return session;
};

test("逐组屏把当前组钉在 DOM 上，输入不再靠数据反推位置", () => {
  const session = sessionWith("dumbbell_bench_press");
  const html = workoutView.editorHtml(session, "chest", [], { focus: true, focusTarget: { exercise: 0, set: 0 } });
  // 动作实例 id + 组序写进 DOM：填了次数之后这一组变成「有记录」，按数据反推会把指针滑走。
  assert.match(html, /data-focus-scope/);
  assert.match(html, new RegExp(`data-focus-ex="${session.exercises[0].id}"`));
  assert.match(html, /data-focus-set="0"/);
});

test("多动作时才给上/下一个动作，第一个动作的「上一个」不可点", () => {
  const single = sessionWith("dumbbell_bench_press");
  const one = workoutView.editorHtml(single, "chest", [], { focus: true, focusTarget: { exercise: 0, set: 0 } });
  assert.doesNotMatch(one, /data-focus-move-exercise/);

  const multi = sessionWith("dumbbell_bench_press", "cable_fly_mid");
  const html = workoutView.editorHtml(multi, "chest", [], { focus: true, focusTarget: { exercise: 0, set: 0 } });
  assert.match(html, /data-focus-move-exercise="-1" disabled/);
  assert.match(html, /data-focus-move-exercise="1"/);
  assert.match(html, /动作 1 \/ 2/);
});

test("完成一组先在本动作内推进，本动作练完才换下一个动作", () => {
  const session = sessionWith("dumbbell_bench_press", "cable_fly_mid");
  workout.addSet(session, 0);
  workout.addSet(session, 0);
  session.exercises[0].sets[0] = { weight_kg: 30, reps: 10, rpe: "", note: "" };

  // 第 1 组记完，下一个位置仍是同一个动作的第 2 组，不会跨到别的动作。
  assert.deepEqual(workout.nextSetTarget(session, { exercise: 0, set: 0 }), { exercise: 0, set: 1 });
  assert.deepEqual(workout.nextSetTarget(session, { exercise: 0, set: 1 }), { exercise: 0, set: 2 });
  // 本动作练完才去下一个动作的第 1 组。
  assert.deepEqual(workout.nextSetTarget(session, { exercise: 0, set: 2 }), { exercise: 1, set: 0 });
});

test("全部组都有记录时不再给下一站；前面漏掉的组会被补上", () => {
  const session = sessionWith("dumbbell_bench_press", "cable_fly_mid");
  session.exercises[0].sets[0] = { weight_kg: 30, reps: 10, rpe: "", note: "" };
  session.exercises[1].sets[0] = { weight_kg: 15, reps: 12, rpe: "", note: "" };
  assert.equal(workout.nextSetTarget(session, { exercise: 1, set: 0 }), null);

  workout.addSet(session, 0);
  session.exercises[0].sets[1] = { weight_kg: 0, reps: 0, rpe: "", note: "" };
  assert.deepEqual(workout.nextSetTarget(session, { exercise: 1, set: 0 }), { exercise: 0, set: 1 });
});

test("加动作照抄当前动作的组数，同器械才带重量，次数一律留空", () => {
  const session = sessionWith("dumbbell_bench_press");
  workout.addSet(session, 0);
  workout.addSet(session, 0);
  session.exercises[0].sets[0] = { weight_kg: 30, reps: 10, rpe: "", note: "" };
  session.exercises[0].sets[1].weight_kg = 30;
  session.exercises[0].sets[2].weight_kg = 30;
  const template = { sets: 3, weight_kg: 30, equipment: "哑铃" };

  workout.addExercise(session, "dumbbell_fly", [], template);
  const dumbbell = session.exercises[1];
  assert.equal(dumbbell.sets.length, 3);
  assert.equal(dumbbell.planned_sets, 3);
  assert.deepEqual(dumbbell.sets.map(set => set.weight_kg), [30, 30, 30]);
  // 次数留空：抄过来会一出生就算已记录，进度虚高。
  assert.deepEqual(dumbbell.sets.map(set => set.reps), ['', '', '']);
  assert.equal(workout.recordedSets(dumbbell).length, 0);

  workout.addExercise(session, "cable_fly_mid", [], template);
  const cable = session.exercises[2];
  assert.equal(cable.sets.length, 3);
  // 器械不同：组数照抄，重量不搬（30kg 的哑铃不是 30kg 的绳索）。
  assert.deepEqual(cable.sets.map(set => set.weight_kg), ['', '', '']);
});

test("自定义动作也照抄组数，但重量不抄", () => {
  const session = sessionWith("dumbbell_bench_press");
  workout.addCustomExercise(session, "猫式拉伸", [], { sets: 3, weight_kg: 30, equipment: "哑铃" });
  const custom = session.exercises[1];
  assert.equal(custom.sets.length, 3);
  assert.deepEqual(custom.sets.map(set => set.weight_kg), ['', '', '']);
});

test("空白组把上次的重量与次数摆成建议值，但不写进数据、也不算已录", () => {
  const history = [workout.createSession("chest", new Date(2026, 10, 1))];
  workout.addExercise(history[0], "dumbbell_bench_press");
  history[0].exercises[0].sets[0] = { weight_kg: 22.5, reps: 10, rpe: "", note: "" };
  history[0].status = "completed";

  const session = sessionWith("dumbbell_bench_press", "cable_fly_mid");
  const html = workoutView.editorHtml(session, "chest", history, { focus: true, focusTarget: { exercise: 0, set: 0 } });
  // 建议值上屏，带 is-suggest 标记（淡一档）
  assert.match(html, /class="focus-value is-suggest"[^>]*value="22\.5"/);
  assert.match(html, /class="focus-value is-suggest"[^>]*value="10"/);
  assert.equal(workout.setHasRecord(session.exercises[0].sets[0]), false, "建议值不等于本次记录");
  // 已经填好了，按钮隐藏，不再把同一个数字重复写一遍
  assert.match(html, /data-focus-last hidden/);

  // 跨器械换动作：不带上一个动作的重量，改用这个动作自己的上次数据
  const cable = workoutView.editorHtml(session, "chest", history, { focus: true, focusTarget: { exercise: 1, set: 0 } });
  assert.doesNotMatch(cable, /value="22\.5"/);
});

test("逐组屏把「第 N / M 组」放在动作名下面的同一行，底部不再重复一遍", () => {
  const session = sessionWith("dumbbell_bench_press");
  workout.addSet(session, 0);
  const html = workoutView.editorHtml(session, "chest", [], { focus: true, focusTarget: { exercise: 0, set: 1 } });

  // 组序、进度点、本组停留排在同一行：一件事只在一个地方说。
  assert.match(html, /class="focus-setbar"/);
  assert.match(html, /data-focus-setpos>第 <b>2<\/b> \/ \d+ 组/);
  assert.match(html, /data-focus-dwell>本组停留 00:00/);
  assert.match(html, /focus-setbar[\s\S]*?class="focus-dots"/);
  // 底部提示只说下一步去哪，不再写第三遍「第 2 / 3 组」。
  assert.doesNotMatch(html, /focus-hint">第 /);
  // 动作名下面那行只留部位与器械，不再叠一个「已录/总组数」。
  assert.match(html, /class="focus-head">[\s\S]*?<p>胸 · 哑铃<\/p>/);
});

test("本组停留只认组身份：改数值、加组都不归零，换组换动作才归零", () => {
  const session = sessionWith("dumbbell_bench_press", "cable_fly_mid");
  const first = session.exercises[0];
  const key = workout.dwellKey(first, 0);

  // 同一组里加组（总组数变了）与改重量次数：当前组没变，计时不该重来。
  workout.addSet(session, 0);
  first.sets[0].weight_kg = 42.5;
  first.sets[0].reps = 9;
  assert.equal(workout.dwellKey(first, 0), key);
  // 换组、换动作才是新的一段停留。
  assert.notEqual(workout.dwellKey(first, 1), key);
  assert.notEqual(workout.dwellKey(session.exercises[1], 0), key);
  const retained = workout.dwellKey(first, 1);
  workout.removeSet(session, 0, 0);
  assert.equal(workout.dwellKey(first, 0), retained, '删前组后仍是同一个组对象');
  assert.equal(workout.dwellKey(null, 0), null);
});

test("本组停留按 mm:ss 显示，负数和空值归零", () => {
  assert.equal(workout.formatDwell(0), "00:00");
  assert.equal(workout.formatDwell(9), "00:09");
  assert.equal(workout.formatDwell(72), "01:12");
  assert.equal(workout.formatDwell(-5), "00:00");
  assert.equal(workout.formatDwell(undefined), "00:00");
});
