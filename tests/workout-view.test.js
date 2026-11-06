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
  // addSet 会继承上一组数值，这里显式清空，才构成「第 2 组待填」的场景。
  // 全部组都有记录的动作走收小态，另见「已完成动作」那条测试。
  session.exercises[0].sets[1] = { weight_kg: 0, reps: 0, rpe: "", note: "" };
  const html = view.editorHtml(session, "chest");
  // 有数值的第 1 组收起成一行，第 2 组（待填）展开。
  assert.equal((html.match(/class="set-row is-collapsed"/g) || []).length, 1);
  assert.equal((html.match(/class="set-row is-active"/g) || []).length, 1);
  // 未完成动作不受收小影响：没有 is-done-compact，也没有折叠标记
  assert.doesNotMatch(html, /is-done-compact/);
  assert.doesNotMatch(html, /exercise-fold-mark/);
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

test("已完成动作整卡收小：保留数值可点开，未完成动作完全不变", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date(2026, 8, 20));
  workout.addExercise(session, "dumbbell_bench_press");
  workout.addExercise(session, "machine_chest_press");
  // 第一个动作三组全填满（已完成），第二个只填一组（未完成）
  session.exercises[0].sets = [
    { weight_kg: 20, reps: 10, rpe: "", note: "" },
    { weight_kg: 20, reps: 9, rpe: "", note: "" },
    { weight_kg: 17.5, reps: 12, rpe: "", note: "" },
  ];
  session.exercises[1].sets = [
    { weight_kg: 45, reps: 12, rpe: "", note: "" },
    { weight_kg: 0, reps: 0, rpe: "", note: "" },
  ];
  const html = view.editorHtml(session, "chest");
  // 按 <article 切段：card 的 class 在 data-exercise-card 之前，只按属性切会把 class 落掉
  const cardStart = id => html.lastIndexOf("<article", html.indexOf(`data-exercise-card="${id}"`));
  const doneCard = html.slice(cardStart(0), cardStart(1));
  const pendingCard = html.slice(cardStart(1));

  // 已完成：收小态、折叠标记、不显示上次表现与组间歇建议
  assert.match(doneCard, /session-exercise is-done is-done-compact/);
  assert.match(doneCard, /class="exercise-fold-mark"[^>]*aria-expanded="false"/);
  assert.doesNotMatch(doneCard, /class="exercise-last/);
  assert.doesNotMatch(doneCard, /class="rest-advice"/);
  // 三组都收成只读一行，仍能看见重量次数，没有常驻删除叉、没有展开的编辑器
  assert.equal((doneCard.match(/class="set-row is-collapsed"/g) || []).length, 3);
  assert.equal((doneCard.match(/class="set-line is-readonly"/g) || []).length, 3);
  assert.doesNotMatch(doneCard, /set-row is-active/);
  assert.doesNotMatch(doneCard, /data-set-delete/);
  assert.match(doneCard, /20 kg × 10/);
  assert.match(doneCard, /3\/3 组/);

  // 未完成：当前组仍展开，上次表现、组间歇建议、删除叉都在，没有折叠标记
  assert.doesNotMatch(pendingCard, /is-done-compact/);
  assert.doesNotMatch(pendingCard, /exercise-fold-mark/);
  assert.match(pendingCard, /set-row is-active/);
  assert.match(pendingCard, /class="rest-advice"/);
  assert.match(pendingCard, /data-set-delete/);

  // 展开过的动作回到完整态（内存态由 uiState 传入）
  const expanded = view.editorHtml(session, "chest", [], { openSets: {}, expandedDone: new Set([session.exercises[0].id]) });
  const expandedStart = expanded.lastIndexOf("<article", expanded.indexOf('data-exercise-card="0"'));
  const expandedCard = expanded.slice(expandedStart, expanded.lastIndexOf("<article", expanded.indexOf('data-exercise-card="1"')));
  assert.doesNotMatch(expandedCard, /is-done-compact/);
  assert.match(expandedCard, /aria-expanded="true"/);
  assert.match(expandedCard, /class="exercise-last/);
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
  // 训练页只统计这次训练里的动作；空训练不显示进展块（三个零不是信息）
  assert.doesNotMatch(view.editorHtml(session, "chest", history), /动作进展/);
  workout.addExercise(session, "dumbbell_bench_press");
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
  assert.match(html, /class="set-hint"[^>]*data-fill-last="1"[^>]*>20×10</);
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

test("动作选择器不再常驻自定义入口，只在搜不到时给新建", () => {
  const view = loadView();
  const session = workout.createSession("legs", new Date(2026, 9, 8));
  const html = view.exerciseLibraryHtml("legs", session.exercises, [{ id: "custom_农夫行走", name: "农夫行走" }]);
  // 自定义输入区撤了：动作库基本盖得住，不能默认占着一屏的位置
  assert.doesNotMatch(html, /id="workout-custom-form"/);
  assert.doesNotMatch(html, /data-add-custom=/);
  // 新建入口只存在于那个默认隐藏的空态里（搜索无结果时才由脚本放开）
  assert.match(html, /id="workout-exercise-create"/);
  assert.match(html, /class="exercise-empty" hidden/);
  // 列表被包在独立的滚动区里，头和搜索不跟着滚
  assert.match(html, /class="lib-scroll"/);
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
  // 历史卡整张可点；编辑入口移到详情弹窗里
  assert.match(history, /data-history-view=/);
  assert.doesNotMatch(history, /data-history-edit=/);
  assert.match(detail, /data-history-edit=/);
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
  assert.match(html, /class="history-facts"/);
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

test("结束区训练中默认收成一行，点开才是时长、状态词与备注", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date());
  const collapsed = view.editorHtml(session, "chest");
  // 默认收起：只留日期一行，▾ 与 aria-expanded 说明里面还有东西
  assert.match(collapsed, /class="workout-completion is-collapsed"/);
  assert.match(collapsed, /class="workout-completion-head" data-completion-toggle aria-expanded="false"/);
  assert.match(collapsed, /class="workout-fold-mark"/);
  assert.match(collapsed, /class="workout-completion-hint">状态词 · 备注</);
  // 内容仍在 DOM 里（只是收起），否则填完收起再展开就丢值
  assert.match(collapsed, /id="workout-duration"/);
  assert.match(collapsed, /id="workout-note"/);
  // 已经选过状态词的，收起行直接把它露出来
  session.mood = "不错";
  assert.match(view.editorHtml(session, "chest"), /class="workout-completion-hint">状态 · 不错</);
  // 点开态由内存开关控制
  const opened = view.editorHtml(session, "chest", [], { completionOpen: true });
  assert.match(opened, /class="workout-completion is-open"/);
  assert.match(opened, /aria-expanded="true"/);
  // 历史详情是回看，不受这个收起开关影响：状态词与备注直接展示
  const record = workout.createSession("chest", new Date(2026, 8, 20));
  record.status = "completed";
  record.mood = "练爽了";
  record.note = "今天状态很好";
  const detail = view.detailHtml(record);
  assert.match(detail, /class="record-mood">练爽了</);
  assert.match(detail, /class="record-note">今天状态很好</);
  assert.doesNotMatch(detail, /workout-completion/);
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
  // 上次这一练并进了开始卡：日期与动作/组数在事实行，末组落在账本行上
  assert.match(html, /class="workout-start-card"/);
  assert.match(html, /今天 · 胸日/);
  assert.match(html, /2026-10-13/);
  assert.match(html, /哑铃卧推<\/b> 20×10/);
  // 补记入口不单独提供：想补哪一天，开始训练后在结束区改日期
  assert.doesNotMatch(html, /workout-backfill/);
  // 没有记录时不给上次事实，也不给「照上次练」，不编造安排
  const empty = view.idleHtml("chest", []);
  assert.doesNotMatch(empty, /class="start-repeat"/);
  assert.match(empty, /这个训练日还没有记录/);
});

test("历史卡与详情显示状态词", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date("2026-10-13T00:00:00"));
  session.status = "completed";
  session.mood = "不错";
  assert.match(view.idleHtml("chest", [session]), /class="history-stamp">不错</);
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

test("统计：一行事实，容量带千分位，没录时是破折号而不是 0", () => {
  const view = loadView();
  const session = workout.createSession("legs", new Date(2026, 10, 4));
  workout.addExercise(session, "barbell_squat");
  session.exercises[0].sets = Array.from({ length: 6 }, () => ({ weight_kg: 100, reps: 12 }));
  const html = view.statsHtml(workout.calculateStats(session));
  // 四位数带千分位：不加逗号在窄屏上会读成一团数字
  assert.match(html, /data-workout-stat="volume">7,200</);
  assert.match(html, /<b data-workout-stat="setCount">6<\/b>组/);
  // 开场必然为 0，就不拿它当主视觉：排了动作还没录时容量是一条破折号
  const draft = workout.createSession("legs", new Date(2026, 10, 4));
  workout.addExercise(draft, "barbell_squat");
  assert.match(view.statsHtml(workout.calculateStats(draft)), /data-workout-stat="volume">—</);
  assert.doesNotMatch(view.statsHtml(workout.calculateStats(draft)), />0<\/b> kg/);
  // 一个动作都没排时整行不出现，不报三个零
  assert.equal(view.statsHtml(workout.calculateStats(workout.createSession("legs", new Date(2026, 10, 4)))), "");
  // 四栏等分和超大主数字的旧结构都不再出现
  assert.doesNotMatch(html, /class="workout-stat"/);
  assert.doesNotMatch(html, /workout-summary-hero/);
});

test("动作进展：只练过一次的动作在有可比数据时收成一行计数，不占整行", () => {
  const view = loadView();
  const make = (date, weight, reps) => {
    const session = workout.createSession("legs", new Date(`${date}T00:00:00`));
    workout.addExercise(session, "barbell_squat");
    session.status = "completed";
    session.date = date;
    session.exercises[0].sets = [{ weight_kg: weight, reps }];
    return session;
  };
  const once = workout.createSession("chest", new Date(2026, 9, 1));
  workout.addExercise(once, "dumbbell_bench_press");
  once.status = "completed";
  once.date = "2026-10-01";
  once.exercises[0].sets = [{ weight_kg: 20, reps: 10 }];
  const html = view.idleHtml("chest", [once, make("2026-10-01", 60, 8), make("2026-10-08", 62.5, 8)]);
  assert.match(html, /data-exercise-trend="barbell_squat"/);
  assert.match(html, /\+2\.5 kg/);
  // 只练过一次的哑铃卧推收进计数行，不再单独占一行
  assert.doesNotMatch(html, /data-exercise-trend="dumbbell_bench_press"/);
  assert.match(html, /另有 1 个动作只练过一次/);
});

test("逐组模式只渲染当前这一组，给的是两个大号输入而不是整页卡片", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date(2026, 10, 6));
  workout.addExercise(session, "dumbbell_bench_press");
  const html = view.editorHtml(session, "chest", [], { focus: true, focusTarget: { exercise: 0, set: 0 } });
  assert.match(html, /class="workout-app workout-focus"/);
  assert.match(html, /data-focus-field="weight_kg"/);
  assert.match(html, /data-focus-field="reps"/);
  assert.match(html, /data-focus-done/);
  assert.match(html, /data-focus-overview/);
  // 逐组模式里不该出现总览那套动作卡与统计条
  assert.doesNotMatch(html, /data-exercise-card/);
  assert.doesNotMatch(html, /workout-summary/);
});

