import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSSRApp} from 'vue';
import {renderToString} from '@vue/server-renderer';
import {parse} from '@vue/compiler-sfc';
import Workout from '../src/lib/workout.js';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const home=read('../src/modules/home/HomeView.vue');
const atlas=read('../src/modules/workout/ExerciseAtlasView.vue');
function record(ids){const s=Workout.createSession('cardio');s.date='2026-11-10';s.status='completed';for(const [id,set]of ids){Workout.addExercise(s,id);s.exercises.at(-1).sets=[set];}return s;}
function renderHome(sessions){
  const start=home.indexOf('function goalsTileHTML('),end=home.indexOf('\n}',start)+2;
  const bindings={Workout,weekDates:()=>['2026-11-10'],data:()=>({sport:sessions}),WorkoutPlan:{load:()=>null},icon:()=>'',esc:String};
  return new Function(...Object.keys(bindings),`${home.slice(start,end)};return goalsTileHTML();`)(...Object.values(bindings));
}
test('首页纯有氧只展示训练次数和记录组，不显示kg或混合量纲',()=>{
  const html=renderHome([record([['swimming',{distance_km:0.5}],['stair_climber',{floors:12.5}]])]);
  assert.doesNotMatch(html,/\bkg\b|容量/);assert.match(html,/总组数/);assert.match(html,/2 个动作 · 2 组/);
});
test('首页自重0kg仍属于力量，混合训练容量明确仅力量',()=>{
  const bodyweight=renderHome([record([['pull_up',{weight_kg:0,reps:8}]])]);
  assert.match(bodyweight,/力量容量 0 kg/);assert.match(bodyweight,/力量容量 kg/);
  const mixed=renderHome([record([['swimming',{distance_km:0.5}],['dumbbell_bench_press',{weight_kg:20,reps:10}]])]);
  assert.match(mixed,/力量容量 200 kg/);assert.match(mixed,/力量容量 kg/);assert.doesNotMatch(mixed,/200\.5/);
});
async function renderAtlas(staticHold){
  const demo={status:'calibrated',label:'校准样片 · 待视觉验收',clip:{staticHold},source:'https://www.strengthlog.com/plank/',view:'test',support:'test',movement:'test'};
  const selected={id:'synthetic',name:'合成动作',equipment:'自重',bodyPart:'核心',demo};
  return renderToString(createSSRApp({template:parse(atlas).descriptor.template.content,setup:()=>({query:'',equipment:'',status:'',equipmentOptions:[],statusLabels:{calibrated:'已接入示范 · 待视觉验收'},filtered:[],rows:[selected],selected,playing:false,figure:null,demoLabel:()=> '已接入示范 · 待视觉验收',select:()=>{},staticFigure:()=>{}})}));
}
test('图鉴实际模板：staticHold无播放控制，动态保留播放，来源中性',async()=>{
  const still=await renderAtlas(true);assert.match(still,/静态保持示范/);assert.doesNotMatch(still,/播放示范|停止播放/);
  const moving=await renderAtlas(false);assert.match(moving,/播放示范/);assert.doesNotMatch(moving,/静态保持示范/);
  assert.match(still,/href="https:\/\/www.strengthlog.com\/plank\/"[^>]*>动作参考/);assert.doesNotMatch(still,/ACE 动作参考|校准样片/);
  assert.match(atlas,/if \(selected.value\?\.demo.clip\?\.staticHold\) playing.value = false/);
  const fn=atlas.match(/function select\(exercise\) \{[^}]+\}/)[0];
  const playing={value:true},selected={value:null};new Function('playing','selected',`${fn};select({demo:{clip:{staticHold:true}}});`)(playing,selected);assert.equal(playing.value,false);
});
