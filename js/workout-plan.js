(function (root, factory) {
  const api = factory(root?.WorkoutCatalog || (typeof require === "function" ? require("./workout-catalog.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WorkoutPlan = api;
})(typeof window !== "undefined" ? window : null, function (catalog) {
  const STORAGE_KEY = "cat-newsroom-workout-plan-v1";
  const PROGRESS_KEY = "cat-newsroom-workout-plan-progress-v1";

  function unwrap(value) {
    if (!value || typeof value !== "object") return null;
    return value.plan && typeof value.plan === "object" ? value.plan : value;
  }

  function normalize(result, context = {}) {
    const source = unwrap(result) || {};
    const days = Array.isArray(source.days) ? source.days.slice(0, 6).map((day, index) => ({
      ...day,
      day_index: Number(day.day_index || index + 1),
      exercises: Array.isArray(day.exercises) ? day.exercises : [],
    })) : [];
    return {
      schema_version: 1,
      kind: "workout_plan",
      generated_at: context.generated_at || new Date().toISOString(),
      start_date: context.start_date || "",
      timezone: context.timezone || "",
      preferences: context.preferences || {},
      days,
    };
  }

  function isValid(plan) {
    return Boolean(plan && Array.isArray(plan.days) && plan.days.length > 0);
  }

  function load(storage) {
    const source = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!source) return null;
    try {
      const raw = JSON.parse(source.getItem(STORAGE_KEY) || "null");
      if (isValid(raw)) return raw;
      if (raw && isValid(unwrap(raw))) return normalize(raw, raw);
    } catch (_) { /* Ignore malformed local plans and let the UI offer generation. */ }
    return null;
  }

  function save(plan, storage) {
    const target = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!target || !isValid(plan)) return false;
    target.setItem(STORAGE_KEY, JSON.stringify(plan));
    return true;
  }

  function formatMeta(plan, locale = "zh-CN") {
    if (!plan?.generated_at) return "未记录生成时间";
    return `生成于 ${new Date(plan.generated_at).toLocaleString(locale)}`;
  }

  // ---- 本地规则引擎：力训三分化（PPL × 2 轮 = 6 天）----
  // 生成原理见 docs/workout-plan-generation-principles.md，改规则须同步改文档。

  const SPLIT_SEQUENCE = [
    { split_day: "push", training_day: "chest", name: "力量训练·推", focus: "胸 + 前束 + 三头" },
    { split_day: "pull", training_day: "back", name: "力量训练·拉", focus: "背 + 后束 + 二头" },
    { split_day: "legs", training_day: "legs", name: "力量训练·腿", focus: "股四头 + 腘绳 + 臀 + 小腿" },
  ];

  const POOLS = {
    push: {
      compounds: ["barbell_bench_press", "dumbbell_bench_press", "machine_chest_press", "dumbbell_bench_press_incline", "barbell_bench_press_incline", "strict_press", "dumbbell_shoulder_press", "machine_shoulder_press"],
      isolations: ["cable_fly_mid", "dumbbell_lateral_raise", "pec_deck", "cable_fly_high", "cable_fly_low", "rope_pushdown", "bar_pushdown", "overhead_extension", "skull_crusher"],
    },
    pull: {
      compounds: ["pull_up", "lat_pulldown_wide", "barbell_row", "seated_cable_row", "one_arm_dumbbell_row", "machine_row", "lat_pulldown_close", "straight_arm_pulldown"],
      isolations: ["face_pull", "reverse_pec_deck", "dumbbell_curl", "hammer_curl", "barbell_curl", "preacher_curl", "cable_curl"],
    },
    legs: {
      compounds: ["barbell_squat", "romanian_deadlift", "leg_press", "hack_squat", "conventional_deadlift", "bulgarian_split_squat", "walking_lunge", "hip_thrust"],
      isolations: ["leg_extension", "leg_curl", "calf_raise"],
    },
  };
  const COMPOUND_COUNT = 4;
  const ISOLATION_COUNT = 2;

  function buildStructure() {
    return Array.from({ length: 6 }, (_, index) => {
      const template = SPLIT_SEQUENCE[index % 3];
      const round = Math.floor(index / 3) + 1;
      return {
        day_index: index + 1, round, split_day: template.split_day,
        training_day: template.training_day, title: `${template.name} · 第 ${round} 轮`,
        focus: template.focus, exercises: [], notes: "",
      };
    });
  }

  function exerciseName(exerciseId) {
    return catalog?.exercises?.find(item => item.id === exerciseId)?.name || exerciseId;
  }

  // 孤立动作从 pool 的 startOffset 起循环取 ISOLATION_COUNT 个（第 2 轮顺延一位实现替换）。
  function pickIsolations(pool, startOffset) {
    return Array.from({ length: ISOLATION_COUNT }, (_, i) => pool.isolations[(i + startOffset) % pool.isolations.length]);
  }

  function fillExercises(day, pool, round1Compounds, isolationOffset) {
    const compoundIds = round1Compounds || pool.compounds.slice(0, COMPOUND_COUNT);
    const allIds = [...compoundIds, ...pickIsolations(pool, isolationOffset)];
    allIds.forEach((id, index) => {
      const compound = index < COMPOUND_COUNT;
      day.exercises.push({
        exercise_id: id, name: exerciseName(id), order: index + 1,
        sets: compound ? 4 : 3, reps: compound ? "8-12" : "10-15",
        rest_seconds: compound ? 120 : 90, weight_kg: null,
        intensity_hint: "RPE 7-8", rationale: "",
      });
    });
  }

  // ---- 渐进超负荷：最近一次完成记录驱动 ----

  function lastCompleted(records, exerciseId) {
    const sessions = (records || [])
      .filter(r => r?.kind === "workout_session" && r.schema_version === 2 && r.status !== "draft" && !r.deleted_at)
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
    for (const session of sessions) {
      const entry = (session.exercises || []).find(e => e.exercise_id === exerciseId);
      if (entry?.sets?.length) return entry;
    }
    return null;
  }

  // 渐进超负荷：最近一次完成记录驱动。
  // 用户较少记录 RPE：只要最近一次全部组完成即视为可进阶（未填 RPE 不影响判定）；
  // 若填写了 RPE 且平均 ≥ 9 则视为强度过高，维持重量。
  function suggestWeight(records, exerciseId, stepKg = 2.5) {
    const entry = lastCompleted(records, exerciseId);
    if (!entry) return null;
    const completed = entry.sets.filter(set => set.completed);
    const allDone = completed.length === entry.sets.length;
    const rated = completed.filter(set => set.rpe);
    const avgRpe = rated.length ? rated.reduce((sum, set) => sum + Number(set.rpe || 0), 0) / rated.length : 8;
    const base = Number(completed.at(-1)?.weight_kg || 0);
    if (allDone && avgRpe <= 8) return Math.round((base + stepKg) * 10) / 10;
    return base;
  }

  function generatePlan({ preferences = {}, records = [] } = {}) {
    const days = buildStructure();
    days.forEach(day => {
      const pool = POOLS[day.split_day] || POOLS.push;
      // 第 1 轮：复合取池内前 4 个，孤立从偏移 1 起取；第 2 轮：复合沿用第 1 轮，孤立顺延一位（偏移 2）。
      const round1 = days.find(item => item.split_day === day.split_day && item.round === 1);
      const round1Compounds = day.round === 2 && round1 ? round1.exercises.slice(0, COMPOUND_COUNT).map(e => e.exercise_id) : null;
      fillExercises(day, pool, round1Compounds, day.round === 1 ? 1 : 2);
      // 上下肢步进区分：推/拉日 +2.5kg，腿日 +5kg（下肢通常进步更快）。
      const stepKg = day.split_day === "legs" ? 5 : 2.5;
      day.exercises.forEach(exercise => {
        exercise.weight_kg = suggestWeight(records, exercise.exercise_id, stepKg);
      });
    });
    return {
      schema_version: 1,
      kind: "workout_plan",
      generated_at: new Date().toISOString(),
      source: "local_rules",
      goal: preferences.goal || "hypertrophy",
      split: "ppl_3day",
      rounds: 2,
      preferences,
      days,
    };
  }

  // ---- 计划完成进度 ----

  function progressStorage(storage) {
    return storage || (typeof localStorage !== "undefined" ? localStorage : null);
  }

  function saveProgress({ plan_generated_at, day_index, session_id, date, saved_at = new Date().toISOString() }, storage) {
    const target = progressStorage(storage);
    if (!target || !plan_generated_at) return false;
    const current = loadProgress(target) || { plan_generated_at: "", days: {} };
    current.plan_generated_at = plan_generated_at;
    current.days = current.days || {};
    current.days[String(day_index)] = { session_id, date, saved_at };
    target.setItem(PROGRESS_KEY, JSON.stringify(current));
    return true;
  }

  function loadProgress(storage) {
    const target = progressStorage(storage);
    if (!target) return null;
    try {
      const raw = JSON.parse(target.getItem(PROGRESS_KEY) || "null");
      return raw && typeof raw === "object" && raw.days ? raw : null;
    } catch (_) { return null; }
  }

  function isProgressValid(progress, planGeneratedAt) {
    return Boolean(progress && progress.plan_generated_at && progress.plan_generated_at === planGeneratedAt);
  }

  function clearProgress(storage) {
    const target = progressStorage(storage);
    if (target) target.removeItem(PROGRESS_KEY);
  }

  return {
    STORAGE_KEY, PROGRESS_KEY, normalize, isValid, load, save, formatMeta,
    generatePlan, saveProgress, loadProgress, isProgressValid, clearProgress,
  };
});
