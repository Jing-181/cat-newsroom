// 训练界面控制器：挂载运动页、草稿与选中日的持久化、弹窗流程。
//
// ESM 模块：import WorkoutUI from "./workout-ui.js"。

import Workout from "./workout.js";
import WorkoutCatalog from "./workout-catalog.js";
import WorkoutPlan from "./workout-plan.js";
import WorkoutView from "./workout-view.js";
import AppDialog from "./app-dialog.js";
import Toast from "./toast.js";
import { playInkSweep, encourageFor } from "./ink-sweep.js";
import { mountMoveFigure, kindForName } from "./move-figure.js";
// 使用记录：同步调用、无 await、不落盘（由 trace 自己合并写），失败不抛
import Trace from "./trace.js";

  const DRAFT_KEY = "cat-newsroom-workout-draft-v1";
  const FULLSCREEN_KEY = "cat-newsroom-workout-fullscreen";
const DAY_KEY = "cat-newsroom-workout-day-v1";

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
}

// 保存后的一句回声：按状态词说一句，不额外占操作。
const MOOD_REPLY = {
  "不错": "记下了。",
  "还阔以": "记下了，稳稳的。",
  "一般般": "记下了，一般也算数。",
  "练爽了": "记下了，这练值。",
  "起飞": "记下了，飞起来了。",
  "突破": "记下了，今天算个日子。",
  "摸鱼": "摸鱼也是练。",
  "腿软": "记下了，腿软说明练到了。",
  "顶不住": "能记完就不算白来。",
  "没睡好": "没睡好还来了，记下了。",
};
const moodReply = mood => MOOD_REPLY[mood] || "记下了。";

// 弹窗里的历史统计要拼 HTML，这里只转义五个会破坏结构的字符。
function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;" }[ch]));
}

