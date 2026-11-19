// 本地 PPL 六次循环；规则与 docs/workout-plan-generation-principles.md 同步。
import catalog from './workout-catalog.js';
import { setHasRecord, isBodyweight, allowsAssist } from './workout.js';
const STORAGE_KEY = "cat-newsroom-workout-plan-v1";
const PROGRESS_KEY = "cat-newsroom-workout-plan-progress-v1";
const unwrap = value => value && typeof value === 'object' ? (value.plan || value) : null;
function normalize(result, context = {}) {
  const source = unwrap(result) || {};
  return { schema_version: 1, kind: 'workout_plan', generated_at: context.generated_at || new Date().toISOString(),
    start_date: context.start_date || '', timezone: context.timezone || '', preferences: context.preferences || {},
    days: Array.isArray(source.days) ? source.days.slice(0, 6).map((day, i) => ({ ...day, day_index: Number(day?.day_index || i + 1), exercises: Array.isArray(day?.exercises) ? day.exercises : [] })) : [] };
}
function repRange(value) {
  const match = String(value ?? '').match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
  if (!match) return null;
  const low = Number(match[1]), high = Number(match[2] || match[1]);
  return low > 0 && high >= low && high <= 50 ? { low, high } : null;
}
function isValid(plan) {
  if (!plan || !Array.isArray(plan.days) || !plan.days.length || plan.days.length > 6) return false;
  const indices = new Set();
  return plan.days.every(day => {
    if (!day || !Number.isInteger(day.day_index) || day.day_index < 1 || day.day_index > 6 || indices.has(day.day_index)) return false;
    indices.add(day.day_index);
    if (!catalog.trainingDays.some(item => item.id === day.training_day) || !Array.isArray(day.exercises) || !day.exercises.length || day.exercises.length > 12) return false;
    const ids = new Set();
    return day.exercises.every(ex => {
      const target = catalog.exercises.find(item => item.id === ex?.exercise_id);
      if (!ex || !target || ids.has(ex.exercise_id)) return false;
      ids.add(ex.exercise_id);
      return Number.isInteger(ex.sets) && ex.sets > 0 && ex.sets <= 12 && !!repRange(ex.reps)
        && (ex.weight_kg == null || (typeof ex.weight_kg === 'number' && Number.isFinite(ex.weight_kg) && (ex.weight_kg >= 0 || allowsAssist(target))))
        && (ex.rest_seconds == null || (Number.isFinite(ex.rest_seconds) && ex.rest_seconds > 0 && ex.rest_seconds <= 600));
    });
  });
}
function storageOrDefault(storage) { return storage || (typeof localStorage !== 'undefined' ? localStorage : null); }
function load(storage) {
  try {
    const raw = JSON.parse(storageOrDefault(storage)?.getItem(STORAGE_KEY) || 'null');
    if (isValid(raw)) return raw;
    if (raw && isValid(unwrap(raw))) return normalize(raw, raw);
  } catch (_) { /* 损坏的计划不进入执行界面。 */ }
  return null;
}
function save(plan, storage) {
  try {
    const target = storageOrDefault(storage);
    if (!target || !isValid(plan)) return false;
    target.setItem(STORAGE_KEY, JSON.stringify(plan));
    return true;
  } catch (_) { return false; }
}
function formatMeta(plan, locale = 'zh-CN') {
  return plan?.generated_at ? `生成于 ${new Date(plan.generated_at).toLocaleString(locale)}` : '未记录生成时间';
}
// 槽位明确覆盖不同动作功能，不用池子的前几个动作凑数。
const SLOTS = {
  push: [
    ['水平推', ['barbell_bench_press'], 3, '8-12'],
    ['肩推', ['dumbbell_shoulder_press'], 3, '8-12'],
    ['胸孤立', ['cable_fly_mid', 'pec_deck'], 2, '10-15'],
    ['肩中束', ['dumbbell_lateral_raise'], 3, '10-15'],
    ['三头', ['rope_pushdown', 'overhead_extension'], 3, '10-15'],
  ],
  pull: [
    ['垂直拉', ['lat_pulldown_wide'], 3, '8-12'],
    ['水平拉', ['seated_cable_row'], 3, '8-12'],
    ['后束', ['face_pull', 'reverse_pec_deck'], 3, '10-15'],
    ['二头', ['dumbbell_curl', 'hammer_curl'], 3, '10-15'],
    ['背部辅助', ['straight_arm_pulldown'], 2, '10-15'],
  ],
  legs: [
    ['膝主导', ['barbell_squat'], 3, '8-12'],
    ['髋铰链', ['romanian_deadlift'], 3, '8-12'],
    ['腿屈伸', ['leg_extension'], 2, '10-15'],
    ['腿弯举', ['leg_curl'], 2, '10-15'],
    ['小腿', ['calf_raise', 'seated_calf_raise'], 3, '10-15'],
    ['髋辅助', ['seated_hip_adduction', 'seated_hip_abduction'], 2, '10-15'],
  ],
};
const SPLIT_LABELS = { push: '推 · 胸 / 肩 / 三头', pull: '拉 · 背 / 后束 / 二头', legs: '腿 · 股四头 / 腘绳 / 臀 / 小腿' };
const ALTERNATIVES = {
  barbell_bench_press: 'machine_chest_press', dumbbell_shoulder_press: 'machine_shoulder_press',
  cable_fly_mid: 'pec_deck', rope_pushdown: 'overhead_extension',
  lat_pulldown_wide: 'lat_pulldown_close', seated_cable_row: 'machine_row',
  face_pull: 'reverse_pec_deck', dumbbell_curl: 'hammer_curl',
  barbell_squat: 'leg_press', romanian_deadlift: 'hip_thrust',
  calf_raise: 'seated_calf_raise', seated_hip_adduction: 'seated_hip_abduction',
};
// Free training uses slot coverage and rep targets without creating a plan.
function freeExerciseSlot(id) {
  for (const [split, slots] of Object.entries(SLOTS)) for (const [slot, ids, , reps] of slots) {
    if (ids.includes(id) || ids.some(source => source !== 'romanian_deadlift' && ALTERNATIVES[source] === id)) return { split, slot, reps };
  }
  return null;
}
const COMPOUNDS = new Set(['barbell_bench_press', 'machine_chest_press', 'dumbbell_shoulder_press', 'machine_shoulder_press', 'lat_pulldown_wide', 'lat_pulldown_close', 'seated_cable_row', 'machine_row', 'barbell_squat', 'leg_press', 'romanian_deadlift', 'hip_thrust', 'pull_up']);
function restGuidance(exercise) {
  const target = catalog.exercises.find(e => e.id === exercise.exercise_id);
  const range = repRange(exercise.reps);
  const compound = COMPOUNDS.has(exercise.exercise_id) || ['水平推', '肩推', '垂直拉', '水平拉', '膝主导', '髋铰链'].includes(exercise.slot);
  let seconds = 90, reason = '辅助动作参考';
  if (compound) { seconds = range && range.low <= 8 ? 180 : 120; reason = range && range.low <= 8 ? '复合动作、目标次数较低' : '复合动作参考'; }
  else if (target && isBodyweight(target)) { seconds = 120; reason = '自重动作负担因人而异'; }
  return { seconds, reason, text: `${seconds} 秒起，${reason}；实际强度未知，呼吸或动作未恢复可延长，体感优先` };
}
function recommendSplit(records = [], now = new Date()) {
  const dates = { push: null, pull: null, legs: null };
  const today = new Date(now);
  const recent = records.filter(r => r?.kind === 'workout_session' && r.schema_version === 2 && r.status === 'completed' && !r.__seed && !r.deleted_at)
    .filter(r => { const age = (today - new Date(`${r.date}T00:00:00`)) / 86400000; return Number.isFinite(age) && age >= 0 && age <= 28; });
  for (const record of recent) for (const ex of record.exercises || []) {
    if (!(ex.sets || []).some(setHasRecord)) continue;
    const source = catalog.exercises.find(e => e.id === ex.exercise_id);
    // 只使用实际练过动作的主要肌群，避免训练标题误代表整场内容。
    const part = source?.bodyPart || ex.body_part || '';
    const split = /腿|臀|股四|腘绳|小腿/.test(part) ? 'legs' : /背|后束|二头/.test(part) ? 'pull' : /胸|肩|三头/.test(part) ? 'push' : null;
    if (split && (!dates[split] || record.date > dates[split])) dates[split] = record.date;
  }
  const known = Object.entries(dates).filter(([, date]) => date).sort((a, b) => b[1].localeCompare(a[1]));
  if (!known.length) return { split: 'push', dates, rationale: '近 28 天没有可识别的真实动作记录，默认从推开始；这不是个性化恢复判断。' };
  const latest = known[0][1];
  const touched = known.filter(([, date]) => date === latest).map(([split]) => split);
  const sequence = ['push', 'pull', 'legs'];
  const next = sequence[(sequence.indexOf(touched[0]) + 1) % 3];
  const split = sequence.find(key => !touched.includes(key) && key === next) || sequence.find(key => !touched.includes(key)) || next;
  return { split, dates, rationale: `最近可识别训练为 ${latest}：${touched.map(key => SPLIT_LABELS[key].split(' · ')[0]).join('、')}；建议轮换到${SPLIT_LABELS[split].split(' · ')[0]}。仅参考已记录动作与日期，不代表肌群已恢复；未记录的训练无法判断。` };
}
function dailyOptions(split, records = [], now = new Date()) {
  if (!SLOTS[split]) return [];
  const base = generatePlan({ records, now }).days.find(day => day.split_day === split);
  return ['A', 'B'].map(variant => {
    const day = { ...base, variant, title: `${SPLIT_LABELS[split]} · ${variant}`,
      label: variant === 'A' ? '基础组合 · 主项稳定' : '替代组合 · 器械为主，腿日臀推替代髋铰链',
      exercises: base.exercises.map(ex => {
        const exercise_id = variant === 'B' ? ALTERNATIVES[ex.exercise_id] || ex.exercise_id : ex.exercise_id;
        const item = { ...ex, exercise_id, name: catalog.exercises.find(e => e.id === exercise_id).name };
        return { ...item, rest_seconds: restGuidance(item).seconds };
      }) };
    // 估算包括每组约 45 秒、动作切换 2 分钟和约 8 分钟热身，不保证实际时长。
    day.estimated_minutes = Math.ceil((day.exercises.reduce((sum, ex) => sum + ex.sets * 45 + (ex.sets - 1) * ex.rest_seconds + 120, 0) + 480) / 60);
    return refreshDay(day, records, now);
  });
}

