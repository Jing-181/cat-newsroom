import test from 'node:test';
import assert from 'node:assert/strict';
import W from '../src/lib/workout.js';
import V,{setRowActive} from '../src/lib/workout-view.js';
import {metricFields,metricNumber,parseSetInput,fillPrevious,clearRecordFields,cardioMetric} from '../src/lib/workout-metrics.js';
const ex={exercise_id:'treadmill',equipment:'有氧'};
function session(set){const s=W.createSession('cardio');W.addExercise(s,'treadmill');s.exercises[0].sets=[set];return s;}
test('跑步机段设置finite，负坡度，无全局设备上下限',()=>{
  const specs=metricFields(ex);
  assert.deepEqual(specs.map(s=>s.field),['duration_min','distance_km','treadmill_speed_kmh','treadmill_incline_pct']);
  assert.equal(specs.find(s=>s.field==='treadmill_incline_pct').min,'');
  for(const n of [-20,-0.5,0,40]) {assert.equal(parseSetInput('treadmill_incline_pct',n).valid,true);assert.equal(metricNumber(n,'treadmill_incline_pct'),n);}
  assert.equal(parseSetInput('treadmill_speed_kmh',-1).valid,false);
  for(const field of ['treadmill_speed_kmh','treadmill_incline_pct']) for(const n of [NaN,Infinity,-Infinity]) assert.equal(parseSetInput(field,n).valid,false);
  assert.equal(W.setHasRecord({treadmill_speed_kmh:10,treadmill_incline_pct:5}),false);
  assert.equal(W.setHasRecord({duration_min:10,treadmill_speed_kmh:10}),true);
  assert.equal(W.setHasRecord({distance_km:1,treadmill_incline_pct:-3}),true);
});
test('段继承设置但清空完成字段，显式0不覆盖，旧pace和未知字段保留',()=>{
  const original={duration_min:10,distance_km:1,treadmill_speed_kmh:6,treadmill_incline_pct:-2,pace:'old',unknown:{x:1},id:'old-id'};
  const s=session(original);const added=W.addSet(s,0);clearRecordFields(added);
  assert.equal(added.treadmill_incline_pct,-2);assert.equal(added.treadmill_speed_kmh,6);assert.equal(added.id,undefined);assert.equal(W.setHasRecord(added),false);
  const zero={treadmill_speed_kmh:0,treadmill_incline_pct:0};fillPrevious(zero,original);assert.equal(zero.treadmill_speed_kmh,0);assert.equal(zero.treadmill_incline_pct,0);
  const saved=W.upsertSession([],JSON.parse(JSON.stringify(s)));assert.deepEqual(saved.exercises[0].sets,[original]);
  const old={duration_min:12,distance_km:2,pace:'legacy',unknown:3};assert.deepEqual(W.upsertSession([],session(old)).exercises[0].sets[0],old);
  assert.doesNotMatch(W.formatSetText(old,ex),/本段设定/);
  const settings=W.upsertSession([],session({treadmill_speed_kmh:10}));assert.equal(settings.exercises.length,0);
});
test('真实表单与逐组显示段、设置提示、负坡度；历史复制不称平均',()=>{
  const s=session({duration_min:10,treadmill_speed_kmh:6,treadmill_incline_pct:-2,pace:'old'});
  const html=setRowActive(s.exercises[0],s.exercises[0].sets[0],0,0,[]);
  assert.match(html,/第 1 段/);assert.match(html,/本段设定速度/);assert.match(html,/不等于全程平均值/);assert.match(html,/无设置字段的旧记录/);
  const input=html.match(/<input[^>]*data-set-field="treadmill_incline_pct"[^>]*>/)[0];assert.doesNotMatch(input,/min=/);assert.match(input,/value="-2"/);
  const focus=V.editorHtml(s,'cardio',[],{focus:true,focusTarget:{exercise:0,set:0}});assert.match(focus,/加一段/);assert.match(focus,/完成这段/);
  assert.match(V.detailHtml(s),/本段设定坡度 -2 %/);
  assert.match(V.buildCopyText(s),/第 1 段/);assert.match(V.buildCopyText(s),/原记录配速 old/);
  assert.equal('distance_km' in s.exercises[0].sets[0],false);
});
test('设置不进入趋势和PR，不反推距离或速度',()=>{
  for(const f of ['treadmill_speed_kmh','treadmill_incline_pct']) assert.equal(cardioMetric({sets:[{[f]:10}]},f),null);
  const a=session({duration_min:10,treadmill_speed_kmh:8});a.status='completed';a.date='2026-11-10';
  const b=session({duration_min:10,treadmill_speed_kmh:6});b.status='completed';b.date='2026-11-09';
  const d=W.progressDigests([a,b])[0];assert.equal(d.delta,0);assert.equal(d.isPR,false);assert.equal(d.metricField,'duration_min');
  assert.doesNotMatch(W.formatSetText(a.exercises[0].sets[0],ex),/距离|记录时长配速/);
});
