# 记运动模块移动端交互优化 Prompt

## 项目背景

这是一个个人生活记录工作台项目（cat-newsroom），其中"记运动"模块是一个力量训练日志。用户按训练日（胸日/背日/肩日/腿日等）选择预置动作，逐组记录重量、次数、RPE，支持有氧动作（时长/距离/配速）。数据存储在 localStorage，支持草稿自动保存。

## 需要修改的文件

| 文件 | 作用 |
|------|------|
| `js/workout-view.js` | 视图层：生成所有 HTML 字符串 |
| `js/workout-ui.js` | 控制器：事件绑定、状态管理、草稿持久化 |
| `css/workout-ui.css` | 样式：布局、响应式、移动端适配 |

## 当前代码结构概要

- `WorkoutView.editorHtml(session, selectedDay, history)` → 返回编辑态 HTML
- `WorkoutView.idleHtml(selectedDay, records)` → 返回空闲态 HTML
- `WorkoutView.setRows(exercise, exerciseIndex)` → 返回每组的 HTML（重量/次数/RPE 输入框）
- `WorkoutView.quickExerciseHtml(selectedDay, exercises)` → 快捷添加 chips
- `WorkoutUI.mount(container, options)` → 挂载到容器，内部 `wireEditor()` 绑定编辑态事件
- `session.exercises[i].sets[j]` → `{ weight_kg, reps, rpe, completed }` 或有氧字段
- `root.Workout.addExercise(session, exerciseId, records)` → 添加动作，自动带入上次组数据
- `root.Workout.previousPerformance(records, exerciseId)` → 返回上次完成组数据
- `root.Workout.calculateStats(session)` → 返回 `{ exerciseCount, setCount, reps, volume }`
- 移动端容器有 `.mobile-shell` class，底部有 64px 的导航栏（tabbar）
- 控制器已有 `data-set-adjust` 事件处理逻辑（步进器增减），但视图层从未渲染对应按钮——这是死代码

## 优化清单（共 12 项，按优先级排序）

---

### 优化 1 [P0]：移动端浮动添加动作按钮

**问题**：添加多个动作后，页面往下很长，要再加动作必须滚回顶部点击"+ 添加动作"。移动端这是最大的交互痛点。

**方案**：在移动端编辑态，当动作列表超过 1 个动作时，在页面底部浮动显示一个"+ 添加动作"按钮，与底部导航栏（64px tabbar）保持间距。桌面端不需要此浮动按钮（空间足够）。

**视图层改动** (`workout-view.js` `editorHtml`)：
- 在 `workout-layout` 的 `<main>` 内部，`session-list` 的末尾加一个"追加动作"区域，始终可见：
```html
<div class="workout-add-floating">
  <button type="button" class="workout-btn primary" id="workout-add-floating">+ 添加动作</button>
</div>
```
这个按钮放在 `session-list` div 之后、`</main>` 之前。

**控制器改动** (`workout-ui.js` `wireEditor`)：
- 给 `#workout-add-floating` 绑定与 `#workout-add-exercise` 相同的 `openExerciseLibrary` 事件。

**样式改动** (`workout-ui.css`)：
- 桌面端隐藏：`.workout-add-floating { display:none; }`
- 移动端显示为 sticky 浮动条：
```css
.mobile-shell .workout-add-floating,
@media (max-width:760px) {
  .workout-add-floating {
    display:flex; justify-content:center;
    position:sticky; bottom:80px; z-index:3;
    padding:8px 0; margin-top:8px;
  }
  .workout-add-floating .workout-btn { width:100%; max-width:320px; }
}
```
- `bottom:80px` 是 64px tabbar + 16px 间距。确保不遮挡底部的提交栏（提交栏 `bottom:64px`，但提交栏有自己的 sticky 容器，浮动添加按钮在动作列表区域内不会冲突）。

---

### 优化 2 [P0]：步进器按钮渲染

**问题**：`workout-ui.js` 第 132-144 行已有完整的 `data-set-adjust` 步进器逻辑（按步长增减重量/次数），但 `workout-view.js` 的 `setRows()` 从未渲染这些按钮——死代码。

