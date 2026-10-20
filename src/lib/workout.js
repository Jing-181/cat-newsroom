// 训练领域逻辑：会话与组的读写、历史统计、文案格式化。
//
// ESM 模块：import Workout from "./workout.js"。

import catalog from "./workout-catalog.js";

  // "有记录"的判定：力量组以次数为准，有氧组以时长/距离为准。
// 只填了重量、次数是 0 的组（例如 20kg × 0）不算记录，避免自动继承出来的半成品进历史；
// 重量允许为 0：自重动作（引体、俯卧撑）重量就是 0，但次数写了就是真实训练。
// 没有任何数值的空组同样不属于训练记录，界面直接删除而不是标记状态。
const CARDIO_EQUIPMENT = ["有氧", "恢复"];
// 自重类动作（引体向上、双杠臂屈伸、俯卧撑）没有外加负重，但可以用弹力带或助力器械做退阶。
// 重量写负数表示助力，0 表示纯自重，写正数则是加负重腰带。
const ASSIST_EQUIPMENT = ["自重", "自重/器械"];
// 文案上能说「自重」的器械类型：只有这些动作在重量为 0 时用「自重」代替「0 kg」
const BODYWEIGHT_EQUIPMENT = ["自重", "自重/器械", "哑铃/自重"];
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

function isBodyweight(exercise) {
  return BODYWEIGHT_EQUIPMENT.includes(exercise?.equipment);
}

// 该动作能不能记录助力（负重量）：自重类动作才开放
function allowsAssist(exercise) {
  return ASSIST_EQUIPMENT.includes(exercise?.equipment);
}

function setHasRecord(set) {
  if (!set || typeof set !== "object") return false;
  // 有氧组（有时长/距离字段）：留了时长或距离才算一次有氧记录。
  if ("duration_min" in set || "distance_km" in set) {
    return Number(set.duration_min || 0) > 0 || Number(set.distance_km || 0) > 0;
  }
  // 力量组：以次数为准，重量可以为 0（自重）。
  return Number(set.reps || 0) > 0;
}

function recordedSets(exercise) {
  return (exercise?.sets || []).filter(setHasRecord);
}

