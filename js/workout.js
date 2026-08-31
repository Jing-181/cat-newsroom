(function (root, factory) {
  const api = factory(root?.WorkoutCatalog || (typeof require === "function" ? require("./workout-catalog.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.Workout = api;
})(typeof window !== "undefined" ? window : null, function (catalog) {
  const id = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const dateKey = date => {
    const value = date || new Date();
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  };

  function isSession(record) {
    return record?.kind === "workout_session" && record.schema_version === 2;
  }

  function createSession(trainingDay = "chest", date = new Date()) {
    const day = catalog.trainingDays.find(item => item.id === trainingDay) || catalog.trainingDays[0];
    return {
      id: id("workout"), schema_version: 2, kind: "workout_session", status: "draft",
      title: day.name, training_day: day.id, date: dateKey(date), duration_min: 60,
      exercises: [], note: "", updated_at: new Date().toISOString(),
    };
  }

  function previousSet(records, exerciseId) {
    return records.filter(isSession).sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .flatMap(session => session.exercises || [])
      .find(item => item.exercise_id === exerciseId)?.sets?.filter(set => set.completed).at(-1) || null;
  }

  function addExercise(session, exerciseId, history = []) {
    const source = catalog.exercises.find(item => item.id === exerciseId);
    if (!source || session.exercises.some(item => item.exercise_id === exerciseId)) return session;
    const previous = previousSet(history, exerciseId);
    const base = { weight_kg: Number(previous?.weight_kg || 0), reps: Number(previous?.reps || 10), rpe: previous?.rpe || "", completed: false };
    session.exercises.push({
      id: id("exercise"), exercise_id: source.id, name: source.name, body_part: source.bodyPart,
      equipment: source.equipment, angle: source.angle || "", sets: [{ ...base }, { ...base }, { ...base }], note: "",
    });
    session.updated_at = new Date().toISOString();
    return session;
  }

  function calculateStats(session) {
    const sets = (session?.exercises || []).flatMap(item => item.sets || []).filter(set => set.completed);
    return {
      exerciseCount: (session?.exercises || []).length,
      setCount: sets.length,
      reps: sets.reduce((sum, set) => sum + Number(set.reps || 0), 0),
      volume: sets.reduce((sum, set) => sum + Number(set.weight_kg || 0) * Number(set.reps || 0), 0),
    };
  }

  function summary(record) {
    if (!isSession(record)) return { legacy: true, title: record?.title || "旧版运动目标" };
    return { ...calculateStats(record), legacy: false, title: record.title, date: record.date, duration: record.duration_min };
  }

  function cloneRecord(record) {
    return JSON.parse(JSON.stringify(record));
  }

  function upsertSession(records, session) {
    const saved = cloneRecord({ ...session, status: "completed", updated_at: new Date().toISOString() });
    const editingId = saved._editing_record_id;
    delete saved._editing_record_id;
    const index = records.findIndex(record => String(record.id) === String(editingId || saved.id));
    if (index >= 0) records[index] = saved;
    else records.unshift(saved);
    // 补录或修改日期后，历史记录仍按日期倒序展示。
    records.sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")));
    return saved;
  }

  return { catalog, isSession, createSession, previousSet, addExercise, calculateStats, summary, cloneRecord, upsertSession };
});
