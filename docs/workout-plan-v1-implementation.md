# 力训三分化训练计划 v1 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用本地确定性规则引擎生成"2 轮 × 3 天 PPL"训练计划，并实现"点计划日 → 建训练草稿 → 编辑保存 → 标记完成"的完整交互，同时交付版本化的生成原理文档。

**Architecture:** 计划生成逻辑为纯函数（`WorkoutPlan.generatePlan(preferences, records)`），不依赖 DOM/localStorage，可在 Node 中单测；动作池从 `js/workout-catalog.js` 现成目录派生；计划视图与交互复用现有 `WorkoutView` / `WorkoutUI` 的弹窗与编辑器，训练记录模型（`workout_session` schema v2）不变。

**Tech Stack:** 原生 JavaScript（UMD 模块 + IIFE）、Node 内置 `node:test`、Vue 入口复用共享 JS。

**关联文档:** `docs/workout-plan-generation-principles.md`（生成原理 v1）、`docs/workout-plan-v1-design.md`（实现设计）。

---

## 文件结构

| 文件 | 职责 | 动作 |
| --- | --- | --- |
| `js/workout-plan.js` | 规则引擎（动作池、结构、渐进超负荷）、进度存储 | 修改（新增函数） |
| `js/workout-view.js` | 计划日卡视图 HTML（`planViewHtml`） | 修改（新增函数） |
| `js/workout-ui.js` | 生成/查看/点日卡事件接线 | 修改（改 3 处事件） |
| `tests/workout-plan.test.js` | 规则引擎与进度测试 | 新建 |
| `docs/workout-ai-plan-spec.md` | 更新为"本地规则为主"的描述 | 修改 |
| `README.md` | 功能概览补一行计划说明 | 修改 |

## 关键约定

- 计划日映射：`push→chest`、`pull→back`、`legs→legs`（记录沿用现有枚举，标题显示"推日 · 第 1 轮"）。
- 建议重量规则：最近一次全部完成且平均 RPE≤8（缺省视为满足）→ +2.5kg；否则维持；无历史 → `null`。
- 第 2 轮复合动作与第 1 轮相同；孤立动作在第 1 轮基础上"顺延一位（循环）"替换。
- 每天 6 个动作：4 复合 + 2 孤立。
- 进度键 `cat-newsroom-workout-plan-progress-v1`，`plan_generated_at` 与计划不匹配则视为无效。

---

### Task 1: 动作池与 6 日结构

**Files:**
- Modify: `js/workout-plan.js`
- Test: `tests/workout-plan.test.js`

- [ ] **Step 1: 写失败测试（结构与映射）**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const plan = require("../js/workout-plan.js");

