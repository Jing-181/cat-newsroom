import Workout from './workout.js';
import Plan from './workout-plan.js';
import { metricNumber } from './workout-metrics.js';

export function recentTraining(records, now = new Date()) {
  return records.filter(record => {
    const age = (now - new Date(`${record.date}T00:00:00`)) / 86400000;
    return Workout.isSession(record) && record.status === 'completed' && !record.__seed && !record.deleted_at && age >= 0 && age <= 28;
  });
}

export function freeReference(records, exercise, setIndex) {
  if (Workout.isCardio(exercise)) return null;
  const performance = Workout.previousPerformance(recentTraining(records), exercise.exercise_id);
  const previous = performance?.sets[setIndex] || performance?.set;
  const reps = metricNumber(previous?.reps, 'reps') || Number(Plan.freeExerciseSlot(exercise.exercise_id)?.reps.split('-')[0]) || undefined;
  const raw = previous?.weight_kg;
  const weight = (typeof raw === 'number' || (typeof raw === 'string' && raw.trim())) ? Number(raw) : NaN;
  const weight_kg = Number.isFinite(weight) && (weight > 0 || (weight === 0 && Workout.isBodyweight(exercise)) || (weight >= -200 && weight < 0 && Workout.allowsAssist(exercise))) ? weight : undefined;
  return reps === undefined && weight_kg === undefined ? null : { reps, weight_kg };
}

// The session flag only supports drafts created by the previous free-training UI.
export const confirmsWorkoutSet = (session, exercise) => !session?._editing_record_id && Boolean(exercise?._confirm_sets || session?._free_training);

export function recommendationPlanDay(session, plan, progress) {
  if (!Plan.isValid(plan)) return null;
  const matches = plan.days.filter(day => day.training_day === session.training_day);
  if (session._plan_day_index != null || session._plan_generated_at != null) {
    if (!plan.generated_at || session._plan_generated_at !== plan.generated_at) return null;
    return matches.find(day => day.day_index === session._plan_day_index) || null;
  }
  const done = Plan.isProgressValid(progress, plan.generated_at) ? progress.days : null;
  return matches.sort((a, b) => a.day_index - b.day_index)
    .find(day => done?.[day.day_index]?.status !== 'completed') || null;
}

export function recommendedExercises(records, selected, catalog, selectedDay, planDay = null) {
  const ids = new Set(selected.map(ex => ex.exercise_id));
  if (planDay) return new Set(planDay.exercises.map(ex => ex.exercise_id).filter(id => !ids.has(id)));
  const recent = recentTraining(records);
  const daySplit = { chest: 'push', shoulders: 'push', back: 'pull', legs: 'legs' }[selectedDay];
  const matchDay = selectedDay === 'arms' || selectedDay === 'cardio';
  const split = daySplit || selected.map(ex => Plan.freeExerciseSlot(ex.exercise_id)?.split).find(Boolean) || Plan.recommendSplit(recent).split;
  const slots = new Set(selected.map(ex => Plan.freeExerciseSlot(ex.exercise_id)?.slot));
  const ranked = new Map();
  for (const item of catalog) {
    if (ids.has(item.id)) continue;
    const target = Plan.freeExerciseSlot(item.id);
    if (matchDay ? !item.trainingDays.includes(selectedDay) : !target || target.split !== split || slots.has(target.slot)) continue;
    const slot = target?.slot || item.id;
    const count = recent.filter(record => record.exercises.some(ex => ex.exercise_id === item.id && Workout.recordedSets(ex).length)).length;
    const best = ranked.get(slot);
    if (!best || count > best.count) ranked.set(slot, { id: item.id, count });
  }
  return new Set([...ranked.values()].sort((a, b) => b.count - a.count).slice(0, 3).map(item => item.id));
}
