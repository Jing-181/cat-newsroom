(function (root) {
  const DRAFT_KEY = "cat-newsroom-workout-draft-v1";
  const DAY_KEY = "cat-newsroom-workout-day-v1";

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
  }

  function shouldAnimate() {
    return !matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function loadPlan() {
    return root.WorkoutPlan?.load?.() || readJson("cat-newsroom-weekly-workout-plan-v1");
  }

  function mount(container, options) {
    if (!container || !root.Workout || !root.WorkoutCatalog || !root.WorkoutView) return null;
    const records = options.records || [];
    root.Workout.sortRecords(records);
    let session = readJson(DRAFT_KEY);
    let selectedDay = localStorage.getItem(DAY_KEY) || "chest";
    // 用户手动展开的组：key 为动作实例 id，值为组索引；-1 表示整组收起。
    // 没点过时自动展开"第一个没录的组"。
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
      const stats = root.Workout.calculateStats(session);
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
      const done = root.Workout.recordedSets(exercise).length;
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
      if (root.Workout.isSession(record)) {
        session = root.Workout.cloneRecord(record);
        session._editing_record_id = record.id;
        session.status = "draft";
        selectedDay = session.training_day;
        openSets = {};
        persistDraft();
        render();
        window.scrollTo({ top:0, behavior:shouldAnimate() ? "smooth" : "auto" });
        return;
      }
      const dialog = openDialog(root.WorkoutView.legacyEditHtml(record));
      dialog.querySelector("#legacy-edit-form").addEventListener("submit", event => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(event.currentTarget));
        const saved = { ...record, ...values, current:Number(values.current || 0), target:Number(values.target || 0), updated_at:new Date().toISOString() };
        records.splice(records.indexOf(record), 1, saved);
        root.Workout.sortRecords(records);
        options.onSave(saved);
        dialog.close();
        render();
      });
    }

    function openExerciseLibrary() {
      const dialog = openDialog(root.WorkoutView.exerciseLibraryHtml(selectedDay, session.exercises));
      const wireOptions = () => dialog.querySelectorAll("[data-add-exercise]").forEach(button => button.addEventListener("click", () => {
        root.Workout.addExercise(session, button.dataset.addExercise, records);
        updateSession({ rerender:false });
        dialog.querySelector("#workout-dialog-content").innerHTML = root.WorkoutView.exerciseLibraryHtml(selectedDay, session.exercises);
        dialog.querySelectorAll("[data-dialog-close]").forEach(close => close.addEventListener("click", () => dialog.close()));
        wireOptions();
      }));
      wireOptions();
      // 关闭选择器后再刷新编辑区，支持一次连续加入多个动作。
      dialog.addEventListener("close", render, { once:true });
    }

    // 记录当前组并进入下一组：最后一组时自动新增一组并继承数据，随后滚动定位到新活动组。
    function nextSet(exerciseIndex, setIndex) {
      const exercise = session.exercises[exerciseIndex];
      if (!exercise) return;
      const isLast = setIndex === exercise.sets.length - 1;
      if (isLast) {
        root.Workout.addSet(session, exerciseIndex);
        openSets[exercise.id] = exercise.sets.length - 1;
      } else {
        openSets[exercise.id] = setIndex + 1;
      }
      updateSession();
      requestAnimationFrame(() => {
        const active = container.querySelector(`[data-exercise-card="${exerciseIndex}"] .set-row.is-active`);
        if (!active) return;
        active.scrollIntoView({ behavior: shouldAnimate() ? "smooth" : "auto", block: "center" });
        active.querySelector("[data-set-field]")?.focus?.({ preventScroll:true });
      });
    }

    function wireEditor() {
      container.querySelector("#workout-cancel")?.addEventListener("click", async () => {
        if (!(await root.AppDialog.confirm(session._editing_record_id ? "退出编辑并放弃本次修改？" : "放弃当前训练草稿？", { title:"放弃训练", danger:true, okText:"放弃" }))) return;
        session = null;
        openSets = {};
        persistDraft();
        render();
      });
      container.querySelector("#workout-add-exercise")?.addEventListener("click", openExerciseLibrary);
      container.querySelector("#workout-add-floating")?.addEventListener("click", openExerciseLibrary);
      // 训练中的"动作进展"：点开弹窗看某个动作的长期变化，不打断记录。
      container.querySelector("[data-tracked-progress]")?.addEventListener("click", () => {
        openDialog(root.WorkoutView.progressDialogHtml(records));
      });
      container.querySelector("[data-open-library]")?.addEventListener("click", openExerciseLibrary);
      container.querySelectorAll("[data-quick-add]").forEach(button => button.addEventListener("click", () => {
        root.Workout.addExercise(session, button.dataset.quickAdd, records);
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
        root.Workout.addSet(session, exerciseIndex);
        openSets[exercise.id] = exercise.sets.length - 1;
        updateSession();
      }));
      // 展开已收起的组（手动定位到某一组去修改）；此时收起其它动作，保持只有一个动作展开。
      container.querySelectorAll("[data-set-open]").forEach(button => button.addEventListener("click", () => {
        const exercise = session.exercises[Number(button.dataset.exercise)];
        if (!exercise) return;
        collapseOtherExercises(exercise.id);
        openSets[exercise.id] = Number(button.dataset.set);
        updateSession();
      }));
      // 记录并进入下一组。
      container.querySelectorAll("[data-set-next]").forEach(button => button.addEventListener("click", () => {
        nextSet(Number(button.dataset.exercise), Number(button.dataset.set));
      }));
      // 收起当前组：整组回到一行，需要时再点开修改。
      container.querySelectorAll("[data-set-collapse]").forEach(button => button.addEventListener("click", () => {
        const exercise = session.exercises[Number(button.dataset.exercise)];
        if (!exercise) return;
        openSets[exercise.id] = -1;
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
        const tips = (ex.tips || "保持动作稳定，按自身能力调整重量和次数。").replace(/。/g, "。\n");
        openDialog(`<div class="dialog-head"><div><span class="dialog-kicker">动作说明</span><h3>${ex.name}</h3></div><button type="button" class="icon-action" data-dialog-close>×</button></div><p class="dialog-muscles"><strong>锻炼部位</strong><br>${ex.muscles || ex.body_part || "全身"}</p><p class="dialog-tips"><strong>动作要点</strong><br>${tips}</p>`);
      }));
      // 删组：走数据层 removeSet 同步下调计划组数，并修正展开位置。
      container.querySelectorAll("[data-set-delete]").forEach(button => button.addEventListener("click", () => {
        const exerciseIndex = Number(button.dataset.exercise);
        const setIndex = Number(button.dataset.set);
        const exercise = session.exercises[exerciseIndex];
        if (!exercise) return;
        root.Workout.removeSet(session, exerciseIndex, setIndex);
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
      // 输入即写入草稿，避免切换动作时丢失最后一次修改；有数值即算训练记录。
      container.querySelectorAll("[data-set-field]").forEach(input => input.addEventListener("input", () => {
        const exerciseIndex = Number(input.dataset.exercise);
        const set = session.exercises[exerciseIndex]?.sets[Number(input.dataset.set)];
        if (!set) return;
        set[input.dataset.setField] = input.dataset.setField === "pace" ? input.value : (input.value === "" ? "" : Number(input.value));
        updateSession({ rerender:false });
        refreshStats();
        refreshExerciseProgress(exerciseIndex);
      }));
      container.querySelectorAll("[data-set-adjust]").forEach(button => button.addEventListener("click", () => {
        const exerciseIndex = Number(button.dataset.exercise);
        const setIndex = Number(button.dataset.set);
        const field = button.dataset.setAdjust;
        const step = Number(button.dataset.step);
        const set = session.exercises[exerciseIndex]?.sets[setIndex];
        if (!set) return;
        const minimum = field === "reps" ? 1 : 0;
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
      container.querySelector("#workout-finish")?.addEventListener("click", async () => {
        if (!session.date) return root.AppDialog.alert("请选择训练日期。", { title:"还差一步" });
        // 没有任何一组留下数值时不构成训练记录，提示后仍允许保存（可能是纯备注）。
        const hasRecord = root.Workout.calculateStats(session).setCount > 0;
        if (!hasRecord && !(await root.AppDialog.confirm("还没有记录任何一组，仍要保存吗？", { title:"训练尚未开始", okText:"仍然保存" }))) return;
        session.note = container.querySelector("#workout-note")?.value.trim() || "";
        const saved = root.Workout.upsertSession(records, session);
        options.onSave(saved);
        if (session._plan_generated_at && session._plan_day_index != null) {
          root.WorkoutPlan?.saveProgress?.({
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
      });
    }

    function startFromPlanDay(day, plan) {
      session = root.Workout.createSession(day.training_day, new Date());
      session.title = day.title;
      openSets = {};
      const history = records.filter(record => root.Workout.isSession(record));
      for (const item of day.exercises || []) {
        root.Workout.addExercise(session, item.exercise_id, history);
        const entry = session.exercises.find(exercise => exercise.exercise_id === item.exercise_id);
        if (!entry) continue;
        // 计划写了组数就补齐到目标组数，新组继承上一组数据并同步 planned_sets。
        const target = item.sets || entry.sets.length;
        const entryIndex = session.exercises.indexOf(entry);
        while (entry.sets.length < target) root.Workout.addSet(session, entryIndex);
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
        if (!plan) return root.AppDialog.alert("还没有已保存的训练计划，请先生成。", { title: "暂无计划" });
        const rawProgress = root.WorkoutPlan?.loadProgress?.();
        const progress = root.WorkoutPlan?.isProgressValid?.(rawProgress, plan.generated_at) ? rawProgress : null;
        openDialog(root.WorkoutView.planViewHtml(plan, progress));
      });
      container.querySelector("#workout-preferences")?.addEventListener("click", () => {
        const saved = readJson("cat-newsroom-workout-preferences-v1") || { goal:"hypertrophy", split:"three_day", days_per_week:3, session_minutes:60, notes:"" };
        const dialog = openDialog(`<form class="workout-preferences" id="workout-preferences-form"><h3>运动偏好</h3><label>目标<select name="goal"><option value="hypertrophy">增肌</option><option value="strength">力量</option><option value="fat_loss">减脂</option><option value="maintenance">维持</option></select></label><label>分化<select name="split"><option value="three_day">三分化</option><option value="upper_lower">上下肢</option><option value="full_body">全身</option></select></label><label>每周训练次数<input name="days_per_week" type="number" min="1" max="7"></label><label>单次时长<input name="session_minutes" type="number" min="15" max="240"></label><label>补充说明<textarea name="notes" maxlength="500"></textarea></label><button class="workout-btn primary" type="submit">保存</button></form>`);
        const form = dialog.querySelector("form"); Object.entries(saved).forEach(([key,value]) => { if (form.elements[key]) form.elements[key].value = value; });
        form.addEventListener("submit", event => { event.preventDefault(); localStorage.setItem("cat-newsroom-workout-preferences-v1", JSON.stringify(Object.fromEntries(new FormData(form)))); dialog.close(); });
      });
      container.querySelector("#workout-plan")?.addEventListener("click", async () => {
        const existing = loadPlan();
        if (existing && !(await root.AppDialog.confirm("已有一份训练计划。重新生成会覆盖它，是否继续？", { title:"覆盖训练计划", danger:true, okText:"重新生成" }))) return;
        const preferences = readJson("cat-newsroom-workout-preferences-v1") || {};
        const plan = root.WorkoutPlan.generatePlan({ preferences, records });
        root.WorkoutPlan.save(plan);
        root.WorkoutPlan.clearProgress();
        openDialog(root.WorkoutView.planViewHtml(plan));
      });
      container.querySelectorAll("[data-day]").forEach(button => button.addEventListener("click", () => {
        selectedDay = button.dataset.day;
        localStorage.setItem(DAY_KEY, selectedDay);
        if (session) {
          session.training_day = selectedDay;
          session.title = root.WorkoutCatalog.trainingDays.find(day => day.id === selectedDay).name;
          updateSession();
        } else render();
      }));
      container.querySelector("#workout-start")?.addEventListener("click", () => { session = root.Workout.createSession(selectedDay); openSets = {}; persistDraft(); render(); });
      container.querySelectorAll("[data-history-view]").forEach(button => button.addEventListener("click", () => { const record = findRecord(button.dataset.historyView); if (record) openDialog(root.WorkoutView.detailHtml(record)); }));
      container.querySelectorAll("[data-history-edit]").forEach(button => button.addEventListener("click", () => { const record = findRecord(button.dataset.historyEdit); if (record) editRecord(record); }));
      container.querySelectorAll("[data-history-delete]").forEach(button => button.addEventListener("click", async () => {
        const record = findRecord(button.dataset.historyDelete);
        if (!record || !(await root.AppDialog.confirm(`删除「${record.title || "这条训练"}」？`, { title:"删除训练记录", danger:true, okText:"删除" }))) return;
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
        ? root.WorkoutView.editorHtml(session, selectedDay, records, uiState)
        : root.WorkoutView.idleHtml(selectedDay, records);
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
        const rawProgress = root.WorkoutPlan?.loadProgress?.();
        const progress = root.WorkoutPlan?.isProgressValid?.(rawProgress, plan.generated_at) ? rawProgress : null;
        const done = progress?.days?.[String(dayIndex)];
        if (done) {
          const record = findRecord(done.session_id);
          const redo = await root.AppDialog.confirm(`这天已在 ${done.date} 完成。是否重新练一次？`, { title: "该日已完成", okText: "重新练一次" });
          if (!redo) {
            if (record) openDialog(root.WorkoutView.detailHtml(record));
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
        if (!record || !root.WorkoutView?.buildCopyText) return;
        const text = root.WorkoutView.buildCopyText(record);
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
        if (root.Toast) root.Toast.show("已把训练数据复制到剪贴板");
        else root.AppDialog.alert("已把训练数据复制到剪贴板", { title: "已复制" });
      });
    }

    // 动作进展：历史页入口与详情弹窗里的“进展”按钮都打开该动作的长期记录。
    if (!container.__exerciseTrendBound) {
      container.__exerciseTrendBound = true;
      container.addEventListener("click", event => {
        const button = event.target.closest("[data-exercise-trend]");
        if (!button) return;
        openDialog(root.WorkoutView.exerciseProgressHtml(records, button.dataset.exerciseTrend));
      });
    }

    render();
    return { render, getSession:() => session };
  }

  root.WorkoutUI = { DRAFT_KEY, DAY_KEY, mount };
})(typeof window !== "undefined" ? window : null);
