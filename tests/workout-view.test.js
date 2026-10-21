import test from "node:test";
import assert from "node:assert/strict";
import workout from "../src/lib/workout.js";
import workoutView from "../src/lib/workout-view.js";

// 界面模块已经是 ESM，直接 import 即可，不用再造一个干净的 window 去 vm 里跑
const loadView = () => workoutView;

test("训练编辑器提供日期、动作弹窗和保存入口", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date(2026, 7, 20));
  const html = view.editorHtml(session, "chest");
  assert.match(html, /id="workout-date"/);
  assert.match(html, /id="workout-add-exercise"/);
  assert.match(html, /id="workout-add-floating"/);
  assert.match(html, />结束训练</);
});

test("训练组使用屏内卡片布局：已录组收起、当前组展开", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date(2026, 7, 20));
  workout.addExercise(session, "dumbbell_bench_press");
  session.exercises[0].sets[0] = { weight_kg: 20, reps: 10 };
  workout.addSet(session, 0);
  const html = view.editorHtml(session, "chest");
  // 有数值的第 1 组收起成一行，第 2 组（待填）展开。
  assert.equal((html.match(/class="set-row is-collapsed"/g) || []).length, 1);
  assert.equal((html.match(/class="set-row is-active"/g) || []).length, 1);
  // 推进按钮已删除：展开状态只由点击决定，输入不再触发自动收组。
  assert.doesNotMatch(html, /data-set-next|data-set-collapse|收起本组|记录并进入下一组/);
  assert.match(html, /class="set-line"/);
  // 已录组右侧只留一个轻箭头表示可点开修改，不再写"修改"两个字。
  assert.match(html, /class="set-chevron"/);
  assert.doesNotMatch(html, /set-edit-hint/);
  assert.doesNotMatch(html, /set-table-scroll|class="set-table"/);
  assert.match(html, /class="set-fields"/);
  // 自动计时与休息倒计时已经移除，相关标记不应再出现。
  assert.doesNotMatch(html, /data-workout-timer|data-workout-clock|data-rest-bar|data-rest-start|data-workout-auto-hint|field-hint/);
});

test("动作脚部给出组间歇推荐文案，大肌群比小肌群长", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date(2026, 7, 20));
  workout.addExercise(session, "dumbbell_bench_press"); // 胸：大肌群
  const html = view.editorHtml(session, "chest");
  assert.match(html, /class="rest-advice"/);
  assert.match(html, /组间歇建议/);
  assert.match(html, /大肌群/);
  assert.match(html, /2-3 分钟/);
});

test("训练计划卡按肌群给组间歇建议，不再显示倒计时秒数", () => {
  const view = loadView();
  const day = {
    day_index: 1, title: "力量训练·推 · 第 1 轮", focus: "胸/肩/三头",
    exercises: [
      { exercise_id: "barbell_bench_press", name: "杠铃卧推", order: 1, sets: 4, reps: "8-12", rest_seconds: 120, weight_kg: null, intensity_hint: "RPE 7-8", rationale: "" },
      { exercise_id: "rope_pushdown", name: "绳索下压", order: 2, sets: 3, reps: "10-15", rest_seconds: 90, weight_kg: null, intensity_hint: "RPE 7-8", rationale: "" },
    ],
  };
  const html = view.planDayCard(day, null);
  assert.match(html, /组间歇 2-3 分钟/);   // 杠铃卧推：胸，大肌群
  assert.match(html, /组间歇 1 分钟/);     // 绳索下压：三头，小肌群
  assert.doesNotMatch(html, /休息 \d+s/);
});

test("动作进展默认收起：训练页与历史页都改用折叠块", () => {
  const view = loadView();
  const history = [workout.createSession("chest", new Date(2026, 8, 10))];
  workout.addExercise(history[0], "dumbbell_bench_press");
  history[0].status = "completed";
  history[0].exercises[0].sets = [{ weight_kg: 20, reps: 10 }];
  const session = workout.createSession("chest", new Date(2026, 8, 20));
  const editor = view.editorHtml(session, "chest", history);
  // 常驻入口按钮已移除，改成默认收起的 <details>，不占训练主流程的视觉重量。
  assert.doesNotMatch(editor, /data-tracked-progress/);
  assert.match(editor, /<details class="workout-fold">/);
  assert.doesNotMatch(editor, /<details class="workout-fold" open/);
  assert.match(editor, /动作进展/);
  assert.match(editor, /data-exercise-trend="dumbbell_bench_press"/);
  assert.match(editor, /哑铃卧推/);
  // 历史页同样折叠，且没有常驻展开状态。
  const idle = view.idleHtml("chest", history);
  assert.match(idle, /<details class="workout-fold">/);
  assert.doesNotMatch(idle, /<details class="workout-fold" open/);
});

