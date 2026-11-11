import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import W from '../src/lib/workout.js';
import V from '../src/lib/workout-view.js';
import { fillPrevious, inheritSet, metricFields, formatCardio, cardioMetric } from '../src/lib/workout-metrics.js';
const stairs = {exercise_id:'stair_climber',equipment:'有氧'};
test('采用上次只补未填，显式零包括自重不可覆盖', () => {
  const set = {weight_kg:0,reps:0,duration_min:0,floors:0,steps:0,machine_level:0,avg_step_rate_spm:0,note:'本次'};
  const before = structuredClone(set);
  fillPrevious(set, {weight_kg:20,reps:10,duration_min:30,floors:50,steps:100,machine_level:8,avg_step_rate_spm:45,note:'旧'});
  assert.deepEqual(set,before);
  const blank = W.createSet({equipment:'自重'});
  assert.equal(blank.weight_kg,''); assert.equal(blank.reps,'');
  fillPrevious(blank,{weight_kg:0,reps:8}); assert.equal(blank.weight_kg,0); assert.equal(blank.reps,8);
  const s=W.createSession(); W.addExercise(s,'pull_up'); s.exercises[0].sets=[{weight_kg:0,reps:0}];
  const html=V.editorHtml(s,'back',[],{focus:true,focusTarget:{exercise:0,set:0}});
  assert.match(html,/value="0"[^>]*data-focus-field="weight_kg"/);
});
test('新组继承过滤生命周期身份，保存编辑不删原身份或未知指标', () => {
  const old={id:'old',set_id:'s',uuid:'u',status:'completed',completed:true,done:true,created_at:'then',completed_at:'then',floors:3,unknown:{vendor:1}};
  const inherited=inheritSet(old);
  for(const key of ['id','set_id','uuid','status','completed','done','created_at','completed_at']) assert.equal(key in inherited,false);
  assert.deepEqual(inherited.unknown,old.unknown);
  inherited.unknown.vendor=2; assert.equal(old.unknown.vendor,1);
  const current={id:'new',status:'draft',floors:''}; fillPrevious(current,old);
  assert.equal(current.id,'new'); assert.equal(current.status,'draft');
  const s=W.createSession('cardio'); W.addExercise(s,'stair_climber'); s.exercises[0].sets=[old];
  assert.deepEqual(W.upsertSession([],s).exercises[0].sets[0],old);
});
test('爬楼历史距离明确标旧记录距离', () => {
  assert.equal(metricFields(stairs,{distance_km:0}).find(s=>s.field==='distance_km').label,'旧记录距离');
  assert.match(formatCardio({distance_km:2},stairs),/旧记录距离 2 km/);
  assert.doesNotMatch(formatCardio({distance_km:2},{exercise_id:'treadmill'}),/旧记录距离/);
});
test('跨次缺时长时固定最新指标，缺失不补零，显式零仍是记录', () => {
  const make=(date,set)=>{const s=W.createSession('cardio'); W.addExercise(s,'outdoor_run'); s.date=date;s.status='completed';s.exercises[0].sets=[set];return s;};
  const records=[make('2026-11-04',{duration_min:30,distance_km:5}),make('2026-11-03',{distance_km:4}),make('2026-11-02',{duration_min:0,distance_km:3}),make('2026-11-01',{duration_min:20,distance_km:2})];
  const d=W.progressDigests(records)[0];assert.equal(d.metricField,'duration_min');assert.deepEqual(d.series,[20,0,30]);assert.equal(d.previous.value,0);
  const distance=W.progressDigests(records.slice(1))[0];assert.equal(distance.metricField,'distance_km');assert.deepEqual(distance.series,[2,3,4]);
  assert.equal(cardioMetric({sets:[{distance_km:4}]},'duration_min'),null);
  assert.equal(cardioMetric({sets:[{duration_min:0}]},'duration_min').value,0);
});
test('隔离页只导入纯领域/真实表单，不引入存储同步认证', () => {
  const source=readFileSync(new URL('../src/preview/workout-metrics-preview.js',import.meta.url),'utf8');
  assert.match(source,/setRowActive/); assert.match(source,/Workout.upsertSession/);
  assert.doesNotMatch(source,/localStorage|sessionStorage|fetch\(|from.*(?:store|sync|auth|workout-ui)/);
});
