// 训练界面控制器：挂载运动页、草稿与选中日的持久化、弹窗流程。
//
// ESM 模块：import WorkoutUI from "./workout-ui.js"。

import Workout from "./workout.js";
import WorkoutCatalog from "./workout-catalog.js";
import WorkoutPlan from "./workout-plan.js";
import WorkoutView from "./workout-view.js";
import AppDialog from "./app-dialog.js";
import Toast from "./toast.js";

  const DRAFT_KEY = "cat-newsroom-workout-draft-v1";
const DAY_KEY = "cat-newsroom-workout-day-v1";

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
}

// 弹窗里的历史统计要拼 HTML，这里只转义五个会破坏结构的字符。
function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;" }[ch]));
}

function shouldAnimate() {
  return !matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function loadPlan() {
  return WorkoutPlan?.load?.() || readJson("cat-newsroom-weekly-workout-plan-v1");
}

function mount(container, options) {
  if (!container || !Workout || !WorkoutCatalog || !WorkoutView) return null;
  const records = options.records || [];
  Workout.sortRecords(records);
  let session = readJson(DRAFT_KEY);
  let pendingDraft = null;
  // 草稿不是今天开的不直接接管：先问一句，避免把今天的训练记到旧日期上。
  if (session && session.date && session.date !== Workout.todayKey()) {
    pendingDraft = session;
    session = null;
  }
  let selectedDay = localStorage.getItem(DAY_KEY) || "chest";
  // 用户手动展开的组：key 为动作实例 id，值为组索引；-1 表示整组收起。
  // 没点过时自动展开"第一个没录的组"。展开状态只由用户点击改变，不做自动收起。
  let openSets = {};

  function persistDraft() {
    if (session) localStorage.setItem(DRAFT_KEY, JSON.stringify(session));
    else localStorage.removeItem(DRAFT_KEY);
  }

  function updateSession({ rerender = true } = {}) {
    session.updated_at = new Date().toISOString();
    persistDraft();
    if (rerender) render();
  }

  function refreshStats() {
    const stats = Workout.calculateStats(session);
    Object.entries({ ...stats, volume: Math.round(stats.volume) }).forEach(([key, value]) => {
      const target = container.querySelector(`[data-workout-stat="${key}"]`);
      if (target) target.textContent = value;
    });
  }

  // 只更新某动作的"已录 N/M 组"进度文本，避免整个重渲染。
  function refreshExerciseProgress(exerciseIndex) {
    const exercise = session.exercises[exerciseIndex];
    if (!exercise) return;
    const element = container.querySelector(`[data-exercise-card="${exerciseIndex}"] .set-progress`);
    if (!element) return;
    const done = Workout.recordedSets(exercise).length;
    const total = exercise.sets.length;
    element.textContent = `${done}/${total} 组`;
    element.classList.toggle("all-done", done === total && done > 0);
  }

  // 只把"当前正在练的动作"留在展开态：切到别的动作时收起其余动作，列表不会越撑越长。
  function collapseOtherExercises(activeId) {
    session?.exercises?.forEach(exercise => {
      if (exercise.id !== activeId) openSets[exercise.id] = -1;
    });
  }

  function findRecord(id) {
    return records.find(item => String(item.id) === String(id));
  }

  function openDialog(html) {
    const dialog = container.querySelector("#workout-dialog");
    dialog.querySelector("#workout-dialog-content").innerHTML = html;
    dialog.showModal();
    if (shouldAnimate()) dialog.animate([{ opacity:0, transform:"translateY(10px)" }, { opacity:1, transform:"translateY(0)" }], { duration:180, easing:"ease-out" });
    dialog.querySelectorAll("[data-dialog-close]").forEach(button => button.addEventListener("click", () => dialog.close()));
    // 仅点击遮罩区域关闭，弹窗内容区交互不受影响。
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    return dialog;
  }

  function editRecord(record) {
    if (Workout.isSession(record)) {
      session = Workout.cloneRecord(record);
      session._editing_record_id = record.id;
      session.status = "draft";
      selectedDay = session.training_day;
      openSets = {};
      persistDraft();
      render();
      window.scrollTo({ top:0, behavior:shouldAnimate() ? "smooth" : "auto" });
      return;
    }
    const dialog = openDialog(WorkoutView.legacyEditHtml(record));
    dialog.querySelector("#legacy-edit-form").addEventListener("submit", event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const saved = { ...record, ...values, current:Number(values.current || 0), target:Number(values.target || 0), updated_at:new Date().toISOString() };
      records.splice(records.indexOf(record), 1, saved);
      Workout.sortRecords(records);
      options.onSave(saved);
      dialog.close();
      render();
    });
  }

  function openExerciseLibrary() {
    const html = () => WorkoutView.exerciseLibraryHtml(selectedDay, session.exercises, Workout.customExercises(records), records);
    const dialog = openDialog(html());
    // 本地搜索：只过滤当前列表，不发请求；关键词在 refresh 后保留，连续加动作时不丢。
    let keyword = "";
    const applyFilter = () => {
      const search = dialog.querySelector("#workout-exercise-search");
      const empty = dialog.querySelector(".exercise-empty");
      if (search) keyword = search.value;
      const query = keyword.trim().toLowerCase();
      let visible = 0;
      dialog.querySelectorAll(".exercise-option").forEach(option => {
        const hit = !query || (option.dataset.search || "").includes(query);
        option.hidden = !hit;
        if (hit) visible += 1;
      });
      if (empty) empty.hidden = visible > 0 || !query;
      const create = dialog.querySelector("#workout-exercise-create");
      if (create) create.textContent = query ? `用「${keyword.trim()}」新建` : "新建动作";
    };
    const bindSearch = () => {
      const search = dialog.querySelector("#workout-exercise-search");
      if (search) {
        search.value = keyword;
        search.addEventListener("input", applyFilter);
      }
      // 搜不到时直接用当前关键词建自定义动作，省得再把名字打一遍。
      dialog.querySelector("#workout-exercise-create")?.addEventListener("click", () => {
        const name = (dialog.querySelector("#workout-exercise-search")?.value || "").trim();
        if (!name) return;
        const before = session.exercises.length;
        Workout.addCustomExercise(session, name, records);
        if (session.exercises.length === before) {
          const hint = dialog.querySelector("#workout-custom-hint");
          if (hint) hint.textContent = "这个名字已经在本次训练里了，或者超过 20 字。";
          return;
        }
        updateSession({ rerender: false });
        keyword = "";
        refresh();
      });
    };
    const refresh = () => {
      dialog.querySelector("#workout-dialog-content").innerHTML = html();
      dialog.querySelectorAll("[data-dialog-close]").forEach(close => close.addEventListener("click", () => dialog.close()));
      bindSearch();
      wireOptions();
      applyFilter();
    };
    const wireOptions = () => {
      dialog.querySelectorAll("[data-add-exercise]").forEach(button => button.addEventListener("click", () => {
        Workout.addExercise(session, button.dataset.addExercise, records);
        updateSession({ rerender:false });
        refresh();
      }));
      // 用过或自定义过的动作：点一下加回本次训练（id 由名称派生，历史轨迹不变）。
      dialog.querySelectorAll("[data-add-custom]").forEach(button => button.addEventListener("click", () => {
        Workout.addCustomExercise(session, button.dataset.addCustom, records);
        updateSession({ rerender:false });
        refresh();
      }));
      // 自定义动作：输入名称后回车或点「添加」，空名由原生校验拦住，重名给一句提示。
      dialog.querySelector("#workout-custom-form")?.addEventListener("submit", event => {
        event.preventDefault();
        const input = event.currentTarget.elements.name;
        const hint = dialog.querySelector("#workout-custom-hint");
        const before = session.exercises.length;
        Workout.addCustomExercise(session, input.value, records);
        if (session.exercises.length === before) {
          if (hint) hint.textContent = "这个名字已经在本次训练里了，换一个名称。";
          input.select();
          return;
        }
        updateSession({ rerender:false });
        refresh();
        // 连续加多个自定义动作时不用再点一次输入框。
        dialog.querySelector("#workout-custom-name")?.focus();
      });
    };
    bindSearch();
    wireOptions();
    // 关闭选择器后再刷新编辑区，支持一次连续加入多个动作。
    dialog.addEventListener("close", render, { once:true });
  }

  function wireEditor() {
    container.querySelector("#workout-cancel")?.addEventListener("click", async () => {
      if (!(await AppDialog.confirm(session._editing_record_id ? "退出编辑并放弃本次修改？" : "放弃当前训练草稿？", { title:"放弃训练", danger:true, okText:"放弃" }))) return;
      session = null;
      openSets = {};
      persistDraft();
      render();
      // 回到记录列表时回到顶部，让最新记录可见（浏览器不会自动复位滚动位置）
      window.scrollTo({ top:0, behavior:shouldAnimate() ? "smooth" : "auto" });
    });
    container.querySelector("#workout-add-exercise")?.addEventListener("click", openExerciseLibrary);
    container.querySelector("#workout-add-floating")?.addEventListener("click", openExerciseLibrary);
    container.querySelector("[data-open-library]")?.addEventListener("click", openExerciseLibrary);
    container.querySelectorAll("[data-quick-add]").forEach(button => button.addEventListener("click", () => {
      Workout.addExercise(session, button.dataset.quickAdd, records);
      updateSession();
    }));
    container.querySelectorAll("[data-exercise-delete]").forEach(button => button.addEventListener("click", () => {
      const exercise = session.exercises[Number(button.dataset.exerciseDelete)];
      if (exercise) delete openSets[exercise.id];
      session.exercises.splice(Number(button.dataset.exerciseDelete), 1);
      updateSession();
    }));
    // 加一组：继承上一组数据并展开新组。
    container.querySelectorAll("[data-set-add]").forEach(button => button.addEventListener("click", () => {
      const exerciseIndex = Number(button.dataset.setAdd);
      const exercise = session.exercises[exerciseIndex];
      if (!exercise) return;
      Workout.addSet(session, exerciseIndex);
      openSets[exercise.id] = exercise.sets.length - 1;
      updateSession();
    }));
    // 唯一改变展开状态的入口：点某一组就展开它，同时收起本动作的其它组与别的动作。
    // 不做"填完自动收"——只有用户点了别处，当前这组才收起来。
    container.querySelectorAll("[data-set-open]").forEach(button => button.addEventListener("click", () => {
      const exercise = session.exercises[Number(button.dataset.exercise)];
      if (!exercise) return;
      collapseOtherExercises(exercise.id);
      openSets[exercise.id] = Number(button.dataset.set);
      updateSession();
    }));
    // 更多面板：RPE / RIR / 备注只切换显隐，不重渲染。
    container.querySelectorAll("[data-set-more]").forEach(button => button.addEventListener("click", () => {
      const panel = button.closest(".set-more")?.querySelector(".set-more-panel");
      if (!panel) return;
      panel.hidden = !panel.hidden;
      button.setAttribute("aria-expanded", String(!panel.hidden));
    }));
    container.querySelectorAll("[data-exercise-info]").forEach(button => button.addEventListener("click", () => {
      const ex = session.exercises[Number(button.dataset.exerciseInfo)];
      if (!ex) return;
      const tips = (ex.tips || "保持动作稳定，按自身能力调整重量和次数。").replace(/。/g, "。\n");
      // 这个动作的历史数字直接放进说明里，不用再滚到底部展开动作进展。
      const history = Workout.exerciseHistory(records, ex.exercise_id, 20);
      const last = history[0];
      const best = Workout.bestSet(history.flatMap(item => item.sets));
      const stats = history.length
        ? `<p class="dialog-stats"><span>共 ${history.length} 次</span><span>上次 ${esc(last.date)}</span>${best ? `<span>最好 ${esc(Workout.formatSetCompact(best, ex.equipment))}</span>` : ""}</p><button type="button" class="workout-btn compact" data-exercise-trend="${esc(ex.exercise_id)}">看进展</button>`
        : `<p class="dialog-stats is-empty">还没有这个动作的记录。</p>`;
      openDialog(`<div class="dialog-head"><div><span class="dialog-kicker">动作说明</span><h3>${esc(ex.name)}</h3></div><button type="button" class="icon-action" data-dialog-close>×</button></div>${stats}<p class="dialog-muscles"><strong>锻炼部位</strong><br>${esc(ex.muscles || ex.body_part || "全身")}</p><p class="dialog-tips"><strong>动作要点</strong><br>${esc(tips).replace(/\n/g, "<br>")}</p>`);
    }));
    // 删组：走数据层 removeSet 同步下调计划组数，并修正展开位置。
    container.querySelectorAll("[data-set-delete]").forEach(button => button.addEventListener("click", () => {
      const exerciseIndex = Number(button.dataset.exercise);
      const setIndex = Number(button.dataset.set);
      const exercise = session.exercises[exerciseIndex];
      if (!exercise) return;
      Workout.removeSet(session, exerciseIndex, setIndex);
      if (openSets[exercise.id] != null) {
        if (openSets[exercise.id] === setIndex) openSets[exercise.id] = Math.min(setIndex, Math.max(0, exercise.sets.length - 1));
        else if (openSets[exercise.id] > setIndex) openSets[exercise.id] -= 1;
      }
      // 一组不剩：整个动作也不再保留。
      if (!exercise.sets.length) {
        session.exercises.splice(exerciseIndex, 1);
        delete openSets[exercise.id];
      }
      updateSession();
    }));
    // 输入即写入草稿，避免切换动作时丢失最后一次修改；展开状态只由点击决定，输入不触发收起。
    container.querySelectorAll("[data-set-field]").forEach(input => input.addEventListener("input", () => {
      const exerciseIndex = Number(input.dataset.exercise);
      const setIndex = Number(input.dataset.set);
      const exercise = session.exercises[exerciseIndex];
      const set = exercise?.sets[setIndex];
      if (!set) return;
      const field = input.dataset.setField;
      set[field] = field === "pace" ? input.value : (input.value === "" ? "" : Number(input.value));
      updateSession({ rerender:false });
      refreshStats();
      refreshExerciseProgress(exerciseIndex);
    }));
    container.querySelectorAll("[data-set-adjust]").forEach(button => button.addEventListener("click", () => {
      const exerciseIndex = Number(button.dataset.exercise);
      const setIndex = Number(button.dataset.set);
      const field = button.dataset.setAdjust;
      const step = Number(button.dataset.step);
      const exercise = session.exercises[exerciseIndex];
      const set = exercise?.sets[setIndex];
      if (!set) return;
      // 自重类动作重量可负（负数=助力），其余动作重量下限为 0；次数至少 1 个
      const assistable = Workout.allowsAssist(exercise);
      const minimum = field === "reps" ? 1 : (assistable ? -200 : 0);
      set[field] = Math.max(minimum, Number(set[field] || 0) + step);
      const input = container.querySelector(`[data-set-field="${field}"][data-exercise="${exerciseIndex}"][data-set="${setIndex}"]`);
      if (input) input.value = set[field];
      updateSession({ rerender:false });
      refreshStats();
      refreshExerciseProgress(exerciseIndex);
    }));
    container.querySelector("#workout-date")?.addEventListener("input", event => {
      session.date = event.target.value;
      updateSession({ rerender:false });
    });
    // 训练时长完全由用户填写，不做自动计时。
    container.querySelector("#workout-duration")?.addEventListener("input", event => {
      const value = Number(event.target.value);
      session.duration_min = value > 0 ? value : 0;
      updateSession({ rerender:false });
    });
    container.querySelector("#workout-note")?.addEventListener("input", event => { session.note = event.target.value; updateSession({ rerender:false }); });
    // 状态词：单选，再点一下取消。仅切 class，不重渲染，输入框不会失焦。
    container.querySelectorAll("[data-mood]").forEach(button => button.addEventListener("click", () => {
      const mood = button.dataset.mood;
      session.mood = session.mood === mood ? "" : mood;
      container.querySelectorAll("[data-mood]").forEach(chip => {
        const on = chip.dataset.mood === session.mood;
        chip.classList.toggle("on", on);
        chip.setAttribute("aria-pressed", String(on));
      });
      updateSession({ rerender:false });
    }));
    container.querySelector("#workout-finish")?.addEventListener("click", async () => {
      if (!session.date) return AppDialog.alert("请选择训练日期。", { title:"还差一步" });
      // 没有任何一组留下数值时不构成训练记录，提示后仍允许保存（可能是纯备注）。
      const hasRecord = Workout.calculateStats(session).setCount > 0;
      if (!hasRecord && !(await AppDialog.confirm("还没有记录任何一组，仍要保存吗？", { title:"训练尚未开始", okText:"仍然保存" }))) return;
      // 同一天已有记录时先问一句：补记与重复保存都走这里，不硬拦，由用户决定。
      const sameDay = Workout.sessionsOnDate(records, session.date)
        .filter(record => String(record.id) !== String(session._editing_record_id || ""));
      if (sameDay.length && !(await AppDialog.confirm(`${session.date} 已经有 ${sameDay.length} 条训练记录，仍要再存一条吗？`, { title:"同一天已有记录", okText:"仍然保存" }))) return;
      // 时长以输入框为准；没碰过输入框时用草稿开始时间给的预估值兜底。
      const durationValue = Number(container.querySelector("#workout-duration")?.value || 0);
      session.duration_min = durationValue > 0 ? Math.round(durationValue) : 0;
      session.note = container.querySelector("#workout-note")?.value.trim() || "";
      const saved = Workout.upsertSession(records, session);
      options.onSave(saved);
      if (session._plan_generated_at && session._plan_day_index != null) {
        WorkoutPlan?.saveProgress?.({
          plan_generated_at: session._plan_generated_at,
          day_index: session._plan_day_index,
          session_id: saved.id,
          date: saved.date,
        });
      }
      session = null;
      openSets = {};
      persistDraft();
      render();
      // 结束训练回到记录列表时回到顶部，让最新提交的记录可见
      window.scrollTo({ top: 0, behavior: shouldAnimate() ? "smooth" : "auto" });
    });
  }

  function startFromPlanDay(day, plan) {
    session = Workout.createSession(day.training_day, new Date());
    session.title = day.title;
    openSets = {};
    const history = records.filter(record => Workout.isSession(record));
    for (const item of day.exercises || []) {
      Workout.addExercise(session, item.exercise_id, history);
      const entry = session.exercises.find(exercise => exercise.exercise_id === item.exercise_id);
      if (!entry) continue;
      // 计划写了组数就补齐到目标组数，新组继承上一组数据并同步 planned_sets。
      const target = item.sets || entry.sets.length;
      const entryIndex = session.exercises.indexOf(entry);
      while (entry.sets.length < target) Workout.addSet(session, entryIndex);
      entry.sets.forEach(set => { if (item.weight_kg) set.weight_kg = item.weight_kg; });
    }
    session._plan_day_index = day.day_index;
    session._plan_generated_at = plan.generated_at;
    container.querySelector("#workout-dialog")?.close();
    persistDraft();
    render();
    window.scrollTo({ top: 0, behavior: shouldAnimate() ? "smooth" : "auto" });
  }

  function wire() {
    container.querySelector("#workout-plan-menu")?.addEventListener("click", event => {
      const actions = container.querySelector(".workout-plan-actions");
      if (!actions) return;
      actions.hidden = !actions.hidden;
      event.currentTarget.setAttribute("aria-expanded", String(!actions.hidden));
      event.stopPropagation();
      if (!actions.hidden) {
        const close = ev => { if (!actions.contains(ev.target)) { actions.hidden = true; document.removeEventListener("click", close); } };
        setTimeout(() => document.addEventListener("click", close), 0);
      }
    });
    container.querySelector("#workout-plan-view")?.addEventListener("click", () => {
      const plan = loadPlan();
      if (!plan) return AppDialog.alert("还没有已保存的训练计划，请先生成。", { title: "暂无计划" });
      const rawProgress = WorkoutPlan?.loadProgress?.();
      const progress = WorkoutPlan?.isProgressValid?.(rawProgress, plan.generated_at) ? rawProgress : null;
      openDialog(WorkoutView.planViewHtml(plan, progress));
    });
    // 运动偏好的入口已从菜单里撤下（见 workout-view.js 的 idleHtml），实现留在这里不动；
    // 重新设计偏好与计划的组合方式时，把按钮挂回菜单即可接上。
    container.querySelector("#workout-preferences")?.addEventListener("click", () => {
      const saved = readJson("cat-newsroom-workout-preferences-v1") || { goal:"hypertrophy", split:"three_day", days_per_week:3, session_minutes:60, notes:"" };
      const dialog = openDialog(`<form class="workout-preferences" id="workout-preferences-form"><h3>运动偏好</h3><label>目标<select name="goal"><option value="hypertrophy">增肌</option><option value="strength">力量</option><option value="fat_loss">减脂</option><option value="maintenance">维持</option></select></label><label>分化<select name="split"><option value="three_day">三分化</option><option value="upper_lower">上下肢</option><option value="full_body">全身</option></select></label><label>每周训练次数<input name="days_per_week" type="number" min="1" max="7"></label><label>单次时长<input name="session_minutes" type="number" min="15" max="240"></label><label>补充说明<textarea name="notes" maxlength="500"></textarea></label><button class="workout-btn primary" type="submit">保存</button></form>`);
      const form = dialog.querySelector("form"); Object.entries(saved).forEach(([key,value]) => { if (form.elements[key]) form.elements[key].value = value; });
      form.addEventListener("submit", event => { event.preventDefault(); localStorage.setItem("cat-newsroom-workout-preferences-v1", JSON.stringify(Object.fromEntries(new FormData(form)))); dialog.close(); });
    });
    container.querySelector("#workout-plan")?.addEventListener("click", async () => {
      const existing = loadPlan();
      if (existing && !(await AppDialog.confirm("已有一份训练计划。重新生成会覆盖它，是否继续？", { title:"覆盖训练计划", danger:true, okText:"重新生成" }))) return;
      const preferences = readJson("cat-newsroom-workout-preferences-v1") || {};
      const plan = WorkoutPlan.generatePlan({ preferences, records });
      WorkoutPlan.save(plan);
      WorkoutPlan.clearProgress();
      openDialog(WorkoutView.planViewHtml(plan));
    });
    container.querySelectorAll("[data-day]").forEach(button => button.addEventListener("click", () => {
      selectedDay = button.dataset.day;
      localStorage.setItem(DAY_KEY, selectedDay);
      if (session) {
        session.training_day = selectedDay;
        session.title = WorkoutCatalog.trainingDays.find(day => day.id === selectedDay).name;
        updateSession();
      } else render();
    }));
    container.querySelector("#workout-start")?.addEventListener("click", () => { session = Workout.createSession(selectedDay); openSets = {}; persistDraft(); render(); });
    // 补记：按选定日期开一条新训练。补的是哪一天就记哪一天，和当天记录没有区别。
    container.querySelector("#workout-backfill")?.addEventListener("click", () => {
      const date = container.querySelector("#workout-backfill-date")?.value;
      if (!date) return AppDialog.alert("先选一个补记日期。", { title:"还差一步" });
      if (date > Workout.todayKey()) return AppDialog.alert("补记日期不能晚于今天。", { title:"日期不对" });
      session = Workout.createSession(selectedDay, new Date(`${date}T00:00:00`));
      openSets = {};
      persistDraft();
      render();
    });
    container.querySelectorAll("[data-history-view]").forEach(button => button.addEventListener("click", () => { const record = findRecord(button.dataset.historyView); if (record) openDialog(WorkoutView.detailHtml(record)); }));
    container.querySelectorAll("[data-history-edit]").forEach(button => button.addEventListener("click", () => { const record = findRecord(button.dataset.historyEdit); if (record) editRecord(record); }));
    container.querySelectorAll("[data-history-delete]").forEach(button => button.addEventListener("click", async () => {
      const record = findRecord(button.dataset.historyDelete);
      if (!record || !(await AppDialog.confirm(`删除「${record.title || "这条训练"}」？`, { title:"删除训练记录", danger:true, okText:"删除" }))) return;
      records.splice(records.indexOf(record), 1);
      options.onDelete(record);
      render();
    }));
    if (session) wireEditor();
  }

  function render() {
    if (session) selectedDay = session.training_day;
    // uiState.previous 由渲染层自行计算上次表现；openSets 是这里的交互态。
    const uiState = { previous: null, openSets };
    container.innerHTML = session
      ? WorkoutView.editorHtml(session, selectedDay, records, uiState)
      : WorkoutView.idleHtml(selectedDay, records);
    wire();
  }

  // 计划日卡是打开弹窗后才渲染的，使用事件委托避免重复绑定。
  if (!container.__planDayBound) {
    container.__planDayBound = true;
    container.addEventListener("click", async event => {
      const card = event.target.closest("[data-plan-day]");
      if (!card) return;
      const plan = loadPlan();
      const dayIndex = Number(card.dataset.planDay);
      const day = plan?.days?.find(item => item.day_index === dayIndex);
      if (!plan || !day) return;
      const rawProgress = WorkoutPlan?.loadProgress?.();
      const progress = WorkoutPlan?.isProgressValid?.(rawProgress, plan.generated_at) ? rawProgress : null;
      const done = progress?.days?.[String(dayIndex)];
      if (done) {
        const record = findRecord(done.session_id);
        const redo = await AppDialog.confirm(`这天已在 ${done.date} 完成。是否重新练一次？`, { title: "该日已完成", okText: "重新练一次" });
        if (!redo) {
          if (record) openDialog(WorkoutView.detailHtml(record));
          return;
        }
      }
      startFromPlanDay(day, plan);
    });
  }

  // 训练详情“复制数据”：把整次训练复制到剪贴板。
  if (!container.__copyWorkoutBound) {
    container.__copyWorkoutBound = true;
    container.addEventListener("click", async event => {
      const button = event.target.closest("[data-copy-workout]");
      if (!button) return;
      const record = findRecord(button.dataset.copyWorkout);
      if (!record || !WorkoutView?.buildCopyText) return;
      const text = WorkoutView.buildCopyText(record);
      try {
        await navigator.clipboard.writeText(text);
      } catch (_) {
        const area = document.createElement("textarea");
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      if (Toast) Toast.show("已把训练数据复制到剪贴板");
      else AppDialog.alert("已把训练数据复制到剪贴板", { title: "已复制" });
    });
  }

  // 动作进展：历史页入口与详情弹窗里的“进展”按钮都打开该动作的长期记录。
  if (!container.__exerciseTrendBound) {
    container.__exerciseTrendBound = true;
    container.addEventListener("click", event => {
      const button = event.target.closest("[data-exercise-trend]");
      if (!button) return;
      openDialog(WorkoutView.exerciseProgressHtml(records, button.dataset.exerciseTrend));
    });
  }

  render();
  if (pendingDraft) {
    AppDialog.confirm(`上次有一条没结束的${pendingDraft.title || "训练"}（${pendingDraft.date}），接着记还是开新的？`, {
      title: "上次训练还没结束",
      okText: "接着记",
      cancelText: "开新的",
    }).then(keep => {
      if (keep) {
        session = pendingDraft;
        selectedDay = session.training_day || selectedDay;
        render();
      } else {
        localStorage.removeItem(DRAFT_KEY);
        render();
      }
    });
  }
  return { render, getSession:() => session };
}

const WorkoutUI = {
  DRAFT_KEY, DAY_KEY, mount
};
export default WorkoutUI;
export {
  DRAFT_KEY, DAY_KEY, mount
};
