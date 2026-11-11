import {v,add,bendJoint} from './candidate-clips.js';
const size=Object.freeze({thigh:28,shin:28,upperArm:19,forearm:19,headRadius:9});
const smooth=x=>x*x*(3-2*x),clamp=x=>Math.max(0,Math.min(1,x)),ramp=(t,a,b)=>smooth(clamp((t-a)/(b-a)));
function beltFoot(u,y,duty,slope){
 const stance=u<duty;let x,z;
 if(stance){x=17-34*u/duty;z=0;}
 else{const s=(u-duty)/(1-duty);x=-17+34*smooth(s);z=12*Math.sin(Math.PI*s)**2;}
 return {point:v(x,y,4+slope*x+z),stance};
}
function sample(id,time){
 const duration=id==='rower'?6:4,t=((time%duration)+duration)%duration,u=t/duration,a=2*Math.PI*u;
 let hip=v(0,0,51),shoulderCenter,ankles,hands,phases=[],fixtures=[],lines=[],rollers=[],supports={},mechanism={};
 if(id==='bike'){
  hip=v(-9,0,47);ankles=[-1,1].map((s,i)=>v(9+12*Math.cos(a+i*Math.PI),s*10,17+12*Math.sin(a+i*Math.PI)));
  shoulderCenter=v(5,0,71);hands=[v(31,-12,57),v(31,12,57)];fixtures=[[v(-17,0,47),v(0,0,47)],[v(-9,0,47),v(9,0,17)],[v(9,0,17),v(31,0,57)]];lines=ankles.map(p=>[v(9,p.y,17),p]);rollers=[{center:v(9,0,17),radius:12}];supports={saddle:hip,hands};mechanism={crank:v(9,0,17),radius:12};
 }else if(id==='elliptical'){
  ankles=[-1,1].map((s,i)=>v(19*Math.cos(a+i*Math.PI),s*11,12+5*Math.sin(a+i*Math.PI)));hip=v(0,0,57);shoulderCenter=v(1,0,82);hands=[-1,1].map((s,i)=>v(18-10*Math.cos(a+i*Math.PI),s*19,66));
  fixtures=[[v(-28,0,2),v(32,0,2)]];lines=ankles.map((p,i)=>[p,hands[i]]);supports={pedals:ankles,handles:hands};mechanism={ellipse:{rx:19,rz:5,cz:12}};
 }else if(id==='rower'){
  const drive=t<=2.4,clock=drive?t:6-t;
  const leg=ramp(clock,0,1.2),body=ramp(clock,1.2,1.8),arm=ramp(clock,1.8,2.4);
  hip=v(-5-23*leg,0,19);const lean=.3-.55*body;shoulderCenter=add(hip,v(26*Math.sin(lean),0,26*Math.cos(lean)));
  const handX=shoulderCenter.x+Math.sqrt(36**2-(shoulderCenter.z-32)**2)-23*arm;
  hands=[v(handX,-9,32),v(handX,9,32)];ankles=[v(20,-10,5),v(20,10,5)];fixtures=[[v(-40,0,16),v(10,0,16)],[v(20,-18,2),v(20,18,2)]];lines=[[v(hip.x-7,0,18),v(hip.x+7,0,18)],[v(60,0,32),v(handX,0,32)],[hands[0],hands[1]]];supports={feet:ankles};mechanism={outlet:v(60,0,32),seat:hip,leg,body,arm,drive};
 }else if(id==='stairs'){
  const duty=.65;ankles=[-1,1].map((s,i)=>{const p=(u+i*.5)%1,stance=p<duty;let x,z;if(stance){x=18-22*p/duty;z=22-12*p/duty;}else{const k=smooth((p-duty)/(1-duty));x=-4+22*k;z=10+12*k+7*Math.sin(Math.PI*k)**2;}phases.push(stance);return v(x,s*11,z);});hip=v(4,0,61);shoulderCenter=v(8,0,86);hands=[v(27,-20,71),v(27,20,71)];fixtures=[[v(27,-20,0),v(27,-20,77)],[v(27,20,0),v(27,20,77)]];
  ankles.forEach((p,i)=>{if(phases[i])lines.push([v(p.x-5,-23,p.z-2),v(p.x+6,-23,p.z-2),v(p.x+6,23,p.z-2),v(p.x-5,23,p.z-2)]);});supports={hands,stance:phases};mechanism={stairVelocity:v(-22/(duration*duty),0,-12/(duration*duty)),steps:ankles.map((p,i)=>phases[i]?v(p.x,0,p.z-2):null)};
 }else{
  const walk=id==='inclineWalk',slope=walk?.12:0,duty=walk?.65:.38;
  const states=[beltFoot(u,-10,duty,slope),beltFoot((u+.5)%1,10,duty,slope)];ankles=states.map(s=>s.point);phases=states.map(s=>s.stance);hip=v(0,0,walk?51:49+2*Math.sin(2*a)**2);shoulderCenter=add(hip,v(3,0,26));hands=[-1,1].map((s,i)=>add(shoulderCenter,v(9+9*Math.cos(a+i*Math.PI),s*15,-22)));
  fixtures=[[v(-27,-22,2-27*slope),v(27,-22,2+27*slope)],[v(-27,22,2-27*slope),v(27,22,2+27*slope)],[v(27,-22,2+27*slope),v(27,-22,78)]];
  supports={stance:phases};mechanism={slope,beltSpeed:34/(duration*duty),duty,surfaceHeight:2};
 }
 if(id==='treadmill'||id==='inclineWalk'){
  const slope=mechanism.slope;
  fixtures.push([v(-27,-22,2-27*slope),v(-27,22,2-27*slope)],[v(27,-22,2+27*slope),v(27,22,2+27*slope)],
   [v(27,22,2+27*slope),v(27,22,78)],[v(27,-22,78),v(27,22,78)],
   [v(27,-22,62),v(10,-22,62)],[v(27,22,62),v(10,22,62)]);
 }
 // Minimal recognizable fixed chassis; no solid volumes or altered pedal paths.
 if(id==='bike'){
  fixtures=[[v(-17,0,47),v(0,0,47)],[v(-9,0,47),v(-9,0,3)],
   [v(-22,0,3),v(39,0,3)],[v(-20,-17,3),v(-20,17,3)],[v(36,-17,3),v(36,17,3)],
   [v(31,0,3),v(31,0,57)],[v(31,-12,57),v(31,12,57)],[v(-9,0,30),v(31,0,30)]];
  // Two moving crank spokes remain; omit its decorative full circle near the feet.
  rollers=[{center:v(43,0,15),radius:9}];
  fixtures.push([v(31,0,15),v(43,0,15)],[v(43,0,15),v(43,0,3)]);
 }
 if(id==='elliptical'){
  fixtures.push([v(-28,-23,2),v(34,-23,2)],[v(-28,23,2),v(34,23,2)],[v(28,0,2),v(28,0,72)],[v(28,-23,2),v(28,23,2)]);
  ankles.forEach(p=>lines.push([v(p.x-8,p.y,p.z-2),v(p.x+8,p.y,p.z-2)]));rollers.push({center:v(27,0,15),radius:12});
 }
 if(id==='rower'){
  fixtures.push([v(-42,-12,16),v(15,-12,16)],[v(-42,12,16),v(15,12,16)],[v(-37,0,16),v(-37,0,0)],[v(10,0,16),v(10,0,0)],[v(60,0,32),v(60,0,0)]);
  for(const side of[-1,1])fixtures.push([v(17,side*10,2),v(24,side*10,10)]);
  lines.push([v(hip.x-7,-10,18),v(hip.x+7,-10,18)],[v(hip.x-7,10,18),v(hip.x+7,10,18)]);rollers.push({center:v(60,0,18),radius:14});
 }
 if(id==='stairs'){
  fixtures.push([v(-18,-26,0),v(40,-26,32)],[v(-18,26,0),v(40,26,32)],[v(27,-20,71),v(-6,-20,61)],[v(27,20,71),v(-6,20,61)]);
  // Only unloaded background treads; active contact steps above remain authoritative.
  for(let k=0;k<4;k++){const x=-18+16*k,z=2+8*k;fixtures.push([v(x,-26,z),v(x+12,-26,z),v(x+12,-26,z+8)]);}
 }
 const legs=ankles.map((p,i)=>{const root=add(hip,v(0,i?8:-8,0));return {hip:root,knee:bendJoint(root,p,28,28,v(1,0,0)),ankle:p};});
 const arms=hands.map((hand,i)=>{const shoulder=add(shoulderCenter,v(0,i?10:-10,0));return {shoulder,hand,elbow:bendJoint(shoulder,hand,19,19,id==='rower'?v(-1,(i?1:-1)*.3,-.4):v(1,i?1:-1,0))};});
 const slope=mechanism.slope||0,feet=ankles.map(p=>({ankle:p,heel:v(p.x-4,p.y,p.z-2-4*slope),toe:v(p.x+5,p.y,p.z-2+5*slope)}));
 return {id,size,hip,shoulderCenter,head:add(shoulderCenter,v(0,0,14)),legs,arms,feet,soles:[],fixtures,fixtureStyle:id==='bike'?{width:1.9,opacity:.7}:['elliptical','rower','stairs','treadmill','inclineWalk'].includes(id)?{width:2.4,opacity:.85}:undefined,bench:null,equipment:{type:'machine',lines,rollers,grips:hands},supports,mechanism,camera:{yaw:.45,elevation:.2,offsetY:148}};
}
const make=(id,label,source,movement)=>Object.freeze({id,label,duration:id==='rower'?6:4,stillAt:1,loop:true,viewBox:'-5 -10 215 190',sample:t=>sample(id,t),source,view:'器械独立轨迹 · 腿部比例强调',support:'支撑按跑带/踏板/固定鞍把/滑座与脚蹬区分。',movement});
export const CARDIO_MACHINE_CLIPS=Object.freeze({
 treadmill:make('treadmill','跑步机','https://health.clevelandclinic.org/treadmill-or-elliptical-how-to-decide-whats-your-best-workout','跑步周期含腾空，支撑期足线随带向后，摆动期离带前移；参考确认电机带走跑，不验证本图步态相位/尺寸。'),
 inclineWalk:make('inclineWalk','坡度快走','https://health.clevelandclinic.org/12-3-30-workout','12%坡面快走，始终至少一脚支撑，无跑步腾空；参考支持自然摆臂，12%为示例非默认训练处方。'),
 bike:make('bike','动感单车','https://health.clevelandclinic.org/benefits-of-cycling','固定鞍把，双脚踏板半径12反相圆周；参考支持室内单车座把踏板调整，不验证绘图半径/膝角。'),
 elliptical:make('elliptical','椭圆机','https://health.clevelandclinic.org/elliptical-machine-benefits','双脚保持踏板，反相椭圆与往复手柄；参考支持踏板/手柄机械关系，不验证具体相位/尺寸。'),
 rower:make('rower','划船机','https://www.concept2.com/training/rowing-technique','固定脚蹬和绳出口，腿驱滑座→躯干→手拉，回程手→躯干→腿；阶段连续混合示意。'),
 stairs:make('stairs','爬楼机','https://health.clevelandclinic.org/stairmaster-benefits-and-workouts','交替踩循环踏级；参考支持台阶下行、人向上攀与扶栏稳定，不验证具体落脚膝角；厂家机械来源见文档。仅画工作区两级。'),
});
