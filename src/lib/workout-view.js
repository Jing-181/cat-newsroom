// 训练界面模板：编辑器、空闲页、历史详情、动作库与计划卡的 HTML 生成。
//
// ESM 模块：import WorkoutView from "./workout-view.js"。

import Workout from "./workout.js";
import WorkoutCatalog from "./workout-catalog.js";

  function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
}

function dayName(dayId) {
  return WorkoutCatalog.trainingDays.find(day => day.id === dayId)?.name || "训练";
}

function isCardio(exercise) {
  return Workout.isCardio(exercise);
}

// 计划生成的训练记录使用"力量训练·推/拉/腿"作为徽标，普通训练日仍显示原名（如胸日）。
function recordKicker(record) {
  const title = String(record.title || "");
  if (title.startsWith("力量训练")) return title.split(" · ")[0] || title;
  return dayName(record.training_day);
}

function dayButtons(selectedDay) {
  return WorkoutCatalog.trainingDays.map(day => `<button type="button" data-day="${day.id}" class="${selectedDay === day.id ? "on" : ""}">${day.name}</button>`).join("");
}

function statsHtml(stats) {
  return `<div class="workout-summary" aria-label="训练统计">
      <div class="workout-stat"><b data-workout-stat="exerciseCount">${stats.exerciseCount}</b><span>动作</span></div>
      <div class="workout-stat"><b data-workout-stat="setCount">${stats.setCount}</b><span>组数</span></div>
      <div class="workout-stat"><b data-workout-stat="reps">${stats.reps}</b><span>总次数</span></div>
      <div class="workout-stat"><b data-workout-stat="volume">${Math.round(stats.volume)}</b><span>训练容量 kg</span></div>
    </div>`;
}

// 结束区的状态词：快捷选项，点一下就行；自由备注仍然留着自己写。
// 用她自己写过的词（还阔以 / 练爽了 / 一般般），比标准情绪词更像人话。
// 两样都不是必填，不写也能保存。
const MOOD_OPTIONS = ["不错", "还阔以", "一般般", "练爽了", "起飞", "突破", "摸鱼", "腿软", "顶不住", "没睡好"];

function moodChipsHtml(current = "") {
  return `<div class="mood-chips" role="group" aria-label="今天的状态">${MOOD_OPTIONS.map(mood => {
    const on = current === mood;
    return `<button type="button" class="mood-chip${on ? " on" : ""}" data-mood="${escapeHtml(mood)}" aria-pressed="${on}">${escapeHtml(mood)}</button>`;
  }).join("")}</div>`;
}

function quickExerciseHtml(selectedDay, exercises) {
  const added = new Set((exercises || []).map(item => item.exercise_id));
  const items = WorkoutCatalog.forDay(selectedDay).filter(item => !added.has(item.id)).slice(0, 5);
  if (!items.length) return "";
  return `<div class="quick-exercises" aria-label="常用动作">${items.map(item => `<button type="button" data-quick-add="${escapeHtml(item.id)}">${escapeHtml(item.name)}</button>`).join("")}<button type="button" class="more" data-open-library>更多动作</button></div>`;
}

// ---- 组记录：已录组收成一行，当前组展开 ----

function setLine(set, { index, exerciseIndex, setIndex, equipment }) {
  // 整行都可点开修改，所以不再写"修改"两个字，只留一个轻箭头表示可进入。
  return `<div class="set-row is-collapsed">
      <button type="button" class="set-line" data-set-open="1" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-expanded="false" aria-label="修改第 ${index + 1} 组">
        <span class="set-index">第 ${index + 1} 组</span>
        <b>${escapeHtml(Workout.formatSetText(set, equipment))}</b>
        <span class="set-chevron" aria-hidden="true">›</span>
      </button>
      <button type="button" class="icon-action" data-set-delete="1" data-exercise="${exerciseIndex}" data-set="${setIndex}" title="删除本组" aria-label="删除第 ${index + 1} 组">×</button>
    </div>`;
}

