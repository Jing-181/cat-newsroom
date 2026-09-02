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
    const records = options.records;
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
        records.sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")));
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
      container.querySelector("#workout-cancel")?.addEventListener("click", () => {
        if (!confirm(session._editing_record_id ? "退出编辑并放弃本次修改？" : "放弃当前训练草稿？")) return;
        session = null;
        persistDraft();
        render();
      });
      container.querySelector("#workout-add-exercise")?.addEventListener("click", openExerciseLibrary);
      container.querySelector("[data-open-library]")?.addEventListener("click", openExerciseLibrary);
      container.querySelectorAll("[data-quick-add]").forEach(button => button.addEventListener("click", () => {
        root.Workout.addExercise(session, button.dataset.quickAdd, records);
        updateSession();
      }));
      container.querySelectorAll("[data-exercise-delete]").forEach(button => button.addEventListener("click", () => { session.exercises.splice(Number(button.dataset.exerciseDelete), 1); updateSession(); }));
      container.querySelectorAll("[data-set-add], [data-set-copy]").forEach(button => button.addEventListener("click", () => {
        const index = Number(button.dataset.setAdd ?? button.dataset.setCopy);
        const exercise = session.exercises[index];
        const previous = exercise.sets.at(-1) || { weight_kg:0, reps:10, rpe:"" };
        exercise.sets.push({ ...previous, completed:true });
        updateSession();
      }));
      container.querySelectorAll("[data-set-delete]").forEach(button => button.addEventListener("click", () => { session.exercises[Number(button.dataset.exercise)].sets.splice(Number(button.dataset.set), 1); updateSession(); }));
      container.querySelectorAll("[data-set-done]").forEach(button => button.addEventListener("click", () => {
        const set = session.exercises[Number(button.dataset.exercise)].sets[Number(button.dataset.set)];
        set.completed = !set.completed;
        updateSession();
      }));
      // 输入即写入草稿，避免切换动作时丢失最后一次修改。
      container.querySelectorAll("[data-set-field]").forEach(input => input.addEventListener("input", () => {
        const set = session.exercises[Number(input.dataset.exercise)].sets[Number(input.dataset.set)];
        set[input.dataset.setField] = input.value === "" ? "" : Number(input.value);
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
      container.querySelector("#workout-finish")?.addEventListener("click", () => {
        if (!session.date) return alert("请选择训练日期。");
        if (!root.Workout.calculateStats(session).setCount && !confirm("还没有标记完成的训练组，仍要保存吗？")) return;
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
      container.querySelectorAll("[data-history-delete]").forEach(button => button.addEventListener("click", () => {
        const record = findRecord(button.dataset.historyDelete);
        if (!record || !confirm(`删除「${record.title || "这条训练"}」？`)) return;
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