**方案**：在 `setRows()` 中，重量和次数输入框两侧添加 `-` / `+` 步进按钮。RPE 也可加但步长为 1。

**视图层改动** (`workout-view.js` `setRows`)：

力量训练组，把每个字段从单纯的 `<input>` 改为步进器组件：
```javascript
// 重量字段
`<label><span>重量 kg</span>
  <div class="stepper">
    <button type="button" class="stepper-btn" data-set-adjust="weight_kg" data-exercise="${exerciseIndex}" data-set="${setIndex}" data-step="-2.5" aria-label="减少重量">−</button>
    <input type="number" min="0" step="2.5" value="${escapeHtml(set.weight_kg)}" data-set-field="weight_kg" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-label="重量">
    <button type="button" class="stepper-btn" data-set-adjust="weight_kg" data-exercise="${exerciseIndex}" data-set="${setIndex}" data-step="2.5" aria-label="增加重量">+</button>
  </div>
</label>`

// 次数字段同理，data-step="-1" / "1"
// RPE 字段同理，data-step="-1" / "1"，min=1 max=10
```

有氧/恢复组不变（时长/距离/配速不太需要步进），或仅时长加步进器（步长 5 分钟）。

**样式改动** (`workout-ui.css`)：
```css
.stepper { display:flex; align-items:stretch; min-width:0; }
.stepper-btn { flex:0 0 30px; border:1px solid var(--border-input); border-radius:6px; background:var(--surface-nested); color:var(--text); cursor:pointer; font-size:16px; font-weight:700; }
.stepper-btn:first-child { border-radius:6px 0 0 6px; border-right:0; }
.stepper-btn:last-child { border-radius:0 6px 6px 0; border-left:0; }
.stepper input { border-radius:0 !important; flex:1; min-width:0; }
```
- 移动端 `.stepper-btn { flex:0 0 36px; font-size:18px; }` 确保触摸目标够大。

---

### 优化 3 [P0]：组完成状态视觉反馈

**问题**：完成的组仅靠 30px ✓ 按钮变色区分，整行卡片外观不变，训练中无法一眼扫出完成进度。

**方案**：完成的组行加背景色变化和左边框高亮；动作卡片头部加"N/M 组完成"进度标签。

**视图层改动** (`workout-view.js`)：
- `setRows()` 的 `set-row` div 加条件 class：`class="set-row ${set.completed ? "completed" : ""}"`
- 动作卡片头部 (`session-exercise-head`) 的 `<div>` 内追加进度标签：
```javascript
const completedSets = exercise.sets.filter(s => s.completed).length;
// 在 strong 和 span 之后追加：
`<em class="set-progress">${completedSets}/${exercise.sets.length} 组</em>`
```

**控制器改动** (`workout-ui.js`)：
- `data-set-done` 点击事件中，除了 toggle 按钮的 `on` class，还需要 toggle 父行 `.set-row` 的 `completed` class，并更新进度标签文本。具体做法：在 `button.classList.toggle("on", set.completed)` 之后，找到最近的 `.set-row` 并 toggle `completed`，然后找到最近的 `.session-exercise-head` 内的 `.set-progress` 更新文本。
- 因为当前 `updateSession({ rerender:false })` 不重新渲染，需要手动更新 DOM。可以简化为直接重新渲染该动作卡片，但为了保留滚动位置，建议手动更新 DOM 元素。

**样式改动** (`workout-ui.css`)：
```css
.set-row.completed { background:color-mix(in srgb, var(--module-1) 8%, var(--surface-card)); border-color:color-mix(in srgb, var(--module-1) 30%, var(--border)); }
.set-row.completed .set-row-head strong { color:var(--module-1); }
.set-progress { margin-left:auto; padding:2px 8px; border-radius:999px; font-size:10px; font-style:normal; font-weight:700; color:var(--text-secondary); background:var(--surface-nested); }
.set-progress.all-done { color:var(--module-1); background:color-mix(in srgb, var(--module-1) 12%, var(--surface-nested)); }
```

---

### 优化 4 [P1]：复制上次训练