function stepperField(label, field, set, { exerciseIndex, setIndex, down, up, min, step, placeholder, title }) {
  const hint = placeholder || (min === "0" ? "0" : "1");
  return `<label><span>${label}</span><div class="stepper"><button type="button" class="stepper-btn" data-set-adjust="${field}" data-exercise="${exerciseIndex}" data-set="${setIndex}" data-step="${down}" aria-label="减少${label}">−</button><input type="number" min="${min}" step="${step}" value="${escapeHtml(set[field] === 0 ? "" : set[field])}" placeholder="${hint}" ${title ? `title="${escapeHtml(title)}" ` : ""}inputmode="decimal" data-set-field="${field}" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-label="${label}"><button type="button" class="stepper-btn" data-set-adjust="${field}" data-exercise="${exerciseIndex}" data-set="${setIndex}" data-step="${up}" aria-label="增加${label}">+</button></div></label>`;
}

function morePanel(set, exercise, { exerciseIndex, setIndex }) {
  const fields = [
    `<label><span>RPE</span><input type="number" min="1" max="10" step="0.5" value="${escapeHtml(set.rpe)}" placeholder="1-10" inputmode="decimal" data-set-field="rpe" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-label="RPE"></label>`,
  ];
  if (!isCardio(exercise)) {
    fields.push(`<label><span>RIR</span><input type="number" min="0" max="10" step="1" value="${escapeHtml(set.rir)}" placeholder="剩余次数" inputmode="numeric" data-set-field="rir" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-label="RIR"></label>`);
  }
  fields.push(`<label class="note"><span>本组备注</span><input value="${escapeHtml(set.note)}" placeholder="动作感受、器械调整" data-set-field="note" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-label="本组备注"></label>`);
  return `<div class="set-more-panel" data-set-more-panel="${exerciseIndex}-${setIndex}" hidden>${fields.join("")}</div>`;
}

function setRowActive(exercise, set, exerciseIndex, setIndex, previousSets) {
  const cardio = isCardio(exercise);
  // 自重类动作重量可负：负数=助力（弹力带/助力器械），0=纯自重，正数=负重腰带
  const assistable = !cardio && Workout.allowsAssist(exercise);
  const fields = cardio
    ? `<label><span>时长（分）</span><input type="number" min="0" step="1" value="${escapeHtml(set.duration_min === 0 ? "" : set.duration_min)}" placeholder="分钟" inputmode="numeric" data-set-field="duration_min" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-label="时长"></label><label><span>距离 km</span><input type="number" min="0" step="0.1" value="${escapeHtml(set.distance_km === 0 ? "" : set.distance_km)}" placeholder="0" inputmode="decimal" data-set-field="distance_km" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-label="距离"></label><label><span>配速</span><input value="${escapeHtml(set.pace)}" placeholder="如 6'00\"" data-set-field="pace" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-label="配速"></label>`
    : [
      stepperField("重量 kg", "weight_kg", set, {
        exerciseIndex, setIndex, down: "-2.5", up: "2.5",
        min: assistable ? "-200" : "0", step: "2.5",
        placeholder: assistable ? "0=自重" : "0",
        title: assistable ? "0 = 纯自重，负数 = 助力（如 -20）" : "本组重量",
      }),
      stepperField("次数", "reps", set, { exerciseIndex, setIndex, down: "-1", up: "1", min: "0", step: "1" }),
    ].join("");
  // 同一组序上一次怎么练的，直接贴在当前组上，衔接时有参照。
  // 只放数值本身："上次"这个前提由卡片级那行给出，同一件事不在两处各写一遍，完整语义留在 title。
  const last = previousSets?.[setIndex];
  const lastCompact = last ? Workout.formatSetCompact(last, exercise.equipment) : "";
  const lastHint = lastCompact ? `<span class="set-hint" title="上次这一组：${escapeHtml(lastCompact)}">${escapeHtml(lastCompact)}</span>` : "";
  // 头部只保留"第 N 组"这一条信息：当前组已经是高亮的，再写"本次要填的组"是重复噪音。
  return `<div class="set-row is-active">
      <div class="set-row-head"><strong>第 ${setIndex + 1} 组</strong>${lastHint}<button type="button" class="icon-action" data-set-delete="1" data-exercise="${exerciseIndex}" data-set="${setIndex}" title="删除本组" aria-label="删除第 ${setIndex + 1} 组">×</button></div>
      <div class="set-fields${cardio ? " cardio-fields" : ""}">${fields}</div>
      <div class="set-more"><button type="button" class="set-more-toggle" data-set-more="1" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-expanded="false">RPE · RIR · 备注</button>${morePanel(set, exercise, { exerciseIndex, setIndex })}</div>
    </div>`;
}

