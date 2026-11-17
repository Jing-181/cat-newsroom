import test from 'node:test';
import assert from 'node:assert/strict';
import plan from '../src/lib/workout-plan.js';
import workout from '../src/lib/workout.js';
import view from '../src/lib/workout-view.js';
import { readFileSync } from 'node:fs';
test('执行入口保留保存防重、失败回滚和空输入边界（静态契约）', () => {
  const ui = readFileSync(new URL('../src/lib/workout-ui.js', import.meta.url), 'utf8');
  assert.match(ui, /if \(!session \|\| savingSession\) return/);
  assert.match(ui, /await options\.onSave\(saved\)/);
  assert.match(ui, /records\.splice\(0, records\.length, \.\.\.before\)/);
  assert.match(ui, /if \(!hasRecord\) return AppDialog\.alert/);
  assert.match(ui, /day = WorkoutPlan\.refreshDay\(day, records\)/);
  assert.match(ui, /set\.weight_kg = ''; set\.reps = ''/);
  const source = readFileSync(new URL('../src/lib/workout-view.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /data-set-field="rpe"|data-set-field="rir"/);
});
const now = new Date('2026-11-16T12:00:00+08:00');
const target = { exercise_id: 'barbell_bench_press', sets: 3, reps: '8-12' };
function history({ count = 3, reps = 12, weight = 50, planned = 3, date = '2026-11-15', id = target.exercise_id } = {}) {
  return [{ kind: 'workout_session', schema_version: 2, status: 'completed', date, exercises: [{ exercise_id: id, planned_sets: planned, sets: Array.from({ length: count }, () => ({ weight_kg: weight, reps })) }] }];
}
const suggest = (records, ex = target) => plan.suggestWeight(records, ex, now);
function storage() {
  const map = new Map();
  return { getItem: key => map.get(key), setItem: (key, val) => map.set(key, val), removeItem: key => map.delete(key) };
}
test('当天 A/B 实质不同、覆盖相同槽位，切换部位生成对应方案', () => {
  for (const split of ['push', 'pull', 'legs']) {
    const [a, b] = plan.dailyOptions(split, [], now);
    assert.equal(a.split_day, split); assert.equal(b.split_day, split);
    assert.ok(plan.isValid({ days: [a] }) && plan.isValid({ days: [b] }));
    assert.notDeepEqual(a.exercises.map(e => e.exercise_id), b.exercises.map(e => e.exercise_id));
    assert.deepEqual(a.exercises.map(e => e.slot), b.exercises.map(e => e.slot));
    assert.ok(a.estimated_minutes > 20 && a.estimated_minutes < 100);
    assert.ok(b.exercises.every(e => e.weight_kg == null));
  }
  assert.deepEqual(plan.dailyOptions('unknown'), []);
});
test('近期推荐只按真实已练动作及日期，信息不足诚实默认', () => {
  assert.match(plan.recommendSplit([], now).rationale, /不是个性化/);
  assert.equal(plan.recommendSplit(history(), now).split, 'pull');
  const changedTitle = history(); changedTitle[0].training_day = 'legs';
  assert.equal(plan.recommendSplit(changedTitle, now).split, 'pull');
  for (const records of [history({ count: 0 }), history({ date: '2026-01-01' }), history({ date: '2026-11-18' }), history({ id: 'custom_unknown' })]) {
    assert.match(plan.recommendSplit(records, now).rationale, /没有可识别/);
  }
  for (const patch of [{ __seed: true }, { status: 'draft' }, { deleted_at: 'yes' }]) {
    const records = history(); Object.assign(records[0], patch);
    assert.match(plan.recommendSplit(records, now).rationale, /没有可识别/);
  }
  const result = plan.recommendSplit(history(), now);
  assert.match(result.rationale, /2026-11-15/);
  assert.match(result.rationale, /不代表肌群已恢复/);
});
test('休息分级依据动作及目标次数，不推断实际强度', () => {
  assert.equal(plan.restGuidance(target).seconds, 180);
  assert.equal(plan.restGuidance({ ...target, reps: '10-15' }).seconds, 120);
  assert.equal(plan.restGuidance({ exercise_id: 'rope_pushdown', reps: '10-15' }).seconds, 90);
  assert.equal(plan.restGuidance({ exercise_id: 'push_up', reps: '10-15' }).seconds, 120);
  assert.match(plan.restGuidance(target).text, /实际强度未知/);
});
test('选择弹窗保留取消、切换与六次计划入口；独立计划不写循环身份（静态契约）', () => {
  const options = plan.dailyOptions('push', [], now);
  const html = view.dailyChoiceHtml(plan.recommendSplit([], now), 'push', options, plan.generatePlan({ now }));
  assert.match(html, /data-dialog-close/); assert.match(html, /data-daily-split/);
  assert.match(html, /data-daily-cycle/); assert.match(html, /开始 A/);
  assert.match(html, /A · 基础/); assert.match(html, /B · 器械/);
  assert.doesNotMatch(html, /参考休息|不推进循环进度|疲劳、疼痛/);
  const ui = readFileSync(new URL('../src/lib/workout-ui.js', import.meta.url), 'utf8');
  const chooser = ui.slice(ui.indexOf('function openDailyChoice('), ui.indexOf('function wire()'));
  assert.doesNotMatch(chooser, /createSession|persistDraft|saveProgress/);
  assert.match(chooser, /independent: true/);
  assert.match(ui, /if \(!independent\) \{\s+session\._plan_day_index/);
});

test('六次 PPL 槽位覆盖与组数预算，主项稳定且保留腿部偏好', () => {
  const result = plan.generatePlan({ now });
  assert.equal(plan.isValid(result), true);
  assert.deepEqual(result.days.map(d => d.split_day), ['push', 'pull', 'legs', 'push', 'pull', 'legs']);
  assert.deepEqual(result.days.map(d => d.exercises.reduce((sum, e) => sum + e.sets, 0)), [14, 14, 15, 14, 14, 15]);
  for (const day of result.days) {
    assert.ok(day.exercises.every((e, i) => e.order === i + 1 && e.name));
    assert.equal(day.exercises.filter(e => e.slot === '水平推').length, day.split_day === 'push' ? 1 : 0);
    if (day.split_day === 'push') for (const slot of ['肩推', '肩中束', '三头']) assert.ok(day.exercises.some(e => e.slot === slot));
    if (day.split_day === 'legs') {
      for (const slot of ['腿屈伸', '腿弯举', '小腿']) assert.ok(day.exercises.some(e => e.slot === slot));
      assert.ok(!day.exercises.some(e => ['hack_squat', 'conventional_deadlift'].includes(e.exercise_id)));
    }
  }
  assert.ok(result.days[2].exercises.some(e => e.exercise_id === 'seated_hip_adduction'));
  assert.ok(result.days[5].exercises.some(e => e.exercise_id === 'seated_hip_abduction'));
  for (let i = 0; i < 3; i++) assert.deepEqual(result.days[i].exercises.slice(0, 2), result.days[i + 3].exercises.slice(0, 2));
});
test('同重量完整工作组全部达上限才提示下一档，RPE 不参与，公斤不猜', () => {
  for (const rpe of [undefined, 1, 10]) {
    const records = history();
    records[0].exercises[0].sets.forEach(s => s.rpe = rpe);
    assert.match(suggest(records).rationale, /最小下一档/);
    assert.equal(suggest(records).weight_kg, 50);
  }
});
test('少组、低次数、空组、旧数据缺 planned_sets 均不进阶', () => {
  for (const records of [history({ count: 2 }), history({ reps: 11 }), history({ planned: 4 })]) {
    assert.match(suggest(records).rationale, /维持重量/);
  }
  const missing = history(); delete missing[0].exercises[0].planned_sets;
  assert.match(suggest(missing).rationale, /维持重量/);
  const blank = history(); blank[0].exercises[0].sets.push({ reps: '', weight_kg: '' });
  assert.match(suggest(blank).rationale, /维持重量/);
});
test('混重、缺重、旧记录、未来和无效日期留空，不回退挑旧达标记录', () => {
  const mixed = history(); mixed[0].exercises[0].sets[1].weight_kg = 55;
  const missing = history(); missing[0].exercises[0].sets[1].weight_kg = '';
  for (const records of [mixed, missing, history({ date: '2026-10-01' }), history({ date: '2026-11-17' }), history({ date: 'bad' }), history({ weight: Infinity }), history({ weight: -5 }), history({ weight: 0 }), []]) assert.equal(suggest(records).weight_kg, null);
  const recentEmpty = history({ count: 0 });
  assert.equal(suggest([...history({ date: '2026-11-14' }), ...recentEmpty]).weight_kg, null);
});
test('草稿、删除与样板数据不参与', () => {
  for (const patch of [{ status: 'draft' }, { deleted_at: 'yes' }, { __seed: true }]) {
    const records = history(); Object.assign(records[0], patch);
    assert.equal(suggest(records).weight_kg, null);
  }
});
test('自重与助力分别提示，不自动加公斤', () => {
  const ex = { ...target, exercise_id: 'pull_up' };
  assert.match(suggest(history({ id: 'pull_up', weight: -20 }), ex).rationale, /减少一档助力/);
  assert.match(suggest(history({ id: 'pull_up', weight: 0 }), ex).rationale, /更难变式/);
  assert.equal(suggest(history({ id: 'pull_up', weight: -20 }), ex).weight_kg, -20);
});
test('开练刷新最新记录且不修改保存的计划', () => {
  const original = plan.generatePlan({ now }).days[0];
  const refreshed = plan.refreshDay(original, history(), now);
  assert.match(refreshed.exercises[0].rationale, /最小下一档/);
  assert.equal(original.exercises[0].weight_kg, null);
});
test('计划校验拒绝空天、重复索引、无效动作组次数与重量，兼容旧合法计划', () => {
  const valid = plan.generatePlan({ now });
  for (const mutate of [p => p.days = [], p => p.days[1].day_index = 1, p => p.days[0].exercises = [], p => p.days[0].exercises[0].sets = 0, p => p.days[0].exercises[0].reps = '12-8', p => p.days[0].exercises[0].exercise_id = 'unknown', p => p.days[0].exercises[0].weight_kg = NaN, p => p.days[0].exercises[0].rest_seconds = -1]) {
    const bad = structuredClone(valid); mutate(bad); assert.equal(plan.isValid(bad), false);
  }
  const mem = storage(); assert.equal(plan.save(valid, mem), true); assert.deepEqual(plan.load(mem), valid);
  mem.setItem(plan.STORAGE_KEY, JSON.stringify({ plan: valid })); assert.ok(plan.load(mem));
  mem.setItem(plan.STORAGE_KEY, '{'); assert.equal(plan.load(mem), null);
});
test('存储失败可识别，不清理原计划；新版本进度不混入旧进度', () => {
  const broken = { setItem() { throw new Error('quota'); }, getItem() { return null; } };
  assert.equal(plan.save(plan.generatePlan({ now }), broken), false);
  assert.equal(plan.saveProgress({ plan_generated_at: 'a', day_index: 1 }, broken), false);
  const mem = storage();
  plan.saveProgress({ plan_generated_at: 'a', day_index: 1 }, mem);
  plan.saveProgress({ plan_generated_at: 'b', day_index: 2, status: 'partial' }, mem);
  assert.deepEqual(Object.keys(plan.loadProgress(mem).days), ['2']);
  assert.equal(plan.loadProgress(mem).days['2'].status, 'partial');
  assert.equal(plan.isProgressValid(plan.loadProgress(mem), 'a'), false);
  plan.clearProgress(mem); assert.equal(plan.loadProgress(mem), null);
});
test('空训练、部分训练、完整训练区分；删除动作不伪装完成', () => {
  const s = { _plan_targets: [{ exercise_id: target.exercise_id, sets: 3 }], exercises: [] };
  assert.equal(plan.completionStatus(s), 'empty');
  s.exercises = history({ count: 2 })[0].exercises;
  assert.equal(plan.completionStatus(s), 'partial');
  s.exercises = history()[0].exercises;
  assert.equal(plan.completionStatus(s), 'completed');
  s._plan_targets.push({ exercise_id: 'leg_curl', sets: 2 });
  assert.equal(plan.completionStatus(s), 'partial');
});
test('执行提示保留目标、依据与休息，保存清理临时字段而保留旧 RPE', () => {
  const s = workout.createSession(); workout.addExercise(s, target.exercise_id);
  const ex = s.exercises[0]; ex._plan = { ...target, rest_seconds: 120, rationale: '参考近期完整记录' };
  s._plan_targets = [target]; s._plan_generated_at = 'a'; s._plan_day_index = 1;
  ex.sets[0] = { weight_kg: 50, reps: 12, rpe: 8 };
  assert.match(view.planHintText(ex), /3 组 × 8-12 次.*120 秒.*参考近期完整记录/);
  assert.equal(workout.restAdvice(ex).seconds, 120);
  const saved = workout.upsertSession([], s);
  assert.equal(saved._plan_targets, undefined); assert.equal(saved.exercises[0]._plan, undefined);
  assert.equal(saved.exercises[0].sets[0].rpe, 8);
  assert.match(view.planDayCard({ day_index: 1, exercises: [] }, { days: { 1: { status: 'partial', date: '2026-11-16' } } }), /部分完成/);
});