**问题**：每次训练都要从零开始——选日、逐个添加动作、逐组填数据。力量训练有高度重复性，同一个训练日计划通常用数周。

**方案**：在空闲态，最近一次同训练日的历史记录卡片上加"复制为今日训练"按钮。点击后以该记录为模板创建新 session，带入所有动作和组数据（status 改为 draft，日期改为今天），直接进入编辑态。

**视图层改动** (`workout-view.js` `historyHtml`)：
- 在每张 `history-card` 的 `history-actions` 区域，详情/编辑按钮之后加一个复制按钮（仅对非 legacy 记录）：
```javascript
// 在 detail 按钮和 edit 按钮之后：
`<button type="button" class="workout-btn compact copy" data-history-copy="${escapeHtml(record.id)}">复制</button>`
```
- 也可以只在最近一条同训练日记录上显示，但实现复杂度更高，先在所有非 legacy 记录上都显示。

**控制器改动** (`workout-ui.js`)：
- 在 `wire()` 中绑定 `data-history-copy`：
```javascript
container.querySelectorAll("[data-history-copy]").forEach(button => button.addEventListener("click", () => {
  const record = findRecord(button.dataset.historyCopy);
  if (!record || !root.Workout.isSession(record)) return;
  session = root.Workout.cloneRecord(record);
  session.id = `workout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  session.status = "draft";
  session.date = dateKey(new Date()); // 改为今天
  delete session._editing_record_id;
  session.updated_at = new Date().toISOString();
  persistDraft();
  render();
}));
```
- 需要在 `workout-ui.js` 顶部引入 `dateKey` 或内联实现：`const d = new Date(); const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;`

**样式改动**：
```css
.workout-btn.copy { border-color:var(--module-3); color:var(--module-3); }
.workout-btn.copy:hover { background:color-mix(in srgb, var(--module-3) 10%, var(--surface-card)); }
```

---

### 优化 5 [P1]：删除组/动作的撤销机制

**问题**：删除组和删除动作都是立即 splice + 重新渲染，无确认无撤销。移动端大拇指容易误触 34px 的 × 按钮，丢失已填好的数据代价高。

**方案**：删除后不立即丢弃，而是显示一个 3 秒的 Toast 提示"已删除：第N组，撤销"，点击撤销恢复数据。

**控制器改动** (`workout-ui.js`)：
- 新增一个轻量 Toast 函数：
```javascript
function showToast(message, actionLabel, onUndo) {
  const toast = document.createElement("div");
  toast.className = "workout-toast";
  toast.innerHTML = `<span>${message}</span>${actionLabel ? `<button type="button" class="workout-toast-undo">${actionLabel}</button>` : ""}`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  let timer = setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 300); }, 3000);
  if (onUndo && actionLabel) {
    toast.querySelector(".workout-toast-undo").addEventListener("click", () => {
      clearTimeout(timer); onUndo(); toast.classList.remove("show"); setTimeout(() => toast.remove(), 300);
    });
  }
}
```
- 删除组时：
```javascript
container.querySelectorAll("[data-set-delete]").forEach(button => button.addEventListener("click", () => {
  const exerciseIndex = Number(button.dataset.exercise);
  const setIndex = Number(button.dataset.set);
  const removed = session.exercises[exerciseIndex].sets.splice(setIndex, 1)[0];
  updateSession();
  showToast(`已删除第 ${setIndex + 1} 组`, "撤销", () => {
    session.exercises[exerciseIndex].sets.splice(setIndex, 0, removed);
    updateSession();
  });
}));
```
- 删除动作时同理，保存 `removed = session.exercises.splice(exerciseIndex, 1)[0]`，Toast 撤销时 splice 回去。

**样式改动** (`workout-ui.css`)：
```css
.workout-toast { position:fixed; left:50%; transform:translateX(-50%) translateY(20px); bottom:100px; z-index:50; display:flex; align-items:center; gap:12px; padding:10px 16px; border-radius:8px; background:var(--text); color:var(--surface-card); box-shadow:var(--shadow-overlay); font-size:13px; opacity:0; transition:opacity .25s, transform .25s; pointer-events:auto; }
.workout-toast.show { opacity:1; transform:translateX(-50%) translateY(0); }
.workout-toast-undo { border:0; background:none; color:var(--module-3); font-weight:700; cursor:pointer; font-size:13px; }
```

---

### 优化 6 [P1]：上次成绩即时对比

**问题**：上次成绩仅显示为一行 11px 灰色小字。力量训练核心驱动力是渐进超负荷，这个关键对比信息太弱。

**方案**：当当前输入值 > 上次时，输入框边框变绿并显示"↑ +Nkg"微型提示。等于或低于时显示灰色参考线。

**视图层改动** (`workout-view.js` `setRows`)：
- 在力量训练组的每个 set-row 中，如果有上次数据，给 input 加 `data-previous` 属性存储上次值：
```javascript
const previous = root.Workout.previousPerformance(history, exercise.exercise_id);
// previous.set 包含 weight_kg, reps 等
```
- 注意 `setRows` 当前只接收 `(exercise, exerciseIndex)`，需要额外传入 `previous` 数据。可以改为在 `editorHtml` 中先计算 previous 再传入，或者改为 `setRows(exercise, exerciseIndex, previous)`。
- 给重量 input 加 `data-previous-weight="${previous?.set?.weight_kg || ""}"`，次数同理。

**控制器改动** (`workout-ui.js`)：
- 在 `data-set-field` 的 `input` 事件中，比较当前值与 `data-previous-*` 属性，动态添加/移除 class：
```javascript
input.addEventListener("input", () => {
  // ... 现有逻辑 ...
  const prevWeight = input.dataset.previousWeight;
  if (prevWeight && input.dataset.setField === "weight_kg") {
    const diff = Number(input.value || 0) - Number(prevWeight);
    input.classList.toggle("better", diff > 0);
    input.classList.toggle("worse", diff < 0 && input.value !== "");
  }
});
```

**样式改动** (`workout-ui.css`)：
```css
.set-fields input.better { border-color:var(--module-1); background:color-mix(in srgb, var(--module-1) 8%, var(--surface-card)); }
.set-fields input.worse { border-color:var(--text-secondary); opacity:.85; }
```

---

### 优化 7 [P2]：休息计时器

**问题**：完成一组后无休息倒计时，用户需要自己掐表。组间休息（60-180 秒）是力量训练核心环节。

**方案**：点击 ✓ 完成一组后，在底部弹出一个轻量休息计时器浮动条。可预设 60s / 90s / 120s，倒计时结束有振动（`navigator.vibrate`）和提示音。不遮挡训练数据。

**视图层改动**：在 `editorHtml` 末尾（`dialogShell()` 之前）加一个空的计时器容器：
```html
<div class="rest-timer" id="rest-timer" hidden>
  <div class="rest-timer-info">
    <span class="rest-timer-label">组间休息</span>
    <span class="rest-timer-count">01:30</span>
  </div>
  <div class="rest-timer-presets">
    <button type="button" data-rest="60">60s</button>
    <button type="button" data-rest="90">90s</button>
    <button type="button" data-rest="120">120s</button>
  </div>
  <button type="button" class="rest-timer-skip" data-rest-skip>跳过</button>
  <div class="rest-timer-bar"><i></i></div>
