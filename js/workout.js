(function (root, factory) {
  const api = factory(root?.WorkoutCatalog || (typeof require === "function" ? require("./workout-catalog.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.Workout = api;
})(typeof window !== "undefined" ? window : null, function (catalog) {
  // 列为"有记录"的字段：只要留下任意有效数值，这一组就是一条真实训练记录。
  // 没有留下数值的空组不属于训练记录，界面直接删除而不是标记状态。
  const CARDIO_EQUIPMENT = ["有氧", "恢复"];
  // 组间歇推荐：大肌群恢复慢，间歇留长一点；小肌群恢复快，可以短一些。
  // 只作为填写时的参考文案，不倒计时、不强制、也不写入历史。
  const REST_ADVICE = {
    large: { seconds: 120, minutes: "2-3 分钟", label: "大肌群", reason: "胸、背、腿这类大肌群恢复慢，组间歇留 2-3 分钟" },
    small: { seconds: 60, minutes: "1 分钟", label: "小肌群", reason: "手臂、肩后束、小腿这类小肌群恢复快，1 分钟够用" },
  };
  const LARGE_MUSCLE_KEYWORDS = ["胸", "背", "腿", "臀", "后链", "股四头", "腘绳肌", "肩", "全身"];
  // 只在草稿/编辑期存在、不写入历史的界面态字段。
  const TRANSIENT_KEYS = ["_editing_record_id", "_open_set"];

  const id = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const dateKey = date => {
    const value = date || new Date();
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  };
  const num = (value, fallback = 0) => {
    if (value === "" || value == null) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const trim = value => Math.round(Number(value || 0) * 100) / 100;

  function isSession(record) {
    return record?.kind === "workout_session" && record.schema_version === 2;
  }

  function isCardio(exercise) {
    return CARDIO_EQUIPMENT.includes(exercise?.equipment);
  }

  function setHasRecord(set) {
    if (!set || typeof set !== "object") return false;
    return Number(set.weight_kg || 0) > 0
      || Number(set.reps || 0) > 0
      || Number(set.duration_min || 0) > 0
      || Number(set.distance_km || 0) > 0;
  }

  function recordedSets(exercise) {
    return (exercise?.sets || []).filter(setHasRecord);
  }

  // 新组继承来源数据（上一次训练或上一组），但不继承备注；没有来源时不编造数值。
  function createSet(exercise, previous = null) {
    if (isCardio(exercise)) {
      return {
        duration_min: num(previous?.duration_min, 0),
        distance_km: num(previous?.distance_km, 0),
        pace: previous?.pace || "",
        rpe: previous?.rpe ?? "",
        note: "",
      };
    }
    return {
      weight_kg: num(previous?.weight_kg, 0),
      reps: num(previous?.reps, 0),
      rpe: previous?.rpe ?? "",
      note: "",
    };
  }

  function createSession(trainingDay = "chest", date = new Date()) {
    const day = catalog.trainingDays.find(item => item.id === trainingDay) || catalog.trainingDays[0];
    const startedAt = date instanceof Date ? date : new Date(date);
    return {
      id: id("workout"), schema_version: 2, kind: "workout_session", status: "draft",
      title: day.name, training_day: day.id, date: dateKey(startedAt),
      // 时长完全由用户填写，不做自动计时。
      duration_min: 0,
      exercises: [], note: "", updated_at: new Date().toISOString(),
    };
  }

  function sessionSort(left, right) {
    return String(right.date || "").localeCompare(String(left.date || ""))
      || String(right.updated_at || "").localeCompare(String(left.updated_at || ""));
  }

  function completedSessions(records) {
    return (records || [])
      .filter(isSession)
      .filter(session => session.status !== "draft" && !session.deleted_at)
      .sort(sessionSort);
  }

  // 最近一次练到这个动作的记录：同时给出当时的每一组，便于照着上次的组安排继续加。
  function previousPerformance(records, exerciseId) {
    for (const session of completedSessions(records)) {
      const exercise = (session.exercises || []).find(item => item.exercise_id === exerciseId);
      const sets = recordedSets(exercise);
      if (!sets.length) continue;
      return {
        set: sets[sets.length - 1],
        sets,
        date: session.date,
        sessionTitle: session.title,
        sessionId: session.id,
      };
    }
    return null;
  }

  function previousSet(records, exerciseId) {
    return previousPerformance(records, exerciseId)?.set || null;
  }

  function addExercise(session, exerciseId, history = []) {
    const source = catalog.exercises.find(item => item.id === exerciseId);
    if (!source || session.exercises.some(item => item.exercise_id === exerciseId)) return session;
    const previous = previousPerformance(history, exerciseId);
    session.exercises.push({
      id: id("exercise"), exercise_id: source.id, name: source.name, body_part: source.bodyPart,
      equipment: source.equipment, angle: source.angle || "", icon: source.icon || "运",
      tips: source.tips || "控制动作节奏，保持躯干稳定；重量以动作质量为先。",
      muscles: source.muscles || source.bodyPart,
      // planned_sets 记录"这个动作这次打算练几组"，用于判断最近一次是否练满计划组数。
      planned_sets: 1,
      sets: [createSet(source, previous?.set)], note: "",
    });
    session.updated_at = new Date().toISOString();
    return session;
  }

  // 加一组：默认继承上一组数据，组与组衔接时不用重复输入。
  function addSet(session, exerciseIndex, { inherit = true } = {}) {
    const exercise = session?.exercises?.[exerciseIndex];
    if (!exercise) return null;
    const previous = inherit ? exercise.sets[exercise.sets.length - 1] || null : null;
    const set = createSet(exercise, previous);
    exercise.sets.push(set);
    exercise.planned_sets = Number(exercise.planned_sets || 0) + 1;
    session.updated_at = new Date().toISOString();
    return set;
  }

  // 删组时同步下调计划组数，避免"删掉没练的组"之后仍被判为未练满。
  function removeSet(session, exerciseIndex, setIndex) {
    const exercise = session?.exercises?.[exerciseIndex];
    if (!exercise || !Array.isArray(exercise.sets)) return null;
    const [removed] = exercise.sets.splice(setIndex, 1);
    exercise.planned_sets = Math.max(exercise.sets.length, Number(exercise.planned_sets || 0) - 1);
    session.updated_at = new Date().toISOString();
    return removed || null;
  }

  function calculateStats(session) {
    const sets = (session?.exercises || []).flatMap(recordedSets);
    const strengthSets = sets.filter(set => "reps" in set || "weight_kg" in set);
    return {
      exerciseCount: (session?.exercises || []).length,
      setCount: sets.length,
      reps: strengthSets.reduce((sum, set) => sum + Number(set.reps || 0), 0),
      volume: strengthSets.reduce((sum, set) => sum + Number(set.weight_kg || 0) * Number(set.reps || 0), 0),
    };
  }

  function summary(record) {
    if (!isSession(record)) return { legacy: true, title: record?.title || "旧版运动目标" };
    return { ...calculateStats(record), legacy: false, title: record.title, date: record.date, duration: record.duration_min };
  }

  // ---- 组间歇推荐（仅文案参考，不倒计时、不写入历史）----

  // 大肌群（胸/背/腿等）恢复慢，组间歇建议长一些；小肌群恢复快，建议短一些。
  function restAdvice(exercise) {
    const text = `${exercise?.body_part || ""} ${exercise?.name || ""} ${exercise?.muscles || ""}`;
    const large = LARGE_MUSCLE_KEYWORDS.some(keyword => text.includes(keyword));
    return large ? REST_ADVICE.large : REST_ADVICE.small;
  }

  // ---- 动作维度的长期记录（历史页的训练工具视角）----

  function exerciseHistory(records, exerciseId, limit = 8) {
    const items = [];
    for (const session of completedSessions(records)) {
      const exercise = (session.exercises || []).find(item => item.exercise_id === exerciseId);
      const sets = recordedSets(exercise);
      if (!sets.length) continue;
      items.push({
        sessionId: session.id, date: session.date, title: session.title,
        equipment: exercise.equipment, sets, setCount: sets.length,
        volume: sets.reduce((sum, set) => sum + Number(set.weight_kg || 0) * Number(set.reps || 0), 0),
        topWeight: sets.reduce((max, set) => Math.max(max, Number(set.weight_kg || 0)), 0),
      });
      if (items.length >= limit) break;
    }
    return items;
  }

  // 历史页入口：列出练过的动作，点进去看这个动作的近几次记录。
  function trackedExercises(records) {
    const map = new Map();
    for (const session of completedSessions(records)) {
      for (const exercise of session.exercises || []) {
        const sets = recordedSets(exercise);
        if (!sets.length) continue;
        const date = String(session.date || "");
        const entry = map.get(exercise.exercise_id) || {
          exercise_id: exercise.exercise_id, name: exercise.name, body_part: exercise.body_part,
          equipment: exercise.equipment, sessionCount: 0, setCount: 0, lastDate: "",
          lastSets: [], lastVolume: 0,
        };
        entry.sessionCount += 1;
        entry.setCount += sets.length;
        if (date > entry.lastDate) {
          entry.lastDate = date;
          entry.lastSets = sets;
          entry.lastVolume = sets.reduce((sum, set) => sum + Number(set.weight_kg || 0) * Number(set.reps || 0), 0);
        }
        map.set(exercise.exercise_id, entry);
      }
    }
    return [...map.values()].sort((left, right) => right.lastDate.localeCompare(left.lastDate) || right.sessionCount - left.sessionCount);
  }

  // ---- 组记录展示 ----

  function formatSetText(set, equipment) {
    if (isCardio({ equipment })) {
      const parts = [`${num(set?.duration_min)} 分钟`];
      if (Number(set?.distance_km || 0) > 0) parts.push(`${Number(set.distance_km)} km`);
      if (set?.pace) parts.push(String(set.pace));
      return parts.join(" · ");
    }
    return `${num(set?.weight_kg)} kg × ${num(set?.reps)}`;
  }

  // 紧凑写法：20×10，自重动作显示为 自重×12。
  function formatSetCompact(set, equipment) {
    if (isCardio({ equipment })) {
      const parts = [`${num(set?.duration_min)}分`];
      if (Number(set?.distance_km || 0) > 0) parts.push(`${Number(set.distance_km)}km`);
      return parts.join(" ");
    }
    const weight = Number(set?.weight_kg || 0);
    return `${weight > 0 ? trim(weight) : "自重"}×${num(set?.reps)}`;
  }

  function formatSetList(sets, equipment) {
    return (sets || []).map(set => formatSetCompact(set, equipment)).join(" / ");
  }

  function cloneRecord(record) {
    return JSON.parse(JSON.stringify(record));
  }

  // 保存前清理：没有留下任何数值的空组不算训练记录，直接删掉；整组都没练的动作也不再保留。
  function pruneSession(session) {
    const cleaned = cloneRecord(session);
    cleaned.exercises = (cleaned.exercises || [])
      .map(exercise => ({ ...exercise, sets: (exercise.sets || []).filter(setHasRecord) }))
      .filter(exercise => exercise.sets.length > 0);
    return cleaned;
  }

  function upsertSession(records, session, now = new Date()) {
    const saved = pruneSession({ ...session, status: "completed", updated_at: now.toISOString() });
    // 时长直接采用用户填写值，不做自动计时推算。
    saved.duration_min = Math.max(0, Math.round(Number(session?.duration_min || 0)));
    TRANSIENT_KEYS.forEach(key => delete saved[key]);
    const editingId = session._editing_record_id;
    const index = records.findIndex(record => String(record.id) === String(editingId || saved.id));
    if (index >= 0) records[index] = saved;
    else records.unshift(saved);
    // 补录或修改日期后，历史记录仍按日期倒序展示。
    sortRecords(records);
    return saved;
  }

  function sortRecords(records) {
    return records.sort((left, right) => {
      const dateDiff = Date.parse(String(right.date || "")) - Date.parse(String(left.date || ""));
      if (Number.isFinite(dateDiff) && dateDiff !== 0) return dateDiff;
      return String(right.updated_at || right.created_at || right.id || "").localeCompare(String(left.updated_at || left.created_at || left.id || ""));
    });
  }

  return {
    catalog, REST_ADVICE, restAdvice,
    isSession, isCardio, setHasRecord, recordedSets, createSet,
    createSession, previousPerformance, previousSet, addExercise, addSet, removeSet,
    calculateStats, summary,
    exerciseHistory, trackedExercises, formatSetText, formatSetCompact, formatSetList,
    cloneRecord, pruneSession, upsertSession, sortRecords,
  };
});
