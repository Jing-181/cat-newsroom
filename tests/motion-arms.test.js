import test from 'node:test';
import assert from 'node:assert/strict';
import { ARM_CLIPS } from '../src/lib/motion/arm-clips.js';
import { length, sub, project } from '../src/lib/motion/candidate-clips.js';
import { resolveDemo } from '../src/lib/motion/demos.js';
import { createDemoFigure } from '../src/lib/motion/index.js';
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);
const distance = (a,b) => length(sub(a,b));
const ids = {dumbbell_curl:'dumbbellCurl',barbell_curl:'barbellCurl',hammer_curl:'hammerCurl',rope_pushdown:'ropePushdown'};
test('four catalog identities map to independent clips and preserve fixed arms/supports', () => {
  for(const [id,key] of Object.entries(ids)) {
    const clip=resolveDemo(id).clip; assert.equal(clip,ARM_CLIPS[key]);
    const start=clip.sample(0); let previous=start;
    for(let i=0;i<=500;i++) {
      const s=clip.sample(i/100); assert.deepEqual(s.supports,start.supports);
      s.arms.forEach((a,j)=>{
        assert.deepEqual(a.shoulder,start.arms[j].shoulder); assert.deepEqual(a.elbow,start.arms[j].elbow);
        near(distance(a.shoulder,a.elbow),25); near(distance(a.elbow,a.hand),24);
        assert.deepEqual(a.hand,s.equipment.grips[j]);
        assert.ok(distance(a.hand,previous.arms[j].hand)<1);
      });
      const points=[s.head,...s.arms.flatMap(a=>[a.shoulder,a.elbow,a.hand])];
      for(const point of points) { const p=project(point,s.camera); assert.ok(p.x>20&&p.x<180&&p.y>20&&p.y<175); }
      previous=s;
    }
    assert.deepEqual(clip.sample(5),start);
  }
});
test('barbell stays a single rigid shaft; dumbbells remain independent with distinct grip axes',()=>{
  for(const t of [0,.8,1.8,3,4.9]) {
    const bar=ARM_CLIPS.barbellCurl.sample(t).equipment; near(distance(...bar.ends),68); near(distance(...bar.grips),30);
    const db=ARM_CLIPS.dumbbellCurl.sample(t).equipment, hammer=ARM_CLIPS.hammerCurl.sample(t).equipment;
    assert.equal(db.weights.length,2); assert.equal(hammer.weights.length,2);
    db.weights.forEach((w,i)=>{assert.deepEqual(w.center,db.grips[i]); near(distance(...w.ends),14); assert.deepEqual(w.axis,{x:0,y:1,z:0});});
    hammer.weights.forEach((w,i)=>{assert.deepEqual(w.center,hammer.grips[i]); near(distance(...w.ends),14); near(w.axis.y,0); near(length(w.axis),1);});
  }
});
test('pushdown fixed pulley, fixed rope branches and extension, not shoulder-driven pulldown',()=>{
  const start=ARM_CLIPS.ropePushdown.sample(0), end=ARM_CLIPS.ropePushdown.sample(1.8);
  assert.ok(end.arms[0].hand.z<start.arms[0].hand.z);
  for(let i=0;i<=100;i++) {
    const s=ARM_CLIPS.ropePushdown.sample(i/20),e=s.equipment;
    assert.deepEqual(e.pulley,start.equipment.pulley); assert.deepEqual(e.cable[1],e.junction);
    e.branches.forEach((branch,j)=>{near(distance(...branch),e.branchLength);assert.deepEqual(branch[1],s.arms[j].hand);});
  }
});
test('all four create real flat skins in static/animated modes and clean up',()=>{
  const old=global.document; let removed=0;
  const node=()=>({attrs:{},children:[],setAttribute(k,v){this.attrs[k]=v;},append(...v){this.children.push(...v);},remove(){removed++;}});
  global.document={createElementNS:node};
  try { for(const id of Object.keys(ids)) for(const reduced of [true,false]) {
    let destroyed=0; const before=removed,svg=node();
    const stop=createDemoFigure(svg,{exercise:id,reduced,player:options=>({play(){[0,.8,1.8,3].forEach(options.onFrame);},destroy(){destroyed++;}})});
    assert.equal(svg.children[0].attrs.fill,'none'); stop();stop();assert.equal(removed-before,1);assert.equal(destroyed,reduced?0:1);
  }} finally {global.document=old;}
});