function setRows(exercise, exerciseIndex, openIndex, previousSets) {
  return exercise.sets.map((set, setIndex) => (setIndex === openIndex
    ? setRowActive(exercise, set, exerciseIndex, setIndex, previousSets)
    : setLine(set, { index: setIndex, exerciseIndex, setIndex, equipment: exercise.equipment }))).join("");
}

// 已录组数 / 总组数
function progressText(exercise) {
  const done = Workout.recordedSets(exercise).length;
  return { done, total: exercise.sets.length, label: `${done}/${exercise.sets.length} 组` };
}

// 卡片级只说"上次哪天、练了几组"；每一组的具体重量次数贴到对应的组行上（见 setRowActive），
// 同一份数据不在两处各出现一遍。
function lastPerformanceHtml(previous, exercise) {
  if (!previous) {
    const assist = Workout.allowsAssist(exercise) ? "；自重动作重量填 0 表示纯自重，填负数表示助力（如 -20）" : "，先把重量和次数填好";
    return `<p class="exercise-last is-first">首次记录此动作${assist}。</p>`;
  }
  return `<p class="exercise-last"><span class="exercise-last-date">上次 ${escapeHtml(previous.date)}</span><span class="exercise-last-count">· ${previous.sets.length} 组</span></p>`;
}

function editorHtml(session, selectedDay, history = [], uiState = {}) {
  const stats = Workout.calculateStats(session);
  const editing = Boolean(session._editing_record_id);
  const duration = Number(session.duration_min || 0);
  const previousMap = uiState.previous || {};
  const openSets = uiState.openSets || {};
  return `<section class="workout-app">
      <div class="workout-head"><div><h2>${editing ? "编辑" : "记录"}${escapeHtml(session.title)}</h2><p>${escapeHtml(session.date)} · 草稿会自动保存在本机</p></div><div class="workout-head-actions"><button type="button" class="workout-btn danger" id="workout-cancel">${editing ? "退出编辑" : "放弃"}</button></div></div>
      <div class="workout-days">${dayButtons(selectedDay)}</div>
      ${statsHtml(stats)}
      <div class="workout-layout">
        <main class="workout-panel"><div class="workout-panel-title"><span>当前训练</span><button type="button" class="workout-btn compact" id="workout-add-exercise">+ 添加动作</button></div><div class="session-list">${session.exercises.length ? session.exercises.map((exercise, exerciseIndex) => {
          const previous = previousMap[exercise.exercise_id] ?? Workout.previousPerformance(history, exercise.exercise_id);
          const progress = progressText(exercise);
          const advice = Workout.restAdvice(exercise);
          const explicitOpen = openSets[exercise.id];
          const pending = exercise.sets.findIndex(set => !Workout.setHasRecord(set));
          const openIndex = Number.isInteger(explicitOpen) ? Math.min(explicitOpen, exercise.sets.length - 1) : (pending >= 0 ? pending : exercise.sets.length - 1);
          return `<article class="session-exercise" data-exercise-card="${exerciseIndex}"><div class="session-exercise-head"><div><strong>${escapeHtml(exercise.name)}</strong><span>${escapeHtml(exercise.body_part)} · ${escapeHtml(exercise.equipment)}</span><em class="set-progress ${progress.done && progress.done === progress.total ? "all-done" : ""}">${progress.label}</em></div><button type="button" class="icon-action" data-exercise-delete="${exerciseIndex}" title="移除动作" aria-label="移除${escapeHtml(exercise.name)}">×</button></div>
          ${lastPerformanceHtml(previous, exercise)}
          <div class="set-list">${setRows(exercise, exerciseIndex, openIndex, previous?.sets)}</div>
          <div class="session-exercise-foot"><button type="button" data-set-add="${exerciseIndex}">+ 加一组</button><span class="rest-advice" title="${escapeHtml(advice.reason)}">组间歇建议 <b>${escapeHtml(advice.minutes)}</b>（${escapeHtml(advice.label)}）</span><button type="button" data-exercise-info="${exerciseIndex}">动作说明</button></div></article>`;
        }).join("") : `<div class="session-empty">点击“添加动作”安排本次训练。</div>`}</div></main>
      </div>
      ${trackedHtml(history)}
      <section class="workout-completion" aria-label="结束训练">
        <h3 class="workout-completion-title">结束训练</h3>
        <div class="workout-fields">
          <div class="workout-field"><label for="workout-date">训练日期</label><input id="workout-date" type="date" value="${escapeHtml(session.date)}"></div>
          <div class="workout-field"><label for="workout-duration">训练时长（分钟）</label><input id="workout-duration" type="number" min="1" value="${duration > 0 ? escapeHtml(duration) : ""}" placeholder="手动填写"></div>
          <div class="workout-field mood"><span class="workout-field-label">今天的状态</span>${moodChipsHtml(session.mood || "")}</div>
          <div class="workout-field note"><label for="workout-note">备注</label><textarea id="workout-note" rows="3" placeholder="今天的感觉，比如「深蹲突破了」「没睡好，随便练练」">${escapeHtml(session.note)}</textarea></div>
        </div>
      </section>
      <div class="workout-bottom-bar">
        <button type="button" class="workout-btn" id="workout-add-floating">+ 添加动作</button>
        <button type="button" class="workout-btn primary" id="workout-finish">${editing ? "保存修改" : "结束训练"}</button>
      </div>
      ${dialogShell()}
    </section>`;
}

