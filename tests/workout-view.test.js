const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const workout = require("../js/workout.js");
const catalog = require("../js/workout-catalog.js");

function loadView() {
  const window = { Workout:workout, WorkoutCatalog:catalog };
  vm.runInNewContext(fs.readFileSync(require.resolve("../js/workout-view.js"), "utf8"), { window });
  return window.WorkoutView;
}

test("训练编辑器提供日期、折叠和保存入口", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date(2026, 7, 20));
  const html = view.editorHtml(session, "chest", true);
  assert.match(html, /id="workout-date"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, />完成训练</);
});

test("训练详情展示动作组次且历史卡提供编辑入口", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date(2026, 7, 20));
  workout.addExercise(session, "dumbbell_bench_press");
  session.exercises[0].sets[0] = { weight_kg:20, reps:10, rpe:8, completed:true };
  const detail = view.detailHtml(session);
  const history = view.idleHtml("chest", [session]);
  assert.match(detail, /哑铃卧推/);
  assert.match(detail, /20 kg × 10/);
  assert.match(history, /data-history-view=/);
  assert.match(history, /data-history-edit=/);
});
