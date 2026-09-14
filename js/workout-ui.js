(function (root) {
  const DRAFT_KEY = "cat-newsroom-workout-draft-v1";
  const DAY_KEY = "cat-newsroom-workout-day-v1";

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
  }

  function shouldAnimate() {
    return !matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function mount(container, options) {
    if (!container || !root.Workout || !root.WorkoutCatalog || !root.WorkoutView) return null;
    const records = options.records || [];
    root.Workout.sortRecords(records);
    let session = readJson(DRAFT_KEY);
    let selectedDay = localStorage.getItem(DAY_KEY) || "chest";

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

    function wireEditor() {
      container.querySelector("#workout-cancel")?.addEventListener("click", async () => {
        if (!(await root.AppDialog.confirm(session._editing_record_id ? "退出编辑并放弃本次修改？" : "放弃当前训练草稿？", { title:"放弃训练", danger:true, okText:"放弃" }))) return;
        session = null;
        persistDraft();
        render();
      });
      container.querySelector("#workout-add-exercise")?.addEventListener("click", openExerciseLibrary);
      container.querySelector("#workout-add-floating")?.addEventListener("click", openExerciseLibrary);
      container.querySelector("[data-open-library]")?.addEventListener("click", openExerciseLibrary);
      container.querySelectorAll("[data-quick-add]").forEach(button => button.addEventListener("click", () => {
        root.Workout.addExercise(session, button.dataset.quickAdd, records);
        updateSession();
      }));
      container.querySelectorAll("[data-exercise-delete]").forEach(button => button.addEventListener("click", () => { session.exercises.splice(Number(button.dataset.exerciseDelete), 1); updateSession(); }));
      container.querySelectorAll("[data-set-add]").forEach(button => button.addEventListener("click", () => {
        const index = Number(button.dataset.setAdd);
        const exercise = session.exercises[index];
        const previous = exercise.sets.at(-1) || { weight_kg:0, reps:10, rpe:"" };
        exercise.sets.push({ ...previous, completed:true });
        updateSession();
      }));
      container.querySelectorAll("[data-exercise-info]").forEach(button => button.addEventListener("click", () => {
        const ex = session.exercises[Number(button.dataset.exerciseInfo)];
        const tips = (ex.tips || "保持动作稳定，按自身能力调整重量和次数。").replace(/。/g, "。\n");
        openDialog(`<div class="dialog-head"><div><span class="dialog-kicker">动作说明</span><h3>${ex.name}</h3></div><button type="button" class="icon-action" data-dialog-close>×</button></div><p class="dialog-muscles"><strong>锻炼部位</strong><br>${ex.muscles || ex.body_part || "全身"}</p><p class="dialog-tips"><strong>动作要点</strong><br>${tips}</p>`);
      }));
      container.querySelectorAll("[data-set-delete]").forEach(button => button.addEventListener("click", () => { session.exercises[Number(button.dataset.exercise)].sets.splice(Number(button.dataset.set), 1); updateSession(); }));
      container.querySelectorAll("[data-set-done]").forEach(button => button.addEventListener("click", () => {
        const set = session.exercises[Number(button.dataset.exercise)].sets[Number(button.dataset.set)];
        set.completed = !set.completed;
        // 完成组只更新当前按钮和统计，保留用户当前滚动位置。
        button.classList.toggle("on", set.completed);
        button.closest(".set-row")?.classList.toggle("completed", set.completed);
        const card = button.closest(".session-exercise");
        const progress = card?.querySelector(".set-progress");
        if (progress) { const done = session.exercises[Number(button.dataset.exercise)].sets.filter(item => item.completed).length; const count = session.exercises[Number(button.dataset.exercise)].sets.length; progress.textContent = `${done}/${count} 组`; progress.classList.toggle("all-done", done === count); }
        updateSession({ rerender:false });
        refreshStats();
      }));
      // 输入即写入草稿，避免切换动作时丢失最后一次修改。
      container.querySelectorAll("[data-set-field]").forEach(input => input.addEventListener("input", () => {
        const set = session.exercises[Number(input.dataset.exercise)].sets[Number(input.dataset.set)];
        set[input.dataset.setField] = input.dataset.setField === "pace" ? input.value : (input.value === "" ? "" : Number(input.value));
        updateSession({ rerender:false });
        refreshStats();
      }));
      container.querySelectorAll("[data-set-adjust]").forEach(button => button.addEventListener("click", () => {
        const exerciseIndex = Number(button.dataset.exercise);
        const setIndex = Number(button.dataset.set);
        const field = button.dataset.setAdjust;
        const step = Number(button.dataset.step);
        const set = session.exercises[exerciseIndex].sets[setIndex];
        const minimum = field === "reps" ? 1 : 0;
        set[field] = Math.max(minimum, Number(set[field] || 0) + step);
        const input = container.querySelector(`[data-set-field="${field}"][data-exercise="${exerciseIndex}"][data-set="${setIndex}"]`);
        if (input) input.value = set[field];
        updateSession({ rerender:false });
        refreshStats();
      }));
      container.querySelector("#workout-date")?.addEventListener("input", event => {
        session.date = event.target.value;
        container.querySelector("[data-submit-date]").textContent = session.date;
        updateSession({ rerender:false });
      });
      container.querySelector("#workout-duration")?.addEventListener("input", event => {
        session.duration_min = Math.max(1, Number(event.target.value || 1));
        container.querySelector("[data-submit-duration]").textContent = session.duration_min;
        updateSession({ rerender:false });
      });
      container.querySelector("#workout-note")?.addEventListener("input", event => { session.note = event.target.value; updateSession({ rerender:false }); });
      container.querySelector("#workout-finish")?.addEventListener("click", async () => {
        if (!session.date) return root.AppDialog.alert("请选择训练日期。", { title:"还差一步" });
        if (!root.Workout.calculateStats(session).setCount && !(await root.AppDialog.confirm("还没有标记完成的训练组，仍要保存吗？", { title:"训练尚未完成", okText:"仍然保存" }))) return;
        session.duration_min = Math.max(1, Number(container.querySelector("#workout-duration").value || 1));
        session.note = container.querySelector("#workout-note").value.trim();
        const saved = root.Workout.upsertSession(records, session);
        options.onSave(saved);
        session = null;
        persistDraft();
        render();
      });
    }

    function wire() {
      container.querySelector("#workout-plan-menu")?.addEventListener("click", event => { const actions=container.querySelector(".workout-plan-actions"); if(actions){ actions.hidden=!actions.hidden; event.currentTarget.setAttribute("aria-expanded", String(!actions.hidden)); } });
      container.querySelector("#workout-plan-view")?.addEventListener("click", () => { const saved=readJson("cat-newsroom-workout-plan-v1") || readJson("cat-newsroom-weekly-workout-plan-v1"); if(!saved) return root.AppDialog.alert("还没有已保存的训练计划，请先生成。", {title:"暂无计划"}); const plan=saved.plan||saved; openDialog(`<div class="dialog-head"><div><span class="dialog-kicker">训练计划</span><h3>最近两轮 · 六天安排</h3></div><button type="button" class="icon-action" data-dialog-close>×</button></div>${(plan.days||[]).map(day=>`<p><strong>第${day.day_index}天 ${day.title||""}</strong><br>${(day.exercises||[]).map(item=>`${item.name} ${item.sets}组 × ${item.reps}`).join("；")}</p>`).join("")}`); });
      container.querySelector("#workout-preferences")?.addEventListener("click", () => {
        const saved = readJson("cat-newsroom-workout-preferences-v1") || { goal:"hypertrophy", split:"three_day", days_per_week:3, session_minutes:60, notes:"" };
        const dialog = openDialog(`<form class="workout-preferences" id="workout-preferences-form"><h3>运动偏好</h3><label>目标<select name="goal"><option value="hypertrophy">增肌</option><option value="strength">力量</option><option value="fat_loss">减脂</option><option value="maintenance">维持</option></select></label><label>分化<select name="split"><option value="three_day">三分化</option><option value="upper_lower">上下肢</option><option value="full_body">全身</option></select></label><label>每周训练次数<input name="days_per_week" type="number" min="1" max="7"></label><label>单次时长<input name="session_minutes" type="number" min="15" max="240"></label><label>补充说明<textarea name="notes" maxlength="500"></textarea></label><button class="workout-btn primary" type="submit">保存</button></form>`);
        const form = dialog.querySelector("form"); Object.entries(saved).forEach(([key,value]) => { if (form.elements[key]) form.elements[key].value = value; });
        form.addEventListener("submit", event => { event.preventDefault(); localStorage.setItem("cat-newsroom-workout-preferences-v1", JSON.stringify(Object.fromEntries(new FormData(form)))); dialog.close(); });
      });
      container.querySelector("#workout-plan")?.addEventListener("click", async event => { const button=event.currentTarget; button.disabled=true; button.textContent="生成中…"; try { const preferences=readJson("cat-newsroom-workout-preferences-v1")||{}; const result=await root.generateWorkoutPlan({ preferences, recent_workouts:records.slice(0,12), days:6, start_date:new Date().toISOString().slice(0,10), timezone:Intl.DateTimeFormat().resolvedOptions().timeZone }); localStorage.setItem("cat-newsroom-workout-plan-v1", JSON.stringify(result.plan||{})); openDialog(`<h3>六天训练建议</h3>${(result.plan?.days||[]).map(day=>`<p><strong>第${day.day_index}天 ${day.title||""}</strong><br>${(day.exercises||[]).map(item=>`${item.name} ${item.sets}组 × ${item.reps}`).join("；")}</p>`).join("")||"暂无计划"}`); } catch(error) { root.AppDialog.alert(error.message||"训练计划生成失败", {title:"生成失败"}); } finally { button.disabled=false; button.textContent="生成六天计划"; } });
      container.querySelectorAll("[data-day]").forEach(button => button.addEventListener("click", () => {
        selectedDay = button.dataset.day;
        localStorage.setItem(DAY_KEY, selectedDay);
        if (session) {
          session.training_day = selectedDay;
          session.title = root.WorkoutCatalog.trainingDays.find(day => day.id === selectedDay).name;
          updateSession();
        } else render();
      }));
      container.querySelector("#workout-start")?.addEventListener("click", () => { session = root.Workout.createSession(selectedDay); persistDraft(); render(); });
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
      container.innerHTML = session
        ? root.WorkoutView.editorHtml(session, selectedDay, records)
        : root.WorkoutView.idleHtml(selectedDay, records);
      wire();
    }

    render();
    return { render, getSession:() => session };
  }

  root.WorkoutUI = { DRAFT_KEY, DAY_KEY, mount };
})(typeof window !== "undefined" ? window : null);
