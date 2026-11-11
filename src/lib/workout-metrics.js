// 可选 set 指标；不迁移历史，不覆盖原 pace，也不解释未知字段。
const definitions = {
  duration_min: { label: '时长', unit: '分', step: 1 },
  treadmill_speed_kmh: { label: '本段设定速度', unit: 'km/h', step: 0.1 },
  treadmill_incline_pct: { label: '本段设定坡度', unit: '%', step: 0.5, signed: true },
  distance_km: { label: '距离', unit: 'km', step: 0.1 },
  floors: { label: '设备楼层', unit: '层', step: 0.1 },
  steps: { label: '总步数', unit: '步', step: 1, integer: true },
  jump_count: { label: '跳绳次数', unit: '次', step: 10, integer: true },
  machine_level: { label: '本机档位', unit: '档', step: 1 },
  avg_step_rate_spm: { label: '平均步频', unit: '步/分', step: 1 },
};
const timed = ['duration_min'];
const distance = ['duration_min', 'distance_km'];
const profiles = {
  treadmill: [...distance, 'treadmill_speed_kmh', 'treadmill_incline_pct'], outdoor_run: distance, trail_run: distance,
  incline_walk: distance, bike: distance, elliptical: distance, rowing_machine: distance,
  swimming: distance, stair_climber: ['duration_min', 'floors', 'steps', 'machine_level', 'avg_step_rate_spm'],
  stretch: timed, jump_rope: ['duration_min', 'jump_count'], badminton: timed,
};
const running = new Set(['treadmill', 'outdoor_run', 'trail_run']);
const recordFields = ['duration_min', 'distance_km', 'floors', 'steps', 'jump_count'];
const exerciseId = exercise => exercise?.exercise_id || exercise?.id;
export const isCardioExercise = exercise => Boolean(profiles[exerciseId(exercise)]) || ['有氧', '恢复'].includes(exercise?.equipment);
export const hasCardioFields = set => Object.keys(definitions).some(field => field in (set || {}));
export function metricFields(exercise, set = {}) {
  const keys = [...(profiles[exerciseId(exercise)] || distance)];
  // 历史距离保留且可编辑，但不把它解释成设备楼层。
  if (set.distance_km != null && set.distance_km !== '' && !keys.includes('distance_km')) keys.push('distance_km');
  return keys.map(field => ({ field, ...metricSpec(field, exercise), min: definitions[field]?.signed ? '' : 0 }));
}
export function metricSpec(field, exercise) {
  const spec = { ...definitions[field], label: definitions[field] ? metricLabel(field, exercise) : field };
  if (field === 'distance_km' && exerciseId(exercise) === 'swimming') return { ...spec, unit: '米', step: 25, scale: 1000 };
  return { ...spec, scale: 1 };
}
export function inputMetricValue(field, value, exercise) {
  if (isUnfilled(value)) return '';
  const scale = metricSpec(field, exercise).scale;
  return scale === 1 ? value : Number((Number(value) * scale).toPrecision(15));
}
export const recordUnit = exercise => exerciseId(exercise) === 'treadmill' ? '段' : '组';
export function treadmillGuidance(exercise) {
  return exerciseId(exercise) === 'treadmill' ? '可选设置仅表示本段恒定设置，不等于全程平均值；变速或变坡请加一段或留空。无设置字段的旧记录仅保留原时长、距离含义，不推断恒定。' : '';
}
export const isUnfilled = value => value == null || value === '';
function metricLabel(field, exercise) {
  const profile = profiles[exerciseId(exercise)];
  return field === 'distance_km' && profile && !profile.includes(field) ? '旧记录距离' : definitions[field].label;
}

export function metricNumber(value, field) {
  if (value == null || value === '' || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return null;
  if (!['string', 'number'].includes(typeof value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && (definitions[field]?.signed || number >= 0) && (!definitions[field]?.integer || Number.isInteger(number)) ? number : null;
}
export const cardioHasRecord = set => recordFields.some(field => (metricNumber(set?.[field], field) ?? 0) > 0);
export function parseSetInput(field, value, exercise) {
  if (field === 'note' || field === 'pace') return { valid: true, value };
  if (value === '') return { valid: true, value: '' };
  const number = Number(value);
  const valid = Number.isFinite(number) && (field === 'weight_kg' || definitions[field]?.signed || number >= 0) && (!definitions[field]?.integer || Number.isInteger(number));
  const stored = number / metricSpec(field, exercise).scale;
  return { valid: valid && Number.isFinite(stored), value: stored };
}
export function inheritSet(previous = {}) {
  const next = JSON.parse(JSON.stringify(previous || {}));
  // 已知生命周期元数据不能变成新组身份；未知业务指标仍保留。
  for (const key of ['id', 'set_id', 'uuid', 'status', 'completed', 'is_completed', 'done', 'created_at', 'updated_at', 'completed_at', 'started_at', 'deleted_at', 'rir']) delete next[key];
  return { ...next, rpe: '', note: '' };
}
export function fillPrevious(set, previous) {
  for (const [field, value] of Object.entries(inheritSet(previous))) {
    if (['rpe', 'note'].includes(field)) continue;
    if (isUnfilled(set[field])) set[field] = value;
  }
  return set;
}
export function clearRecordFields(set) {
  if (hasCardioFields(set)) recordFields.forEach(field => { if (field in set) set[field] = ''; });
  else set.reps = '';
}
export function derivedPace(set, exercise) {
  if (!running.has(exerciseId(exercise))) return '';
  const duration = metricNumber(set?.duration_min, 'duration_min');
  const km = metricNumber(set?.distance_km, 'distance_km');
  if (!(duration > 0 && km > 0)) return '';
  const seconds = Math.round(duration / km * 60);
  if (!Number.isFinite(seconds)) return '';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}/km`;
}
export function formatCardio(set, exercise) {
  const parts = Object.keys(definitions).flatMap(field => {
    const spec = metricSpec(field, exercise);
    const value = metricNumber(set?.[field], field);
    return value == null ? [] : [`${spec.label} ${inputMetricValue(field, value, exercise)} ${spec.unit}`];
  });
  if (exerciseId(exercise) === 'treadmill' && ['treadmill_speed_kmh', 'treadmill_incline_pct'].some(field => metricNumber(set?.[field], field) != null)) parts.push('恒定段设置，非全程平均');
  const pace = derivedPace(set, exercise);
  if (pace) parts.push(`记录时长配速 ${pace}`);
  if (set?.pace) parts.push(`原记录配速 ${set.pace}`);
  return parts.join(' · ') || '未填';
}
export function cardioMetric(entry, field, exercise = entry) {
  if (!recordFields.includes(field)) return null;
  const values = (entry.sets || []).map(set => metricNumber(set[field], field)).filter(value => value != null);
  if (!values.length) return null;
  const value = values.reduce((sum, number) => sum + number, 0);
  if (!Number.isFinite(value)) return null;
  const spec = metricSpec(field, exercise);
  const displayed = inputMetricValue(field, value, exercise);
  if (!Number.isFinite(displayed)) return null;
  return { value: displayed, field, unit: spec.unit, text: `${spec.label} ${displayed} ${spec.unit}`, date: entry.date };
}
export function cardioTrendField(entry, exercise) {
  return metricFields(exercise).map(spec => spec.field).filter(field => recordFields.includes(field)).concat('distance_km')
    .find(field => (cardioMetric(entry, field)?.value || 0) > 0);
}
export function sameFieldLayout(inputs, specs) {
  return inputs.length === specs.length && specs.every((spec, index) => inputs[index] === spec.field);
}
