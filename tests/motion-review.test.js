import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewPage,createReviewMounts,REVIEW_PHASES} from '../src/lib/motion/review.js';
import {exercises} from '../src/lib/workout-catalog.js';
import {resolveDemo} from '../src/lib/motion/demos.js';
import {createDemoFigure} from '../src/lib/motion/index.js';
import {svgNode,withSvgDocument} from './motion-svg-helpers.js';

test('review pages preserve all104 catalog entries exactly once,8 per page, clamps invalid pages',()=>{
 const pages=Array.from({length:13},(_,i)=>reviewPage(i));
 assert.deepEqual(pages.flatMap(p=>p.items.map(i=>i.exercise.id)),exercises.map(e=>e.id));
 for(const p of pages){assert.equal(p.items.length,8);assert.equal(p.pageCount,13);for(const item of p.items){assert.equal(item.demo.clip,resolveDemo(item.exercise).clip);assert.deepEqual(item.frames.map(f=>f.phase),[0,.25,.5]);item.frames.forEach(f=>assert.equal(f.seconds,item.demo.clip.duration*f.phase));}}
 assert.equal(reviewPage(-3).page,0);assert.equal(reviewPage('nan').page,0);assert.equal(reviewPage(999).page,12);assert.equal(reviewPage(1.9).page,1);
});

test('staticTime uses actual resolver skin and requested sample time, never allocates player',()=>withSvgDocument(()=>{
 for(const id of ['barbell_squat','pull_up','dead_bug','plank','stretch']){
 const demo=resolveDemo(id);
 for(const phase of REVIEW_PHASES){let painted,players=0,destroyed=0;const seconds=phase*demo.clip.duration;
 const stop=createDemoFigure(svgNode(),{exercise:id,reduced:false,staticTime:seconds,skin:()=>({resize(){},paint(s){painted=s;},destroy(){destroyed++;}}),player:()=>{players++;throw Error('review must not play');}});
 assert.deepEqual(painted,demo.clip.sample(seconds));assert.equal(players,0);stop();stop();assert.equal(destroyed,1);
 }}
}));

test('real review page mounts24 SVGs, flip destroys all old skins, teardown idempotent; no rAF',()=>withSvgDocument(()=>{
 const previous=global.requestAnimationFrame;global.requestAnimationFrame=()=>{throw Error('static review requested rAF');};
 try{
 const owner=createReviewMounts();let nodes=[];
 const mount=page=>owner.mount(page,(item,frame)=>{const svg=svgNode();svg.meta={id:item.exercise.id,seconds:frame.seconds};nodes.push(svg);return svg;});
 mount(reviewPage(0));assert.equal(nodes.length,24);const first=nodes;
 first.forEach(svg=>{assert.ok(svg.children.length>0);assert.equal(svg.attrs.viewBox,resolveDemo(svg.meta.id).clip.viewBox);});
 nodes=[];mount(reviewPage(1));first.forEach(svg=>assert.ok(svg.children[0].removed));assert.equal(nodes.length,24);
 owner.destroy();owner.destroy();nodes.forEach(svg=>assert.ok(svg.children[0].removed));
 }finally{global.requestAnimationFrame=previous;}
}));

test('failed review mount cleans already-created real skins',()=>withSvgDocument(()=>{
 const owner=createReviewMounts(),nodes=[];let n=0;
 assert.throws(()=>owner.mount(reviewPage(0),()=>{if(++n===4)throw Error('mount unavailable');const svg=svgNode();nodes.push(svg);return svg;}),/mount unavailable/);
 assert.equal(nodes.length,3);nodes.forEach(svg=>assert.ok(svg.children[0].removed));owner.destroy();
}));
