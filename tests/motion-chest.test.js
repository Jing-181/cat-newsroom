import test from 'node:test';import assert from 'node:assert/strict';
import {CHEST_CLIPS} from '../src/lib/motion/chest-clips.js';
import {length,sub,project} from '../src/lib/motion/candidate-clips.js';
import {resolveDemo} from '../src/lib/motion/demos.js';import {createDemoFigure} from '../src/lib/motion/index.js';
const ids={dumbbell_bench_press:'dumbbellBench',dumbbell_bench_press_incline:'inclineDumbbellBench',barbell_bench_press_incline:'inclineBarbellBench',close_grip_bench_press:'closeBench',smith_machine_bench_press:'smithBench',one_arm_dumbbell_bench_press:'singleDumbbellBench'};
const dist=(a,b)=>length(sub(a,b)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('six chest variants map to real clips with fixed support, bones and bench contact',()=>{
 for(const [id,key] of Object.entries(ids)){
 const clip=resolveDemo(id).clip;assert.equal(clip,CHEST_CLIPS[key]);const start=clip.sample(0);let previous=start;
 for(let i=0;i<=400;i++){
 const s=clip.sample(i/100);assert.deepEqual(s.supports,start.supports);assert.deepEqual(s.fixtures,start.fixtures);
 s.arms.forEach((a,j)=>{near(dist(a.shoulder,a.elbow),25);near(dist(a.elbow,a.hand),23);assert.ok(dist(a.hand,previous.arms[j].hand)<1);if(!(s.variant.single&&j===0)){assert.ok(a.elbow.x>a.shoulder.x);assert.ok((j?1:-1)*a.elbow.y>0);}});
 for(const name of ['seat','back','head']){const p=sub(s.supports[name],s.benchPlane.origin),n=s.benchPlane.normal;near(p.x*n.x+p.y*n.y+p.z*n.z,name==='head'?1:0);}
 if(s.variant.single)assert.deepEqual(s.arms[0].hand,start.arms[0].hand);
 if(s.variant.smith)s.equipment.ends.forEach((end,j)=>{near(end.x,s.rails[j][0].x);near(end.y,s.rails[j][0].y);});
 const weights=s.equipment.weights||[s.equipment];weights.forEach((w,j)=>{if(s.equipment.weights)assert.deepEqual(w.center,s.equipment.grips[j]);});
 for(const point of [s.head,...s.arms.flatMap(a=>[a.shoulder,a.elbow,a.hand]),...weights.flatMap(w=>w.ends)]){const p=project(point,s.camera);assert.ok(p.x>15&&p.x<190&&p.y>15&&p.y<175,`${id} ${JSON.stringify(p)}`);}
 previous=s;
 }assert.deepEqual(clip.sample(4),start);
 const bottom=clip.sample(2);bottom.arms.forEach((a,j)=>{if(!(bottom.variant.single&&j===0))assert.ok(a.hand.z>a.elbow.z,'bottom hand above elbow');});
 }
});
test('variants differ in angle, narrow grip, rails and active equipment count',()=>{
 near(CHEST_CLIPS.inclineDumbbellBench.sample(0).variant.angle,Math.PI/6);
 const narrow=CHEST_CLIPS.closeBench.sample(2);near(dist(...narrow.equipment.grips),26);
 assert.equal(CHEST_CLIPS.singleDumbbellBench.sample(0).equipment.weights.length,1);
 assert.equal(CHEST_CLIPS.dumbbellBench.sample(0).equipment.weights.length,2);
 assert.equal(CHEST_CLIPS.smithBench.sample(0).rails.length,2);
});
test('new chest skins create and destroy through real resolver',()=>{
 const old=global.document;let removed=0;const node=()=>({attrs:{},children:[],setAttribute(k,v){this.attrs[k]=v;},append(...n){this.children.push(...n);},remove(){removed++;}});global.document={createElementNS:node};
 try{for(const id of Object.keys(ids))for(const reduced of [true,false]){const svg=node(),before=removed;let killed=0;const stop=createDemoFigure(svg,{exercise:id,reduced,player:o=>({play(){[0,1,2].forEach(o.onFrame);},destroy(){killed++;}})});assert.equal(svg.children[0].attrs.fill,'none');stop();stop();assert.equal(removed-before,1);assert.equal(killed,reduced?0:1);}}finally{global.document=old;}
});