function shouldAnimate() {
  return !matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// 收小 ↔ 展开的高度过渡：时长与缓动用页面上已有的 token，不另写曲线。
function animateHeightChange(element, from, to) {
  if (!shouldAnimate() || !element || !(from > 0) || Math.abs(from - to) < 1) return;
  const tokens = getComputedStyle(document.documentElement);
  const seconds = parseFloat(tokens.getPropertyValue("--dur-fast")) || 0.15;
  const easing = tokens.getPropertyValue("--ease-out").trim() || "ease-out";
  element.animate(
    [{ height: `${from}px`, boxSizing: "border-box" }, { height: `${to}px`, boxSizing: "border-box" }],
    { duration: seconds * 1000, easing },
  );
}

function loadPlan() {
  return WorkoutPlan?.load?.() || readJson("cat-newsroom-weekly-workout-plan-v1");
}

// 草稿是否存在：只读本地草稿键，不碰记录数据，也不改 DRAFT_KEY 的语义
function hasDraft() {
  return !!readJson(DRAFT_KEY);
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
  // 已完成动作的展开态：只存内存。换页面、刷新、重新挂载都回到收小态，不写进草稿。
  const expandedDone = new Set();
  // 结束训练区的展开态：同上，只存内存。训练结束或离开这条训练就回到收起。
  let completionOpen = false;
  // 逐组模式：训练中默认开，一屏只记当前这一组。
  // 指针记的是「动作实例 id + 组序」，不是数组下标：删动作、重排之后下标会悄悄指向别人。
  let focusMode = false;
  let focusPoint = null;
  let flashTimer = null;
  // 逐组屏上的两个活物：秒表和图解小人。它们绑在 DOM 上，重渲染前要先拆掉
  let focusTimerId = 0;
  let figureCleanup = null;
  // 恢复的草稿也直接进逐组：这是训练时的默认工作面。只有“编辑旧记录”例外，
  // 那种场景是回头改历史，需要看到全部动作。
  if (session && !session._editing_record_id) focusMode = true;
  // 已上报过「这组有记录」的组：只在第一次变成有记录时记一条，不跟着每次输入走
  const reportedSets = new WeakSet();

  // 每次开一条新训练（或离开当前训练）时把编辑器级交互态一起清掉：
  // 展开的组与「已完成动作的展开集」都属于这一次训练，不该带到下一条。
  function resetEditorState() {
    openSets = {};
    expandedDone.clear();
    completionOpen = false;
    focusMode = false;
    focusPoint = null;
  }

  // 当前该记哪一组：先看指针落在哪，再找全场第一组没记录的。
  // 都记完了就停在最后一个动作的最后一组，留着可以改。
  function currentFocusTarget() {
    if (!session || !session.exercises.length) return null;
    const pinnedIndex = focusPoint ? session.exercises.findIndex(item => item.id === focusPoint.exerciseId) : -1;
    if (session.exercises[pinnedIndex]?.sets?.[focusPoint?.setIndex]) {
      return { exercise: pinnedIndex, set: focusPoint.setIndex };
    }
    for (let index = 0; index < session.exercises.length; index += 1) {
      const sets = session.exercises[index].sets || [];
      const empty = sets.findIndex(set => !Workout.setHasRecord(set));
      if (empty >= 0) return { exercise: index, set: empty };
    }
    const last = session.exercises.length - 1;
    const sets = session.exercises[last].sets || [];
    return sets.length ? { exercise: last, set: sets.length - 1 } : null;
  }

  // 把指针落到某个动作的某一组。动作级指针＝这个动作，组级指针＝这一组。
  function rememberFocus(exerciseIndex, setIndex) {
    const exercise = session?.exercises?.[exerciseIndex];
    if (exercise) focusPoint = { exerciseId: exercise.id, setIndex: Number(setIndex) };
  }

  // 逐组屏上正在显示的那一组。输入、步进、"完成这组"全按它写，不再每次从数据反推：
  // 反推的指针会在填了次数之后自己滑到下一组，屏幕和数据从此对不上。
  function focusScope() {
    const scope = container.querySelector("[data-focus-scope]");
    const exerciseIndex = session?.exercises?.findIndex(item => item.id === scope?.dataset.focusEx) ?? -1;
    const exercise = session?.exercises?.[exerciseIndex];
    const setIndex = Number(scope?.dataset.focusSet);
    const set = exercise?.sets?.[setIndex];
    return set ? { exerciseIndex, setIndex, exercise, set } : null;
  }

  // 完成一组之后的下一个位置：本动作内往后 → 下一个动作 → 前面漏掉的；
  // 全部记完就清掉指针（currentFocusTarget 会落到最后一个动作的最后一组）。
  // 下一组接着用上一组的重量（次数不跟：次数填了才算又记了一组）。
  // 换动作时器械类型相同才带，不同就当换器械，不把 30kg 从哑铃搬到绳索上。
  function carryWeight(from, to) {
    if (!to) return;
    const targetExercise = session.exercises[to.exercise];
    const targetSet = targetExercise?.sets?.[to.set];
    if (!targetSet || !("weight_kg" in targetSet)) return;
    if (to.exercise !== from.exerciseIndex && targetExercise.equipment !== from.exercise.equipment) return;
    if (Number(targetSet.weight_kg || 0) !== 0) return;
    const weight = Number(from.set.weight_kg || 0);
    if (weight) targetSet.weight_kg = weight;
  }

  // 加动作时抄当前动作的组数与重量。器械不同时由数据层丢掉重量，只留组数。
  // 重量取当前正在记的那一组（它已由 seedFocusWeight 填好），不取最后一组：
  // 加满四组时最后一组往往还空着，拿它抄等于把 0 当重量。
  function currentTemplate() {
    const scope = focusScope() || currentFocusTarget();
    const exercise = session?.exercises?.[scope?.exerciseIndex ?? scope?.exercise];
    if (!exercise?.sets?.length) return null;
    const anchor = scope?.setIndex ?? exercise.sets.length - 1;
    let weight = 0;
    for (let index = anchor; index >= 0 && !weight; index -= 1) weight = Number(exercise.sets[index]?.weight_kg || 0);
    return { sets: exercise.sets.length, weight_kg: weight, equipment: exercise.equipment };
  }

  // 同动作里下一组默认用上一组的重量。
  // 完成一组、切回来、刷新恢复都走这里：手上不用每次把重量重输一遍，只填次数。
  function seedFocusWeight() {
    const target = currentFocusTarget();
    const exercise = session?.exercises?.[target?.exercise];
    const set = exercise?.sets?.[target?.set];
    if (!set || Workout.setHasRecord(set) || !("weight_kg" in set)) return false;
    if (Number(set.weight_kg || 0) !== 0) return false;
    for (let index = target.set - 1; index >= 0; index -= 1) {
      const previous = exercise.sets[index];
      if (!Workout.setHasRecord(previous) || !Number(previous.weight_kg || 0)) continue;
      set.weight_kg = previous.weight_kg;
      return true;
    }
    return false;
  }

  // 这一组还空着，就把上次练这个动作同一组序的数字填进去。
  // 只补空字段，不覆盖已经输入的；点「完成这组」时才真正采用。
  // 为什么不当成数据直接写：次数一写，这组就变成「已记录」，进度虚高，没练的组也会被存进历史。
  function applySuggestion(scope) {
    if (!scope?.set) return false;
    const previous = Workout.previousPerformance(records, scope.exercise.exercise_id)?.sets?.[scope.setIndex];
    if (!previous) return false;
    let filled = false;
    ["weight_kg", "reps", "duration_min", "distance_km"].forEach(field => {
      if (!(field in scope.set) || Number(scope.set[field] || 0) !== 0) return;
      if (!Number(previous[field] || 0)) return;
      scope.set[field] = previous[field];
      filled = true;
    });
    return filled;
  }

  // 左右滑动：按「动作内所有组」排成一条线前后走，越过本动作末组就进下一个动作。
  // 与「下一个动作」按钮不同：这里是逐组移动，回看上一组也用它。
  function stepFocus(delta) {
    const scope = focusScope();
    if (!scope) return;
    const order = [];
    session.exercises.forEach((exercise, exerciseIndex) => {
      (exercise.sets || []).forEach((set, setIndex) => order.push({ exercise: exerciseIndex, set: setIndex }));
    });
    const here = order.findIndex(item => item.exercise === scope.exerciseIndex && item.set === scope.setIndex);
    if (here < 0) return;
    const next = order[Math.min(order.length - 1, Math.max(0, here + delta))];
    if (!next || (next.exercise === scope.exerciseIndex && next.set === scope.setIndex)) return;
    rememberFocus(next.exercise, next.set);
    render();
  }

  function persistDraft() {
    if (session) localStorage.setItem(DRAFT_KEY, JSON.stringify(session));
    else localStorage.removeItem(DRAFT_KEY);
  }

  function updateSession({ rerender = true } = {}) {
    session.updated_at = new Date().toISOString();
    persistDraft();
    if (rerender) render();
  }

  // 放弃当前训练：完整页的「放弃」与逐组空态的「放弃这次训练」是同一条路径
  async function abandonSession() {
    if (!session) return;
    const question = session._editing_record_id ? "退出编辑并放弃本次修改？" : "放弃当前训练草稿？";
    if (!(await AppDialog.confirm(question, { title: "放弃训练", danger: true, okText: "放弃" }))) return;
    session = null;
    resetEditorState();
    persistDraft();
    render();
    window.scrollTo({ top: 0, behavior: shouldAnimate() ? "smooth" : "auto" });
  }

  // 全屏：只是把顶栏与底栏藏起来，不动任何布局与数据。
  // 它存在 <html> 上，因为要隐藏的元素在训练页外面；离开这一页时由 App 清掉。
  function applyFullscreen(on) {
    document.documentElement.classList.toggle("workout-fullscreen", Boolean(on));
    try { localStorage.setItem(FULLSCREEN_KEY, on ? "1" : "0"); } catch (_) { /* 无痕模式不阻止 */ }
  }

  // 秒表和图解：只在逐组屏出现。秒表从 started_at 算，不另外存字段；
  // 图解按动作名选姿势，认不出的先用呼吸起伏顶着，不假装在演那个动作。
  function stopFocusExtras() {
    if (focusTimerId) { clearInterval(focusTimerId); focusTimerId = 0; }
    if (figureCleanup) { figureCleanup(); figureCleanup = null; }
  }

  function startFocusExtras() {
    // 秒表和小人只是场面上的东西：任何一步出错都不能把训练屏弄挂，所以包一层 try
    try {
      const timerEl = container.querySelector("[data-focus-timer]");
      if (timerEl && session) {
        const tick = () => {
          const start = Date.parse(session?.started_at || "");
          const total = Number.isFinite(start) ? Math.max(0, Math.floor((Date.now() - start) / 1000)) : 0;
          const hours = Math.floor(total / 3600);
          const minutes = Math.floor((total % 3600) / 60);
          const seconds = total % 60;
          timerEl.textContent = `${hours ? `${hours}:${String(minutes).padStart(2, "0")}` : String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
        };
        tick();
        focusTimerId = setInterval(tick, 1000);
      }
      const svg = container.querySelector("[data-move-figure]");
      if (svg && session) {
        const target = currentFocusTarget();
        const exercise = session.exercises[target?.exercise];
        figureCleanup = mountMoveFigure(svg, { kind: kindForName(exercise?.name || "") });
      }
    } catch (error) {
      console.warn("focus extras skipped", error);
    }
  }

  // 补记：不经正式训练，直接落一条记录（没按组记的那些天用）
  function openBackfillDialog() {
    const dialog = openDialog(WorkoutView.backfillDialogHtml(selectedDay));
    dialog.querySelector("#backfill-save")?.addEventListener("click", () => {
      const date = dialog.querySelector("#backfill-date")?.value || Workout.todayKey();
      if (date > Workout.todayKey()) {
        AppDialog.alert("补记日期不能晚于今天。", { title: "日期不对" });
        return;
      }
      const day = dialog.querySelector("#backfill-day")?.value || selectedDay;
      const duration = Number(dialog.querySelector("#backfill-duration")?.value || 0);
      const note = dialog.querySelector("#backfill-note")?.value.trim() || "";
      const record = Workout.createSession(day, new Date(`${date}T12:00:00`));
      record.exercises = [];
      record.duration_min = duration > 0 ? Math.round(duration) : 0;
      record.note = note;
      const saved = Workout.upsertSession(records, record);
      options.onSave(saved);
      dialog.close();
      render();
      Trace.track("workout_backfill_saved", { duration_min: record.duration_min });
      if (Toast) Toast.show("已补记一条");
    });
  }

  // 训练中的反馈放屏幕中间：底部是主按钮和拇指区，提示压在那是挡路。
  // 它只停 1.5 秒、不吃点击，也不推动任何布局。
  function flashFocus(text) {
    const node = container.querySelector(".focus-flash");
    if (!node) {
      if (Toast) Toast.show(text);
      return;
    }
    node.textContent = text;
    node.classList.remove("is-on");
    void node.offsetWidth;
    node.classList.add("is-on");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => node.classList.remove("is-on"), 1500);
  }

  function refreshStats() {
    const stats = Workout.calculateStats(session);
    // 容量上千位带逗号，未录入时是破折号，跟模板里的渲染保持同一套格式
    Object.entries({ ...stats, volume: Workout.formatVolume(stats.volume) }).forEach(([key, value]) => {
      const target = container.querySelector(`[data-workout-stat="${key}"]`);
      if (target) target.textContent = value;
    });
    // 容量从无到有时把单位补上：空状态只说「容量 —」，不写一个空的 kg
    container.querySelector(".workout-summary-volume")?.classList.toggle("is-empty", Math.round(stats.volume) <= 0);
  }

  // 某组第一次有记录的描线：只在这一刻触发一次，跟着输入走的那几次都不重复。
  // 伪元素负责画线，这里只加类；animationend 后立刻摘掉，不留常驻动画，也不新增常驻监听。
  function sweepRecordedSet(exerciseIndex, setIndex) {
    if (!shouldAnimate()) return;
    const card = container.querySelector(`[data-exercise-card="${exerciseIndex}"]`);
    // 组行按渲染顺序排列，索引与数据里的组索引一致；拿不到就不画。
    const row = card?.querySelectorAll(".set-row")[setIndex];
    if (!row || row.classList.contains("is-record-sweep")) return;
    row.classList.add("is-record-sweep");
    row.addEventListener("animationend", () => row.classList.remove("is-record-sweep"), { once: true });
  }

  // 某一组从「空」变成「有记录」的那一刻记一次，用于算组间歇与首组时间。
  // 不挂新监听、不读 DOM，就在已有 handler 末尾调一下。
  function noteSetCompleted(exerciseIndex, setIndex, via) {
    try {
      const exercise = session?.exercises?.[exerciseIndex];
      const set = exercise?.sets?.[setIndex];
      if (!set || reportedSets.has(set)) return;
      if (!Workout.setHasRecord(set)) return;
      reportedSets.add(set);
      sweepRecordedSet(exerciseIndex, setIndex);
      Trace.track("workout_set_completed", { ex_index: exerciseIndex, set_index: setIndex, via });
    } catch (_) { /* 埋点与描线永不打断录入 */ }
  }

  // 只更新某动作的"已录 N/M 组"进度文本，避免整个重渲染。
  function refreshExerciseProgress(exerciseIndex) {
    const exercise = session.exercises[exerciseIndex];
    if (!exercise) return;
    const card = container.querySelector(`[data-exercise-card="${exerciseIndex}"]`);
    const element = card?.querySelector(".set-progress");
    if (!element) return;
    const done = Workout.recordedSets(exercise).length;
    const total = exercise.sets.length;
    element.textContent = `${done}/${total} 组`;
    const allDone = done === total && done > 0;
    element.classList.toggle("all-done", allDone);
    // 不重渲染就不收卡（不在输入时把东西抽走），但卡上的状态标记得跟着数字走，
    // 否则清掉最后一组后卡片还挂着“已完成”。
    card.classList.toggle("is-done", allDone);
  }

  // 只把"当前正在练的动作"留在展开态：切到别的动作时，其余动作的展开状态一并交还回去。
  // openSets 收起组行，expandedDone 收起“用户展开过”的标记：不加这一步，加过组或点过组的动作
  // 会被永久当成用户主动展开过，这次训练里再也不会收小。
  function collapseOtherExercises(activeId) {
    session?.exercises?.forEach(exercise => {
      if (exercise.id === activeId) return;
      openSets[exercise.id] = -1;
      expandedDone.delete(exercise.id);
    });
  }

  // 加进一个新动作不等于把注意力切走：只有当前动作的组全部记完了，才把目标落到新动作上。
  // 这个判断不用写分支——currentFocusTarget 本来就是按顺序找第一组没记录的，
  // 当前动作还有空组时它自然还停在那儿。
  function focusLastExercise() {
    const last = session?.exercises?.[session.exercises.length - 1];
    if (!last) return;
    collapseOtherExercises(last.id);
  }

  // 已完成动作的收小 / 展开：只切内存里的集合，重渲染一次。
  // 高度过渡交给 render 里的统一处理，这里不另外做动画。
  // 不写草稿、不碰数据，所以换页面回来仍是收小态。
  function toggleDoneCard(id) {
    if (!session || !id) return;
    if (!session.exercises.some(item => item.id === id)) return;
    if (expandedDone.has(id)) {
      expandedDone.delete(id);
      // 收起时把“正在改的那一组”一并关上，否则展开态会靠它撑住。
      openSets[id] = -1;
    } else {
      // 点开就等于切到这个动作上：别的已完成的动作该收起。
      collapseOtherExercises(id);
      expandedDone.add(id);
      // 清掉“整组收起”的标记，让展开后回到默认位置（最后一个有记录的组），
      // 也就是这个动作平时的完整长相，而不是一排都合着的行。
      delete openSets[id];
    }
    render();
  }

  function findRecord(id) {
    return records.find(item => String(item.id) === String(id));
  }

  // ink=true：训练期弹窗（动作库、总览、结束）拿深墨皮，跟逐组屏同一套语言。
  // 历史详情、动作进展、训练计划这些是翻旧账用的，仍然纸面。
  function openDialog(html, { ink = false, list = false } = {}) {
    const dialog = container.querySelector("#workout-dialog");
    dialog.classList.toggle("is-ink", Boolean(ink));
    // list：头部与搜索框固定，只有列表滚。不设的话整张弹窗一起滚，搜索时会跟着跑
    dialog.classList.toggle("is-list", Boolean(list));
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
      resetEditorState();
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

  // 总览弹窗：训练中的“看一眼全局”。点任意一组就回去继续记那一组。
  function openOverviewDialog() {
    if (!session) return;
    const dialog = openDialog(WorkoutView.overviewDialogHtml(session, selectedDay), { ink: true });
    const bind = () => {
      dialog.querySelectorAll("[data-dialog-close]").forEach(button => button.addEventListener("click", () => dialog.close()));
      dialog.querySelectorAll("[data-focus-jump]").forEach(button => button.addEventListener("click", () => {
        const [exercise, set] = String(button.dataset.focusJump).split("-").map(Number);
        focusMode = true;
        rememberFocus(exercise, set);
        dialog.close();
        render();
      }));
      // 总览里也能放弃：主屏幕上不再挂这个按钮，但它必须找得到
      dialog.querySelector("[data-focus-abandon]")?.addEventListener("click", async () => {
        dialog.close();
        await abandonSession();
      });
      // 删动作不关弹窗：删完就地重画列表，人会连着删好几个
      dialog.querySelectorAll("[data-focus-remove-ex]").forEach(button => button.addEventListener("click", () => {
        const index = Number(button.dataset.focusRemoveEx);
        const exercise = session?.exercises?.[index];
        if (!exercise) return;
        session.exercises.splice(index, 1);
        focusPoint = null;
        persistDraft();
        paint();
      }));
      dialog.querySelector("[data-focus-finish-dialog]")?.addEventListener("click", () => {
        dialog.close();
        openFinishDialog();
      });
    };
    // 弹窗内容就住在 container 里，调 render() 会把它一起拆掉；
    // 所以弹窗期间只重画自己的列表，背后的训练屏等关闭时再重画。
    const paint = () => {
      if (!session) return;
      dialog.querySelector("#workout-dialog-content").innerHTML = WorkoutView.overviewDialogHtml(session, selectedDay);
      bind();
    };
    bind();
    dialog.addEventListener("close", () => { if (session) render(); }, { once: true });
  }

  // 结束弹窗：训练中不打扰，要收尾了才一次性问时长、日期、状态词、备注
  function openFinishDialog() {
    if (!session) return;
    const dialog = openDialog(WorkoutView.finishDialogHtml(session), { ink: true });
    dialog.querySelectorAll(".mood-chip").forEach(chip => chip.addEventListener("click", () => {
      const value = chip.dataset.mood;
      session.mood = session.mood === value ? "" : value;
      dialog.querySelectorAll(".mood-chip").forEach(item => {
        const on = item.dataset.mood === session.mood;
        item.classList.toggle("on", on);
        item.setAttribute("aria-pressed", String(on));
      });
      persistDraft();
    }));
    dialog.querySelector("#workout-finish-save")?.addEventListener("click", () => saveSession(dialog));
    // 弹窗里的日期/时长/备注自己监听：完整页那套 input 监听绑在总览 DOM 上，逐组模式里不在了
    dialog.querySelector("#workout-date")?.addEventListener("input", event => { session.date = event.target.value; persistDraft(); });
    dialog.querySelector("#workout-duration")?.addEventListener("input", event => {
      const value = Number(event.target.value);
      session.duration_min = value > 0 ? value : 0;
      persistDraft();
    });
    dialog.querySelector("#workout-note")?.addEventListener("input", event => { session.note = event.target.value; persistDraft(); });
  }

  // 动作说明：完整页和逐组屏（点动作名）共用一个弹窗
  function openExerciseInfo(ex) {
    if (!ex) return;
    const tips = (ex.tips || "保持动作稳定，按自身能力调整重量和次数。").replace(/。/g, "。\n");
    // 这个动作的历史数字直接放进说明里，不用再滚到底部展开动作进展。
    const history = Workout.exerciseHistory(records, ex.exercise_id, 20);
    const last = history[0];
    const best = Workout.bestSet(history.flatMap(item => item.sets));
    const stats = history.length
      ? `<p class="dialog-stats"><span>共 ${history.length} 次</span><span>上次 ${esc(last.date)}</span>${best ? `<span>最好 ${esc(Workout.formatSetCompact(best, ex.equipment))}</span>` : ""}</p><button type="button" class="workout-btn compact" data-exercise-trend="${esc(ex.exercise_id)}">看进展</button>`
      : `<p class="dialog-stats is-empty">还没有这个动作的记录。</p>`;
    openDialog(`<div class="dialog-head"><div><span class="dialog-kicker">动作说明</span><h3>${esc(ex.name)}</h3></div><button type="button" class="icon-action" data-dialog-close>×</button></div>${stats}<p class="dialog-muscles"><strong>锻炼部位</strong><br>${esc(ex.muscles || ex.body_part || "全身")}</p><p class="dialog-tips"><strong>动作要点</strong><br>${esc(tips).replace(/\n/g, "<br>")}</p>`, { ink: true });
  }

  function openExerciseLibrary() {
    const html = () => WorkoutView.exerciseLibraryHtml(selectedDay, session.exercises, Workout.customExercises(records), records);
    const dialog = openDialog(html(), { ink: true, list: true });
    // 本地搜索：只开关列表项的 hidden，不重建 DOM，也不发请求。
    let keyword = "";
    const scrollBox = () => dialog.querySelector(".lib-scroll");
    const applyFilter = () => {
      const search = dialog.querySelector("#workout-exercise-search");
      if (search) keyword = search.value;
      const query = keyword.trim().toLowerCase();
      let visible = 0;
      dialog.querySelectorAll(".exercise-option").forEach(option => {
        const hit = !query || (option.dataset.search || "").includes(query);
        option.hidden = !hit;
        if (hit) visible += 1;
      });
      // 「新建」只在搜不到时出现：动作库基本盖得住，平时不给它站位
      const empty = dialog.querySelector(".exercise-empty");
      if (empty) empty.hidden = visible > 0 || !query;
      const create = dialog.querySelector("#workout-exercise-create");
      if (create) create.textContent = query ? `用「${keyword.trim()}」新建` : "新建动作";
    };
    const bind = () => {
      dialog.querySelectorAll("[data-dialog-close]").forEach(button => button.addEventListener("click", () => dialog.close()));
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
        Workout.addCustomExercise(session, name, records, currentTemplate());
        if (session.exercises.length === before) return;
        updateSession({ rerender: false });
        keyword = "";
        refresh();
        Trace.track("workout_exercise_add", { source: "custom", index: session.exercises.length - 1 });
        focusLastExercise();
      });
      dialog.querySelectorAll("[data-add-exercise]").forEach(button => button.addEventListener("click", () => {
        Workout.addExercise(session, button.dataset.addExercise, records, currentTemplate());
        Trace.track("workout_exercise_add", { source: "library", index: session.exercises.length - 1 });
        focusLastExercise();
        updateSession({ rerender: false });
        refresh();
      }));
    };
    const refresh = () => {
      // 加完一个动作不把列表滚回顶部、也不丢搜索词：连着加动作是常态
      const box = scrollBox();
      const top = box ? box.scrollTop : 0;
      dialog.querySelector("#workout-dialog-content").innerHTML = html();
      bind();
      applyFilter();
      const next = scrollBox();
      if (next) next.scrollTop = top;
    };
    bind();
    applyFilter();
    // 关闭选择器后再刷新训练屏，支持一次连续加入多个动作。
    dialog.addEventListener("close", render, { once: true });
  }

  function wireEditor() {
    // 已完成动作的收小 / 展开：整卡可点，但卡内的真实控件优先（加一组、动作说明、删除都不触发折叠）。
    // 用容器级事件委派并只绑一次，重渲染不会重复叠加监听。
    if (!container.__doneCardBound) {
      container.__doneCardBound = true;
      const onDoneToggle = event => {
        const target = event.target.closest("[data-done-toggle]");
        if (!target) return;
        // 真实控件优先：删除、加组、说明、组行都是各自的动作，不能被折叠吃掉。
        // 只有折叠标记自己例外（它本来就是用来开合的）。
        const control = event.target.closest("input, textarea, select, button, a");
        if (control && !control.classList.contains("exercise-fold-mark")) return;
        event.preventDefault();
        toggleDoneCard(target.dataset.doneToggle);
      };
      container.addEventListener("click", onDoneToggle);
    }
    container.querySelector(".workout-completion-head")?.addEventListener("click", () => {
      // 点开结束区只是把这块东西铺开，不写草稿：展开态只存内存。
      completionOpen = !completionOpen;
      render();
    });
    container.querySelector("#workout-cancel")?.addEventListener("click", abandonSession);
    container.querySelector("#workout-add-exercise")?.addEventListener("click", openExerciseLibrary);

    // ---- 逐组模式 ----
    // 训练中只面对当前这一组；所有修改都写回同一个 session，和总览是同一份数据。
    container.querySelector("[data-focus-overview-open]")?.addEventListener("click", openOverviewDialog);
    container.querySelector("[data-focus-enter]")?.addEventListener("click", () => {
      focusMode = true;
      focusPoint = null;
      render();
    });
    // 逐组屏上的每一次输入都写「屏幕上正在显示的那一组」，不按数据反推：
    // 反推会在这一组刚变成有记录的一瞬间把指针滑到下一组，屏幕和实际写入从此对不上。
    const writeFocusField = (field, value) => {
      const scope = focusScope();
      if (!scope) return;
      scope.set[field] = value === "" ? "" : Number(value);
      updateSession({ rerender: false });
    };
    container.querySelectorAll("[data-focus-step]").forEach(button => button.addEventListener("click", () => {
      const scope = focusScope();
      if (!scope) return;
      const { set, exercise } = scope;
      const field = button.dataset.focusStep;
      // 和总览里的步进器同一套下限：自重可负（助力），次数至少 1
      const assistable = Workout.allowsAssist(exercise);
      // 这一格还没填：先从上次的数字起步，不用从 0 一下一下加到上次的量。
      if (!Number(set[field] || 0)) applySuggestion(scope);
      const minimum = field === "reps" ? 1 : (field === "weight_kg" && assistable ? -200 : 0);
      const next = Math.max(minimum, Number(set[field] || 0) + Number(button.dataset.delta));
      set[field] = Math.round(next * 10) / 10;
      updateSession({ rerender: false });
      const input = container.querySelector(`[data-focus-field="${field}"]`);
      if (input) {
        input.value = set[field];
        input.classList.toggle("is-empty", !Number(set[field]));
      }
    }));
    container.querySelectorAll("[data-focus-field]").forEach(input => input.addEventListener("input", () => {
      input.classList.toggle("is-empty", input.value === "");
      input.classList.remove("is-suggest");
      writeFocusField(input.dataset.focusField, input.value);
    }));
    // 上次这组：点一下填进去，已经填了的字段不覆盖
    container.querySelector("[data-focus-last]")?.addEventListener("click", () => {
      const scope = focusScope();
      if (!scope) return;
      const { set, exercise, setIndex } = scope;
      const previousSet = Workout.previousPerformance(records, exercise.exercise_id)?.sets?.[setIndex];
      if (!previousSet) return;
      ["weight_kg", "reps", "duration_min", "distance_km"].forEach(field => {
        if (!(field in previousSet) || Number(set[field] || 0) > 0) return;
        set[field] = previousSet[field];
        const input = container.querySelector(`[data-focus-field="${field}"]`);
        if (input) {
          input.value = set[field];
          input.classList.toggle("is-empty", !Number(set[field]));
        }
      });
      updateSession({ rerender: false });
    });
    container.querySelector("[data-focus-done]")?.addEventListener("click", () => {
      const scope = focusScope();
      if (!scope) return;
      const { set, exercise, exerciseIndex, setIndex } = scope;
      if (!Workout.setHasRecord(set)) {
        // 屏幕上是淡色的建议值，点完成就等于确认：先落成这次的数字再判一次。
        applySuggestion(scope);
      }
      if (!Workout.setHasRecord(set)) {
        flashFocus("这一组还没填数字");
        return;
      }
      const advice = Workout.restAdvice(exercise);
      const next = Workout.nextSetTarget(session, { exercise: exerciseIndex, set: setIndex });
      // 先把重量带到下一组，再移动指针：下一组直接接着用这个重量，只填次数就又是一组。
      carryWeight(scope, next);
      if (next) rememberFocus(next.exercise, next.set);
      else focusPoint = null;
      // 采用建议值改的是数据，需要落一次草稿（render 只负责画）。
      persistDraft();
      render();
      flashFocus(next ? `第 ${setIndex + 1} 组已记录 · 休息 ${advice.minutes}` : "全部组已记录");
    });
    // 上/下一个动作：不离开这一屏就能换动作，落到该动作第一个没记录的组。
    container.querySelectorAll("[data-focus-move-exercise]").forEach(button => button.addEventListener("click", () => {
      const scope = focusScope();
      if (!scope) return;
      const delta = Number(button.dataset.focusMoveExercise);
      const exerciseIndex = Math.min(session.exercises.length - 1, Math.max(0, scope.exerciseIndex + delta));
      const exercise = session.exercises[exerciseIndex];
      if (!exercise?.sets?.length) return;
      const pending = exercise.sets.findIndex(next => !Workout.setHasRecord(next));
      const to = { exercise: exerciseIndex, set: pending >= 0 ? pending : exercise.sets.length - 1 };
      // 同一套器械换动作时把重量带过去，与「完成这组」自动前进是同一条规则。
      carryWeight(scope, to);
      rememberFocus(to.exercise, to.set);
      render();
    }));
    container.querySelector("[data-focus-cancel]")?.addEventListener("click", abandonSession);
    // 左右滑动切组 / 切动作：与上/下一个动作按钮是同一条推进线，步长小一档。
    // 从输入框里开始的横向拖动不算：那里留给输入框自己用。
    const focusRoot = container.querySelector("[data-focus-root]");
    if (focusRoot) {
      let startX = 0;
      let startY = 0;
      let tracking = false;
      focusRoot.addEventListener("touchstart", event => {
        if (event.touches.length !== 1) return;
        tracking = !event.target.closest("input, textarea");
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
      }, { passive: true });
      focusRoot.addEventListener("touchend", event => {
        if (!tracking) return;
        tracking = false;
        const touch = event.changedTouches[0];
        if (!touch) return;
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        // 横向为主且足够长才算滑动，避开上下滚动与轻微拖动。
        if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        stepFocus(dx < 0 ? 1 : -1);
      }, { passive: true });
    }
    // 点动作名看要点：训练中不离开这一屏就能确认动作怎么走
    container.querySelector("[data-focus-info]")?.addEventListener("click", () => {
      const scope = focusScope();
      if (scope) openExerciseInfo(scope.exercise);
    });
    container.querySelector("[data-focus-fullscreen]")?.addEventListener("click", () => {
      applyFullscreen(!document.documentElement.classList.contains("workout-fullscreen"));
    });
    // 全部组都记完了，剩下的就是时长、状态词和保存，交给结束弹窗
    container.querySelector("[data-focus-finish]")?.addEventListener("click", openFinishDialog);
    // 加一组：把当前动作往后延一组。当前这组还没记就留在这组先记完，
    // 已记完才把指针带到新组——加组不等于要先跑到最后。
    container.querySelector("[data-focus-addset]")?.addEventListener("click", () => {
      const scope = focusScope();
      if (!scope) return;
      const hadRecord = Workout.setHasRecord(scope.set);
      const added = Workout.addSet(session, scope.exerciseIndex);
      // addSet 会继承上一组的数值，但那组还没练：把「有没有记录」的判定字段清掉，
      // 否则新加的一组一出生就算已录，主按钮会直接跳成「结束训练」。
      if (added) {
        if ("duration_min" in added || "distance_km" in added) {
          added.duration_min = 0;
          added.distance_km = 0;
        } else {
          added.reps = 0;
        }
      }
      rememberFocus(scope.exerciseIndex, hadRecord ? scope.exercise.sets.length - 1 : scope.setIndex);
      updateSession();
    });
    // 加动作：走已有的动作选择弹窗，加完把目标切到它的第一组
    container.querySelector("[data-focus-add-exercise]")?.addEventListener("click", openExerciseLibrary);
    container.querySelector("#workout-add-floating")?.addEventListener("click", openExerciseLibrary);
    container.querySelector("[data-open-library]")?.addEventListener("click", openExerciseLibrary);
    container.querySelectorAll("[data-quick-add]").forEach(button => button.addEventListener("click", () => {
      Workout.addExercise(session, button.dataset.quickAdd, records, currentTemplate());
      Trace.track("workout_exercise_add", { source: "quick", index: session.exercises.length - 1 });
      focusLastExercise();
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
      const added = Workout.addSet(session, exerciseIndex);
      // 新组只是预填，次数留空：复制次数会让它一出生就算已录，进度虚高、"完成这组"也能跳过去。
      // 逐组屏的加组也是同一套语义，两个入口不能两套判定。
      if (added) {
        if ("duration_min" in added || "distance_km" in added) {
          added.duration_min = 0;
          added.distance_km = 0;
        } else {
          added.reps = 0;
        }
      }
      // 在 A 上加组就是在 A 上操作：别的动作回到收起默认。
      collapseOtherExercises(exercise.id);
      openSets[exercise.id] = exercise.sets.length - 1;
      // 新组在卡上要有地方可改：加完主动铺开，不能被收小态吞掉。
      expandedDone.add(exercise.id);
      Trace.track("workout_set_add", { ex_index: exerciseIndex, set_index: exercise.sets.length - 1 });
      updateSession();
    }));
    // 唯一改变展开状态的入口：点某一组就展开它，同时收起本动作的其它组与别的动作。
    // 不做"填完自动收"——只有用户点了别处，当前这组才收起来。
    container.querySelectorAll("[data-set-open]").forEach(button => button.addEventListener("click", () => {
      const exercise = session.exercises[Number(button.dataset.exercise)];
      if (!exercise) return;
      collapseOtherExercises(exercise.id);
      openSets[exercise.id] = Number(button.dataset.set);
      // 点了某组就是要改它：这个动作跟着展开，不能再被自动收小吞掉。
      expandedDone.add(exercise.id);
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
      if (ex) openExerciseInfo(ex);
    }));
    // 删组：走数据层 removeSet 同步下调计划组数，并修正展开位置。
    container.querySelectorAll("[data-set-delete]").forEach(button => button.addEventListener("click", () => {
      const exerciseIndex = Number(button.dataset.exercise);
      const setIndex = Number(button.dataset.set);
      const exercise = session.exercises[exerciseIndex];
      if (!exercise) return;
      Workout.removeSet(session, exerciseIndex, setIndex);
      Trace.track("workout_set_delete", { ex_index: exerciseIndex, set_index: setIndex });
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
      noteSetCompleted(exerciseIndex, setIndex, "typed");
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
      noteSetCompleted(exerciseIndex, setIndex, "adjust");
    }));
    // 灰色提示点一下：把上次这一组填进空着的字段，已填的不覆盖。
    container.querySelectorAll("[data-fill-last]").forEach(button => button.addEventListener("click", () => {
      const exerciseIndex = Number(button.dataset.exercise);
      const setIndex = Number(button.dataset.set);
      const exercise = session.exercises[exerciseIndex];
      const set = exercise?.sets?.[setIndex];
      if (!set) return;
      const last = Workout.previousPerformance(records, exercise.exercise_id)?.sets?.[setIndex];
      if (!last) return;
      if (set.weight_kg != null && !Number(set.weight_kg)) set.weight_kg = last.weight_kg;
      if (set.reps != null && !Number(set.reps)) set.reps = last.reps;
      if (set.duration_min != null && !Number(set.duration_min)) set.duration_min = last.duration_min;
      if (set.distance_km != null && !Number(set.distance_km)) set.distance_km = last.distance_km;
      // 这里会重渲染：若这一填就把动作填满了，别在手指还贴在这组时把卡收掉。
      expandedDone.add(exercise.id);
      updateSession();
      noteSetCompleted(exerciseIndex, setIndex, "fill_last");
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
    container.querySelector("#workout-finish")?.addEventListener("click", () => saveSession(container));
  }

  // 保存一次训练：完整页底部的「结束训练」和逐组模式的结束弹窗共用这一条路径，
  // 差别只在字段从哪个 DOM 里读（scope）。
  async function saveSession(scope = container) {
    if (!session) return;
    if (!session.date) return AppDialog.alert("请选择训练日期。", { title:"还差一步" });
    // 没有任何一组留下数值时不构成训练记录，提示后仍允许保存（可能是纯备注）。
    const stats = Workout.calculateStats(session);
    const hasRecord = stats.setCount > 0;
    if (!hasRecord && !(await AppDialog.confirm("还没有记录任何一组，仍要保存吗？", { title:"训练尚未开始", okText:"仍然保存" }))) return;
    // 同一天已有记录时先问一句：补记与重复保存都走这里，不硬拦，由用户决定。
    const sameDay = Workout.sessionsOnDate(records, session.date)
      .filter(record => String(record.id) !== String(session._editing_record_id || ""));
    if (sameDay.length && !(await AppDialog.confirm(`${session.date} 已经有 ${sameDay.length} 条训练记录，仍要再存一条吗？`, { title:"同一天已有记录", okText:"仍然保存" }))) return;
    // 时长以输入框为准；没碰过输入框时用草稿开始时间给的预估值兜底。
    const durationValue = Number(scope.querySelector("#workout-duration")?.value || 0);
    const dateValue = scope.querySelector("#workout-date")?.value;
    if (dateValue) session.date = dateValue;
    session.duration_min = durationValue > 0 ? Math.round(durationValue) : 0;
    session.note = scope.querySelector("#workout-note")?.value.trim() || "";
    const saved = Workout.upsertSession(records, session);
    options.onSave(saved);
    Trace.track("workout_finish_saved", {
      set_count: stats.setCount,
      ex_count: stats.exerciseCount,
      duration_min: session.duration_min || 0,
      duration_source: durationValue > 0 ? "input" : "zero",
      mood_selected: !!session.mood,
      same_day_extra: sameDay.length > 0,
    });
    if (session._plan_generated_at && session._plan_day_index != null) {
      WorkoutPlan?.saveProgress?.({
        plan_generated_at: session._plan_generated_at,
        day_index: session._plan_day_index,
        session_id: saved.id,
        date: saved.date,
      });
    }
    const finishedMood = session.mood;
    session = null;
    resetEditorState();
    persistDraft();
    container.querySelector("#workout-dialog")?.close();
    render();
    if (Toast) Toast.show(moodReply(finishedMood));
    // 结束训练回到记录列表时回到顶部，让最新提交的记录可见
    window.scrollTo({ top: 0, behavior: shouldAnimate() ? "smooth" : "auto" });
  }

  // 照上次练：把上次这个训练日的动作和组数整套带进来，组里留空，填的时候看灰色提示。
  // origin 给了（从按钮点的）就同样走墨障过场，和「开始」共用一套开场。
  function startFromLastSession(last, origin) {
    const enter = () => {
      session = Workout.createSession(selectedDay, new Date());
      resetEditorState();
      focusMode = true;
      Trace.track("workout_session_begin", { source: "repeat_last", day: selectedDay });
      const history = records.filter(record => Workout.isSession(record));
      for (const exercise of last.exercises || []) {
        const sets = Workout.recordedSets(exercise);
        if (!sets.length) continue;
        if (Workout.isCustomExerciseId(exercise.exercise_id)) Workout.addCustomExercise(session, exercise.name, history);
        else Workout.addExercise(session, exercise.exercise_id, history);
        const entry = session.exercises.find(item => item.exercise_id === exercise.exercise_id);
        if (!entry) continue;
        const index = session.exercises.indexOf(entry);
        while (entry.sets.length < sets.length) Workout.addSet(session, index);
      }
      persistDraft();
      render();
      window.scrollTo({ top: 0, behavior: shouldAnimate() ? "smooth" : "auto" });
    };
    if (!origin) { enter(); return; }
    const dayIndex = WorkoutCatalog.trainingDays.findIndex(day => day.id === selectedDay);
    const dayLabel = WorkoutCatalog.trainingDays[dayIndex]?.name || "训练";
    playInkSweep({
      from: origin,
      kicker: `照上次 · ${dayLabel}`,
      title: `再来一次${dayLabel}`,
      note: encourageFor(dayIndex + 1),
      onCover: enter,
    });
  }

  function startFromPlanDay(day, plan) {
    session = Workout.createSession(day.training_day, new Date());
    session.title = day.title;
    resetEditorState();
    focusMode = true;
    Trace.track("workout_session_begin", { source: "plan", day: day.training_day });
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
    // 空白训练只从一个地方开：开始卡的按钮、底部队列里的「开始」都走这里，避免两套入口分叉
    const beginBlankSession = origin => {
      const dayIndex = WorkoutCatalog.trainingDays.findIndex(day => day.id === selectedDay);
      const dayLabel = WorkoutCatalog.trainingDays[dayIndex]?.name || "训练";
      playInkSweep({
        from: origin,
        kicker: `今天 · ${dayLabel}`,
        title: `开始${dayLabel}`,
        note: encourageFor(dayIndex),
        onCover: () => {
          session = Workout.createSession(selectedDay);
          resetEditorState();
          // 空白训练开场也先走逐组：加完第一个动作就自动落到第一组
          focusMode = true;
          persistDraft();
          Trace.track("workout_session_begin", { source: "blank", day: selectedDay });
          render();
        },
      });
    };
    container.querySelector("#workout-start")?.addEventListener("click", event => beginBlankSession(event.currentTarget));
    // 首屏右下角那颗圆按钮：不用回顶部挑训练日，直接开练
    container.querySelector("[data-quick-start]")?.addEventListener("click", event => beginBlankSession(event.currentTarget));
    container.querySelector("[data-repeat-last]")?.addEventListener("click", event => {
      const last = Workout.lastSessionForDay(records, selectedDay);
      if (last) startFromLastSession(last, event.currentTarget);
    });
    container.querySelector("[data-backfill]")?.addEventListener("click", openBackfillDialog);
    // 补记：按选定日期开一条新训练。补的是哪一天就记哪一天，和当天记录没有区别。
    container.querySelector("#workout-backfill")?.addEventListener("click", () => {
      const date = container.querySelector("#workout-backfill-date")?.value;
      if (!date) return AppDialog.alert("先选一个补记日期。", { title:"还差一步" });
      if (date > Workout.todayKey()) return AppDialog.alert("补记日期不能晚于今天。", { title:"日期不对" });
      session = Workout.createSession(selectedDay, new Date(`${date}T00:00:00`));
      resetEditorState();
      focusMode = true;
      persistDraft();
      Trace.track("workout_session_begin", { source: "backfill", day: selectedDay });
      render();
    });
    if (session) wireEditor();
  }

  function render() {
    if (session) selectedDay = session.training_day;
    // 指针落到的那一组若还空着，先按同动作上一组的重量预填（只改内存，立刻落草稿）。
    if (session && focusMode && seedFocusWeight()) persistDraft();
    // uiState.previous 由渲染层自行计算上次表现；openSets 与 expandedDone 是这里的交互态。
    // 重渲染前记下每张卡的高度：填完最后一组自动收小、点了别处收起，都不该是硬跳。
    // 只在同一条训练内、同 id 的卡之间对高，换训练时 id 全变，自然不做动画。
    const heights = new Map();
    if (session) {
      container.querySelectorAll("[data-exercise-card][data-done-id]").forEach(card => {
        heights.set(card.dataset.doneId, card.getBoundingClientRect().height);
      });
    }
    const uiState = { previous: null, openSets, expandedDone, completionOpen, focus: focusMode, focusTarget: focusMode ? currentFocusTarget() : null };
    const completionBefore = container.querySelector(".workout-completion")?.getBoundingClientRect().height || 0;
    // 逐组屏的秒表与小人绑在旧 DOM 上，重建之前先停掉，否则会漏掉一个 interval
    stopFocusExtras();
    container.innerHTML = session
      ? WorkoutView.editorHtml(session, selectedDay, records, uiState)
      : WorkoutView.idleHtml(selectedDay, records);
    wire();
    startFocusExtras();
    // 全屏只在训练中存在：回到列表页就把顶底栏还回去，不然会困在没有导航的页面里
    if (!session) document.documentElement.classList.remove("workout-fullscreen");
    else if (localStorage.getItem(FULLSCREEN_KEY) === "1") document.documentElement.classList.add("workout-fullscreen");
    if (heights.size) {
      container.querySelectorAll("[data-exercise-card][data-done-id]").forEach(card => {
        const from = heights.get(card.dataset.doneId);
        if (from) animateHeightChange(card, from, card.getBoundingClientRect().height);
      });
    }
    // 结束区展开 / 收起也走同一条高度过渡
    const completionAfter = container.querySelector(".workout-completion");
    if (completionAfter) animateHeightChange(completionAfter, completionBefore, completionAfter.getBoundingClientRect().height);
  }

  // 历史卡整张可点开详情；编辑放在详情弹窗里，删除按钮不触发详情。
  if (!container.__historyCardBound) {
    container.__historyCardBound = true;
    container.addEventListener("click", async event => {
      // 删除入口现在只在详情弹窗里（列表行不再带 ×）：弹窗内容是后渲染进去的，
      // 只能走容器级委托，不能靠 render() 时的 querySelectorAll。
      const deleteButton = event.target.closest("[data-history-delete]");
      if (deleteButton) {
        const record = findRecord(deleteButton.dataset.historyDelete);
        if (!record) return;
        if (!(await AppDialog.confirm(`删除「${record.title || "这条训练"}」？`, { title:"删除训练记录", danger:true, okText:"删除", cancelText:"保留" }))) return;
        records.splice(records.indexOf(record), 1);
        options.onDelete(record);
        container.querySelector("#workout-dialog")?.close();
        render();
        return;
      }
      const editButton = event.target.closest("[data-history-edit]");
      if (editButton) {
        const record = findRecord(editButton.dataset.historyEdit);
        if (record) {
          container.querySelector("#workout-dialog")?.close();
          editRecord(record);
        }
        return;
      }
      const card = event.target.closest("[data-history-view]");
      if (!card) return;
      const record = findRecord(card.dataset.historyView);
      if (record) openDialog(WorkoutView.detailHtml(record));
    });
    container.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const card = event.target.closest("[data-history-view]");
      if (!card || event.target.closest("button")) return;
      event.preventDefault();
      const record = findRecord(card.dataset.historyView);
      if (record) openDialog(WorkoutView.detailHtml(record));
    });
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

  // 上次选了全屏就继续全屏；不选的人不受影响
  applyFullscreen(localStorage.getItem(FULLSCREEN_KEY) === "1");
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
        Trace.track("workout_session_begin", { source: "draft_resume", day: selectedDay, draft_resume: true });
        render();
      } else {
        localStorage.removeItem(DRAFT_KEY);
        Trace.track("workout_draft_discarded", {});
        render();
      }
    });
  }
  return { render, getSession:() => session };
}

const WorkoutUI = {
  DRAFT_KEY, DAY_KEY, mount, hasDraft
};
export default WorkoutUI;
export {
  DRAFT_KEY, DAY_KEY, mount, hasDraft
};