// 新组继承来源数据（上一次训练或上一组），但不继承备注；没有来源时不编造数值。
// RPE / RIR 是当次体感，和重量次数不同，不跟过来：否则新记录的详情里会冒出自己没填过的数值。
function createSet(exercise, previous = null) {
  if (isCardio(exercise)) {
    return {
      duration_min: num(previous?.duration_min, 0),
      distance_km: num(previous?.distance_km, 0),
      pace: previous?.pace || "",
      rpe: "",
      note: "",
    };
  }
  return {
    weight_kg: num(previous?.weight_kg, 0),
    reps: num(previous?.reps, 0),
    rpe: "",
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
    // mood 是训练结束区的状态词（可选）。旧记录没有这个字段，读取时按空串处理。
    exercises: [], note: "", mood: "", updated_at: new Date().toISOString(),
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

// 自定义动作：动作库没收录的动作由用户自己命名，id 由名称派生，
// 于是同名动作在历史记录与「动作进展」里能连成同一条轨迹；名称直接进 id，不做哈希，避免碰撞。
const CUSTOM_PREFIX = "custom_";
const customExerciseId = name => `${CUSTOM_PREFIX}${name}`;
const isCustomExerciseId = value => String(value || "").startsWith(CUSTOM_PREFIX);

function addCustomExercise(session, name, history = []) {
  // 名称去首尾空白、内部连续空白压缩成一个空格；空名不加入。
  const trimmed = String(name || "").trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > 20) return session;
  const exerciseId = customExerciseId(trimmed);
  // 同名动作在本次训练里只加一次，重复添加由界面提示。
  if (session.exercises.some(item => item.exercise_id === exerciseId)) return session;
  // 有氧恢复日的自定义动作按有氧形态记录（时长/距离），其余训练日按力量形态记录。
  const equipment = session.training_day === "cardio" ? "有氧" : "自定义";
  const previous = previousPerformance(history, exerciseId);
  session.exercises.push({
    id: id("exercise"), exercise_id: exerciseId, name: trimmed, body_part: "自定义",
    equipment, angle: "", icon: trimmed.slice(0, 2),
    tips: "自定义动作：按自己的动作要点控制节奏，重量以动作质量为先。",
    muscles: "自定义动作",
    planned_sets: 1,
    sets: [createSet({ equipment }, previous?.set)], note: "",
  });
  session.updated_at = new Date().toISOString();
  return session;
}

// 用户自己命名过的动作：直接从训练记录里扫描，复用已有数据，不额外引入存储键。
// 同一个自定义动作取最近一次用到的名称，最近用过的排在前面，界面里可以直接点回来。
function customExercises(records) {
  const found = new Map();
  (records || []).filter(record => isSession(record) && !record.deleted_at).forEach(record => {
    const stamp = String(record.updated_at || record.created_at || record.date || "");
    (record.exercises || []).forEach(exercise => {
      const customId = exercise?.exercise_id;
      const name = String(exercise?.name || "").trim();
      if (!isCustomExerciseId(customId) || !name) return;
      const previous = found.get(customId);
      if (!previous || stamp > previous.stamp) found.set(customId, { id: customId, name, stamp });
    });
  });
  return [...found.values()]
    .sort((left, right) => right.stamp.localeCompare(left.stamp))
    .map(({ id: exerciseId, name }) => ({ id: exerciseId, name }));
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

// ---- 日期与频次（空闲页的「上次这一练」用）----

function todayKey() {
  return dateKey(new Date());
}

function daysSince(dateStr, today = todayKey()) {
  const from = Date.parse(`${dateStr}T00:00:00`);
  const to = Date.parse(`${today}T00:00:00`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, Math.round((to - from) / 86400000));
}

// 周一为一周的起点，和训练周复盘的口径一致。
function weekStartKey(key = todayKey()) {
  const day = new Date(`${key}T00:00:00`);
  if (Number.isNaN(day.getTime())) return "";
  const offset = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - offset);
  return dateKey(day);
}

function sessionsThisWeek(records, key = todayKey()) {
  const start = weekStartKey(key);
  if (!start) return 0;
  return completedSessions(records).filter(session => session.date >= start && session.date <= key).length;
}

// 某个训练日最近一次完成的记录；没有就返回 null，由界面决定怎么留白。
function lastSessionForDay(records, trainingDay) {
  return completedSessions(records).find(session => session.training_day === trainingDay) || null;
}

function sessionsOnDate(records, date) {
  return (records || []).filter(record => isSession(record) && record.date === date && !record.deleted_at);
}

function calculateStats(session) {
  const sets = (session?.exercises || []).flatMap(recordedSets);
  const strengthSets = sets.filter(set => "reps" in set || "weight_kg" in set);
  return {
    exerciseCount: (session?.exercises || []).length,
    setCount: sets.length,
    reps: strengthSets.reduce((sum, set) => sum + Number(set.reps || 0), 0),
    volume: strengthSets.reduce((sum, set) => sum + Math.max(0, Number(set.weight_kg || 0)) * Number(set.reps || 0), 0),
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

// 每次记录的代表组：按估算强度挑，而不是只挑最重的一组。
// 90×2 与 70×8 的直接重量差很大，但强度接近；只看重量会把「减重加次」读成退步。
// 同一动作的器械类型固定，所以在同一动作的历史里比较是稳的。
function setIntensity(set) {
  if (!set || typeof set !== "object") return 0;
  if ("duration_min" in set || "distance_km" in set) {
    return Number(set.duration_min || 0) + Number(set.distance_km || 0) * 6;
  }
  const reps = Number(set.reps || 0);
  if (!reps) return 0;
  const weight = Number(set.weight_kg || 0);
  if (weight > 0) return weight * (1 + reps / 30);
  // 助力动作：同为自重时，助力越大越轻松，用负数重量折算掉一部分次数。
  if (weight < 0) return Math.max(0, reps + weight / 10);
  return reps;
}

function bestSet(sets) {
  return (sets || []).reduce((best, set) => (!best || setIntensity(set) > setIntensity(best) ? set : best), null);
}

function exerciseHistory(records, exerciseId, limit = 8) {
  const items = [];
  for (const session of completedSessions(records)) {
    const exercise = (session.exercises || []).find(item => item.exercise_id === exerciseId);
    const sets = recordedSets(exercise);
    if (!sets.length) continue;
    items.push({
      sessionId: session.id, date: session.date, title: session.title,
      equipment: exercise.equipment, sets, setCount: sets.length,
      volume: sets.reduce((sum, set) => sum + Math.max(0, Number(set.weight_kg || 0)) * Number(set.reps || 0), 0),
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
        entry.lastVolume = sets.reduce((sum, set) => sum + Math.max(0, Number(set.weight_kg || 0)) * Number(set.reps || 0), 0);
      }
      map.set(exercise.exercise_id, entry);
    }
  }
  return [...map.values()].sort((left, right) => right.lastDate.localeCompare(left.lastDate) || right.sessionCount - left.sessionCount);
}

// ---- 组记录展示 ----

// 负重文案：负数=助力（弹力带/助力器械），0=自重（仅自重类动作，其他动作显示 0 kg），正数=负重
function weightText(weight, equipment) {
  const value = Number(weight || 0);
  if (value < 0) return `助力 ${trim(-value)} kg`;
  if (value === 0) return isBodyweight({ equipment }) ? "自重" : "0 kg";
  return `${trim(value)} kg`;
}

function formatSetText(set, equipment) {
  if (isCardio({ equipment })) {
    const parts = [`${num(set?.duration_min)} 分钟`];
    if (Number(set?.distance_km || 0) > 0) parts.push(`${Number(set.distance_km)} km`);
    if (set?.pace) parts.push(String(set.pace));
    return parts.join(" · ");
  }
  return `${weightText(set?.weight_kg, equipment)} × ${num(set?.reps)}`;
}

// 紧凑写法：20×10，自重动作显示为 自重×12，助力动作显示为 助力20×8。
function formatSetCompact(set, equipment) {
  if (isCardio({ equipment })) {
    const parts = [`${num(set?.duration_min)}分`];
    if (Number(set?.distance_km || 0) > 0) parts.push(`${Number(set.distance_km)}km`);
    return parts.join(" ");
  }
  const weight = Number(set?.weight_kg || 0);
  const label = weight < 0 ? `助力${trim(-weight)}` : (weight > 0 ? trim(weight) : "自重");
  return `${label}×${num(set?.reps)}`;
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

const Workout = {
  catalog, REST_ADVICE, restAdvice,
  isSession, isCardio, isBodyweight, allowsAssist, setHasRecord, recordedSets, createSet,
  createSession, previousPerformance, previousSet, addExercise, addCustomExercise, customExercises, isCustomExerciseId,
  addSet, removeSet,
  calculateStats, summary,
  todayKey, daysSince, weekStartKey, sessionsThisWeek, lastSessionForDay, sessionsOnDate,
  setIntensity, bestSet,
  exerciseHistory, trackedExercises, formatSetText, formatSetCompact, formatSetList,
  cloneRecord, pruneSession, upsertSession, sortRecords,
};
export default Workout;
export {
  catalog, REST_ADVICE, restAdvice,
  isSession, isCardio, isBodyweight, allowsAssist, setHasRecord, recordedSets, createSet,
  createSession, previousPerformance, previousSet, addExercise, addCustomExercise, customExercises, isCustomExerciseId,
  addSet, removeSet,
  calculateStats, summary,
  todayKey, daysSince, weekStartKey, sessionsThisWeek, lastSessionForDay, sessionsOnDate,
  setIntensity, bestSet,
  exerciseHistory, trackedExercises, formatSetText, formatSetCompact, formatSetList,
  cloneRecord, pruneSession, upsertSession, sortRecords,
};