// ---- 历史：档案 + 动作维度的长期记录 ----

function trendFlowHtml(entries) {
  if (!entries.length) return "";
  return `<span class="trend-flow">${entries.map(entry => `<b>${escapeHtml(entry.text)}</b>`).join('<i aria-hidden="true">→</i>')}</span>`;
}

// 每次记录取最重的一组代表该次表现，按时间正序连成进步轨迹。
function trendPoints(records, exerciseId, limit = 4) {
  return Workout.exerciseHistory(records, exerciseId, limit).map(item => {
    // 用最佳组（按估算强度）代表该次表现，而不是只取最重的一组：
    // 90×2 与 70×8 的直接重量差很大，但强度接近，只按重量排会读成退步。
    const best = Workout.bestSet(item.sets) || item.sets[0];
    return { date: item.date, text: Workout.formatSetCompact(best, item.equipment) };
  }).reverse();
}

function trendChipsHtml(records, limit = 8) {
  return Workout.trackedExercises(records).slice(0, limit).map(item => `<button type="button" class="trend-chip" data-exercise-trend="${escapeHtml(item.exercise_id)}"><span class="trend-name">${escapeHtml(item.name)}</span>${trendFlowHtml(trendPoints(records, item.exercise_id))}<span class="trend-meta">${item.sessionCount} 次 · 最近 ${escapeHtml(item.lastDate || "未记录")}</span></button>`).join("");
}

// 动作进展折叠块：默认收起，训练中和历史页共用，需要时再点开。
function trackedHtml(records, hint = "点开看每个动作最近的重量变化") {
  const chips = trendChipsHtml(records, 8);
  if (!chips) return "";
  return `<details class="workout-fold"><summary><span>动作进展</span><em>${escapeHtml(hint)}</em></summary>
      <div class="exercise-trends">${chips}</div>
    </details>`;
}

// 上次这一练：上次这个训练日练了什么、最后一组多少、隔了几天、本周第几次。
// 没有记录时整块不渲染，不编造安排。
function lastSessionHtml(selectedDay, records) {
  const last = Workout.lastSessionForDay(records, selectedDay);
  if (!last) return "";
  const days = Workout.daysSince(last.date);
  const weekCount = Workout.sessionsThisWeek(records);
  const exercises = last.exercises || [];
  let lastText = "";
  for (let index = exercises.length - 1; index >= 0; index -= 1) {
    const sets = Workout.recordedSets(exercises[index]);
    if (!sets.length) continue;
    lastText = `${exercises[index].name} ${Workout.formatSetCompact(sets[sets.length - 1], exercises[index].equipment)}`;
    break;
  }
  const gap = days == null ? "" : `<span>${days === 0 ? "今天练过" : `隔了 ${days} 天`}</span>`;
  return `<div class="workout-last" aria-label="上次这一练">
      <span class="workout-last-day">上次${dayName(selectedDay)}</span>
      <span>${escapeHtml(last.date)}</span>
      ${gap}
      <span>本周已练 ${weekCount} 次</span>
      <span>${exercises.length} 个动作</span>
      ${lastText ? `<b>${escapeHtml(lastText)}</b>` : ""}
    </div>`;
}

