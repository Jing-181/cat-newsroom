import test from 'node:test';import assert from 'node:assert/strict';
import {HINGE_CLIPS} from '../src/lib/motion/hinge-clips.js';import {length,sub,project} from '../src/lib/motion/candidate-clips.js';import {resolveDemo} from '../src/lib/motion/demos.js';import {createDemoFigure} from '../src/lib/motion/index.js';
const ids={romanian_deadlift:'rdl',conventional_deadlift:'deadlift',single_leg_rdl:'singleRdl',barbell_row:'barbellRow',one_arm_dumbbell_row:'singleRow',t_bar_row:'tbarRow'};
const dist=(a,b)=>length(sub(a,b)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('six real hinge/row mappings preserve bones, supports, grip and continuity',()=>{
 for(const[id,key]of Object.entries(ids)){const c=resolveDemo(id).clip;assert.equal(c,HINGE_CLIPS[key]);const start=c.sample(0);let prev=start;
 for(let i=0;i<=400;i++){const s=c.sample(i/100);assert.deepEqual(s.supports,start.supports);assert.deepEqual(s.fixtures,start.fixtures);near(s.torsoLength,start.torsoLength);
 s.legs.forEach(l=>{near(dist(l.hip,l.knee),s.size.thigh);near(dist(l.knee,l.ankle),s.size.shin);});
 s.arms.forEach((a,j)=>{near(dist(a.shoulder,a.elbow),s.size.upperArm);near(dist(a.elbow,a.hand),s.size.forearm);assert.ok(dist(a.hand,prev.arms[j].hand)<1.1);});
 const active=key==='singleRow'?[s.arms[1]]:s.arms;assert.deepEqual(s.equipment.grips,active.map(a=>a.hand));
 if(key==='rdl'||key==='deadlift'||key==='barbell'+'Row'){
 const c=s.equipment.center;
 for(const l of s.legs)for(const[a,b]of[[l.hip,l.knee],[l.knee,l.ankle]]){
 const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((c.x-a.x)*dx+(c.z-a.z)*dz)/(dx*dx+dz*dz)));
 assert.ok(Math.hypot(c.x-a.x-t*dx,c.z-a.z-t*dz)>2.5,'bar shaft does not intersect leg segments');
 }}
 if(s.equipment.weights)s.equipment.weights.forEach((w,j)=>assert.deepEqual(w.center,active[j].hand));
 if(key==='tbarRow'){assert.deepEqual(s.equipment.pivot,start.equipment.pivot);near(dist(s.equipment.pivot,s.equipment.tip),60);}
 for(const point of [s.head,...s.legs.flatMap(l=>[l.hip,l.knee,l.ankle]),...s.arms.flatMap(a=>[a.shoulder,a.elbow,a.hand])]){const p=project(point,s.camera);assert.ok(p.x>-5&&p.x<190&&p.y>15&&p.y<175,`${id} ${JSON.stringify(p)}`);}
 prev=s;
 }assert.deepEqual(c.sample(4),start);}
});
test('deadlift/RDL starts differ; single support/bench contact and anchored T bar are actual constraints',()=>{
 const r=HINGE_CLIPS.rdl.sample(0),d=HINGE_CLIPS.deadlift.sample(0);assert.ok(d.hip.z<r.hip.z-15);assert.ok(d.equipment.center.z<r.equipment.center.z-20);
 for(let i=0;i<=100;i++){const s=HINGE_CLIPS.singleRdl.sample(i/25);assert.ok(s.legs[0].ankle.z>0);assert.ok(s.legs[0].ankle.x<s.hip.x);}
 const s=HINGE_CLIPS.singleRow.sample(1);near(s.supports.hand.z,18);near(s.supports.knee.z,18);near(s.supports.foot.z,2);
 const a=HINGE_CLIPS.tbarRow.sample(0).equipment.tip,b=HINGE_CLIPS.tbarRow.sample(2).equipment.tip;assert.notEqual(a.x,b.x);assert.ok(b.z>a.z);
});
test('all six render actual SVG and clean once in static/animated modes',()=>{
 const old=global.document;let removed=0;const node=()=>({attrs:{},children:[],setAttribute(k,v){this.attrs[k]=v;},append(...n){this.children.push(...n);},remove(){removed++;}});global.document={createElementNS:node};
 try{for(const id of Object.keys(ids))for(const reduced of[true,false]){const svg=node(),before=removed;let killed=0;const stop=createDemoFigure(svg,{exercise:id,reduced,player:o=>({play(){[0,1,2].forEach(o.onFrame);},destroy(){killed++;}})});assert.equal(svg.children[0].attrs.fill,'none');stop();stop();assert.equal(removed-before,1);assert.equal(killed,reduced?0:1);}}finally{global.document=old;}
});
