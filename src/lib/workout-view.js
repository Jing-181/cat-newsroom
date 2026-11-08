// 训练界面模板：编辑器、空闲页、历史详情、动作库与计划卡的 HTML 生成。
//
// ESM 模块：import WorkoutView from "./workout-view.js"。

import Workout from "./workout.js";
import WorkoutCatalog from "./workout-catalog.js";
import { pawTrail } from "./critters.js";

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

// 统计带：一个主数字（训练容量）+ 三个小事实。
// 原来是四栏等宽的表头式布局，四个量级完全不同的数字（2 / 6 / 56 / 4720）被压成同一档，
// 数字之间还插着三条竖线，读起来像表格。现在只留一条主次关系，不再画格子。
// 统计：一行事实，不占横带。
// 上一版把容量做成了页面最大的字（34px 主数字），结果是开场一个新草稿就把「0 kg」放到了第一眼：
// 一个必然为零的度量，占掉了最大字号、最重的线、最显眼的位置。
// 训练中要回答的是「现在到哪了」（几个动作、几组、几次），容量没录就给破折号，不冒充 0。
function statsHtml(stats) {
  // 空训练里这行的三个数都是 0，它只是一个占位：没排动作时整行不出现，不占一行字也不报三个零。
  if (!stats.exerciseCount && !stats.setCount) return "";
  return `<div class="workout-summary" aria-label="训练统计">
      <span><b data-workout-stat="exerciseCount">${stats.exerciseCount}</b>动作</span>
      <span><b data-workout-stat="setCount">${stats.setCount}</b>组</span>
      <span><b data-workout-stat="reps">${stats.reps}</b>次</span>
      <span class="workout-summary-volume${Number(stats.volume || 0) > 0 ? "" : " is-empty"}">容量 <b data-workout-stat="volume">${Workout.formatVolume(stats.volume)}</b><i>kg</i></span>
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

// 已完成动作的组行：只读摘要。收起态下整张卡是一句结论，行不再各自可点，
// 删除与修改统一留给点开后的完整态，所以这里不带箭头和删除叉。
function setLineCompact(set, { index, equipment }) {
  return `<div class="set-row is-collapsed">
      <div class="set-line is-readonly">
        <span class="set-index">第 ${index + 1} 组</span>
        <b>${escapeHtml(Workout.formatSetText(set, equipment))}</b>
      </div>
    </div>`;
}

// 已录组收成一行；未录的组不写成“0 kg × 0”，那个长得像一条真实数据，读的人还要自己判断是没练还是没记。
function setLine(set, { index, exerciseIndex, setIndex, equipment }) {
  const text = Workout.setHasRecord(set) ? Workout.formatSetText(set, equipment) : "未录";
  return `<div class="set-row is-collapsed">
      <button type="button" class="set-line" data-set-open="1" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-expanded="false" aria-label="修改第 ${index + 1} 组">
        <span class="set-index">第 ${index + 1} 组</span>
        <b>${escapeHtml(text)}</b>
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
  const lastHint = lastCompact ? `<button type="button" class="set-hint" data-fill-last="1" data-exercise="${exerciseIndex}" data-set="${setIndex}" title="点一下用上次这一组的数字">${escapeHtml(lastCompact)}</button>` : "";
  // 头部只保留"第 N 组"这一条信息：当前组已经是高亮的，再写"本次要填的组"是重复噪音。
  return `<div class="set-row is-active">
      <div class="set-row-head"><strong>第 ${setIndex + 1} 组</strong>${lastHint}<button type="button" class="icon-action" data-set-delete="1" data-exercise="${exerciseIndex}" data-set="${setIndex}" title="删除本组" aria-label="删除第 ${setIndex + 1} 组">×</button></div>
      <div class="set-fields${cardio ? " cardio-fields" : ""}">${fields}</div>
      <div class="set-more"><button type="button" class="set-more-toggle" data-set-more="1" data-exercise="${exerciseIndex}" data-set="${setIndex}" aria-expanded="false">RPE · RIR · 备注</button>${morePanel(set, exercise, { exerciseIndex, setIndex })}</div>
    </div>`;
}

