import test from'node:test';import assert from'node:assert/strict';import{OUTDOOR_CLIPS as C}from'../src/lib/motion/outdoor-clips.js';import{createCandidateSkin}from'../src/lib/motion/candidate-skin.js';import{project}from'../src/lib/motion/candidate-clips.js';import{svgNode,withSvgDocument,pathPoints}from'./motion-svg-helpers.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
test('trail side3/4 separates sampled knees/feet better without end-on torso or altered world gait',()=>withSvgDocument(()=>{
 const svg=svgNode(),skin=createCandidateSkin(svg);let oldKnees=0,newKnees=0;
 for(let i=0;i<8;i++){const s=C.trail.sample(i*.5),before=JSON.stringify(s);skin.paint(s);assert.equal(JSON.stringify(s),before);const root=svg.children[0],leg0=pathPoints(root.children.find(n=>n.attrs['data-part']==='farLeg').attrs.d),leg1=pathPoints(root.children.find(n=>n.attrs['data-part']==='nearLeg').attrs.d),torso=pathPoints(root.children.find(n=>n.attrs['data-part']==='torso').attrs.d);
 const kneeSeparation=distance(leg0[1],leg1[1]);newKnees+=kneeSeparation;oldKnees+=distance(project(s.legs[0].knee,s.camera),project(s.legs[1].knee,s.camera));assert.ok(kneeSeparation>12,'eight review phases retain knee separation');assert.ok(distance(leg0[2],leg1[2])>7,'feet distinguishable at sampled phases');assert.ok(distance(...torso)>26,'torso retained');
 }
 assert.ok(newKnees>oldKnees*1.4,'measured average separation improves');skin.destroy();
}));
test('actual trail render foot contact follows unchanged slope and camera wrap continuously',()=>withSvgDocument(()=>{
 const svg=svgNode(),skin=createCandidateSkin(svg);let previous,first;
 for(let i=0;i<=480;i++){const s=C.trail.sample(i/120),before=JSON.stringify(s);skin.paint(s);assert.equal(JSON.stringify(s),before);const paths=['leftFoot','rightFoot'].map(name=>pathPoints(svg.children[0].children.find(n=>n.attrs['data-part']===name).attrs.d));if(i===0)first=paths;
 paths.forEach((points,j)=>{if(previous)points.forEach((p,k)=>assert.ok(distance(p,previous[j][k])<2,'no camera jump'));if(s.supports.stance[j]){for(const point of[s.feet[j].heel,s.feet[j].toe])assert.ok(Math.abs(point.z-s.mechanism.slope*point.x)<1e-6);}});previous=paths;
 }previous.forEach((points,j)=>points.forEach((p,k)=>assert.ok(distance(p,first[j][k])<.002)));skin.destroy();
}));
