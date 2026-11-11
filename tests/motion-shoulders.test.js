import test from 'node:test';
import assert from 'node:assert/strict';
import {SHOULDER_CLIPS} from '../src/lib/motion/shoulder-clips.js';
import {v,add,mul,sub,length,project} from '../src/lib/motion/candidate-clips.js';
import {resolveDemo} from '../src/lib/motion/demos.js';
import {createDemoFigure} from '../src/lib/motion/index.js';
const distance=(a,b)=>length(sub(a,b)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const segmentDistance=(p,a,b)=>{const d=sub(b,a),t=Math.max(0,Math.min(1,dot(sub(p,a),d)/dot(d,d)));return distance(p,add(a,mul(d,t)));};
const ids={strict_press:'strictPress',dumbbell_shoulder_press:'dumbbellShoulderPress',dumbbell_lateral_raise:'lateralRaise',dumbbell_front_raise:'frontRaise'};
test('shoulder catalog mappings: fixed bones/supports, no head penetration, continuous trajectory and framing',()=>{
 for(const [id,key] of Object.entries(ids)){
  const clip=resolveDemo(id).clip;assert.equal(clip,SHOULDER_CLIPS[key]);const start=clip.sample(0);let previous=start;
  for(let i=0;i<=500;i++){
   const s=clip.sample(i/100);assert.deepEqual(s.supports,start.supports);assert.deepEqual(s.hip,start.hip);assert.deepEqual(s.fixtures,start.fixtures);
   s.arms.forEach((a,j)=>{near(distance(a.shoulder,a.elbow),23);near(distance(a.elbow,a.hand),22);assert.deepEqual(a.hand,s.equipment.grips[j]);assert.ok(distance(a.hand,previous.arms[j].hand)<1.2);for(const [x,y] of [[a.shoulder,a.elbow],[a.elbow,a.hand]])assert.ok(segmentDistance(s.head,x,y)>s.size.headRadius+1,`${id} arm/head`);});
   const weights=s.equipment.weights||[s.equipment];
   weights.forEach(w=>{assert.ok(segmentDistance(s.head,...w.ends)>s.size.headRadius+1,`${id} shaft/head`);w.plates.forEach(p=>assert.ok(distance(p,s.head)>s.size.headRadius+5));});
   const points=[s.head,...s.arms.flatMap(a=>[a.shoulder,a.elbow,a.hand]),...weights.flatMap(w=>w.ends)];
   for(const point of points){const p=project(point,s.camera);assert.ok(p.x>20&&p.x<180&&p.y>20&&p.y<175,`${id} ${JSON.stringify(p)}`);}
   previous=s;
  }
  assert.deepEqual(clip.sample(5),start);
 }
});
test('raises use distinct planes and fixed elbow bend, pressing uses single shaft vs independent dumbbells',()=>{
 for(const t of [0,.8,1.8,3]){
  const lateral=SHOULDER_CLIPS.lateralRaise.sample(t),front=SHOULDER_CLIPS.frontRaise.sample(t);
  for(const s of [lateral,front])s.arms.forEach(a=>{const upper=sub(a.elbow,a.shoulder),fore=sub(a.hand,a.elbow);near(dot(upper,fore)/(23*22),Math.cos(24*Math.PI/180));});
  lateral.arms.forEach(a=>near(a.elbow.x,a.shoulder.x));front.arms.forEach(a=>near(a.elbow.y,a.shoulder.y));
  const bar=SHOULDER_CLIPS.strictPress.sample(t).equipment;near(distance(...bar.ends),76);near(distance(...bar.grips),46);
  const db=SHOULDER_CLIPS.dumbbellShoulderPress.sample(t);assert.ok(db.supports.seat);assert.equal(db.equipment.weights.length,2);db.equipment.weights.forEach((w,i)=>assert.deepEqual(w.center,db.arms[i].hand));
 }
 const l=SHOULDER_CLIPS.lateralRaise.sample(1.8),f=SHOULDER_CLIPS.frontRaise.sample(1.8);
 assert.ok(Math.abs(l.arms[1].hand.y-l.arms[1].shoulder.y)>40);assert.ok(f.arms[1].hand.x-f.arms[1].shoulder.x>40);
});
test('four new shoulder clips use real shared skins and idempotent static/animated cleanup',()=>{
 const old=global.document;let removed=0;const node=()=>({attrs:{},children:[],setAttribute(k,v){this.attrs[k]=v;},append(...n){this.children.push(...n);},remove(){removed++;}});global.document={createElementNS:node};
 try{for(const id of Object.keys(ids))for(const reduced of [true,false]){const svg=node(),before=removed;let killed=0;const stop=createDemoFigure(svg,{exercise:id,reduced,player:o=>({play(){[0,.8,1.8,3].forEach(o.onFrame);},destroy(){killed++;}})});assert.equal(svg.children[0].attrs.fill,'none');stop();stop();assert.equal(removed-before,1);assert.equal(killed,reduced?0:1);}}finally{global.document=old;}
});
