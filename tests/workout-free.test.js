import test from 'node:test';
import assert from 'node:assert/strict';
import Workout from '../src/lib/workout.js';
import Plan from '../src/lib/workout-plan.js';
import View from '../src/lib/workout-view.js';
import { freeReference, recommendationPlanDay, recommendedExercises } from '../src/lib/workout-free.js';

const exercise = id => ({ ...Workout.catalog.exercises.find(e => e.id === id), exercise_id: id });
const completed = (id, set, extra = {}) => ({ ...Workout.createSession(), status: 'completed', exercises: [{ ...exercise(id), sets: [set] }], ...extra });

test('free reference uses real recent sets, known target lower bounds and valid weight semantics', () => {
  const bench = exercise('barbell_bench_press');
  const seed = completed(bench.exercise_id, { weight_kg: 99, reps: 15 }, { __seed: true });
  const old = completed(bench.exercise_id, { weight_kg: 80, reps: 12 }, { date: '2000-01-01' });
  assert.deepEqual(freeReference([seed, old], bench, 0), { weight_kg: undefined, reps: 8 });
  assert.deepEqual(freeReference([completed(bench.exercise_id, { weight_kg: 7.5, reps: 9 })], bench, 0), { weight_kg: 7.5, reps: 9 });
  assert.deepEqual(freeReference([completed(bench.exercise_id, { weight_kg: 0, reps: 9 })], bench, 0), { weight_kg: undefined, reps: 9 });
  const pullup = exercise('pull_up');
  assert.deepEqual(freeReference([completed('pull_up', { weight_kg: -15, reps: 6 })], pullup, 0), { weight_kg: -15, reps: 6 });
  assert.deepEqual(freeReference([completed('pull_up', { weight_kg: 0, reps: 6 })], pullup, 0), { weight_kg: 0, reps: 6 });
  assert.equal(freeReference([], exercise('treadmill_run'), 0), null);
  assert.equal(Plan.freeExerciseSlot('hip_thrust'), null);
});

test('recommendations rotate from recent real work and remove covered slots', () => {
  const history = [completed('barbell_bench_press', { reps: 8, weight_kg: 20 })];
  const catalog = Workout.catalog.exercises;
  assert.ok(recommendedExercises(history, [], catalog).has('lat_pulldown_wide'));
  const after = recommendedExercises(history, [exercise('lat_pulldown_wide')], catalog);
  assert.ok(after.has('seated_cable_row'));
  assert.ok(!after.has('lat_pulldown_wide') && !after.has('lat_pulldown_close'));
  const html = View.exerciseLibraryHtml('full_body', [], [], history, true);
  assert.match(html, /class="exercise-recommendation">推荐/);
  assert.doesNotMatch(html, /data-recommended-filter/);
  assert.ok(html.indexOf('lat_pulldown_wide') < html.indexOf('barbell_bench_press'));
  assert.ok(recommendedExercises(history, [], catalog, 'legs').has('barbell_squat'));
  assert.match(html, /data-add-exercise="lat_pulldown_wide" data-recommended/);
  assert.match(html, /data-add-exercise="barbell_bench_press"/);
});

test('plan recommendations match exact draft identity or next unfinished day of the same type', () => {
  const plan = Plan.generatePlan();
  const session = Workout.createSession('chest');
  const progress = { plan_generated_at: plan.generated_at, days: { 1: { status: 'completed' }, 4: { status: 'partial' } } };
  assert.equal(recommendationPlanDay(session, plan, progress).day_index, 4);
  assert.equal(recommendationPlanDay(session, { ...plan, days: [...plan.days].reverse() }, { ...progress, plan_generated_at: 'stale' }).day_index, 1);
  assert.equal(recommendationPlanDay({ ...session, training_day: 'shoulders' }, plan, progress), null);
  assert.equal(recommendationPlanDay(session, plan, { ...progress, days: { 1: { status: 'completed' }, 4: { status: 'completed' } } }), null);
  const linked = { ...session, _plan_day_index: 1, _plan_generated_at: plan.generated_at };
  assert.equal(recommendationPlanDay(linked, plan, progress).day_index, 1);
  assert.equal(recommendationPlanDay({ ...linked, _plan_generated_at: 'stale' }, plan, progress), null);
  assert.equal(recommendationPlanDay({ ...linked, _plan_day_index: 2 }, plan, progress), null);
});

test('matched plan keeps every unselected action in plan order, including shared slots', () => {
  const plan = Plan.generatePlan();
  const day = plan.days[0];
  day.exercises = [day.exercises[3], { ...day.exercises[0], exercise_id: 'machine_chest_press' }, day.exercises[0], day.exercises[2], day.exercises[1]];
  assert.ok(Plan.isValid(plan));
  const ids = day.exercises.map(ex => ex.exercise_id);
  const badges = (selected, match) => [...View.exerciseLibraryHtml('chest', selected, [], [], true, match).matchAll(/data-add-exercise="([^"]+)" data-recommended/g)].map(m => m[1]);
  assert.deepEqual(badges([], day), ids);
  assert.deepEqual(badges([exercise(ids[1])], day), ids.filter(id => id !== ids[1]));
  assert.deepEqual(badges(ids.map(exercise), day), []);
  assert.equal(badges([], null).length, 3);
});

test('pending values survive draft JSON without entering progress, overview or persisted sets', () => {
  const session = Workout.createSession('full_body');
  Workout.addExercise(session, 'barbell_bench_press');
  session.exercises[0]._confirm_sets = true;
  Workout.addExercise(session, 'dumbbell_shoulder_press');
  session.exercises[0].sets[0]._pending = { weight_kg: 7.5, reps: 10 };
  session.exercises[1].sets[0]._pending = { reps: 8 };
  const draft = JSON.parse(JSON.stringify(session));
  assert.match(View.editorHtml(draft, 'full_body', [], { focus: true, focusTarget: { exercise: 0, set: 0 } }), /value="7.5"/);
  assert.doesNotMatch(View.overviewDialogHtml(draft, 'full_body'), /is-done|7\.5/);
  assert.equal(Workout.calculateStats(draft).setCount, 0);
  assert.equal(Plan.completionStatus(draft), 'empty');
  Object.assign(draft.exercises[0].sets[0], { weight_kg: 10, reps: 9 });
  const saved = Workout.upsertSession([], draft);
  assert.equal(saved.exercises.length, 1);
  assert.equal(saved.exercises[0].sets[0].reps, 9);
  assert.doesNotMatch(JSON.stringify(saved), /_pending|_confirm_sets|_free_training|_plan_/);
});