function setRows(exercise, exerciseIndex, openIndex, previousSets, compact = false) {
  // 已完成且收起：三组都收成只读一行，不再留一个展开的编辑器。
  if (compact) return exercise.sets.map((set, setIndex) => setLineCompact(set, { index: setIndex, equipment: exercise.equipment })).join("");
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

// ---- 逐组模式 ----
// 训练中一屏只问两件事：这一组多重、几次。其他所有东西降成小字。
// 它不替代完整编辑页：右上的「总览」随时退回去改历史组、删组、看动作说明。
// 屏幕是深墨底，跟开场那滴墨是同一个语言：墨不是过场，是训练时的常驻背景。

function focusField({ label, field, unit, value, step, min, assistable, title }) {
  const shown = value === 0 || value === "" ? "" : value;
  return `<div class="focus-field">
      <span class="focus-label">${label}</span>
      <button type="button" class="focus-step" data-focus-step="${field}" data-delta="-${step}" aria-label="减少${label}">−</button>
      <input class="focus-value${shown === "" ? " is-empty" : ""}" type="number" min="${min}" step="${step}" inputmode="decimal" value="${escapeHtml(shown)}" placeholder="0" data-focus-field="${field}" aria-label="${label}"${title ? ` title="${escapeHtml(title)}"` : ""}>
      <span class="focus-unit">${unit}</span>
      <button type="button" class="focus-step" data-focus-step="${field}" data-delta="${step}" aria-label="增加${label}">+</button>
    </div>`;
}

function focusHtml(session, selectedDay, target, history = []) {
  // 还没动作：也停在逐组屏里加，不再退回整页。训练的第一个决定就是「练什么」。
  if (!target) {
    return `<section class="workout-app workout-focus" data-focus-root>
      <div class="focus-top"><span class="focus-kicker">训练中 · ${escapeHtml(dayName(selectedDay))}</span><div class="focus-top-actions"><button type="button" class="focus-full" data-focus-fullscreen aria-label="全屏" title="全屏">⤢</button><button type="button" class="focus-overview" data-focus-overview-open>总览</button></div></div>
      <div class="focus-empty"><p class="focus-empty-kicker">今天还没有动作</p><h2>先挑一个练的</h2><p class="focus-empty-sub">加完就从第一组开始记，其他都不用管。</p></div>
      <div class="focus-actions"><button type="button" class="focus-primary" data-focus-add-exercise>+ 加动作</button></div>
      <p class="focus-extras"><button type="button" data-focus-cancel>放弃这次训练</button></p>
      <div class="focus-flash" aria-live="polite"></div>
      ${dialogShell()}
    </section>`;
  }
  const exercise = session.exercises[target.exercise];
  if (!exercise) return "";
  const set = exercise.sets[target.set] || {};
  const cardio = isCardio(exercise);
  const assistable = !cardio && Workout.allowsAssist(exercise);
  const recorded = Workout.recordedSets(exercise).length;
  const totalSets = exercise.sets.length;
  const pending = session.exercises.reduce((sum, item) => sum + item.sets.filter(next => !Workout.setHasRecord(next)).length, 0);
  const remainingExercises = session.exercises.length - 1 - target.exercise;
  const previous = Workout.previousPerformance(history, exercise.exercise_id);
  const previousSet = previous?.sets?.[target.set];
  const previousText = previousSet ? Workout.formatSetCompact(previousSet, exercise.equipment) : "";

  const fields = cardio
    ? focusField({ label: "时长", field: "duration_min", unit: "分", value: set.duration_min || 0, step: 1, min: 0 }) +
      focusField({ label: "距离", field: "distance_km", unit: "km", value: set.distance_km || 0, step: 0.5, min: 0 })
    : focusField({
      label: "重量", field: "weight_kg", unit: "kg", value: set.weight_kg || 0, step: 2.5,
      min: assistable ? -200 : 0, assistable,
      title: assistable ? "0 = 纯自重，负数 = 助力" : "",
    }) + focusField({ label: "次数", field: "reps", unit: "次", value: set.reps || 0, step: 1, min: 1 });

  const dots = exercise.sets.map((item, index) => {
    const done = Workout.setHasRecord(item);
    const now = index === target.set ? " is-now" : "";
    return `<i class="focus-dot${done ? " is-done" : ""}${now}"></i>`;
  }).join("");

  // 动作之间的切换：逐组屏原来只有「总览」一条出口，换个动作要先开弹窗、再点某一组。
  // 现在当前动作名下面直接给上/下一个，训练中换动作不用离开这一屏。
  const totalExercises = session.exercises.length;
  const nav = totalExercises > 1
    ? `<div class="focus-nav"><button type="button" class="focus-nav-btn" data-focus-move-exercise="-1"${target.exercise === 0 ? " disabled" : ""}>‹ 上一个</button><span class="focus-nav-pos">动作 ${target.exercise + 1} / ${totalExercises}</span><button type="button" class="focus-nav-btn" data-focus-move-exercise="1"${target.exercise === totalExercises - 1 ? " disabled" : ""}>下一个 ›</button></div>`
    : "";

  const tail = target.exercise === session.exercises.length - 1
    ? (remainingExercises >= 0 ? "最后一个动作" : "")
    : `后面还有 ${remainingExercises} 个动作`;
  const hint = pending === 0
    ? "全部组已记录 · 可以结束了"
    : `第 ${target.set + 1} / ${totalSets} 组${tail ? ` · ${tail}` : ""}`;

  const primary = pending === 0
    ? `<button type="button" class="focus-primary is-finish" data-focus-finish>结束训练</button>`
    : `<button type="button" class="focus-primary" data-focus-done>完成这组</button>`;

  return `<section class="workout-app workout-focus" data-focus-root>
      <div class="focus-top"><span class="focus-kicker">训练中 · ${escapeHtml(dayName(selectedDay))}</span><span class="focus-timer" data-focus-timer>00:00</span><div class="focus-top-actions"><button type="button" class="focus-full" data-focus-fullscreen aria-label="全屏" title="全屏">⤢</button><button type="button" class="focus-overview" data-focus-overview-open>总览</button></div></div>
      <div class="focus-head"><h2><button type="button" class="focus-name" data-focus-info>${escapeHtml(exercise.name)}</button></h2><p>${escapeHtml(exercise.body_part)} · ${escapeHtml(exercise.equipment)} · ${recorded}/${totalSets} 组</p></div>
      ${nav}
      <div class="focus-dots" aria-hidden="true">${dots}</div>
      <div class="focus-fields" data-focus-scope data-focus-ex="${escapeHtml(exercise.id)}" data-focus-set="${target.set}">${fields}</div>
      ${previousText ? `<p class="focus-last">上次这组 <button type="button" data-focus-last>${escapeHtml(previousText)}</button></p>` : `<p class="focus-last is-first">这个动作首次记录</p>`}
      <div class="focus-coach" aria-hidden="true"><svg class="move-figure" data-move-figure></svg></div>
      <p class="focus-hint">${hint}</p>
      <div class="focus-actions">${primary}</div>
      <p class="focus-extras"><button type="button" data-focus-addset>＋ 加一组</button><i aria-hidden="true">·</i><button type="button" data-focus-add-exercise>＋ 加动作</button></p>
      <div class="focus-flash" aria-live="polite"></div>
      ${dialogShell()}
    </section>`;
}

// 总览弹窗：本次训练的全部动作与组，点任意一组就回去继续记。
// 它替代了原来那一整页总览：那页要的信息这里都有，但不占着训练时的注意力。
// 完整页仍留了一个入口，改日期、删动作、放弃草稿这些事在那边做。
function overviewDialogHtml(session, selectedDay) {
  const body = session.exercises.map((exercise, exerciseIndex) => {
    const sets = (exercise.sets || []).map((set, setIndex) => {
      const done = Workout.setHasRecord(set);
      const text = done ? Workout.formatSetText(set, exercise.equipment) : "未录";
      return `<button type="button" class="ovd-set${done ? " is-done" : ""}" data-focus-jump="${exerciseIndex}-${setIndex}"><span>第 ${setIndex + 1} 组</span><b>${escapeHtml(text)}</b></button>`;
    }).join("");
    return `<section class="ovd-ex"><h4>${escapeHtml(exercise.name)}<em>${escapeHtml(exercise.body_part)}</em><button type="button" class="ovd-remove" data-focus-remove-ex="${exerciseIndex}" title="从本次训练移除" aria-label="移除${escapeHtml(exercise.name)}">×</button></h4><div class="ovd-sets">${sets}</div></section>`;
  }).join("");
  const stats = Workout.calculateStats(session);
  return `<div class="dialog-head"><div><span class="dialog-kicker">${escapeHtml(dayName(selectedDay))} · ${escapeHtml(session.date)}</span><h3>本次训练</h3></div><button type="button" class="icon-action" data-dialog-close aria-label="关闭">×</button></div>
      <p class="dialog-sub">${stats.exerciseCount} 个动作 · ${stats.setCount} 组${stats.setCount ? " · 点任意一组回去接着记" : ""}</p>
      <div class="ovd-body">${body || `<div class="session-empty">还没有动作。</div>`}</div>
      <div class="dialog-actions"><button type="button" class="dialog-quiet" data-focus-abandon>放弃这次训练</button><button type="button" class="workout-btn" data-dialog-close>接着练</button><button type="button" class="workout-btn primary" data-focus-finish-dialog>结束训练</button></div>`;
}

// 补记弹窗：没按组记的那些天（跑步、打球、随便活动一下）用一条轻量记录补上。
// 不经过正式训练流程，也就不碰草稿、组数据与墨障。
function backfillDialogHtml(selectedDay) {
  const days = WorkoutCatalog.trainingDays
    .map(day => `<option value="${day.id}"${day.id === selectedDay ? " selected" : ""}>${escapeHtml(day.name)}</option>`)
    .join("");
  const today = Workout.todayKey();
  return `<div class="dialog-head"><div><span class="dialog-kicker">补记</span><h3>补一条运动记录</h3></div><button type="button" class="icon-action" data-dialog-close aria-label="关闭">×</button></div>
      <div class="workout-fields"><div class="workout-field"><label for="backfill-date">日期</label><input id="backfill-date" type="date" max="${today}" value="${today}"></div><div class="workout-field"><label for="backfill-duration">时长（分钟）</label><input id="backfill-duration" type="number" min="0" placeholder="可留空"></div></div>
      <div class="workout-field"><label for="backfill-day">练了什么</label><select id="backfill-day">${days}</select></div>
      <div class="workout-field note"><label for="backfill-note">备注</label><textarea id="backfill-note" rows="2" placeholder="写一句就够，比如「绕湖跑了 5 公里」"></textarea></div>
      <div class="dialog-actions"><button type="button" class="workout-btn" data-dialog-close>取消</button><button type="button" class="workout-btn primary" id="backfill-save">补记</button></div>`;
}

// 结束弹窗：时长、日期、状态词、备注。训练中不打扰，要收尾了才一次性问。
function finishDialogHtml(session) {
  const saved = Number(session.duration_min || 0);
  const suggested = saved > 0 ? saved : Workout.elapsedMinutes(session);
  return `<div class="dialog-head"><div><span class="dialog-kicker">结束训练</span><h3>${escapeHtml(session.title)}</h3></div><button type="button" class="icon-action" data-dialog-close aria-label="关闭">×</button></div>
      <div class="workout-fields"><div class="workout-field"><label for="workout-duration">训练时长（分钟）</label><input id="workout-duration" type="number" min="1" value="${suggested > 0 ? escapeHtml(suggested) : ""}" placeholder="手动填写"></div><div class="workout-field"><label for="workout-date">训练日期</label><input id="workout-date" type="date" value="${escapeHtml(session.date)}"></div></div>
      <div class="workout-field mood"><span class="workout-field-label">今天的状态</span>${moodChipsHtml(session.mood || "")}</div>
      <div class="workout-field note"><label for="workout-note">备注</label><textarea id="workout-note" rows="3" placeholder="今天的感觉，比如「深蹲突破了」「没睡好，随便练练」">${escapeHtml(session.note || "")}</textarea></div>
      <div class="dialog-actions"><button type="button" class="workout-btn" data-dialog-close>再练会儿</button><button type="button" class="workout-btn primary" id="workout-finish-save">保存这次训练</button></div>`;
}

function editorHtml(session, selectedDay, history = [], uiState = {}) {
  const stats = Workout.calculateStats(session);
  const editing = Boolean(session._editing_record_id);
  const duration = Number(session.duration_min || 0);
  // 没填时长时用草稿的开始时间给一个可修改的预估值，不做自动计时。
  const suggestedDuration = duration > 0 ? duration : Workout.elapsedMinutes(session);
  const previousMap = uiState.previous || {};
  const openSets = uiState.openSets || {};
  // 已完成动作的展开态：默认收小，点一下才铺开。只存内存，不落盘也不进草稿。
  const expandedDone = uiState.expandedDone || new Set();
  // 结束训练区在训练中默认收成一行（只留日期与时长），点开才有状态词与备注。
  // 状态词与备注是练完才用的，训练过程中占着屏幕底部是浪费。
  const completionOpen = Boolean(uiState.completionOpen);
  // 逐组模式下就算没有动作也留在这块屏上：加动作的入口就在手边（见 focusHtml 的空态）
  if (uiState.focus) {
    return focusHtml(session, selectedDay, uiState.focusTarget, history);
  }
  return `<section class="workout-app">
      <div class="workout-head"><div><h2>${editing ? "编辑" : "记录"}${escapeHtml(session.title)}</h2><p>${escapeHtml(session.date)} · 草稿会自动保存在本机</p></div><div class="workout-head-actions"><button type="button" class="workout-btn compact" data-focus-enter>逐组记录</button><button type="button" class="workout-btn danger" id="workout-cancel">${editing ? "退出编辑" : "放弃"}</button></div></div>
      <div class="workout-days">${dayButtons(selectedDay)}</div>
      ${statsHtml(stats)}
      ${session.exercises.length ? trackedHtml(history, { exerciseIds: session.exercises.map(item => item.exercise_id) }) : ""}
      <div class="workout-layout">
        <main class="workout-panel"><div class="workout-panel-title"><span>当前训练</span><button type="button" class="workout-btn compact" id="workout-add-exercise">+ 添加动作</button></div><div class="session-list">${session.exercises.length ? session.exercises.map((exercise, exerciseIndex) => {
          const previous = previousMap[exercise.exercise_id] ?? Workout.previousPerformance(history, exercise.exercise_id);
          const progress = progressText(exercise);
          const advice = Workout.restAdvice(exercise);
          const explicitOpen = openSets[exercise.id];
          const pending = exercise.sets.findIndex(set => !Workout.setHasRecord(set));
          const openIndex = Number.isInteger(explicitOpen) ? Math.min(explicitOpen, exercise.sets.length - 1) : (pending >= 0 ? pending : exercise.sets.length - 1);
          // 练完的动作（每组都有记录）：整卡收小成一句结论，点一下铺回完整态。
          // 编辑已有记录时一律展开：进来就是为了改数值，不应先多一步点开。
          // 用户主动点开过的（expandedDone）也不再自动收：他的意图优先于默认。
          const done = progress.done > 0 && progress.done === progress.total;
          const collapsible = done && !editing;
          const compact = collapsible && !expandedDone.has(exercise.id);
          const cardClass = ["session-exercise", done ? "is-done" : "", compact ? "is-done-compact" : ""].filter(Boolean).join(" ");
          // 折叠标记：只有可折叠的动作才有。 ▾ / ▴ 与 .workout-fold 是同一个符号、同一档灰色。
          // 它负责键盘与读屏（aria-expanded）；收小态整卡可点，展开态点头部收起。
          const foldMark = collapsible
            ? `<button type="button" class="exercise-fold-mark" data-done-toggle="${escapeHtml(exercise.id)}" aria-expanded="${compact ? "false" : "true"}" aria-label="${compact ? "展开" : "收小"}${escapeHtml(exercise.name)}完整记录" title="${compact ? "展开完整记录" : "收小"}"></button>`
            : "";
          // 收小态整卡可点开；展开态只有头部与 ▴ 可点收起。
          // 展开态卡里全是真实控件（组行、输入框、删除叉），整卡可点会误触，把正在改的东西收掉。
          const foldAttrs = () => (collapsible ? ` data-done-toggle="${escapeHtml(exercise.id)}"` : "");
          const cardFold = compact ? foldAttrs() : "";
          const headFold = foldAttrs();
          // 头部的移除叉在收小态不渲染：它不是这张卡的结论信息，且 38px 的点击面积会把头部顶回两行高。
          // 删除是破坏性操作，留在点开后的完整态更安全，也只多一步。
          // 头部结构：序号 + （部位·器械作为小标签 / 动作名） + 组进度 + 折叠标记 + 移除。
          // 头部只留一行：动作名是一张单子上唯一需要被扇读的东西，部位与器械跟在后面但明显弱一档。
          // 序号已撤掉：它只是数出来的次序，不带数据，给它独立层级就会和动作名争第一眼。
          const headHtml = `<div class="session-exercise-head"${headFold}><div class="exercise-head-copy"><strong>${escapeHtml(exercise.name)}</strong><span class="exercise-meta">${escapeHtml(exercise.body_part)} · ${escapeHtml(exercise.equipment)}</span></div><em class="set-progress ${done ? "all-done" : ""}">${progress.label}</em>${foldMark}${compact ? "" : `<button type="button" class="icon-action" data-exercise-delete="${exerciseIndex}" title="移除动作" aria-label="移除${escapeHtml(exercise.name)}">×</button>`}</div>`;
          return `<article class="${cardClass}" data-exercise-card="${exerciseIndex}" data-done-id="${escapeHtml(exercise.id)}"${cardFold}>${headHtml}
          ${compact ? "" : lastPerformanceHtml(previous, exercise)}
          <div class="set-list">${setRows(exercise, exerciseIndex, openIndex, previous?.sets, compact)}</div>
          <div class="session-exercise-foot"><button type="button" data-set-add="${exerciseIndex}">+ 加一组</button>${compact ? "" : `<span class="rest-advice" title="${escapeHtml(advice.reason)}">组间歇建议 <b>${escapeHtml(advice.minutes)}</b>（${escapeHtml(advice.label)}）</span>`}<button type="button" data-exercise-info="${exerciseIndex}">动作说明</button></div></article>`;
        }).join("") : `<div class="session-empty">点击“添加动作”安排本次训练。</div>`}</div></main>
      </div>
      <section class="workout-completion${completionOpen ? " is-open" : " is-collapsed"}" aria-label="结束训练">
        <button type="button" class="workout-completion-head" data-completion-toggle aria-expanded="${completionOpen ? "true" : "false"}">
          <span class="workout-completion-date">${escapeHtml(session.date)}${suggestedDuration > 0 ? ` · ${suggestedDuration} 分钟` : " · 时长未填"}</span>
          <em class="workout-completion-hint">${session.mood ? `状态 · ${escapeHtml(session.mood)}` : "状态词 · 备注"}</em>
          <span class="workout-fold-mark" aria-hidden="true"></span>
        </button>
        <div class="workout-completion-body">
          <div class="workout-fields">
            <div class="workout-field"><label for="workout-date">训练日期</label><input id="workout-date" type="date" value="${escapeHtml(session.date)}"></div>
            <div class="workout-field"><label for="workout-duration">训练时长（分钟）</label><input id="workout-duration" type="number" min="1" value="${suggestedDuration > 0 ? escapeHtml(suggestedDuration) : ""}" placeholder="手动填写"></div>
          </div>
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

// 弹窗里的轨迹：按时间正序连成一条箭头链，用于“看进展”弹窗顶部的总览。
function trendFlowHtml(entries) {
  if (!entries.length) return "";
  return `<span class="trend-flow">${entries.map(entry => `<b>${escapeHtml(entry.text)}</b>`).join('<i aria-hidden="true">→</i>')}</span>`;
}

// 动作进展折叠块：训练中和历史页共用。
// 收起状态下那一行已经不是使用说明，而是结论本身（卧推 +2.5 kg · 深蹲 持平），
// 不点开也能看到变化；点开是按变化大小排过的完整列表。
// 只练过一次的动作没有可比对象，混在列表里只是一排“首次”；有可比数据时把它们收成最后一行计数。
// exerciseIds 给了就只看这几个动作（训练页只关心今天要练的），空或没给就是全部。
function trackedHtml(records, { exerciseIds = null } = {}) {
  const digests = Workout.progressDigests(records, { exerciseIds });
  if (!digests.length) return "";
  const comparable = digests.filter(digest => digest.state !== "new");
  const shown = comparable.length ? comparable : digests;
  const fresh = digests.length - shown.length;
  const headline = Workout.progressHeadline(shown);
  const more = fresh > 0 ? `<p class="digest-more">另有 ${fresh} 个动作只练过一次，还比不了</p>` : "";
  return `<details class="workout-fold"><summary><span>动作进展</span><em>${escapeHtml(headline)}</em></summary>
      <div class="exercise-digest">${shown.map(digestRowHtml).join("")}${more}</div>
    </details>`;
}

// 迷你柱状图：每次训练一根柱，越高代表那次越强（估算强度），最后一根是最近一次。
// 只用来给“在涨还是在掉”一个形状，具体数值在右边，不靠柱子读数。
function sparklineHtml(series) {
  if (!series || series.length < 2) return "";
  const min = Math.min(...series);
  const max = Math.max(...series);
  const bars = series.map((value, index) => {
    const ratio = max === min ? 0.45 : (value - min) / (max - min);
    const height = Math.round(24 + ratio * 76);
    const current = index === series.length - 1 ? " is-current" : "";
    return `<i class="digest-bar${current}" style="height:${height}%"></i>`;
  }).join("");
  return `<span class="digest-spark" aria-hidden="true">${bars}</span>`;
}

function digestRowHtml(digest) {
  // 新纪录也要给出差量：只说“新纪录”丢掉了涨了多少，而涨多少才是判断要不要再加重量的依据。
  const figures = Workout.deltaText(digest);
  const meta = digest.isPR
    ? ["新纪录", digest.text].filter(Boolean).join(" · ")
    : [digest.text, String(digest.date || "").slice(5)].filter(Boolean).join(" · ");
  return `<button type="button" class="digest-row is-${digest.isPR ? "pr" : digest.state}" data-exercise-trend="${escapeHtml(digest.exercise_id)}">
        <span class="digest-main"><b class="digest-name">${escapeHtml(digest.name)}</b>${sparklineHtml(digest.series)}</span>
        <span class="digest-figures"><em class="digest-delta">${escapeHtml(figures)}</em><span class="digest-meta">${escapeHtml(meta)}</span></span>
      </button>`;
}

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// 账本行左侧日期柱用的星期。按年月日手工构造，不走 Date 的字符串解析，避免时区把它挪成前一天。
function weekdayLabel(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  if (!match) return "";
  return WEEKDAY_LABELS[new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getDay()];
}

// 一条训练记录的「末组」：最后练到的动作的最后一组。
// 账本行只给这一条具体数字，其余压成三个事实；扫一眼就知道那天练到哪儿。
function finalSetText(record) {
  const exercises = record?.exercises || [];
  for (let index = exercises.length - 1; index >= 0; index -= 1) {
    const sets = Workout.recordedSets(exercises[index]);
    if (!sets.length) continue;
    const text = Workout.formatSetCompact(sets[sets.length - 1], exercises[index].equipment);
    return `<b>${escapeHtml(exercises[index].name)}</b> ${escapeHtml(text)}`;
  }
  return "";
}

// 开始卡：页面上唯一的深色块。它替掉了原来分开的「上次这一练」块和一个通栏按钮。
// 主数字只有一个——本周已练几次；上次练了什么压成一行事实，不再各占一格。
function startCardHtml(selectedDay, records) {
  const last = Workout.lastSessionForDay(records, selectedDay);
  const weekCount = Workout.sessionsThisWeek(records);
  const exercises = last?.exercises || [];
  const setCount = exercises.reduce((sum, item) => sum + Workout.recordedSets(item).length, 0);
  const days = last ? Workout.daysSince(last.date) : null;
  const gap = days == null ? "" : `<span>${days === 0 ? "今天练过" : `隔 ${days} 天`}</span>`;
  const facts = last
    ? `<span>上次 <b>${escapeHtml(last.date)}</b></span>${gap}<span><b>${exercises.length}</b> 个动作</span><span><b>${setCount}</b> 组</span>`
    : `<span>这个训练日还没有记录</span>`;
  return `<section class="workout-start-card" aria-label="开始训练">
      <div class="start-head"><div class="start-copy"><p class="start-kicker">今天 · ${escapeHtml(dayName(selectedDay))}</p><h3>开始${escapeHtml(dayName(selectedDay))}</h3></div><div class="start-ring"><b>${weekCount}</b><span>本周已练</span></div></div>
      <div class="start-facts">${facts}<button type="button" class="start-go" id="workout-start">开始 ›</button></div>
      ${last ? `<button type="button" class="start-repeat" data-repeat-last>照上次练 ›</button>` : ""}
    </section>`;
}

// 一条记录 = 账本里的一行：左日期柱，右标题 + 三个事实 + 末组，情绪词斜着盖在右上角。
function historyRowHtml(record, info) {
  const date = info.date || record.date || "";
  const day = String(date).slice(8, 10);
  const facts = info.legacy
    ? `<span>${escapeHtml(date || "日期未记录")}</span><span>${escapeHtml(record.current || 0)}/${escapeHtml(record.target || 0)} ${escapeHtml(record.unit || "")}</span>`
    : `<span>${info.exerciseCount} 动作</span><span>${info.setCount} 组</span>${info.duration ? `<span>${escapeHtml(info.duration)} 分</span>` : ""}`;
  const peek = info.legacy ? "" : finalSetText(record);
  const stamp = record.mood ? `<em class="history-stamp">${escapeHtml(record.mood)}</em>` : "";
  return `<article class="history-row" data-history-view="${escapeHtml(record.id)}" role="button" tabindex="0" aria-label="查看${escapeHtml(info.title)}详情">
        <div class="history-date">${day ? `<b>${escapeHtml(day)}</b>` : ""}<span>${escapeHtml(weekdayLabel(date))}</span></div>
        <div class="history-row-copy"><h4>${escapeHtml(info.title)}</h4><div class="history-facts">${facts}</div>${peek ? `<p class="history-peek">末组 ${peek}</p>` : ""}</div>
        ${stamp}
      </article>`;
}

function historyHtml(records) {
  if (!records.length) return `<div class="session-empty"><span class="empty-paws" aria-hidden="true">${pawTrail}</span>还没有训练记录，选择训练日开始第一练。</div>`;
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
      // 月份标签：2026-09 → 2026 年 9 月。两位月份以前会原样漏出去，因为旧写法只匹配个位数字。
      const label = group.month ? group.month.replace(/-(\d{1,2})$/, (_, month) => ` 年 ${Number(month)} 月`) : "日期未记录";
      const rows = group.items.map(({ record, info }) => historyRowHtml(record, info)).join("");
      return `<section class="history-group-block"><h5 class="history-month">${escapeHtml(label)}</h5><div class="history-group">${rows}</div></section>`;
    }).join("")}</div>`;
}

function idleHtml(selectedDay, records) {
  // 运动偏好入口暂时下线：偏好与计划的组合方式要重新设计。实现仍留在 workout-ui.js，挂回来只需把那个按钮放回这个菜单。
  return `<section class="workout-app workout-idle"><header class="workout-mast"><div class="workout-mast-copy"><p class="workout-kicker">Cat Life Daily · 运动</p><h2>运动健身</h2><p class="workout-mast-sub">按训练日安排今天，逐组记下重量。</p></div>
      <div class="workout-mast-actions"><button type="button" class="workout-btn plan-menu-icon" id="workout-plan-menu" aria-label="训练计划" title="训练计划" aria-expanded="false">☰</button><div class="workout-plan-actions" hidden><button type="button" class="workout-btn primary" id="workout-plan">生成六天计划</button><button type="button" class="workout-btn" id="workout-plan-view">查看计划</button></div></div>
      </header>
      <div class="workout-days" role="group" aria-label="训练日">${dayButtons(selectedDay)}</div>
      ${startCardHtml(selectedDay, records)}
      <section class="workout-history-section"><div class="workout-panel-title">训练历史<button type="button" class="history-backfill" data-backfill>补记一条</button></div>${historyHtml(records)}</section>
      <button type="button" class="workout-fab" data-quick-start aria-label="开始${escapeHtml(dayName(selectedDay))}"><svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M2.5 1.6 10 6l-7.5 4.4z" fill="currentColor"/></svg><span>开始</span></button>
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
    return `<div class="dialog-head"><div><span class="dialog-kicker">历史记录</span><h3>${escapeHtml(info.title)}</h3></div>${copy}<button type="button" class="dialog-delete" data-history-delete="${escapeHtml(record.id)}" title="删除这条记录">删除</button><button type="button" class="icon-action" data-dialog-close aria-label="关闭">×</button></div>
        <dl class="record-facts"><div><dt>日期</dt><dd>${escapeHtml(record.date || "未记录")}</dd></div><div><dt>当前</dt><dd>${escapeHtml(record.current || 0)} ${escapeHtml(record.unit || "")}</dd></div><div><dt>目标</dt><dd>${escapeHtml(record.target || 0)} ${escapeHtml(record.unit || "")}</dd></div></dl>
        ${record.note ? `<p class="record-note">${escapeHtml(record.note)}</p>` : ""}`;
  }
  // kicker 与标题相同时（如普通训练日标题就是"胸日"）不重复渲染，只留标题。
  const kicker = recordKicker(record);
  const kickerHtml = kicker && kicker !== String(record.title || "") ? `<span class="dialog-kicker">${escapeHtml(kicker)}</span>` : "";
  return `<div class="dialog-head"><div>${kickerHtml}<h3>${escapeHtml(record.title)}</h3></div>${copy}<button type="button" class="workout-btn compact" data-history-edit="${escapeHtml(record.id)}">编辑</button> <button type="button" class="dialog-delete" data-history-delete="${escapeHtml(record.id)}" title="删除这条记录">删除</button><button type="button" class="icon-action" data-dialog-close aria-label="关闭">×</button></div>
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

function exerciseLibraryHtml(selectedDay, selectedExercises, customExercises = [], records = []) {
  const selectedIds = new Set((selectedExercises || []).map(item => item.exercise_id));
  const counts = frequencyMap(records);
  // 搜索已经能跨日找动作，列表就不再限制在当天训练日：当天动作排前面，其余跟在后面。
  const isToday = item => item.availableOnAllDays || item.trainingDays.includes(selectedDay);
  const library = WorkoutCatalog.exercises
    .map((item, index) => ({ item, index, count: counts.get(item.id) || 0, today: isToday(item) ? 1 : 0 }))
    .sort((left, right) => right.today - left.today || right.count - left.count || left.index - right.index)
    .map(entry => entry.item);
  // 自定义动作：动作库基本能盖住，不再常驻一个输入区。
  // 只在搜不到的时候给一个「用这个关键词新建」，日常看不见。
  return `<div class="dialog-head"><div><span class="dialog-kicker">${escapeHtml(dayName(selectedDay))}</span><h3>添加训练动作</h3><p class="dialog-sub">当天动作在前，其余按练过的次数排</p></div><button type="button" class="icon-action" data-dialog-close aria-label="关闭">×</button></div>
      <div class="exercise-search"><input id="workout-exercise-search" type="search" placeholder="搜动作名、部位或器械" aria-label="搜索动作" autocomplete="off"></div>
      <div class="lib-scroll"><div class="exercise-library dialog-library">${library.map(item => {
        const added = selectedIds.has(item.id);
        const count = counts.get(item.id) || 0;
        const haystack = `${item.name} ${item.bodyPart} ${item.equipment}`.toLowerCase();
        // 不属于当天训练日的动作标出它属于哪天，跨日直接选的时候心里有数。
        const otherDays = isToday(item) ? "" : item.trainingDays.map(dayId => WorkoutCatalog.trainingDays.find(day => day.id === dayId)?.name || "").filter(Boolean).join("/");
        return `<button type="button" class="exercise-option ${added ? "is-added" : ""}" data-add-exercise="${item.id}" data-search="${escapeHtml(haystack)}" ${added ? "disabled" : ""}><span class="info"><span class="name">${escapeHtml(item.name)}</span><span class="meta">${escapeHtml(item.bodyPart)} · ${escapeHtml(item.equipment)}${count ? ` · 练过 ${count} 次` : ""}${otherDays ? ` · ${escapeHtml(otherDays)}` : ""}</span></span><span class="exercise-state">${added ? "已添加" : "+ 添加"}</span></button>`;
      }).join("")}</div>
      <p class="exercise-empty" hidden>动作库没有这个。<button type="button" id="workout-exercise-create" class="workout-btn compact">新建动作</button></p></div>`;
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
  editorHtml, idleHtml, detailHtml, exerciseLibraryHtml, exerciseProgressHtml, legacyEditHtml, planDayCard, planViewHtml, buildCopyText, statsHtml,
  overviewDialogHtml, finishDialogHtml, backfillDialogHtml
};
export default WorkoutView;
export {
  editorHtml, idleHtml, detailHtml, exerciseLibraryHtml, exerciseProgressHtml, legacyEditHtml, planDayCard, planViewHtml, buildCopyText, statsHtml,
  overviewDialogHtml, finishDialogHtml, backfillDialogHtml
};
