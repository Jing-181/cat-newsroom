import {v,add,mul,sub,length,bendJoint} from './candidate-clips.js';
const size=Object.freeze({upperArm:21,forearm:21,thigh:27,shin:27,headRadius:8});
const smooth=x=>x*x*(3-2*x),phase=t=>(1-Math.cos(2*Math.PI*t/4))/2;
function groundRun(time,slope){
 const t=((time%4)+4)%4,u=t/4,travel=32*u,duty=.4;
 const states=[0,.5].map((offset,i)=>{const p=(u+offset)%1,n=Math.floor(u+offset),anchor=32*(n-offset)+9;
 if(p<duty)return {ankle:v(anchor,i?10:-10,2+slope*anchor),stance:true};
 const k=(p-duty)/(1-duty),x=anchor+32*smooth(k);return {ankle:v(x,i?10:-10,2+slope*x+10*Math.sin(Math.PI*k)**2),stance:false};});
 // Different wrapped world translations are removed by the following camera.
 const hip=v(travel,0,47+slope*travel+2*Math.sin(4*Math.PI*u)**2);
 return {hip,states,travel,slope};
}
function sample(id,time){
 const t=((time%4)+4)%4,q=phase(t),a=2*Math.PI*t/4,run=id==='run'||id==='trail',swim=id==='swim';
 let hip,shoulderCenter,head,legs,arms,feet,fixtures=[],equipment={type:'machine',lines:[],rollers:[],grips:[]},supports={},camera={yaw:.5,elevation:.18,offsetY:146},mechanism={};
 if(run){
  const slope=id==='trail'?.08:0,g=groundRun(t,slope);hip=g.hip;shoulderCenter=add(hip,v(id==='trail'?7:3,0,26));head=add(shoulderCenter,v(0,0,14));
  legs=g.states.map((state,i)=>{const root=add(hip,v(0,i?8:-8,0));return {hip:root,knee:bendJoint(root,state.ankle,27,27,v(1,0,0)),ankle:state.ankle};});
  arms=[-1,1].map((side,i)=>{const shoulder=add(shoulderCenter,v(0,side*10,0)),swing=.6*Math.sin(a+i*Math.PI),elbow=add(shoulder,v(21*Math.sin(swing),0,-21*Math.cos(swing))),hand=add(elbow,v(21*Math.cos(swing),0,21*Math.sin(swing)));return {shoulder,elbow,hand};});
  feet=legs.map(l=>({ankle:l.ankle,heel:add(l.ankle,v(-3,0,-2-3*slope)),toe:add(l.ankle,v(7,0,-2+7*slope))}));
  fixtures=[[v(g.travel-38,-20,slope*(g.travel-38)),v(g.travel+45,-20,slope*(g.travel+45))],[v(g.travel-38,20,slope*(g.travel-38)),v(g.travel+45,20,slope*(g.travel+45))]];
  camera.offsetX=100-g.travel*Math.cos(.5);camera.offsetY=146-g.travel*Math.sin(.5)*Math.sin(.18)+slope*g.travel*Math.cos(.18);
  supports={stance:g.states.map(s=>s.stance),anchors:g.states.map(s=>s.stance?s.ankle:null)};mechanism={travel:g.travel,slope};
 }else if(swim){
  hip=v(15,0,34);shoulderCenter=v(-15,0,34);head=v(-29,0,35);
  arms=[-1,1].map((side,i)=>{
   const p=(a+i*Math.PI)%(2*Math.PI),recovery=p<Math.PI;
   // Exit near thigh -> high elbow bent recovery -> forward entry; then underwater pull.
   const bend=(recovery?1.5:.7)*Math.sin(p)**2;
   const elbow=add(add(shoulderCenter,v(0,side*10,0)),v(21*Math.cos(p),0,21*Math.sin(p)));
   const shoulder=add(shoulderCenter,v(0,side*10,0));
   const hand=add(elbow,v(21*Math.cos(p+bend),0,21*Math.sin(p+bend)));
   return {shoulder,elbow,hand,recovery,elbowFlexion:bend};
  });
  camera={yaw:.65,elevation:.4,offsetY:146};
  legs=[-1,1].map((side,i)=>{const root=add(hip,v(0,side*7,0)),kick=.16*Math.sin(2*a+i*Math.PI),knee=add(root,v(27*Math.cos(kick),0,27*Math.sin(kick))),ankle=add(knee,v(27*Math.cos(kick+.08),0,27*Math.sin(kick+.08)));return {hip:root,knee,ankle};});
  fixtures=[[v(-72,-22,34),v(80,-22,34)],[v(-72,22,34),v(80,22,34)]];supports={waterLevel:34};mechanism={stroke:'freestyle',armPhase:a,kickPhase:2*a};
 }else{
  const jump=id==='jump',stretch=id==='stretch';
  const rise=jump?7*Math.max(0,Math.sin(a))**2:0;
  hip=v(0,0,stretch?Math.sqrt(54**2-20**2-2**2)+2:46+rise);shoulderCenter=add(hip,v(stretch?12:3,0,26));head=add(shoulderCenter,v(0,0,14));
  const ankles=stretch?[v(-20,-10,2),v(6,10,2)]:[v(-7,-11,2+rise),v(7,11,2+rise)];
  if(id==='badminton'){hip=v(3*Math.sin(a)**2,0,43+3*q);shoulderCenter=add(hip,v(0,0,27));head=add(shoulderCenter,v(0,0,14));}
  legs=ankles.map((ankle,i)=>{const root=add(hip,v(0,i?8:-8,0));return {hip:root,knee:stretch&&i===0?mul(add(root,ankle),.5):bendJoint(root,ankle,27,27,v(1,0,0)),ankle};});
  arms=[-1,1].map((side,i)=>{const shoulder=add(shoulderCenter,v(0,side*10,0));let hand;
   if(stretch)hand=v(34,side*13,63);
   else if(jump)hand=v(6,side*20,56);
   else if(i===1){const p=-.9+2.3*q;hand=add(shoulderCenter,v(25*Math.sin(p),22,8+24*Math.cos(p)));}
   else hand=add(shoulderCenter,v(15,-14,-9));
   return {shoulder,hand,elbow:bendJoint(shoulder,hand,21,21,v(1,side,0))};
  });
  if(stretch){
   // Flat wall cross-line passes through both real hand contacts; no volume panel.
   fixtures=[[v(34,-25,0),v(34,-25,103)],[v(34,25,0),v(34,25,103)],[v(34,-25,63),v(34,25,63)],[v(-28,-20,0),v(32,-20,0)]];
   feet=legs.map(l=>({ankle:l.ankle,heel:v(l.ankle.x-3,l.ankle.y,0),toe:v(l.ankle.x+7,l.ankle.y,0)}));
   supports={feet:feet.map(f=>f.heel),hands:arms.map(arm=>arm.hand),wallX:34};
  }
  else if(jump){
   const left=arms[0].hand,right=arms[1].hand,rope=Array.from({length:65},(_,i)=>{const u=i/64;return v(left.x+55*Math.sin(Math.PI*u)*Math.cos(a),left.y+(right.y-left.y)*u,left.z-55*Math.sin(Math.PI*u)*Math.sin(a));});
   equipment={type:'machine',lines:[rope],rollers:[],grips:arms.map(arm=>arm.hand),rope};supports={stance:rise<1e-8};mechanism={rise,ropePhase:a};
  }else{
   const hand=arms[1].hand,p=-.9+2.3*q,axis=v(Math.sin(p),0,Math.cos(p)),center=add(hand,mul(axis,20)),across=v(Math.cos(p),0,-Math.sin(p));
   const rim=Array.from({length:33},(_,i)=>{const phi=i/32*Math.PI*2;return add(center,add(mul(axis,8*Math.cos(phi)),mul(across,5*Math.sin(phi))));});
   equipment={type:'machine',lines:[[hand,add(center,mul(axis,-8))],rim,[add(center,mul(axis,-8)),add(center,mul(axis,8))],[add(center,mul(across,-5)),add(center,mul(across,5))]],rollers:[],grips:[hand],racket:{center,axis,faceNormal:v(0,1,0)}};supports={feet:ankles};mechanism={scope:'right-handed forehand overhead rehearsal',phase:q};
  }
 }
 if(!feet)feet=legs.map(l=>({ankle:l.ankle,heel:l.ankle,toe:add(l.ankle,v(6,0,0))}));
 return {id,size,hip,shoulderCenter,head,legs,arms,feet,soles:[],fixtures,bench:null,equipment,supports,mechanism,camera};
}
// Sources read by the parent-session reference worker; general guidance does not validate drawing dimensions.
const references = {
 run: ['https://health.clevelandclinic.org/perfect-your-running-gait-to-avoid-injury-improve-your-time', '一般协调与个体差异，不验证本图步幅。'],
 trail: ['https://runnersconnect.net/hill-running-form/', '教练媒体上坡姿态原则，不验证8%坡或复杂越野。'],
 jump: ['https://health.clevelandclinic.org/jump-rope-benefits', '基本跳绳/轻落地原则，不验证本图具体节奏。'],
 swim: ['https://www.swimming.org/justswim/tips-for-getting-front-crawl-right/', '自由泳基本臂腿配合；示范未含呼吸与滚转。'],
 stretch: ['https://www.acefitness.org/resources/everyone/exercise-library/152/standing-dorsi-flexion-calf-stretch/', '扶墙小腿拉伸原则，不能扩大为全部恢复动作。'],
};
const make=(id,label,movement,supportType='exact')=>Object.freeze({id,label,duration:4,stillAt:id==='jump'?1:2,loop:true,staticHold:id==='stretch',viewBox:'-15 -20 245 200',sample:t=>sample(id,t),source:references[id]?.[0]||'',referenceStatus:references[id]?'parent-verified-general-guidance':'pending',supportType,view:'单线具体变式',support:'支撑/相位按具体变式定义；非整个运动项目的完整教学。',movement:movement+(references[id]?` 参考范围：${references[id][1]}`:' 外部对应正文仍待核实。')});
export const OUTDOOR_CLIPS=Object.freeze({
 run:make('run','户外跑 · 平地小步','交替支撑/腾空，世界植地脚固定，相机跟随前进回环；平整路线示意。'),
 trail:make('trail','越野跑 · 缓坡小步','选8%连续缓坡，落脚点与坡面一致，短步轻前倾，无障碍跳跃；不涵盖复杂越野地形。','simplified'),
 jump:make('jump','跳绳 · 双脚基本跳','单根绳由固定手旁握点连续旋转，绳到脚下时双脚离地；非交叉/双摇花式。'),
 badminton:make('badminton','羽毛球 · 右手正手头顶挥拍','只示范无球基础头顶挥拍准备→伸展→回位，双脚重心变化与球拍面方向标记；掌面不可见，不涵盖完整高远球落点或整项运动。','simplified'),
 swim:make('swim','游泳 · 自由泳基础示意','水平体位双臂交替水下划水与屈肘高肘回臂、交替打腿与水面线；不演示完整换气、身体滚转、转身或所有泳姿。','simplified'),
 stretch:make('stretch','恢复 · 扶墙小腿静态拉伸','仅选后腿脚跟落地扶墙小腿拉伸，静态保持；不涵盖全部拉伸或泡沫轴项目。','simplified'),
});
