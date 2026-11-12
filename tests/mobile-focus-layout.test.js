import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import Workout from '../src/lib/workout.js';import View from '../src/lib/workout-view.js';
test('mobile overrides only action navigation, retains touch targets and noncompressed demonstration with scrolling',()=>{
 const css=readFileSync('css/workout-ui.css','utf8');const start=css.indexOf('@media (max-width:820px), (max-width:1024px) and (pointer:coarse)');const block=css.slice(start,css.indexOf('@media (min-width:821px)',start));
 assert.ok(block.includes('.focus-nav-btn { display:none; }'));assert.ok(block.includes('height:auto; margin:0'));assert.ok(block.includes('grid-row:1 / 3'));assert.ok(block.includes('overflow-y:auto'));assert.ok(block.includes('min-height:44px'));
 assert.ok(!css.includes('focus-bottom'));assert.ok(!block.includes('.focus-coach'));assert.ok(!block.includes('.focus-actions'));assert.ok(!block.includes('order:'));assert.ok(!block.includes('padding:58px')); 
 const ui=readFileSync('src/lib/workout-ui.js','utf8');assert.ok(ui.includes('bindFocusGestures(focusRoot, { step: stepFocus, openGroup: openGroupMenu })'));
});
test('real templates preserve essential actions for strength and multi-metric long-title cases',()=>{
 for(const id of ['dumbbell_bench_press','treadmill','stair_climber']){
 const s=Workout.createSession('cardio');Workout.addExercise(s,id);Workout.addExercise(s,'pull_up');for(let i=1;i<12;i++)Workout.addSet(s,0);s.exercises[0].name='双行标题训练动作 · 保持输入控件清楚可点';
 const html=View.editorHtml(s,'cardio',[],{focus:true,focusTarget:{exercise:0,set:0}});
 for(const marker of ['data-focus-done','data-focus-finish','data-focus-overview-open','data-focus-addset','data-focus-add-exercise','data-move-figure','data-focus-move-exercise'])assert.ok(html.includes(marker),id+marker);
 assert.ok(!html.includes('focus-bottom'));assert.ok(html.indexOf('class="focus-coach"')<html.indexOf('class="focus-actions"'));assert.ok(html.indexOf('class="focus-actions"')<html.indexOf('class="focus-extras"'));
 assert.equal((html.match(/class="focus-dot[ "]/g)||[]).length,12);
 }
});
