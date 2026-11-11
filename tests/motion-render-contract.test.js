import test from 'node:test';import assert from 'node:assert/strict';
import {exercises} from '../src/lib/workout-catalog.js';import {resolveDemo} from '../src/lib/motion/demos.js';
import {SHOULDER_CLIPS} from '../src/lib/motion/shoulder-clips.js';import {COMPOUND_LEG_CLIPS} from '../src/lib/motion/compound-leg-clips.js';
import {project,sub} from '../src/lib/motion/candidate-clips.js';import {createCandidateSkin} from '../src/lib/motion/candidate-skin.js';
import {svgNode,withSvgDocument,pathPoints,svgBounds} from './motion-svg-helpers.js';
const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
test('all 104 actual SVG skins fit full rendered bounds including strokes across entire duration',()=>withSvgDocument(()=>{
 const demos=exercises.map(resolveDemo).filter(d=>d.clip);assert.equal(demos.length,104);const failures=[];
 for(const demo of demos){const svg=svgNode(),skin=demo.skin(svg),clip=demo.clip;skin.resize(clip.viewBox);const[x,y,w,h]=clip.viewBox.split(' ').map(Number);
 const times=[...Array.from({length:Math.ceil(clip.duration*120)+1},(_,i)=>i/120),clip.duration-1e-7,clip.duration,clip.duration+1e-7,4.7].filter(t=>t<=clip.duration+1e-6);
 for(const t of times){skin.paint(clip.sample(t));const b=svgBounds(svg),margin=1;if(b.minX<x+margin||b.minY<y+margin||b.maxX>x+w-margin||b.maxY>y+h-margin){failures.push(`${demo.exerciseId} @${t.toFixed(4)} box=${clip.viewBox} rendered=${JSON.stringify(b)}`);break;}}
 skin.destroy();}
 assert.deepEqual(failures,[]);
}));
test('front raise neck actually connects shoulder to circular outline without entering head interior',()=>withSvgDocument(()=>{
 const svg=svgNode(),skin=createCandidateSkin(svg);
 for(const t of [0,1,2,4.7,5]){const s=SHOULDER_CLIPS.frontRaise.sample(t);skin.paint(s);const neck=svg.children[0].children.find(n=>n.attrs['data-part']==='neck'),points=pathPoints(neck.attrs.d);assert.equal(points.length,2);const h=project(s.head,s.camera),shoulder=project(s.shoulderCenter,s.camera);near(points[0].x,shoulder.x,.001);near(points[0].y,shoulder.y,.001);const end=points[1],d=Math.hypot(end.x-h.x,end.y-h.y),half=Number(neck.attrs['stroke-width'])/2;assert.ok(d-half>=s.size.headRadius-.001);assert.ok(d-half<=s.size.headRadius+.001);}
 skin.destroy();
}));
test('leg press actual rendered sole endpoints contact moving platform plane, not the ankle',()=>withSvgDocument(()=>{
 for(const id of ['legPress','singlePress']){const svg=svgNode(),skin=createCandidateSkin(svg),clip=COMPOUND_LEG_CLIPS[id];
 for(let i=0;i<=480;i++){const s=clip.sample(i/120),e=s.equipment;skin.paint(s);s.feet.forEach((foot,j)=>{if(id==='singlePress'&&j===0)return;for(const p of [foot.heel,foot.toe,foot.contact])near(dot(sub(p,e.platform),e.platformNormal),0);near(dot(sub(foot.ankle,e.platform),e.platformNormal),-2);const node=svg.children[0].children.find(n=>n.attrs['data-part']===(j?'rightFoot':'leftFoot')),points=pathPoints(node.attrs.d);assert.equal(points.length,4);for(const[k,p]of [[2,foot.heel],[3,foot.toe]]){const expected=project(p,s.camera);near(points[k].x,expected.x,.001);near(points[k].y,expected.y,.001);}});}
 skin.destroy();}
}));