test("没有动作时也停在逐组屏，加动作的入口就在这块屏上", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date(2026, 10, 6));
  // 训练从「练什么」开始：空态留在逐组屏，不退回整页
  const empty = view.editorHtml(session, "chest", [], { focus: true, focusTarget: null });
  assert.match(empty, /workout-focus/);
  assert.match(empty, /data-focus-add-exercise/);
  assert.match(empty, /data-focus-cancel/);
  assert.doesNotMatch(empty, /data-exercise-card/);
  // 从总览进来时才给回到逐组的入口
  assert.doesNotMatch(view.editorHtml(session, "chest", [], {}), /workout-focus/);
  assert.match(view.editorHtml(session, "chest", [], {}), /data-focus-enter/);
});

test("总览弹窗与结束弹窗：默认导出里拿得到，含组列表与结束字段", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date(2026, 10, 6));
  workout.addExercise(session, "dumbbell_bench_press");
  // 这两个弹窗是逐组模式唯一的全局入口，缺一个就退回整页总览
  const overview = view.overviewDialogHtml(session, "chest");
  assert.match(overview, /data-focus-jump="0-0"/);
  assert.match(overview, /data-focus-finish-dialog/);
  const finish = view.finishDialogHtml(session);
  assert.match(finish, /id="workout-date"/);
  assert.match(finish, /id="workout-duration"/);
  assert.match(finish, /id="workout-note"/);
  assert.match(finish, /workout-finish-save/);
});

test("逐组屏带秒表与图解位，补记弹窗不走正式训练", () => {
  const view = loadView();
  const session = workout.createSession("chest", new Date(2026, 10, 6));
  workout.addExercise(session, "dumbbell_bench_press");
  const focus = view.editorHtml(session, "chest", [], { focus: true, focusTarget: { exercise: 0, set: 0 } });
  assert.match(focus, /data-focus-timer/);
  assert.match(focus, /data-move-figure/);
  // 补记是独立的轻量入口：日期、训练日、时长、备注，没有组数据
  const backfill = view.backfillDialogHtml("chest");
  assert.match(backfill, /id="backfill-date"/);
  assert.match(backfill, /id="backfill-day"/);
  assert.match(backfill, /id="backfill-duration"/);
  assert.match(backfill, /id="backfill-save"/);
  assert.doesNotMatch(backfill, /data-focus/);
  // 空闲页给了这个入口
  assert.match(view.idleHtml("chest", []), /data-backfill/);
});
