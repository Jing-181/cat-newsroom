import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import Workout from '../src/lib/workout.js';import View from '../src/lib/workout-view.js';
const css=readFileSync('css/workout-ui.css','utf8');
test('mobile setbar has independent progress row and non-shrinking touch target, desktop retained',()=>{
 const block=css.slice(css.indexOf('@media (max-width:820px), (max-width:1024px) and (pointer:coarse)'));
 assert.match(block,/grid-template-columns:minmax\(0,1fr\) auto/);assert.match(block,/focus-dots[^}]+grid-column:1 \/ -1; grid-row:2/s);assert.match(block,/focus-group-menu[^}]+min-height:44px/s);assert.match(block,/focus-dot[^}]+min-width:18px/s);assert.match(block,/overflow-y:auto/);assert.match(block,/focus-field[^}]+flex-shrink:0/s);
});
test('real focus templates retain menu/dots/dwell and explicit zero for strength and multi-metric cardio',()=>{
 for(const id of ['pull_up','treadmill','stair_climber','swimming']){
 const s=Workout.createSession('cardio');Workout.addExercise(s,id);for(let i=0;i<11;i++)Workout.addSet(s,0);
 s.exercises[0].sets[0]={...s.exercises[0].sets[0],weight_kg:0,reps:0,duration_min:0,distance_km:0};
 const html=View.editorHtml(s,'cardio',[],{focus:true,focusTarget:{exercise:0,set:0}});
 assert.ok(html.includes('focus-setbar'));assert.equal((html.match(/class="focus-dot[ "]/g)||[]).length,12);assert.ok(html.includes('data-focus-dwell'));assert.ok(html.includes('data-focus-group-menu'));assert.match(html,/value="0"/);
 }
});