function historyHtml(records) {
  if (!records.length) return `<div class="session-empty">还没有训练记录，选择训练日开始第一练。</div>`;
  const ordered = [...records];
  Workout.sortRecords(ordered);
  // 按月份分组展示；旧版无日期记录归入「日期未记录」
  const groups = [];
  let month = null;
  ordered.forEach(record => {
    const info = Workout.summary(record);
    const key = (info.date || record.date || "").slice(0, 7);
    if (key !== month) { month = key; groups.push({ month: key, items: [] }); }
    groups[groups.length - 1].items.push({ record, info });
  });
  return `${trackedHtml(records)}<div class="workout-history">${groups.map(group => {
      const label = group.month ? group.month.replace(/-0?(\d)$/, " 年 $1 月") : "日期未记录";
      const cards = group.items.map(({ record, info }) => {
        const meta = info.legacy
          ? `<span>${escapeHtml(record.date || "日期未记录")}</span><span>${escapeHtml(record.current || 0)}/${escapeHtml(record.target || 0)} ${escapeHtml(record.unit || "")}</span>`
          : `<span>${escapeHtml(info.date)}</span><span>${info.exerciseCount} 个动作</span><span>${info.setCount} 组</span>${info.duration ? `<span>${escapeHtml(info.duration)} 分钟</span>` : ""}`;
        return `<article class="history-card">
        <div class="history-card-copy"><h4>${escapeHtml(info.title)}${record.mood ? `<em class="history-mood">${escapeHtml(record.mood)}</em>` : ""}</h4><div class="history-meta">${meta}</div></div>
        <div class="history-actions">
          <button type="button" class="workout-btn compact" data-history-view="${escapeHtml(record.id)}">详情</button>
          <button type="button" class="workout-btn compact" data-history-edit="${escapeHtml(record.id)}">编辑</button>
          <button type="button" class="icon-action danger" data-history-delete="${escapeHtml(record.id)}" title="删除记录" aria-label="删除记录">×</button>
        </div>
      </article>`;
      }).join("");
      return `<section class="history-group-block"><h5 class="history-month">${label}</h5><div class="history-group">${cards}</div></section>`;
    }).join("")}</div>`;
}

function idleHtml(selectedDay, records) {
  // 运动偏好入口暂时下线：偏好与计划的组合方式要重新设计。实现仍留在 workout-ui.js，挂回来只需把那个按钮放回这个菜单。
  return `<section class="workout-app"><div class="workout-head"><div><h2>运动健身</h2><p>按训练日快速安排动作，记录每一组重量与次数。</p></div>
      <div class="workout-head-actions"><button type="button" class="workout-btn plan-menu-icon" id="workout-plan-menu" aria-label="训练计划" title="训练计划" aria-expanded="false">☰</button><div class="workout-plan-actions" hidden><button type="button" class="workout-btn primary" id="workout-plan">生成六天计划</button><button type="button" class="workout-btn" id="workout-plan-view">查看计划</button></div></div>
      </div>
      <div class="workout-days">${dayButtons(selectedDay)}</div>
      ${lastSessionHtml(selectedDay, records)}
      <div class="workout-start-row"><button type="button" class="workout-btn primary" id="workout-start">开始${dayName(selectedDay)}</button>
        <div class="workout-backfill"><input id="workout-backfill-date" type="date" value="${escapeHtml(Workout.todayKey())}" aria-label="补记日期"><button type="button" class="workout-btn" id="workout-backfill">补记这一天</button></div>
      </div>
      <section><div class="workout-panel-title">训练历史</div>${historyHtml(records)}</section>
      ${dialogShell()}
    </section>`;
}

function dialogShell() {
  return `<dialog class="workout-dialog" id="workout-dialog"><div id="workout-dialog-content"></div></dialog>`;
}