</div>
```

**控制器改动** (`workout-ui.js`)：
- 新增 `startRestTimer(seconds)` 函数：
```javascript
let restTimerInterval = null;
function startRestTimer(seconds) {
  const el = container.querySelector("#rest-timer");
  if (!el) return;
  el.hidden = false;
  const countEl = el.querySelector(".rest-timer-count");
  const barEl = el.querySelector(".rest-timer-bar i");
  const total = seconds;
  let remaining = seconds;
  clearInterval(restTimerInterval);
  const update = () => {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    countEl.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    barEl.style.width = `${(remaining / total) * 100}%`;
  };
  update();
  restTimerInterval = setInterval(() => {
    remaining--; update();
    if (remaining <= 0) {
      clearInterval(restTimerInterval);
      el.hidden = true;
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
  }, 1000);
}
```
- 在 `data-set-done` 点击事件中，当组从未完成变为完成时调用 `startRestTimer(90)`（默认 90 秒）。
- 绑定 `data-rest` 按钮切换预设时间，`data-rest-skip` 关闭计时器。

**样式改动** (`workout-ui.css`)：
```css
.rest-timer { position:fixed; left:50%; transform:translateX(-50%); bottom:100px; z-index:20; width:min(360px, calc(100vw - 28px)); padding:12px 16px; border-radius:12px; background:var(--text); color:var(--surface-card); box-shadow:var(--shadow-overlay); display:grid; grid-template-columns:1fr auto; gap:8px 12px; align-items:center; }
.rest-timer[hidden] { display:none; }
.rest-timer-label { font-size:10px; opacity:.6; }
.rest-timer-count { font-size:24px; font-weight:700; }
.rest-timer-presets { display:flex; gap:6px; grid-column:2; }
.rest-timer-presets button { padding:4px 10px; border:1px solid rgba(255,255,255,.2); border-radius:6px; background:transparent; color:var(--surface-card); font-size:11px; cursor:pointer; }
.rest-timer-presets button.on { background:var(--module-3); border-color:var(--module-3); color:var(--text); }
.rest-timer-skip { grid-column:2; padding:4px 10px; border:0; background:none; color:rgba(255,255,255,.5); font-size:11px; cursor:pointer; }
.rest-timer-bar { grid-column:1/-1; height:3px; border-radius:2px; background:rgba(255,255,255,.15); overflow:hidden; }
.rest-timer-bar i { display:block; height:100%; background:var(--module-3); transition:width 1s linear; }
```

---

### 优化 8 [P2]：快捷添加 Chips 添加后不消失

**问题**：`quickExerciseHtml()` 用 filter 排除已添加动作，添加后 chip 消失，布局跳动，且不支持超级组（同动作做多组间歇）。

**方案**：已添加的 chip 变为灰色"已添加"状态而非消失。再次点击可添加同动作的第二个实例（带入上次组数据）。

**视图层改动** (`workout-view.js` `quickExerciseHtml`)：
```javascript
function quickExerciseHtml(selectedDay, exercises) {
  const added = new Set((exercises || []).map(item => item.exercise_id));
  const items = root.WorkoutCatalog.forDay(selectedDay).slice(0, 5);
  if (!items.length) return "";
  return `<div class="quick-exercises" aria-label="常用动作">${items.map(item => {
    const isAdded = added.has(item.id);
    return `<button type="button" data-quick-add="${escapeHtml(item.id)}" class="${isAdded ? "is-added" : ""}">${isAdded ? "✓ " : "+ "}${escapeHtml(item.name)}</button>`;
  }).join("")}<button type="button" class="more" data-open-library>更多动作</button></div>`;
}
```

**控制器改动**：当前 `data-quick-add` 点击直接调用 `addExercise`，而 `addExercise` 内部有 `session.exercises.some(item => item.exercise_id === exerciseId)` 去重检查会阻止重复添加。需要修改为允许重复添加：
- 在 `workout.js` 的 `addExercise` 中，去掉去重检查，或改为可配置参数 `addExercise(session, exerciseId, history, { allowDuplicate: true })`。
- 或者更简单：在 `quick-add` 点击时不调用 `addExercise`，而是直接 push 一个新的 exercise 对象（复制 source 但给新 id），带入上次组数据。

**样式改动** (`workout-ui.css`)：
```css
.quick-exercises button.is-added { color:var(--text-secondary); border-color:var(--border); }
.quick-exercises button.is-added:hover { color:var(--module-4); }
```

---

### 优化 9 [P2]：动作库弹窗搜索

**问题**：动作库弹窗按训练日筛选后直接列出所有动作。选"全身日"或"手臂日"时动作可达 10+ 项，需滚动寻找。

**方案**：弹窗顶部加搜索框，支持按名称/部位/器械过滤。同时按器械类型分组。

**视图层改动** (`workout-view.js` `exerciseLibraryHtml`)：
```javascript
function exerciseLibraryHtml(selectedDay, selectedExercises) {
  const selectedIds = new Set((selectedExercises || []).map(item => item.exercise_id));
  const library = root.WorkoutCatalog.forDay(selectedDay);
  // 按器械分组
  const groups = {};
  library.forEach(item => { (groups[item.equipment] = groups[item.equipment] || []).push(item); });
  const groupOrder = ["哑铃", "杠铃", "器械", "绳索", "自重", "有氧", "恢复"];
  const sortedGroups = groupOrder.filter(g => groups[g]).concat(Object.keys(groups).filter(g => !groupOrder.includes(g)));
  return `<div class="dialog-head">...</div>
    <div class="exercise-search"><input type="search" id="exercise-search-input" placeholder="搜索动作名、部位或器械..." aria-label="搜索动作"></div>
    <div class="exercise-library dialog-library">
      ${sortedGroups.map(group => `
        <div class="exercise-group" data-group="${escapeHtml(group)}">
          <div class="exercise-group-title">${escapeHtml(group)}</div>
          ${groups[group].map(item => { /* 现有渲染逻辑 */ }).join("")}
        </div>
      `).join("")}
    </div>`;
}
```

**控制器改动** (`workout-ui.js` `openExerciseLibrary`)：
- 绑定搜索框 `input` 事件，过滤 `.exercise-option` 的文本内容，隐藏不匹配项：
```javascript
dialog.querySelector("#exercise-search-input")?.addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase().trim();
  dialog.querySelectorAll(".exercise-option").forEach(option => {
    const text = option.textContent.toLowerCase();
    option.style.display = !query || text.includes(query) ? "" : "none";
  });
  // 隐藏空分组
  dialog.querySelectorAll(".exercise-group").forEach(group => {
    const visible = group.querySelectorAll('.exercise-option:not([style*="none"])').length;
    group.style.display = visible ? "" : "none";
  });
});
```

**样式改动** (`workout-ui.css`)：
```css
.exercise-search { margin-bottom:12px; }
.exercise-search input { width:100%; height:40px; box-sizing:border-box; border:1px solid var(--border-input); border-radius:8px; padding:0 12px; font:inherit; }
.exercise-group-title { grid-column:1/-1; font-size:11px; font-weight:700; color:var(--text-secondary); padding:8px 0 4px; text-transform:uppercase; letter-spacing:.5px; }
```

---

### 优化 10 [P2]：训练日切换保护

**问题**：切换训练日时，如果已有 session，直接修改 `session.training_day` 和 `session.title` 并重新渲染，无确认。可能误触导致训练日语义不匹配。

**方案**：已有 session 且切换训练日时，弹出确认。确认后修改训练日并保留动作列表（或清空——取决于用户选择）。

**控制器改动** (`workout-ui.js` `wire()` 中的 `data-day` 事件)：
```javascript
container.querySelectorAll("[data-day]").forEach(button => button.addEventListener("click", async () => {
  const newDay = button.dataset.day;
  if (session && newDay !== selectedDay) {
    const confirmed = await root.AppDialog.confirm(
      `切换到「${root.WorkoutCatalog.trainingDays.find(d => d.id === newDay).name}」？当前动作列表会保留。`,
      { title: "切换训练日", okText: "切换" }
    );
    if (!confirmed) return;
  }
  selectedDay = newDay;
  localStorage.setItem(DAY_KEY, selectedDay);
  if (session) {
    session.training_day = selectedDay;
    session.title = root.WorkoutCatalog.trainingDays.find(day => day.id === selectedDay).name;
    updateSession();
  } else render();
}));
```

---

### 优化 11 [P3]：移动端组输入框三列优化

**问题**：`.set-fields` 固定三列（重量/次数/RPE），移动端 360px 屏幕每个输入框约 100px 宽，输入"62.5"偏挤。

**方案**：移动端将 RPE 改为下拉选择（1-10），减少输入框宽度压力。或者三列改两列+RPE 独占一行。或者用更紧凑的步进器替代纯输入框（配合优化 2）。

**视图层改动** (`workout-view.js` `setRows`)：
- RPE 字段从 `<input type="number">` 改为 `<select>`：
```html
<select data-set-field="rpe" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-label="RPE">
  <option value="">-</option>
  ${[...Array(11)].map((_, i) => `<option value="${i}" ${set.rpe == i ? "selected" : ""}>${i}</option>`).join("")}
