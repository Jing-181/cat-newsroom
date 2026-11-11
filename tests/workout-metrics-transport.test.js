import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import backup from '../src/lib/data-backup.js';
import W from '../src/lib/workout.js';
import V from '../src/lib/workout-view.js';
const sync=createRequire(import.meta.url)('../js/sync-core.js');
test('指标经真实备份和同步合并纯函数保留完整JSON（非云端验证）',()=>{
  const s=W.createSession('cardio');W.addExercise(s,'stair_climber');
  const set={floors:12.5,steps:200,jump_count:300,treadmill_speed_kmh:6,treadmill_incline_pct:-2,machine_level:0,avg_step_rate_spm:40,pace:'original',distance_km:0.5,unknown:{vendor:'synthetic'}};
  s.exercises[0].sets=[set];
  const snapshot=backup.createSnapshot({sport:[s]},'synthetic-key');
  const restored=backup.dataForRestore(backup.parse(JSON.stringify(snapshot),['sport']),['sport']);
  assert.deepEqual(restored.sport[0].exercises[0].sets[0],set);
  const local={sport:[]};sync.applyPending(local,[{type:'record',moduleKey:'sport',record:structuredClone(s)}]);
  assert.deepEqual(local.sport[0].exercises[0].sets[0],set);
  sync.applyRealtime(local,{table:'workbench_records',eventType:'UPDATE',newRow:{id:s.id,module_key:'sport',data:structuredClone(s),updated_at:'2099-01-01T00:00:00Z'}});
  assert.deepEqual(local.sport[0].exercises[0].sets[0],set);
  assert.equal(W.calculateStats(local.sport[0]).hasStrength,false);assert.equal(W.calculateStats(local.sport[0]).volume,0);
});
test('所有历史表单格式出口保留游泳上下文',()=>{
  const s=W.createSession('cardio');W.addExercise(s,'swimming');s.exercises[0].sets=[{distance_km:0.5}];s.status='completed';
  const ex=s.exercises[0];
  for(const html of [V.detailHtml(s),V.buildCopyText(s),V.overviewDialogHtml(s),V.exerciseProgressHtml([s],'swimming'),V.idleHtml('cardio',[s]),V.editorHtml(s,'cardio'),V.editorHtml(s,'cardio',[],{expandedDone:new Set([ex.id]),openSets:{[ex.id]:-1}})]) {
    assert.match(html,/500 米/);assert.doesNotMatch(html,/0\.5 km/);
  }
});
