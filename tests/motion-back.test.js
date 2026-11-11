import test from 'node:test';
import assert from 'node:assert/strict';
import {BACK_CLIPS} from '../src/lib/motion/back-clips.js';
import {sub,length,project} from '../src/lib/motion/candidate-clips.js';
import {resolveDemo} from '../src/lib/motion/demos.js';
import {createDemoFigure} from '../src/lib/motion/index.js';
const ids={lat_pulldown_wide:'pulldownWide',lat_pulldown_close:'pulldownClose',lat_pulldown_reverse:'pulldownReverse',single_arm_cable_pulldown:'pulldownSingle',seated_cable_row:'rowClose',seated_cable_row_wide:'rowWide'};
const distance=(a,b)=>length(sub(a,b)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7);
test('six back entries: bones, fixed supports/pulley, cable and handle contacts, continuous paths',()=>{
 for(const [id,key] of Object.entries(ids)){
  const clip=resolveDemo(id).clip;assert.equal(clip,BACK_CLIPS[key]);const start=clip.sample(0);let previous=start;
  for(let i=0;i<=500;i++){
   const s=clip.sample(i/100),e=s.equipment;
   assert.deepEqual(s.supports,start.supports);assert.deepEqual(e.pulley,start.equipment.pulley);assert.deepEqual(s.fixtures,start.fixtures);
   assert.deepEqual(e.cable,[e.pulley,e.anchor]);
   s.arms.forEach((a,j)=>{near(distance(a.shoulder,a.elbow),23);near(distance(a.elbow,a.hand),22);assert.ok(distance(a.hand,previous.arms[j].hand)<1);});
   if(e.variant.handle==='single'){assert.deepEqual(s.arms[0].hand,start.arms[0].hand);assert.deepEqual(e.grips,[s.arms[1].hand]);}
   else{assert.deepEqual(e.grips,s.arms.map(a=>a.hand));near(distance(...e.grips),e.variant.halfGrip*2);}
   const points=[s.head,...s.arms.flatMap(a=>[a.shoulder,a.elbow,a.hand]),e.pulley,...e.handleLines.flat()];
   for(const point of points){const p=project(point,s.camera);assert.ok(p.x>15&&p.x<185&&p.y>20&&p.y<175,`${id} ${JSON.stringify(p)}`);}
   previous=s;
  }
  assert.deepEqual(clip.sample(5),start);
 }
});
test('vertical pulling differs from horizontal rows, widths and single support are real geometry',()=>{
 for(const [key,clip] of Object.entries(BACK_CLIPS)){
  const a=clip.sample(0),b=clip.sample(1.8),e=b.equipment;
  if(e.variant.family==='row'){assert.ok(a.equipment.anchor.x-b.equipment.anchor.x>25);assert.ok(Math.abs(a.equipment.anchor.z-b.equipment.anchor.z)<1);}
  else{assert.ok(a.equipment.anchor.z-b.equipment.anchor.z>30);}
  assert.notDeepEqual(a.shoulderCenter,b.shoulderCenter,'small controlled torso change');
  assert.ok(Math.abs(a.shoulderCenter.x-b.shoulderCenter.x)<4);
  assert.ok(clip.movement.includes('不显示掌面'),'honest grip visibility boundary');
 }
 const wide=BACK_CLIPS.pulldownWide.sample(1.8),close=BACK_CLIPS.pulldownClose.sample(1.8),reverse=BACK_CLIPS.pulldownReverse.sample(1.8);
 assert.ok(distance(...wide.equipment.grips)>distance(...reverse.equipment.grips));assert.ok(distance(...reverse.equipment.grips)>distance(...close.equipment.grips));
 assert.equal(close.equipment.handleLines[0].length,3);assert.equal(wide.equipment.handleLines[0].length,2);
});
test('back clips create real flat SVG and clean static/playing mounts once',()=>{
 const old=global.document;let removed=0;const node=()=>({attrs:{},children:[],setAttribute(k,v){this.attrs[k]=v;},append(...n){this.children.push(...n);},remove(){removed++;}});global.document={createElementNS:node};
 try{for(const id of Object.keys(ids))for(const reduced of [true,false]){const before=removed,svg=node();let destroyed=0;const stop=createDemoFigure(svg,{exercise:id,reduced,player:o=>({play(){[0,.8,1.8,3].forEach(o.onFrame);},destroy(){destroyed++;}})});assert.equal(svg.children[0].attrs.fill,'none');stop();stop();assert.equal(removed-before,1);assert.equal(destroyed,reduced?0:1);}}finally{global.document=old;}
});