test("上次表现：卡片级只给日期与组数，每组明细贴到对应的组行上", () => {
  const view = loadView();
  const history = [workout.createSession("chest", new Date(2026, 8, 10))];
  workout.addExercise(history[0], "dumbbell_bench_press");
  history[0].status = "completed";
  history[0].exercises[0].sets = [
    { weight_kg: 20, reps: 10 },
    { weight_kg: 20, reps: 10 },
    { weight_kg: 17.5, reps: 12 },
  ];
  const session = workout.createSession("chest", new Date(2026, 8, 20));
  workout.addExercise(session, "dumbbell_bench_press", history);
  const html = view.editorHtml(session, "chest", history);
  assert.match(html, /class="exercise-last"/);
  assert.match(html, /exercise-last-count">· 3 组</);
  assert.match(html, /class="set-hint" title="上次这一组：20×10">20×10</);
  // 整段明细不再重复出现在卡片级
  assert.doesNotMatch(html, /20×10 \/ 20×10 \/ 17.5×12/);
});

test("动作选择器支持整项点击并标记已添加动作", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date(2026, 7, 20));
  workout.addExercise(session, "dumbbell_bench_press");
  const html = view.exerciseLibraryHtml("chest", session.exercises);
  assert.match(html, /class="exercise-option is-added"/);
  assert.match(html, /data-add-exercise="dumbbell_bench_press"[^>]*disabled/);
  assert.match(html, />已添加</);
});

test("动作选择器提供自定义动作入口，并列出用过的自定义动作", () => {
  const view = loadView();
  const session = workout.createSession("legs", new Date(2026, 9, 8));
  const html = view.exerciseLibraryHtml("legs", session.exercises, [{ id: "custom_农夫行走", name: "农夫行走" }]);
  assert.match(html, /id="workout-custom-form"/);
  assert.match(html, /id="workout-custom-name"[^>]*maxlength="20"/);
  assert.match(html, /data-add-custom="农夫行走"/);
  // 已经加进本次训练的自定义动作不再作为待选 chip 出现
  workout.addCustomExercise(session, "农夫行走");
  const again = view.exerciseLibraryHtml("legs", session.exercises, [{ id: "custom_农夫行走", name: "农夫行走" }]);
  assert.doesNotMatch(again, /data-add-custom=/);
});

test("训练详情展示动作组次且历史卡提供编辑入口", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date(2026, 7, 20));
  workout.addExercise(session, "dumbbell_bench_press");
  session.exercises[0].sets[0] = { weight_kg:20, reps:10, rpe:8 };
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
  // 运动偏好入口已暂停：等偏好与计划的组合方式重新设计后再挂回来
  assert.doesNotMatch(html, /id="workout-preferences"/);
  assert.match(html, /id="workout-start"/);
});

test("训练详情提供复制数据按钮", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date(2026, 8, 20));
  session.status = "completed";
  workout.addExercise(session, "dumbbell_bench_press");
  session.exercises[0].sets[0] = { weight_kg: 20, reps: 10, rpe: 8 };
  const detail = view.detailHtml(session);
  assert.match(detail, /data-copy-workout=/);
  assert.match(detail, />复制数据</);
  const legacy = view.detailHtml({ id: 1, title: "旧记录", current: 10, target: 20, unit: "分钟" });
  assert.match(legacy, /data-copy-workout=/);
});

test("计划生成的训练详情徽标显示力量训练，普通胸日标题不再重复副标题", () => {
  const view = loadView();
  const planSession = workout.createSession("chest", new Date(2026, 8, 20));
  planSession.title = "力量训练·推 · 第 1 轮";
  planSession.status = "completed";
  const planDetail = view.detailHtml(planSession);
  assert.match(planDetail, />力量训练·推</);
  assert.doesNotMatch(planDetail, /dialog-kicker">胸日</);
  // kicker 与标题相同（普通训练日标题就是"胸日"）时不再重复渲染副标题
  const normal = workout.createSession("chest", new Date(2026, 8, 20));
  normal.status = "completed";
  const normalDetail = view.detailHtml(normal);
  assert.match(normalDetail, />胸日</);
  assert.doesNotMatch(normalDetail, /dialog-kicker">胸日</);
});

test("复制文本包含日期、时长与每组重量次数", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date(2026, 8, 20));
  session.status = "completed";
  session.duration_min = 45;
  workout.addExercise(session, "dumbbell_bench_press");
  session.exercises[0].sets = [
    { weight_kg: 20, reps: 10, rpe: 8 },
    { weight_kg: 20, reps: 9, rpe: 9 },
  ];
  const text = view.buildCopyText(session);
  assert.match(text, /2026-09-20/);
  assert.match(text, /45 分钟/);
  assert.match(text, /哑铃卧推/);
  assert.match(text, /20 kg × 10 · RPE 8/);
  assert.match(text, /第 2 组 20 kg × 9 · RPE 9/);
});

