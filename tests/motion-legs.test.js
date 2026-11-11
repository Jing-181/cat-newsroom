import test from 'node:test';
import assert from 'node:assert/strict';
import {LEG_CLIPS} from '../src/lib/motion/leg-clips.js';
import {sub,length,project} from '../src/lib/motion/candidate-clips.js';
import {resolveDemo} from '../src/lib/motion/demos.js';
import {createDemoFigure} from '../src/lib/motion/index.js';
const distance=(a,b)=>length(sub(a,b));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const ids={calf_raise:'standingCalf',seated_calf_raise:'seatedCalf',leg_extension:'legExtension',leg_curl:'legCurl'};
test('four leg catalog entries map to distinct clips; full-cycle bones/supports and knee direction',()=>{
 for(const [id,key] of Object.entries(ids)) {
  const clip=resolveDemo(id).clip;assert.equal(clip,LEG_CLIPS[key]);const start=clip.sample(0);let previous=start;
  for(let i=0;i<=500;i++) {
   const s=clip.sample(i/100);assert.deepEqual(s.supports,start.supports);assert.deepEqual(s.equipment.fixedLines,start.equipment.fixedLines);
   s.legs.forEach((l,j)=>{
    near(distance(l.hip,l.knee),30);near(distance(l.knee,l.ankle),30);
    assert.ok(s.kneeAngles[j]>1&&s.kneeAngles[j]<Math.PI,'no hyperextension or inverted knee');
    assert.ok(l.knee.x>l.hip.x,'knees remain forward on both sides');
    assert.ok(distance(l.ankle,previous.legs[j].ankle)<1);
   });
   s.arms.forEach(a=>{near(distance(a.shoulder,a.elbow),16);near(distance(a.elbow,a.hand),16);});
   const points=[s.head,...s.legs.flatMap(l=>[l.hip,l.knee,l.ankle]),...s.feet.flatMap(f=>[f.heel,f.toe]),...s.equipment.lines.flat()];
   for(const point of points){const p=project(point,s.camera);assert.ok(p.x>20&&p.x<180&&p.y>20&&p.y<175,`${id} ${JSON.stringify(p)}`);}
   previous=s;
  }
  assert.deepEqual(clip.sample(5),start);
 }
});
test('calf raises pivot on fixed forefeet, heel rises; seated pelvis fixed and knees bent',()=>{
 for(const clip of [LEG_CLIPS.standingCalf,LEG_CLIPS.seatedCalf]){
  const low=clip.sample(0),high=clip.sample(1.8);
  low.feet.forEach((f,i)=>{assert.deepEqual(f.toe,high.feet[i].toe);near(distance(f.heel,f.toe),15);near(distance(high.feet[i].heel,f.toe),15);assert.ok(high.feet[i].heel.z>f.heel.z);});
 }
 const low=LEG_CLIPS.seatedCalf.sample(0),high=LEG_CLIPS.seatedCalf.sample(1.8);
 assert.deepEqual(low.hip,high.hip);high.kneeAngles.forEach(a=>assert.ok(a>1.1&&a<2.1));
 assert.ok(LEG_CLIPS.standingCalf.sample(1.8).hip.z>LEG_CLIPS.standingCalf.sample(0).hip.z);
});
test('extension and seated curl have opposite direction, fixed knee pivots and opposing pad normals',()=>{
 const ext0=LEG_CLIPS.legExtension.sample(0),ext1=LEG_CLIPS.legExtension.sample(1.8);
 const curl0=LEG_CLIPS.legCurl.sample(0),curl1=LEG_CLIPS.legCurl.sample(1.8);
 assert.ok(ext1.legs[0].ankle.z>ext0.legs[0].ankle.z);
 assert.ok(curl1.legs[0].ankle.z<curl0.legs[0].ankle.z);
 for(const clip of [LEG_CLIPS.legExtension,LEG_CLIPS.legCurl])for(let i=0;i<=100;i++){
  const s=clip.sample(i/20);
  s.equipment.rollers.forEach((r,j)=>{assert.deepEqual(r.pivot,s.legs[j].knee);near(distance(r.center,r.contact),r.radius);near(distance(r.contact,r.pivot),26);});
 }
 assert.ok(ext0.equipment.rollers[0].normal.x>0);
 assert.ok(curl0.equipment.rollers[0].normal.x<0);
});
test('leg clips create flat skins in static and playing mode and clean once',()=>{
 const old=global.document;let removed=0;
 const node=()=>({children:[],attrs:{},append(...n){this.children.push(...n);},setAttribute(k,v){this.attrs[k]=v;},remove(){removed++;}});
 global.document={createElementNS:node};
 try{for(const id of Object.keys(ids))for(const reduced of [true,false]){
  const svg=node(),before=removed;let destroyed=0;
  const stop=createDemoFigure(svg,{exercise:id,reduced,player:o=>({play(){[0,.8,1.8,3].forEach(o.onFrame);},destroy(){destroyed++;}})});
  assert.equal(svg.children[0].attrs.fill,'none');stop();stop();assert.equal(removed-before,1);assert.equal(destroyed,reduced?0:1);
 }}finally{global.document=old;}
});
