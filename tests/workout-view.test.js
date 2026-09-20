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

test("训练编辑器提供日期、动作弹窗和保存入口", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date(2026, 7, 20));
  const html = view.editorHtml(session, "chest");
  assert.match(html, /id="workout-date"/);
  assert.match(html, /id="workout-add-exercise"/);
  assert.match(html, /id="workout-add-floating"/);
  assert.match(html, />完成训练</);
});

test("训练组使用屏内卡片布局，避免固定宽度横向滚动", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date(2026, 7, 20));
  workout.addExercise(session, "dumbbell_bench_press");
  const html = view.editorHtml(session, "chest");
  assert.equal((html.match(/class="set-row(?: completed)?"/g) || []).length, 1);
  assert.doesNotMatch(html, /set-table-scroll|class="set-table"/);
  assert.match(html, /class="set-fields"/);
});

test("动作选择器支持整项点击并标记已添加动作", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date(2026, 7, 20));
  workout.addExercise(session, "dumbbell_bench_press");
  const html = view.exerciseLibraryHtml("chest", session.exercises);
  assert.match(html, /class="exercise-option is-added"/);
  assert.match(html, /data-add-exercise="dumbbell_bench_press" disabled/);
  assert.match(html, />已添加</);
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

test("训练历史按月份分组，无日期记录归入日期未记录", () => {
  const view = loadView();
  const a = workout.createSession("chest", new Date(2026, 8, 19));   // 2026-09-19
  const b = workout.createSession("back", new Date(2026, 8, 5));     // 2026-09-05
  const legacy = { id: 1, title: "旧记录", current: 10, target: 20, unit: "分钟" }; // 无日期
  const html = view.idleHtml("chest", [legacy, b, a]);
  assert.match(html, /class="history-month">2026 年 9 月</);
  assert.match(html, /class="history-month">日期未记录</);
  assert.match(html, /class="history-group"/);
  assert.match(html, /class="history-meta"/);
  assert.match(html, /data-history-view=/);
});

test("空闲视图恢复训练计划菜单，保留开始训练入口", () => {
  const view = loadView();
  const html = view.idleHtml("chest", []);
  assert.match(html, /id="workout-plan-menu"/);
  assert.match(html, /id="workout-plan"/);
  assert.match(html, /id="workout-preferences"/);
  assert.match(html, /id="workout-start"/);
});

test("训练详情提供复制数据按钮", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date(2026, 8, 20));
  session.status = "completed";
  workout.addExercise(session, "dumbbell_bench_press");
  session.exercises[0].sets[0] = { weight_kg: 20, reps: 10, rpe: 8, completed: true };
  const detail = view.detailHtml(session);
  assert.match(detail, /data-copy-workout=/);
  assert.match(detail, />复制数据</);
  const legacy = view.detailHtml({ id: 1, title: "旧记录", current: 10, target: 20, unit: "分钟" });
  assert.match(legacy, /data-copy-workout=/);
});

test("计划生成的训练详情徽标显示力量训练·推，普通胸日仍显示胸日", () => {
  const view = loadView();
  const planSession = workout.createSession("chest", new Date(2026, 8, 20));
  planSession.title = "力量训练·推 · 第 1 轮";
  planSession.status = "completed";
  const planDetail = view.detailHtml(planSession);
  assert.match(planDetail, />力量训练·推</);
  assert.doesNotMatch(planDetail, /dialog-kicker">胸日</);
  const normal = workout.createSession("chest", new Date(2026, 8, 20));
  normal.status = "completed";
  assert.match(view.detailHtml(normal), /dialog-kicker">胸日</);
});

test("复制文本包含日期、时长与每组重量次数", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date(2026, 8, 20));
  session.status = "completed";
  session.duration_min = 45;
  workout.addExercise(session, "dumbbell_bench_press");
  session.exercises[0].sets = [
    { weight_kg: 20, reps: 10, rpe: 8, completed: true },
    { weight_kg: 20, reps: 9, rpe: 9, completed: true },
  ];
  const text = view.buildCopyText(session);
  assert.match(text, /2026-09-20/);
  assert.match(text, /45 分钟/);
  assert.match(text, /哑铃卧推/);
  assert.match(text, /20 kg × 10 · RPE 8/);
  assert.match(text, /第 2 组 20 kg × 9 · RPE 9/);
});