test("结束区提供状态词快捷选项与多行备注", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date());
  const html = view.editorHtml(session, "chest");
  assert.match(html, /class="mood-chips"/);
  ["不错", "还阔以", "一般般", "练爽了", "起飞", "突破", "摸鱼", "腿软", "顶不住", "没睡好"].forEach(mood => assert.match(html, new RegExp(`data-mood="${mood}"`)));
  // 备注从单行输入改成能写多行的文本域，状态词与备注都非必填
  assert.match(html, /<textarea id="workout-note"/);
  assert.doesNotMatch(html, /<input id="workout-note"/);
});

test("动作选择器提供本地搜索，选项带名称、部位和器械关键词", () => {
  const view = loadView();
  const html = view.exerciseLibraryHtml("chest", [], [], []);
  assert.match(html, /id="workout-exercise-search"/);
  assert.match(html, /data-search="哑铃卧推 胸 哑铃"/);
  assert.match(html, /class="exercise-empty" hidden/);
  // 搜不到时直接用关键词新建自定义动作
  assert.match(html, /id="workout-exercise-create"/);
});

test("动作库补齐常见动作，训练日归属正确", () => {
  const ids = new Set(workout.catalog.exercises.map(item => item.id));
  ["incline_dumbbell_fly", "smith_machine_bench_press", "t_bar_row", "lat_pulldown_reverse", "single_leg_press", "copenhagen_plank", "arnold_press", "cable_hammer_curl", "dead_bug", "farmer_carry", "battle_rope"].forEach(id => assert.ok(ids.has(id), id));
  assert.ok(workout.catalog.exercises.length >= 100, `动作数 ${workout.catalog.exercises.length}`);
  assert.ok(workout.catalog.forDay("chest").some(item => item.id === "incline_dumbbell_fly"));
  assert.ok(workout.catalog.forDay("back").some(item => item.id === "t_bar_row"));
  assert.ok(workout.catalog.forDay("legs").some(item => item.id === "single_leg_press"));
  assert.ok(workout.catalog.forDay("arms").some(item => item.id === "cable_hammer_curl"));
  assert.ok(workout.catalog.forDay("cardio").some(item => item.id === "battle_rope"));
});

test("空闲页给出上次这一练与补记入口", () => {
  const view = loadView();
  const last = workout.createSession("chest", new Date("2026-10-13T00:00:00"));
  last.status = "completed";
  workout.addExercise(last, "dumbbell_bench_press");
  last.exercises[0].sets = [{ weight_kg: 20, reps: 10 }];
  const html = view.idleHtml("chest", [last]);
  assert.match(html, /class="workout-last"/);
  assert.match(html, /上次胸日/);
  assert.match(html, /2026-10-13/);
  assert.match(html, /哑铃卧推 20×10/);
  assert.match(html, /id="workout-backfill"/);
  assert.match(html, /id="workout-backfill-date"/);
  // 没有记录时整块不渲染，不编造安排
  assert.doesNotMatch(view.idleHtml("chest", []), /class="workout-last"/);
});

test("历史卡与详情显示状态词", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date("2026-10-13T00:00:00"));
  session.status = "completed";
  session.mood = "不错";
  assert.match(view.idleHtml("chest", [session]), /class="history-mood">不错</);
  assert.match(view.detailHtml(session), /class="record-mood">不错</);
});

test("动作选择器按练过的次数排序，常用动作排在前面", () => {
  const view = loadView();
  const chest = workout.catalog.forDay("chest");
  const frequent = chest[chest.length - 1]; // 原本排在最后的动作
  const cold = chest[0];
  const records = [];
  for (let i = 0; i < 3; i += 1) {
    const session = workout.createSession("chest", new Date(`2026-10-0${i + 1}T00:00:00`));
    session.status = "completed";
    workout.addExercise(session, frequent.id);
    session.exercises[0].sets = [{ weight_kg: 30, reps: 12 }];
    records.push(session);
  }
  const html = view.exerciseLibraryHtml("chest", [], [], records);
  const hotAt = html.indexOf(`data-add-exercise="${frequent.id}"`);
  const coldAt = html.indexOf(`data-add-exercise="${cold.id}"`);
  assert.ok(hotAt >= 0 && coldAt >= 0);
  assert.ok(hotAt < coldAt, "练过的动作应排在没练过的前面");
  assert.match(html, /练过 3 次/);
  assert.match(html, /当天动作在前/);
  // 不再限制在当天训练日：腿日的动作也能在胸日列表里直接选到
  assert.match(html, /data-add-exercise="barbell_squat"/);
  // 没有历史时保持动作库原序，不编造常用度
  const plain = view.exerciseLibraryHtml("chest", [], [], []);
  assert.ok(plain.indexOf(`data-add-exercise="${cold.id}"`) < plain.indexOf(`data-add-exercise="${frequent.id}"`));
});