function detailHtml(record) {
  const info = Workout.summary(record);
  const copy = `<button type="button" class="workout-btn compact" data-copy-workout="${escapeHtml(record.id)}">复制数据</button>`;
  if (info.legacy) {
    return `<div class="dialog-head"><div><span class="dialog-kicker">历史记录</span><h3>${escapeHtml(info.title)}</h3></div>${copy}<button type="button" class="icon-action" data-dialog-close aria-label="关闭">×</button></div>
        <dl class="record-facts"><div><dt>日期</dt><dd>${escapeHtml(record.date || "未记录")}</dd></div><div><dt>当前</dt><dd>${escapeHtml(record.current || 0)} ${escapeHtml(record.unit || "")}</dd></div><div><dt>目标</dt><dd>${escapeHtml(record.target || 0)} ${escapeHtml(record.unit || "")}</dd></div></dl>
        ${record.note ? `<p class="record-note">${escapeHtml(record.note)}</p>` : ""}`;
  }
  // kicker 与标题相同时（如普通训练日标题就是"胸日"）不重复渲染，只留标题。
  const kicker = recordKicker(record);
  const kickerHtml = kicker && kicker !== String(record.title || "") ? `<span class="dialog-kicker">${escapeHtml(kicker)}</span>` : "";
  return `<div class="dialog-head"><div>${kickerHtml}<h3>${escapeHtml(record.title)}</h3></div>${copy}<button type="button" class="icon-action" data-dialog-close aria-label="关闭">×</button></div>
      <dl class="record-facts"><div><dt>日期</dt><dd>${escapeHtml(record.date)}</dd></div><div><dt>时长</dt><dd>${record.duration_min ? `${escapeHtml(record.duration_min)} 分钟` : "未填"}</dd></div><div><dt>组数</dt><dd>${info.setCount} 组</dd></div><div><dt>容量</dt><dd>${Math.round(info.volume)} kg</dd></div></dl>
      ${record.mood ? `<p class="record-mood">${escapeHtml(record.mood)}</p>` : ""}
      <div class="record-exercises">${(record.exercises || []).map(exercise => {
        // 只展示真正有数值的组，旧数据里的空组不渲染成 0 kg × 0。
        const sets = (exercise.sets || []).filter(set => Workout.setHasRecord(set));
        if (!sets.length) return "";
        return `<section><h4>${escapeHtml(exercise.name)}<button type="button" class="record-trend-link" data-exercise-trend="${escapeHtml(exercise.exercise_id)}">进展</button></h4>${sets.map((set, index) => `<div class="record-set"><span>第 ${index + 1} 组</span><b>${escapeHtml(Workout.formatSetText(set, exercise.equipment))}</b><em>${set.rpe ? `RPE ${escapeHtml(set.rpe)}` : ""}${set.rir ? `${set.rpe ? " · " : ""}RIR ${escapeHtml(set.rir)}` : ""}${set.note ? `${set.rpe || set.rir ? " · " : ""}${escapeHtml(set.note)}` : ""}</em></div>`).join("")}</section>`;
      }).join("") || `<div class="session-empty">本次训练没有动作记录。</div>`}</div>
      ${record.note ? `<p class="record-note">${escapeHtml(record.note)}</p>` : ""}`;
}

// 单个动作的长期记录：20×10 → 22.5×10 → 25×8
function exerciseProgressHtml(records, exerciseId) {
  const entries = Workout.exerciseHistory(records, exerciseId, 12);
  const track = WorkoutCatalog.exercises.find(item => item.id === exerciseId);
  const head = `<div class="dialog-head"><div><span class="dialog-kicker">动作进展</span><h3>${escapeHtml(entries[0] ? track?.name || entries[0].title : track?.name || "动作")}</h3><p class="dialog-sub">${entries.length ? `近 ${entries.length} 次记录，越靠上越新` : "还没有这个动作的记录"}</p></div><button type="button" class="icon-action" data-dialog-close aria-label="关闭">×</button></div>`;
  if (!entries.length) return `${head}<div class="session-empty">练过这个动作后，这里会显示每次的组次变化。</div>`;
  const equipment = entries[0].equipment;
  return `${head}
      <div class="trend-hero">${trendFlowHtml(entries.map(item => {
        const best = Workout.bestSet(item.sets) || item.sets[0];
        return { date: item.date, text: Workout.formatSetCompact(best, equipment) };
      }).reverse())}</div>
      <div class="trend-list">${entries.map(item => `<article class="trend-item"><header><span>${escapeHtml(item.date)}</span><b>${escapeHtml(Workout.formatSetList(item.sets, equipment))}</b></header><div class="trend-meta-row"><span>${item.setCount} 组</span><span>容量 ${Math.round(item.volume)} kg</span>${item.topWeight ? `<span>最重 ${escapeHtml(item.topWeight)} kg</span>` : ""}</div></article>`).join("")}</div>`;
}

