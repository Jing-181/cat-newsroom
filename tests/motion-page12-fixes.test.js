import test from 'node:test';import assert from 'node:assert/strict';
import{OUTDOOR_CLIPS as C}from'../src/lib/motion/outdoor-clips.js';import{BODYWEIGHT_CLIPS}from'../src/lib/motion/bodyweight-clips.js';
import{project,sub,length}from'../src/lib/motion/candidate-clips.js';import{createCandidateSkin}from'../src/lib/motion/candidate-skin.js';import{clipPolylineBehindHead}from'../src/lib/motion/projected-lines.js';import{svgNode,withSvgDocument,pathPoints}from'./motion-svg-helpers.js';
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`),dist=(a,b)=>length(sub(a,b)),dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
test('wall calf stretch rear knee straight, front knee bent, both drawn soles grounded and hands on drawn wall',()=>withSvgDocument(()=>{
 const s=C.stretch.sample(0),rear=s.legs[0],front=s.legs[1];near(dist(rear.hip,rear.ankle),54);assert.ok(dist(front.hip,front.ankle)<53);
 for(const foot of s.feet){near(foot.heel.z,0);near(foot.toe.z,0);}s.arms.forEach(a=>{near(a.hand.x,34);near(a.hand.z,63);});
 const svg=svgNode(),skin=createCandidateSkin(svg);skin.paint(s);const wall=pathPoints(svg.children[0].children.find(n=>n.attrs['data-part']==='bench').attrs.d);
 for(const a of s.arms){const p=project(a.hand,s.camera),lo=project({x:34,y:-25,z:63},s.camera),hi=project({x:34,y:25,z:63},s.camera);near((p.x-lo.x)*(hi.y-lo.y)-(p.y-lo.y)*(hi.x-lo.x),0);assert.ok(wall.some(q=>Math.hypot(q.x-lo.x,q.y-lo.y)<.002));}
 skin.destroy();
}));
test('freestyle recovery really flexes elbow, underwater pull differs, lengths/entry continuity stay fixed',()=>{
 let min=Infinity,max=-Infinity;let prev;
 for(let i=0;i<=480;i++){const s=C.swim.sample(i/120);s.arms.forEach((a,j)=>{near(dist(a.shoulder,a.elbow),21);near(dist(a.elbow,a.hand),21);const bend=Math.acos(Math.max(-1,Math.min(1,dot(sub(a.elbow,a.shoulder),sub(a.hand,a.elbow))/441)));min=Math.min(min,bend);max=Math.max(max,bend);if(prev)assert.ok(dist(a.hand,prev.arms[j].hand)<2);if(a.recovery)assert.ok(a.elbow.z>=s.supports.waterLevel-1e-6);});prev=s;}
 assert.ok(max>1.4);assert.ok(min<.01);const target=C.swim.sample(1);assert.ok(target.arms[0].elbowFlexion>1.4);assert.ok(Math.abs(target.arms[0].hand.x-target.arms[0].elbow.x)>19);assert.deepEqual(C.swim.sample(4),C.swim.sample(0));
});
test('bird dog actual rendered camera and rear-depth clipping avoid head-center crossing at all phases',()=>withSvgDocument(()=>{
 const svg=svgNode(),skin=createCandidateSkin(svg);let trimmed=0;
 for(let i=0;i<=960;i++){const s=BODYWEIGHT_CLIPS.birdDog.sample(i/120),before=JSON.stringify(s),camera={...s.camera,yaw:-.45,elevation:.6},p=x=>project(x,camera),h=p(s.head);skin.paint(s);assert.equal(JSON.stringify(s),before);
 const projectedHip=p(s.hip),projectedShoulder=p(s.shoulderCenter);
 assert.ok(Math.hypot(projectedHip.x-projectedShoulder.x,projectedHip.y-projectedShoulder.y)>26,'side view must retain torso length');
 assert.ok(Math.abs(projectedHip.x-projectedShoulder.x)>26,'camera must not look down torso long axis');
 s.arms.forEach((a,j)=>{const original=[a.shoulder,a.elbow,a.hand].map(p),expected=clipPolylineBehindHead(original,h,10),node=svg.children[0].children.find(n=>n.attrs['data-part']===(j?'nearArm':'farArm')),rendered=pathPoints(node.attrs.d);assert.equal(rendered.length,expected.length*2);
 expected.forEach(([a,b],k)=>{near(rendered[2*k].x,a.x,.001);near(rendered[2*k+1].y,b.y,.001);for(let n=1;n<10;n++){const u=n/10,x=a.x+(b.x-a.x)*u,y=a.y+(b.y-a.y)*u;assert.ok(Math.hypot(x-h.x,y-h.y)>7.9,'head interior center remains clear');}});
 const length2=points=>points.slice(1).reduce((sum,p,k)=>sum+Math.hypot(p.x-points[k].x,p.y-points[k].y),0);if(expected.reduce((sum,line)=>sum+length2(line),0)<length2(original)-1e-5)trimmed++;
 });
 }
 for(const time of [2,6]){
  const s=BODYWEIGHT_CLIPS.birdDog.sample(time),camera={...s.camera,yaw:-.45,elevation:.6},p=x=>project(x,camera),distance=(a,b)=>Math.hypot(p(a).x-p(b).x,p(a).y-p(b).y);
  assert.ok(distance(s.arms[0].hand,s.arms[1].hand)>28,'extended hand visibly separates from support hand on both sides');
  assert.ok(distance(s.legs[0].ankle,s.legs[1].ankle)>34,'extended foot visibly separates from resting foot');
  assert.ok(distance(s.legs[s.supports.activeLeg].ankle,s.supports.knee)>55,'extension cannot foreshorten into the support knee');
  near(s.supports.hand.z,0);near(s.supports.knee.z,0);
 }
 assert.ok(trimmed>0);skin.destroy();
}));
