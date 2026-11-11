import test from 'node:test';
import assert from 'node:assert/strict';
const load = Promise.all([import('../src/lib/workout.js'), import('../src/lib/workout-metrics.js'), import('../src/lib/workout-view.js')]);
const stair = { exercise_id: 'stair_climber', equipment: '有氧' };
const run = { exercise_id: 'outdoor_run', equipment: '有氧' };
function record(W, sets, exerciseId = 'stair_climber', date = '2026-11-01') {
  const s = W.createSession('cardio'); W.addExercise(s, exerciseId); s.date = date; s.status = 'completed'; s.exercises[0].sets = sets; return s;
}
test('指标按真实 ID 定义，恢复最小字段，旧距离可编辑', async () => {
  const [, M] = await load;
  assert.deepEqual(M.metricFields(stair).map(s => s.field), ['duration_min','floors','steps','machine_level','avg_step_rate_spm']);
  assert.deepEqual(M.metricFields({id:'stretch'}).map(s => s.field), ['duration_min']);
  assert.ok(M.metricFields(stair, {distance_km: 2}).some(s => s.field === 'distance_km'));
  assert.equal(M.derivedPace({duration_min:30,distance_km:5}, stair), '');
  assert.equal(M.derivedPace({duration_min:30,distance_km:5}, {id:'swimming'}), '');
});
test('有限非负数、整数步数、空与显式零区分', async () => {
  const [{default:W}, M] = await load;
  for (const value of [undefined,null,'',NaN,Infinity,-1,'abc']) assert.equal(M.metricNumber(value,'floors'), null);
  assert.equal(M.metricNumber(0,'floors'), 0);
  assert.equal(M.metricNumber(2.5,'floors'), 2.5);
  assert.equal(M.metricNumber(2.5,'steps'), null);
  for (const set of [{floors:2.5},{steps:20},{distance_km:2}]) assert.equal(W.setHasRecord(set),true);
  for (const set of [{machine_level:8},{avg_step_rate_spm:50},{steps:2.5},{floors:Infinity},{duration_min:NaN},{steps:0}]) assert.equal(W.setHasRecord(set),false);
  assert.deepEqual(M.parseSetInput('note','腿有点酸'),{valid:true,value:'腿有点酸'});
  for (const value of [-1,Infinity,NaN,2.5]) assert.equal(M.parseSetInput('steps',value).valid,false);
  assert.equal(M.formatCardio({}, stair),'未填');
  assert.match(M.formatCardio({floors:0}, stair),/0 层/);
});
test('跑步配速秒进位、不覆盖原配速、无缺失假零', async () => {
  const [{default:W}, M] = await load;
  const set = {duration_min:5.999,distance_km:1,pace:'6分10秒'};
  assert.equal(M.derivedPace(set,run),'6:00/km');
  assert.match(W.formatSetText(set,run),/原记录配速 6分10秒/);
  assert.equal(set.pace,'6分10秒');
  for (const value of [0,undefined,NaN,Infinity]) assert.equal(M.derivedPace({duration_min:value,distance_km:1},run),'');
  assert.doesNotMatch(W.formatSetText({floors:12},stair),/0 分|km|配速/);
});
test('创建、继承、采用上次、草稿 JSON、保存往返保留扩展', async () => {
  const [{default:W}, M] = await load;
  const previous = {floors:12.5,steps:200,machine_level:8,avg_step_rate_spm:42,distance_km:1,pace:'旧文本',note:'旧备注',rpe:8,unknown:{device:'A'}};
  const s = record(W,[previous]);
  const next = W.addSet(s,0);
  assert.deepEqual(next.unknown,previous.unknown);
  assert.equal(next.pace,previous.pace); assert.equal(next.note,''); assert.equal(next.rpe,'');
  const blank = W.createSet(stair); assert.equal(blank.duration_min,'');
  M.fillPrevious(blank,previous); assert.deepEqual(blank.unknown,previous.unknown);
  M.clearRecordFields(next); assert.equal(W.setHasRecord(next),false);
  const restored = JSON.parse(JSON.stringify(s));
  const saved = W.upsertSession([],restored);
  assert.equal(saved.exercises[0].sets.length,1);
  assert.deepEqual(saved.exercises[0].sets[0],previous);
  for (const set of [{floors:2},{steps:20},{distance_km:1}]) assert.equal(W.pruneSession(record(W,[set])).exercises.length,1);
  assert.equal(W.pruneSession(record(W,[{machine_level:3}])).exercises.length,0);
});
test('趋势固定指标单位、距离不乘6、有氧不生成PR或力量容量', async () => {
  const [{default:W}] = await load;
  const records = [record(W,[{duration_min:30}],'outdoor_run','2026-11-03'),record(W,[{distance_km:5}],'outdoor_run','2026-11-02'),record(W,[{duration_min:20}],'outdoor_run','2026-11-01')];
  const [digest] = W.progressDigests(records);
  assert.equal(digest.unit,'分'); assert.deepEqual(digest.series,[20,30]); assert.equal(digest.delta,10); assert.equal(digest.isPR,false); assert.equal(digest.streak,0);
  const [distance] = W.progressDigests([records[1]]); assert.equal(distance.latest.value,5); assert.equal(distance.unit,'km');
  assert.equal(W.setIntensity({duration_min:20,distance_km:4}),0);
  assert.equal(W.calculateStats(records[0]).hasStrength,false);
});
test('逐组与总览按动作切字段；历史配速、楼层与无容量展示', async () => {
  const [{default:W}, M, {default:V}] = await load;
  const s = record(W,[{floors:12}]);
  const html = V.editorHtml(s,'cardio',[],{focus:true,focusTarget:{exercise:0,set:0}});
  for (const field of ['floors','steps','machine_level','avg_step_rate_spm']) assert.match(html,new RegExp(`data-focus-field="${field}"`));
  assert.doesNotMatch(html,/data-focus-field="distance_km"/);
  assert.match(html,/平均步频/);
  const overview = V.editorHtml(s,'cardio',[],{expandedDone:new Set([s.exercises[0].id]),openSets:{[s.exercises[0].id]:0}});
  for (const field of ['floors','steps','machine_level','avg_step_rate_spm','note']) assert.match(overview,new RegExp(`data-set-field="${field}"`));
  const runningHtml = V.editorHtml(record(W,[{}],'outdoor_run'),'cardio',[],{focus:true,focusTarget:{exercise:0,set:0}});
  assert.match(runningHtml,/data-focus-field="distance_km"/);
  assert.doesNotMatch(runningHtml,/data-focus-field="floors"/);
  assert.equal(M.sameFieldLayout(['duration_min','distance_km'],M.metricFields(stair)),false);
  assert.equal(M.sameFieldLayout(M.metricFields(stair).map(s=>s.field),M.metricFields(stair)),true);
  assert.doesNotMatch(V.detailHtml(s),/容量|0 kg/);
  assert.match(V.detailHtml(s),/12 层/);
  assert.doesNotMatch(V.exerciseProgressHtml([s],'stair_climber'),/容量|最重|新纪录/);
  assert.match(V.detailHtml(record(W,[{duration_min:30,distance_km:5}],'outdoor_run')),/6:00\/km/);
});