function buildCopyText(record) {
  const info = Workout.summary(record);
  if (info.legacy) {
    const lines = [`${record.title || "运动记录"}${record.date ? `（${record.date}）` : ""}`];
    lines.push(`当前 ${record.current || 0} / 目标 ${record.target || 0} ${record.unit || ""}`);
    if (record.note) lines.push(`备注：${record.note}`);
    return lines.join("\n");
  }
  const lines = [`${record.title || "训练"}（${record.date}）${record.duration_min ? ` · ${record.duration_min} 分钟` : ""}`];
  (record.exercises || []).forEach((exercise, index) => {
    lines.push(`${index + 1}. ${exercise.name}${exercise.body_part ? `（${exercise.body_part}）` : ""}`);
    (exercise.sets || []).filter(set => Workout.setHasRecord(set)).forEach((set, setIndex) => {
      const part = [Workout.formatSetText(set, exercise.equipment)];
      if (set.rpe) part.push(`RPE ${set.rpe}`);
      if (set.rir) part.push(`RIR ${set.rir}`);
      if (set.note) part.push(set.note);
      lines.push(`   第 ${setIndex + 1} 组 ${part.join(" · ")}`);
    });
  });
  if (record.note) lines.push(`备注：${record.note}`);
  return lines.join("\n");
}

// 常用度：按历史里这个动作出现过的训练次数算，只统计已完成记录。
function frequencyMap(records) {
  const counts = new Map();
  Workout.trackedExercises(records).forEach(item => counts.set(item.exercise_id, item.sessionCount));
  return counts;
}

// 常用的排前面；次数相同保持动作库原来的顺序，避免每次打开顺序都在变。
function sortByFrequency(items, counts) {
  return items
    .map((item, index) => ({ item, index, count: counts.get(item.id) || 0 }))
    .sort((left, right) => right.count - left.count || left.index - right.index)
    .map(entry => entry.item);
}

function exerciseLibraryHtml(selectedDay, selectedExercises, customExercises = [], records = []) {
  const selectedIds = new Set((selectedExercises || []).map(item => item.exercise_id));
  const counts = frequencyMap(records);
  const library = sortByFrequency(WorkoutCatalog.forDay(selectedDay), counts);
  // 自定义动作：动作库可能没收录，留一个自己命名的入口；用过的自定义动作从历史记录里回捞，点一下直接复用。
  const customs = (customExercises || []).filter(item => !selectedIds.has(item.id));
  const customBlock = `<div class="exercise-custom">
        <form id="workout-custom-form" autocomplete="off"><input id="workout-custom-name" name="name" maxlength="20" required placeholder="动作库没有？输入动作名称" aria-label="自定义动作名称"><button type="submit" class="workout-btn compact">添加</button></form>
        <p class="hint" id="workout-custom-hint">动作库没有的动作，可以自己命名后记录（最多 20 字）。</p>
        ${customs.length ? `<div class="exercise-chips" aria-label="你用过的自定义动作">${customs.map(item => `<button type="button" class="exercise-chip" data-add-custom="${escapeHtml(item.name)}">${escapeHtml(item.name)}</button>`).join("")}</div>` : ""}
      </div>`;
  return `<div class="dialog-head"><div><span class="dialog-kicker">${escapeHtml(dayName(selectedDay))}</span><h3>添加训练动作</h3><p class="dialog-sub">按你练过的次数排，常用的在前面</p></div><button type="button" class="icon-action" data-dialog-close aria-label="关闭">×</button></div>
      ${customBlock}
      <div class="exercise-library dialog-library">${library.map(item => {
        const added = selectedIds.has(item.id);
        const count = counts.get(item.id) || 0;
        return `<button type="button" class="exercise-option ${added ? "is-added" : ""}" data-add-exercise="${item.id}" ${added ? "disabled" : ""}><span class="info"><span class="name">${escapeHtml(item.name)}</span><span class="meta">${escapeHtml(item.bodyPart)} · ${escapeHtml(item.equipment)}${count ? ` · 练过 ${count} 次` : ""}</span></span><span class="exercise-state">${added ? "已添加" : "+ 添加"}</span></button>`;
      }).join("")}</div>`;
}