test("生成 2 轮 × 3 天 PPL 结构", () => {
  const result = plan.generatePlan({ preferences: { goal: "hypertrophy" }, records: [] });
  assert.equal(result.days.length, 6);
  const splits = result.days.map(d => d.split_day);
  assert.deepEqual(splits, ["push", "pull", "legs", "push", "pull", "legs"]);
  assert.deepEqual(result.days.map(d => d.round), [1, 1, 1, 2, 2, 2]);
  assert.deepEqual(result.days.map(d => d.training_day), ["chest", "back", "legs", "chest", "back", "legs"]);
  assert.equal(result.days[0].title, "推日 · 第 1 轮");
  assert.equal(result.days[3].title, "推日 · 第 2 轮");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/workout-plan.test.js`
Expected: FAIL（`generatePlan` 未定义）

- [ ] **Step 3: 实现结构生成**

在 `js/workout-plan.js` 工厂内新增：

```js
const SPLIT_SEQUENCE = [
  { split_day: "push", training_day: "chest", name: "推日", focus: "胸 + 前束 + 三头" },
  { split_day: "pull", training_day: "back", name: "拉日", focus: "背 + 后束 + 二头" },
  { split_day: "legs", training_day: "legs", name: "腿日", focus: "股四头 + 腘绳 + 臀 + 小腿" },
];

function buildStructure() {
  return Array.from({ length: 6 }, (_, index) => {
    const template = SPLIT_SEQUENCE[index % 3];
    const round = Math.floor(index / 3) + 1;
    return {
      day_index: index + 1, round, split_day: template.split_day,
      training_day: template.training_day, title: `${template.name} · 第 ${round} 轮`,
      focus: template.focus, exercises: [], notes: "",
    };
  });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/workout-plan.test.js`
Expected: PASS

- [ ] **Step 5: 语法检查**

Run: `node --check js/workout-plan.js`
Expected: 无输出（成功）

---

### Task 2: 动作池、动作选择与第 2 轮替换

**Files:**
- Modify: `js/workout-plan.js`
- Test: `tests/workout-plan.test.js`

- [ ] **Step 1: 写失败测试（选动作与替换）**

```js
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/workout-plan.test.js`
Expected: FAIL（exercises 为空）

- [ ] **Step 3: 实现动作池与选择**

在 `js/workout-plan.js` 顶部（工厂内）定义池（exercise_id 顺序即选择顺序）：

```js
const POOLS = {
  push: {
    compounds: ["barbell_bench_press", "dumbbell_bench_press", "machine_chest_press", "dumbbell_bench_press_incline", "barbell_bench_press_incline", "strict_press", "dumbbell_shoulder_press", "machine_shoulder_press"],
    isolations: ["cable_fly_mid", "dumbbell_lateral_raise", "pec_deck", "cable_fly_high", "cable_fly_low", "rope_pushdown", "bar_pushdown", "overhead_extension", "skull_crusher"],
  },
  pull: {
    compounds: ["pull_up", "lat_pulldown_wide", "barbell_row", "seated_cable_row", "one_arm_dumbbell_row", "machine_row", "lat_pulldown_close", "straight_arm_pulldown"],
    isolations: ["face_pull", "reverse_pec_deck", "dumbbell_curl", "hammer_curl", "barbell_curl", "preacher_curl", "cable_curl"],
  },
  legs: {
    compounds: ["barbell_squat", "romanian_deadlift", "leg_press", "hack_squat", "conventional_deadlift", "bulgarian_split_squat", "walking_lunge", "hip_thrust"],
    isolations: ["leg_extension", "leg_curl", "calf_raise"],
  },
};
const COMPOUND_COUNT = 4;
const ISOLATION_COUNT = 2;
```

选择函数（顺延一位 = 从 index+1 开始循环取）：

```js
function pickExercises(pool, startOffset = 0) {
  const compounds = Array.from({ length: COMPOUND_COUNT }, (_, i) =>
    pool.compounds[(i + startOffset) % pool.compounds.length]);
  const isolations = Array.from({ length: ISOLATION_COUNT }, (_, i) =>
    pool.isolations[(i + 1 + startOffset) % pool.isolations.length]);
  return { compounds, isolations };
}
```

生成计划时按轮次填充（第 2 轮复合沿用第 1 轮、孤立顺延替换，由 `startOffset` 体现：第 2 轮 `startOffset = 1` 且复合从第 1 轮结果中复制）：

```js
function fillExercises(day, pool, round1Compounds, startOffset) {
  const chosen = pickExercises(pool, startOffset);
  const compoundIds = round1Compounds || chosen.compounds;
  const allIds = [...compoundIds, ...chosen.isolations];
  allIds.forEach((id, index) => {
    day.exercises.push({
      exercise_id: id, name: "", order: index + 1,
      sets: index < COMPOUND_COUNT ? 4 : 3, reps: index < COMPOUND_COUNT ? "8-12" : "10-15",
      rest_seconds: index < COMPOUND_COUNT ? 120 : 90, weight_kg: null,
      intensity_hint: "RPE 7-8", rationale: "",
    });
  });
}
```

在 `generatePlan` 中：遍历 6 天，第 1~3 天 `startOffset=0` 且记录其复合列表；第 4~6 天 `startOffset=1`、复合沿用第 1 轮对应天（`round1Compounds`）。动作名从 `WorkoutCatalog.exercises` 按 `exercise_id` 补齐（catalog 通过 `root?.WorkoutCatalog || require("./workout-catalog.js")` 获取；Node 下可用 `require`）。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/workout-plan.test.js`
Expected: PASS

- [ ] **Step 5: 语法检查**

Run: `node --check js/workout-plan.js`
Expected: 无输出

---

### Task 3: 渐进超负荷建议重量

**Files:**
- Modify: `js/workout-plan.js`
- Test: `tests/workout-plan.test.js`

- [ ] **Step 1: 写失败测试（三态规则）**

```js
const workout = require("../js/workout.js");

function completedSession(date, entries) {
  const session = workout.createSession("chest", new Date(date));
  session.status = "completed";
  session.exercises = entries.map(([exerciseId, sets]) => ({
    id: `ex-${exerciseId}`, exercise_id: exerciseId, name: exerciseId,
    body_part: "胸", equipment: "杠铃", sets,
  }));
  return session;
}

test("全部练满且 RPE≤8 → 建议 +2.5kg", () => {
  const records = [completedSession("2026-09-10", [["barbell_bench_press", [
    { weight_kg: 50, reps: 10, rpe: 8 },
    { weight_kg: 50, reps: 9, rpe: 7 },
  ]]])];
  const result = plan.generatePlan({ preferences: {}, records });
  const bench = result.days[0].exercises.find(e => e.exercise_id === "barbell_bench_press");
  assert.equal(bench.weight_kg, 52.5);
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/workout-plan.test.js`
Expected: FAIL（weight_kg 断言不符）

- [ ] **Step 3: 实现建议重量规则**

```js
function lastCompleted(records, exerciseId) {
  const sessions = (records || [])
    .filter(r => r?.kind === "workout_session" && r.schema_version === 2 && r.status !== "draft" && !r.deleted_at)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  for (const session of sessions) {
    const entry = (session.exercises || []).find(e => e.exercise_id === exerciseId);
    if (entry?.sets?.length) return entry;
  }
  return null;
}

function suggestWeight(records, exerciseId) {
  const entry = lastCompleted(records, exerciseId);
  if (!entry) return null;
  // 已落地：组级 completed 已移除。一组有数值即为记录；planned_sets 记录本次打算练几组，
  // “记录组数 ≥ planned_sets”才算练满（删掉的空组不算）。旧数据无 planned_sets 时按全部组数兜底。
  const hasRecord = s => Number(s?.weight_kg || 0) > 0 || Number(s?.reps || 0) > 0
    || Number(s?.duration_min || 0) > 0 || Number(s?.distance_km || 0) > 0;
  const done = entry.sets.filter(hasRecord);
  const planned = Math.max(Number(entry.planned_sets || 0), entry.sets.length);
  const allDone = done.length >= planned;
  const rated = done.filter(s => s.rpe);
  const avgRpe = rated.length ? rated.reduce((sum, s) => sum + Number(s.rpe || 0), 0) / rated.length : 8;
  const base = Number(done.at(-1)?.weight_kg || 0);
  if (allDone && avgRpe <= 8) return Math.round((base + 2.5) * 10) / 10;
  return base;
}
```

在 `generatePlan` 中，`fillExercises` 完成后对每个动作执行 `exercise.weight_kg = suggestWeight(records, exercise.exercise_id)`，并补齐 `name`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/workout-plan.test.js`
Expected: PASS

- [ ] **Step 5: 语法检查 + 全量测试**

Run: `node --check js/workout-plan.js && npm test`
Expected: 全部 PASS（含既有测试）

---

### Task 4: 计划保存与完成进度存储

**Files:**
- Modify: `js/workout-plan.js`
- Test: `tests/workout-plan.test.js`

- [ ] **Step 1: 写失败测试（进度读写与版本匹配）**

```js
function fakeStorage() {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
}

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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/workout-plan.test.js`
Expected: FAIL（saveProgress 未定义）

- [ ] **Step 3: 实现进度存储**

在 `js/workout-plan.js` 工厂内：

```js
const PROGRESS_KEY = "cat-newsroom-workout-plan-progress-v1";

function progressStorage(storage) {
  return storage || (typeof localStorage !== "undefined" ? localStorage : null);
}

function saveProgress({ plan_generated_at, day_index, session_id, date, saved_at = new Date().toISOString() }, storage) {
  const target = progressStorage(storage);
  if (!target) return false;
  const current = loadProgress(target) || { plan_generated_at: "", days: {} };
  current.plan_generated_at = plan_generated_at;
  current.days = current.days || {};
  current.days[String(day_index)] = { session_id, date, saved_at };
  target.setItem(PROGRESS_KEY, JSON.stringify(current));
  return true;
}

function loadProgress(storage) {
  const target = progressStorage(storage);
  if (!target) return null;
  try { return JSON.parse(target.getItem(PROGRESS_KEY) || "null"); } catch (_) { return null; }
}

function isProgressValid(progress, planGeneratedAt) {
  return Boolean(progress && progress.plan_generated_at && progress.plan_generated_at === planGeneratedAt);
}

function clearProgress(storage) {
  const target = progressStorage(storage);
  if (target) target.removeItem(PROGRESS_KEY);
}
```

导出：`return { STORAGE_KEY, PROGRESS_KEY, normalize, isValid, load, save, formatMeta, generatePlan, saveProgress, loadProgress, isProgressValid, clearProgress };`

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/workout-plan.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add js/workout-plan.js tests/workout-plan.test.js
git commit -m "feat: 本地规则引擎生成力训三分化计划（结构/选动作/渐进超负荷/进度）"
```

---

### Task 5: 计划日卡视图（`planViewHtml`）

**Files:**
- Modify: `js/workout-view.js`

- [ ] **Step 1: 新增视图函数**

在 `js/workout-view.js` 中新增（复用现有 `escapeHtml`、`dayName` 风格，返回日卡 HTML）：

```js
function planDayCard(day, progress) {
  const done = progress?.days?.[String(day.day_index)];
  const exercises = (day.exercises || []).map(item => {
    const weight = item.weight_kg ? `${escapeHtml(item.weight_kg)} kg` : "重量待填";
    return `<li>${escapeHtml(item.name)} · ${escapeHtml(item.sets)} 组 × ${escapeHtml(item.reps)} · ${weight} · 休息 ${escapeHtml(item.rest_seconds)}s${item.intensity_hint ? ` · ${escapeHtml(item.intensity_hint)}` : ""}</li>`;
  }).join("");
  return `<article class="plan-day-card ${done ? "is-done" : ""}" data-plan-day="${day.day_index}">
    <header><h4>${escapeHtml(day.title)}</h4><span>${escapeHtml(day.focus)}</span>${done ? `<em>✓ 已完成 ${escapeHtml(done.date)}</em>` : ""}</header>
    <ul>${exercises}</ul>
  </article>`;
}

function planViewHtml(plan, progress = null) {
  return `<div class="dialog-head"><div><span class="dialog-kicker">训练计划</span><h3>力训三分化 · ${plan.days.length} 天</h3><p class="dialog-sub">点击某一天开始训练，保存后自动标记完成</p></div><button type="button" class="icon-action" data-dialog-close aria-label="关闭">×</button></div>
    <div class="plan-day-grid">${(plan.days || []).map(day => planDayCard(day, progress)).join("")}</div>`;
}
```

- [ ] **Step 2: 导出视图函数**

在 `workout-view.js` 的 `return` 中新增 `planViewHtml`。

- [ ] **Step 3: 语法检查**

Run: `node --check js/workout-view.js`
Expected: 无输出

- [ ] **Step 4: 提交**

```bash
git add js/workout-view.js
git commit -m "feat: 训练计划日卡视图（含完成标记）"
```

---

### Task 6: 交互接线（生成 / 查看 / 点日建草稿）

**Files:**
- Modify: `js/workout-ui.js`

- [ ] **Step 1: 改"生成六天计划"事件为本地引擎**

替换 `#workout-plan` 事件体中的 AI 调用（`root.generateWorkoutPlan` 整段）为：

```js
const preferences = readJson("cat-newsroom-workout-preferences-v1") || {};
const plan = root.WorkoutPlan.generatePlan({ preferences, records });
plan.generated_at = new Date().toISOString();
root.WorkoutPlan.save(plan);
root.WorkoutPlan.clearProgress();
openDialog(root.WorkoutView.planViewHtml(plan));
```

覆盖确认逻辑保留；按钮文案保持"生成六天计划"。

- [ ] **Step 2: 改"查看计划"事件**

替换 `#workout-plan-view` 事件体为：

```js
const plan = loadPlan();
if (!plan) return root.AppDialog.alert("还没有已保存的训练计划，请先生成。", { title: "暂无计划" });
const progress = root.WorkoutPlan.isProgressValid(root.WorkoutPlan.loadProgress(), plan.generated_at) ? root.WorkoutPlan.loadProgress() : null;
openDialog(root.WorkoutView.planViewHtml(plan, progress));
```

- [ ] **Step 3: 新增"点日卡"事件**

在 `wire()` 中新增（放在既有 `[data-day]` 绑定之后）：

```js
container.querySelectorAll("[data-plan-day]").forEach(card => card.addEventListener("click", async () => {
  const dayIndex = Number(card.dataset.planDay);
  const plan = loadPlan();
  const progress = root.WorkoutPlan.loadProgress();
  const done = progress && root.WorkoutPlan.isProgressValid(progress, plan?.generated_at) ? progress.days?.[String(dayIndex)] : null;
  if (done) {
    const record = findRecord(done.session_id);
    const choice = await root.AppDialog.confirm(
      record ? `这天已完成（${done.date}），查看记录还是重新练一次？` : "这天已完成，重新练一次？",
      { title: "该日已完成", okText: "重新练一次", cancelText: "查看记录" });
    if (choice) { /* 走下方新建草稿分支 */ }
    else if (record) openDialog(root.WorkoutView.detailHtml(record));
    return;
  }
  const day = plan?.days?.find(item => item.day_index === dayIndex);
  if (!day) return;
  let session = root.Workout.createSession(day.training_day, new Date());
  session.title = day.title;
  const history = records.filter(r => root.Workout.isSession(r));
  for (const item of day.exercises) {
    root.Workout.addExercise(session, item.exercise_id, history);
    const entry = session.exercises.find(e => e.exercise_id === item.exercise_id);
    if (!entry) continue;
    const target = item.sets || entry.sets.length;
    while (entry.sets.length < target) entry.sets.push(JSON.parse(JSON.stringify(entry.sets[0])));
    entry.sets.forEach(set => { if (item.weight_kg) set.weight_kg = item.weight_kg; });
  }
  session._plan_day_index = dayIndex;
  session._plan_generated_at = plan.generated_at;
  session = root.WorkoutUI.startFromPlan ? root.WorkoutUI.startFromPlan(session) : session;
  container.dispatchEvent(new CustomEvent("workout:plan-day", { detail: { session } }));
}));
```

- [ ] **Step 4: 新增"草稿保存后标记完成"钩子**

在 `workout-ui.js` 的保存成功处（`options.onSave(saved)` 之后）追加：

```js
if (session._plan_generated_at && session._plan_day_index != null) {
  root.WorkoutPlan.saveProgress({
    plan_generated_at: session._plan_generated_at,
    day_index: session._plan_day_index,
    session_id: saved.id,
    date: saved.date,
  });
}
```

并在 `mount` 时监听 `workout:plan-day`：设置 `session` 状态、`persistDraft()`、`render()`（与 `#workout-start` 行为一致）。同时确保 `upsertSession` 前不清除 `_plan_*` 字段（`cloneRecord` 会保留未知字段，`_editing_record_id` 才被删除，天然兼容）。

- [ ] **Step 5: 语法检查 + 全量测试**

Run: `node --check js/workout-ui.js && npm test`
Expected: 全部 PASS

- [ ] **Step 6: 本地手动验收**

Run: `python3 -m http.server 8765`（在项目根目录），浏览器打开 `http://127.0.0.1:8765/`
Expected:
- 运动页"生成六天计划"无网络请求即产出 6 天计划，打开计划视图显示 6 张日卡。
- 点"推日 · 第 1 轮"进入编辑器，动作/组次/建议重量预填正确，日期为当天。
- 完成训练保存后，再次打开计划，该日卡显示"✓ 已完成"。
- 再点已完成日卡出现"查看记录 / 重新练一次"选项。

- [ ] **Step 7: 提交**

```bash
git add js/workout-ui.js
git commit -m "feat: 计划日点击创建训练草稿并标记完成"
```

---

### Task 7: 文档同步（spec 与 README）

**Files:**
- Modify: `docs/workout-ai-plan-spec.md`
- Modify: `README.md`

- [ ] **Step 1: 更新 `docs/workout-ai-plan-spec.md`**

在文件开头追加段落：

```markdown
> 更新（2026-09-20）：计划生成主路径已改为本地规则引擎（`WorkoutPlan.generatePlan`），生成原理见 [训练计划生成原理 v1](./workout-plan-generation-principles.md)。AI Edge Function `generate-workout-plan` 保留但不作为默认入口。
```

- [ ] **Step 2: 更新 `README.md` 功能概览**

在运动模块相关条目后追加：

```markdown
- 训练计划：本地规则引擎生成"2 轮 × 3 天推拉腿（PPL）"计划，点击计划日自动创建训练记录，保存后标记完成；渐进超负荷规则见 [生成原理](docs/workout-plan-generation-principles.md)。
```

- [ ] **Step 3: 提交**

```bash
git add docs/workout-ai-plan-spec.md README.md
git commit -m "docs: 训练计划本地规则引擎说明同步"
```

---

## 自审

- **Spec 覆盖**：生成原理 6 节（结构/选动作/组次/渐进/边界/版本）→ Task 1/2/3 + 原理文档；设计文档交互 5 步 → Task 5/6；验收标准全部映射到 Task 1~6 的测试与手动验收。
- **占位符扫描**：无 TBD/TODO；所有代码块为可直接落地的完整实现。
- **类型一致性**：`generatePlan/saveProgress/loadProgress/isProgressValid/clearProgress/planViewHtml` 名称在 Task 1~6 中保持一致；`weight_kg` 三态（null/维持/+2.5kg）与原理文档一致。