function lastCompleted(records, exerciseId) {
  const sessions = (records || [])
    .filter(r => r?.kind === 'workout_session' && r.schema_version === 2 && r.status === 'completed' && !r.deleted_at && !r.__seed)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  for (const session of sessions) {
    const entry = (session.exercises || []).find(e => e.exercise_id === exerciseId);
    if (entry) return { entry, date: session.date };
  }
  return null;
}
function suggestWeight(records, exercise, now = new Date()) {
  const history = lastCompleted(records, exercise.exercise_id);
  const result = (weight_kg, rationale) => ({ weight_kg, rationale });
  if (!history) return result(null, '暂无真实历史：现场选择可稳定完成次数下限的重量');
  const { entry, date } = history;
  const age = (new Date(now) - new Date(`${date}T00:00:00`)) / 86400000;
  const prefix = `参考 ${date}：`;
  if (!Number.isFinite(age) || age < 0 || age > 28) return result(null, prefix + '历史超过 28 天或日期无效，重新试重，不自动加重');
  const sets = Array.isArray(entry.sets) ? entry.sets : [];
  const done = sets.filter(setHasRecord);
  const validWeight = set => set.weight_kg !== '' && set.weight_kg != null && Number.isFinite(Number(set.weight_kg));
  if (!done.length || !done.every(validWeight)) return result(null, prefix + '重量或次数缺失，无法判断进阶');
  const weights = done.map(set => Number(set.weight_kg));
  if (!weights.every(weight => weight === weights[0])) return result(null, prefix + '混合重量，不能确认统一工作重量，请现场选择');
  const base = weights[0];
  const target = catalog.exercises.find(item => item.id === exercise.exercise_id);
  if ((base < 0 && !allowsAssist(target)) || (base === 0 && !isBodyweight(target))) return result(null, prefix + '负重含义不明确，请重新确认');
  const range = repRange(exercise.reps);
  const planned = Number(entry.planned_sets);
  const enough = Number.isInteger(planned) && planned > 0 && done.length >= Math.max(planned, exercise.sets, sets.length);
  if (!range || !enough || !done.every(set => Number.isInteger(Number(set.reps)) && Number(set.reps) >= range.high)) {
    return result(base, prefix + `维持重量，先把所有 ${exercise.sets} 组逐步做到 ${range?.high || exercise.reps} 次；缺计划组数不判进阶`);
  }
  if (base < 0) return result(base, prefix + '同助力全部达上限，可尝试减少一档助力；不自动换算 kg');
  if (isBodyweight(target)) return result(base, prefix + '全部达上限，可尝试更难变式或最小负重；不自动增加 kg');
  return result(base, prefix + '同重量全部达上限，可尝试该动作器械最小下一档，再从次数下限开始；档位未知，不自动增加 kg');
}
function refreshDay(day, records, now = new Date()) {
  return { ...day, exercises: day.exercises.map(exercise => ({ ...exercise, rest_seconds: restGuidance(exercise).seconds, rest_hint: restGuidance(exercise).text, ...suggestWeight(records, exercise, now) })) };
}
function generatePlan({ preferences = {}, records = [], now = new Date() } = {}) {
  const splits = [ ['push', 'chest', '推', '胸 + 肩 + 三头'], ['pull', 'back', '拉', '背 + 后束 + 二头'], ['legs', 'legs', '腿', '股四头 + 腘绳 + 臀 + 小腿'] ];
  const days = Array.from({ length: 6 }, (_, index) => {
    const [split_day, training_day, name, focus] = splits[index % 3];
    const round = Math.floor(index / 3) + 1;
    const exercises = SLOTS[split_day].map(([slot, ids, sets, reps], i) => {
      const exercise_id = ids[(round - 1) % ids.length];
      return { exercise_id, name: catalog.exercises.find(e => e.id === exercise_id).name, slot, order: i + 1,
        sets, reps, rest_seconds: reps === '8-12' ? 120 : 90, weight_kg: null,
        intensity_hint: '动作稳定，保留约 2 次余力；不必填写体感评分', rationale: '' };
    });
    return refreshDay({ day_index: index + 1, round, split_day, training_day, title: `力量训练·${name} · 第 ${round} 轮`, focus, exercises, notes: '' }, records, now);
  });
  return { schema_version: 1, kind: 'workout_plan', generated_at: new Date(now).toISOString(), source: 'local_rules', goal: 'hypertrophy', split: 'ppl_3day', rounds: 2, preferences, days };
}
function completionStatus(session) {
  const exercises = session?.exercises || [];
  if (!exercises.some(ex => (ex.sets || []).some(setHasRecord))) return 'empty';
  const targets = session?._plan_targets;
  const complete = targets ? targets.every(target => {
    const ex = exercises.find(item => item.exercise_id === target.exercise_id);
    return (ex?.sets || []).filter(setHasRecord).length >= target.sets;
  }) : exercises.every(ex => (ex.sets || []).filter(setHasRecord).length >= Math.max(ex.planned_sets || 0, ex.sets.length));
  return complete ? 'completed' : 'partial';
}
function saveProgress({ plan_generated_at, day_index, session_id, date, status = 'completed', saved_at = new Date().toISOString() }, storage) {
  try {
    const target = storageOrDefault(storage);
    if (!target || !plan_generated_at || !['completed', 'partial'].includes(status)) return false;
    const previous = loadProgress(target);
    const current = isProgressValid(previous, plan_generated_at) ? previous : { plan_generated_at, days: {} };
    current.days[String(day_index)] = { session_id, date, saved_at, status };
    target.setItem(PROGRESS_KEY, JSON.stringify(current));
    return true;
  } catch (_) { return false; }
}
function loadProgress(storage) {
  try {
    const raw = JSON.parse(storageOrDefault(storage)?.getItem(PROGRESS_KEY) || 'null');
    return raw && typeof raw === 'object' && raw.days && typeof raw.days === 'object' ? raw : null;
  } catch (_) { return null; }
}
function isProgressValid(progress, stamp) { return Boolean(progress?.plan_generated_at && progress.plan_generated_at === stamp); }
function clearProgress(storage) {
  try { storageOrDefault(storage)?.removeItem(PROGRESS_KEY); return true; } catch (_) { return false; }
}
const WorkoutPlan = { SPLIT_LABELS, recommendSplit, dailyOptions, freeExerciseSlot, restGuidance, STORAGE_KEY, PROGRESS_KEY, normalize, isValid, load, save, formatMeta, generatePlan, refreshDay, suggestWeight, completionStatus, saveProgress, loadProgress, isProgressValid, clearProgress };
export default WorkoutPlan;
export { STORAGE_KEY, PROGRESS_KEY, normalize, isValid, load, save, formatMeta, generatePlan, refreshDay, suggestWeight, completionStatus, saveProgress, loadProgress, isProgressValid, clearProgress };