</select>
```
- 配合步进器（优化 2），重量和次数各占一列步进器，RPE 用 select，三列变两步进器+一下拉，更紧凑。

**控制器改动**：`data-set-field` 的 `input` 事件对 `<select>` 同样触发，但值是字符串。现有逻辑 `Number(input.value)` 已处理。步进器对 RPE 可用 data-set-adjust 但改为 select 后无需步进。

**样式改动** (`workout-ui.css`)：
```css
.set-fields select { width:100%; height:36px; border:1px solid var(--border-input); border-radius:6px; padding:0 6px; text-align:center; color:var(--text); background:var(--surface-card); }
.mobile-shell .set-fields select, @media (max-width:760px) { .set-fields select { height:40px; font-size:16px; } }
```

---

### 优化 12 [P3]：移动端提交栏底部安全间距

**问题**：移动端提交栏 `position:sticky; bottom:64px`，与底部导航栏 (64px tabbar) 贴合，但没有额外间距，视觉上太紧。且浮动添加按钮（优化 1）`bottom:80px` 可能与提交栏在某些滚动位置重叠。

**方案**：调整间距层次。提交栏 `bottom:72px`（64+8），浮动添加按钮 `bottom:140px`（72+提交栏高度约 60+8），确保三层不重叠：tabbar → 提交栏 → 浮动添加按钮。

**样式改动** (`workout-ui.css`)：
```css
@media (max-width:760px) {
  .workout-submitbar { bottom:72px; }
  .workout-add-floating { bottom:148px; }
}
```
- 具体数值需要根据提交栏实际高度微调。提交栏含日期+时长+备注+完成按钮，移动端约 120-160px 高。浮动按钮在 `bottom:148px` 基本能避开。

---

## 实现注意事项

1. **不要破坏现有测试**：项目有 `tests/workout.test.js` 和 `tests/workout-view.test.js`。修改 `workout-view.js` 的函数签名时要确保测试中的调用方式不变。`setRows` 如果改为 `setRows(exercise, exerciseIndex, previous)`，需检查测试是否直接调用 `setRows`。

2. **草稿持久化不受影响**：所有 DOM 更新最终都通过 `updateSession()` 写入 localStorage 草稿。Toast 撤销操作也要调用 `updateSession()`。

3. **prefers-reduced-motion**：计时器进度条动画和 Toast 过渡需要在 `@media (prefers-reduced-motion:reduce)` 下禁用。

4. **事件绑定顺序**：`wireEditor()` 在每次 `render()` 后调用，确保新 DOM 元素都能绑定事件。浮动添加按钮和步进器按钮在 `wireEditor()` 中绑定。

5. **移动端优先**：所有优化以 `.mobile-shell` 和 `@media (max-width:760px)` 为主要目标，桌面端保持现有行为不变。

6. **渐进增强**：休息计时器的 `navigator.vibrate` 需要检查 `"vibrate" in navigator`，不支持的设备静默跳过。

7. **不要引入新依赖**：所有优化使用原生 DOM API 和现有 CSS 变量系统（`--module-1` 到 `--module-5`、`--surface-card`、`--surface-nested`、`--border`、`--border-input`、`--text`、`--text-secondary`、`--danger`、`--shadow-card`、`--shadow-overlay`、`--radius-card`、`--radius-tile`）。

8. **不要修改 `workout.js` 模型层**：除非优化 8（允许重复添加动作）需要调整 `addExercise` 的去重逻辑——建议改为可选参数而非直接移除去重。

9. **保留旧版记录兼容**：`legacyEditHtml` 和 legacy 记录的处理逻辑不要动。

10. **HTML 转义**：所有动态内容继续使用 `escapeHtml()` 函数，避免 XSS。
