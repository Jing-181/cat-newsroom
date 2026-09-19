(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WorkoutPlan = api;
})(typeof window !== "undefined" ? window : null, function () {
  const STORAGE_KEY = "cat-newsroom-workout-plan-v1";

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

  return { STORAGE_KEY, normalize, isValid, load, save, formatMeta };
});
