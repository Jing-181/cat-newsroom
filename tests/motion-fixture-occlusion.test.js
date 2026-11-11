import test from 'node:test';import assert from 'node:assert/strict';
import{BACK_CLIPS}from'../src/lib/motion/back-clips.js';import{BODYWEIGHT_CLIPS}from'../src/lib/motion/bodyweight-clips.js';import{FUNCTIONAL_CLIPS}from'../src/lib/motion/functional-clips.js';import{SHOULDER_CLIPS}from'../src/lib/motion/shoulder-clips.js';
import{project}from'../src/lib/motion/candidate-clips.js';import{clipPolylineBehindHead}from'../src/lib/motion/projected-lines.js';import{createCandidateSkin}from'../src/lib/motion/candidate-skin.js';import{svgNode,withSvgDocument,pathPoints}from'./motion-svg-helpers.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<.001),length2=segments=>segments.reduce((sum,[a,b])=>sum+Math.hypot(a.x-b.x,a.y-b.y),0);
test('fixed fixtures use same real depth clipping, preserve visible structure and side-view body length',()=>withSvgDocument(()=>{
 for(const clip of[BACK_CLIPS.pulldownSingle,BODYWEIGHT_CLIPS.invertedRow]){const svg=svgNode(),skin=createCandidateSkin(svg);let trimmed=0;
 for(let i=0;i<=clip.duration*120;i++){const s=clip.sample(i/120),before=JSON.stringify(s),camera=s.id==='invertedRow'?{...s.camera,yaw:-.45}:{...s.camera,yaw:-.8,elevation:.2},p=x=>project(x,camera),h=p(s.head);skin.paint(s);assert.equal(JSON.stringify(s),before);
 const original=s.fixtures.map(line=>line.map(p)),expected=original.flatMap(line=>clipPolylineBehindHead(line,h,s.size.headRadius+2));const actual=pathPoints(svg.children[0].children.find(n=>n.attrs['data-part']==='bench').attrs.d);assert.equal(actual.length,expected.length*2);expected.flat().forEach((point,j)=>{near(actual[j].x,point.x);near(actual[j].y,point.y);});
 const originalSegments=original.flatMap(line=>line.slice(1).map((b,j)=>[line[j],b]));if(length2(expected)<length2(originalSegments)-.001)trimmed++;assert.ok(length2(expected)>.75*length2(originalSegments),'rack must remain substantially visible');
 for(const[a,b]of expected)for(let k=1;k<20;k++){const t=k/20;assert.ok(Math.hypot(a.x+(b.x-a.x)*t-h.x,a.y+(b.y-a.y)*t-h.y)>=s.size.headRadius+1.99);}
 const hip=p(s.hip),shoulder=p(s.shoulderCenter);assert.ok(Math.hypot(hip.x-shoulder.x,hip.y-shoulder.y)>26,'do not turn body end-on');
 }assert.ok(trimmed>0);skin.destroy();}
}));
test('strict press bird dog and Arnold existing renderer remains finite, empty-head and source-immutable',()=>withSvgDocument(()=>{
 for(const clip of[SHOULDER_CLIPS.strictPress,BODYWEIGHT_CLIPS.birdDog,FUNCTIONAL_CLIPS.arnold]){const svg=svgNode(),skin=createCandidateSkin(svg);for(let i=0;i<=clip.duration*120;i++){const s=clip.sample(i/120),before=JSON.stringify(s);skin.paint(s);assert.equal(JSON.stringify(s),before);const root=svg.children[0];assert.equal(root.attrs.fill,'none');for(const n of root.children)if(n.tag==='path')pathPoints(n.attrs.d).forEach(p=>assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)));}skin.destroy();}
}));
