import test from 'node:test';import assert from 'node:assert/strict';
import {clipBehindHead,clipPolylineBehindHead} from '../src/lib/motion/projected-lines.js';
import {SHOULDER_CLIPS} from '../src/lib/motion/shoulder-clips.js';import {project} from '../src/lib/motion/candidate-clips.js';import {createCandidateSkin} from '../src/lib/motion/candidate-skin.js';
const p=(x,y,depth)=>({x,y,depth});
test('head clipping removes rear crossing but retains front, tangent, outside and degenerate segments',()=>{
 const h=p(0,0,0);const rear=clipBehindHead(p(-20,0,-2),p(20,0,-2),h,10);
 assert.equal(rear.length,2);assert.equal(rear[0][1].x,-10);assert.equal(rear[1][0].x,10);
 const front=clipBehindHead(p(-5,0,2),p(5,0,2),h,10);assert.equal(front.length,1);assert.equal(front[0][0].x,-5);assert.equal(front[0][1].x,5);
 assert.equal(clipBehindHead(p(0,0,-1),p(0,0,-1),h,10).length,0);
 assert.ok(clipBehindHead(p(-20,10,-1),p(20,10,-1),h,10).length>0);
 const mixed=clipBehindHead(p(-5,0,-1),p(5,0,1),h,10);assert.equal(mixed.length,1);assert.equal(mixed[0][0].x,0);
});
test('strict press full-cycle visible line portions never occupy rear head disk; front portions are retained',()=>{
 let trimmed=0;
 const duration=SHOULDER_CLIPS.strictPress.duration;
 const times=[...Array.from({length:Math.ceil(duration*120)+1},(_,i)=>i/120),4.7,duration-1e-7,duration,duration+1e-7];
 for(const time of times){
 const s=SHOULDER_CLIPS.strictPress.sample(time),p3=x=>project(x,{...s.camera,yaw:-.6}),h=p3(s.head),r=s.size.headRadius+2;
 const lines=[...s.arms.map(a=>[a.shoulder,a.elbow,a.hand]),s.equipment.ends];
 for(const line of lines){const points=line.map(p3),out=clipPolylineBehindHead(points,h,r);const full=points.slice(1).reduce((sum,p,j)=>sum+Math.hypot(p.x-points[j].x,p.y-points[j].y),0);const visible=out.reduce((sum,[a,b])=>sum+Math.hypot(b.x-a.x,b.y-a.y),0);if(visible<full-1e-6)trimmed++;
 for(const [a,b] of out)for(let k=1;k<10;k++){const t=k/10,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,d=a.depth+(b.depth-a.depth)*t;if(Math.hypot(x-h.x,y-h.y)<r-1e-6){assert.ok(d>=h.depth-1e-6);}}
 }}assert.ok(trimmed>0);// Synthetic front/mixed-depth cases above ensure the clipping rule preserves front spans.
});
test('DOM uses depth-clipped paths with an unfilled circular head and unchanged source geometry',()=>{
 const old=global.document;const node=()=>({attrs:{},children:[],setAttribute(k,v){this.attrs[k]=v;},append(...n){this.children.push(...n);},remove(){}});global.document={createElementNS:node};
 try{const svg=node(),skin=createCandidateSkin(svg),clip=SHOULDER_CLIPS.strictPress;
 for(const time of [...Array.from({length:Math.ceil(clip.duration*120)+1},(_,i)=>i/120),4.7,clip.duration-1e-7,clip.duration,clip.duration+1e-7]){
 const s=clip.sample(time),snapshot=JSON.stringify(s);skin.paint(s);assert.equal(JSON.stringify(s),snapshot);const root=svg.children[0];assert.equal(root.attrs.fill,'none');const head=root.children.find(n=>n.attrs['data-part']==='head');assert.equal(head.attrs.fill,undefined);assert.equal(head.attrs.r,9);
 const camera={...s.camera,yaw:-.6},p=x=>project(x,camera),h=p(s.head);
 for(const [i,name]of [[0,'farArm'],[1,'nearArm']]){const a=s.arms[i],segments=clipPolylineBehindHead([a.shoulder,a.elbow,a.hand].map(p),h,s.size.headRadius+2);const expected=segments.map(points=>points.map((p,j)=>`${j?'L':'M'}${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join(' ')).join(' ');assert.equal(root.children.find(n=>n.attrs['data-part']===name).attrs.d,expected);}
 }skin.destroy();}finally{global.document=old;}
});