function legacyEditHtml(record) {
  return `<form id="legacy-edit-form"><div class="dialog-head"><div><span class="dialog-kicker">编辑旧版记录</span><h3>${escapeHtml(record.title || "运动记录")}</h3></div><button type="button" class="icon-action" data-dialog-close aria-label="关闭">×</button></div>
      <div class="legacy-fields"><div class="workout-field"><label for="legacy-title">名称</label><input id="legacy-title" name="title" required value="${escapeHtml(record.title || "")}"></div><div class="workout-field"><label for="legacy-date">日期</label><input id="legacy-date" name="date" type="date" value="${escapeHtml(record.date || "")}"></div><div class="workout-field"><label for="legacy-current">当前</label><input id="legacy-current" name="current" type="number" min="0" value="${escapeHtml(record.current || 0)}"></div><div class="workout-field"><label for="legacy-target">目标</label><input id="legacy-target" name="target" type="number" min="0" value="${escapeHtml(record.target || 0)}"></div><div class="workout-field"><label for="legacy-unit">单位</label><input id="legacy-unit" name="unit" value="${escapeHtml(record.unit || "")}"></div><div class="workout-field note"><label for="legacy-note">备注</label><input id="legacy-note" name="note" value="${escapeHtml(record.note || "")}"></div></div>
      <div class="dialog-actions"><button type="button" class="workout-btn" data-dialog-close>取消</button><button type="submit" class="workout-btn primary">保存修改</button></div></form>`;
}

function planDayCard(day, progress) {
  const done = progress?.days?.[String(day.day_index)];
  const exercises = (day.exercises || []).map(item => {
    const weight = item.weight_kg ? `${escapeHtml(item.weight_kg)} kg` : "重量待填";
    // 组间歇只给按肌群给出的建议，不再显示倒计时秒数（与训练区口径一致）。
    const target = WorkoutCatalog?.exercises?.find(entry => entry.id === item.exercise_id) || item;
    const advice = Workout?.restAdvice?.(target);
    const rest = advice ? ` · 组间歇 ${escapeHtml(advice.minutes)}` : "";
    return `<li>${escapeHtml(item.name)} · ${escapeHtml(item.sets)} 组 × ${escapeHtml(item.reps)} · ${weight}${rest}${item.intensity_hint ? ` · ${escapeHtml(item.intensity_hint)}` : ""}</li>`;
  }).join("");
  return `<article class="plan-day-card ${done ? "is-done" : ""}" data-plan-day="${day.day_index}">
      <header><h4>${escapeHtml(day.title)}</h4><span>${escapeHtml(day.focus)}</span>${done ? `<em>已完成 ${escapeHtml(done.date)}</em>` : ""}</header>
      <ul>${exercises}</ul>
    </article>`;
}

function planViewHtml(plan, progress = null) {
  return `<div class="dialog-head"><div><span class="dialog-kicker">训练计划</span><h3>力训三分化 · ${(plan.days || []).length} 天</h3><p class="dialog-sub">点击某一天开始训练，保存后自动标记完成</p></div><button type="button" class="icon-action" data-dialog-close aria-label="关闭">×</button></div>
      <div class="plan-day-grid">${(plan.days || []).map(day => planDayCard(day, progress)).join("")}</div>`;
}

const WorkoutView = {
  editorHtml, idleHtml, detailHtml, exerciseLibraryHtml, exerciseProgressHtml, legacyEditHtml, planDayCard, planViewHtml, buildCopyText
};
export default WorkoutView;
export {
  editorHtml, idleHtml, detailHtml, exerciseLibraryHtml, exerciseProgressHtml, legacyEditHtml, planDayCard, planViewHtml, buildCopyText
};
