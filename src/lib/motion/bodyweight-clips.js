import {v,add,mul,bendJoint} from './candidate-clips.js';
const size=Object.freeze({upperArm:20,forearm:20,thigh:25,shin:25,headRadius:8});
const cycle=t=>(1-Math.cos(2*Math.PI*t/4))/2;
function sample(id,t){
 const hold=['plank','sidePlank','copenhagen'].includes(id),q=hold?0:cycle(t),side=id==='sidePlank'||id==='copenhagen';
 let hip,shoulderCenter,head,arms,legs,supports;const fixtures=[];
 if(id==='deadBug'||id==='birdDog'){
  const bird=id==='birdDog',half=Math.floor(((t%8)+8)%8/4),amount=cycle(t),activeArm=half,activeLeg=1-half;
  hip=v(20,0,bird?25:4);shoulderCenter=v(-10,0,bird?38:4);head=add(shoulderCenter,v(-14,0,bird?1:5));
  arms=[-1,1].map((s,i)=>{const shoulder=add(shoulderCenter,v(0,s*9,0)),a=i===activeArm?amount:0;
   if(bird){const hand=add(shoulder,v(-38*a,0,-38*(1-a)));return {shoulder,hand,elbow:bendJoint(shoulder,hand,20,20,v(0,s,0))};}
   const angle=a*1.35,elbow=add(shoulder,v(-20*Math.sin(angle),0,20*Math.cos(angle)));return {shoulder,elbow,hand:add(elbow,v(-20*Math.sin(angle),0,20*Math.cos(angle)))};
  });
  legs=[-1,1].map((s,i)=>{const root=add(hip,v(0,s*9,0)),a=i===activeLeg?amount:0;
   if(bird){const angle=a*Math.PI/2,knee=add(root,v(25*Math.sin(angle),0,-25*Math.cos(angle))),ankle=add(knee,v(25,0,0));return {hip:root,knee,ankle};}
   const angle=a*1.35,knee=add(root,v(25*Math.sin(angle),0,25*Math.cos(angle))),ankle=add(knee,v(25*Math.cos(.2*a),0,-25*Math.sin(.2*a)));return {hip:root,knee,ankle};
  });
  supports=bird?{hand:arms[1-activeArm].hand,knee:legs[1-activeLeg].knee,activeArm,activeLeg}:{back:shoulderCenter,pelvis:hip,activeArm,activeLeg};
 }else if(id==='dips'){
  shoulderCenter=v(0,0,92-20*q);hip=v(0,0,62-20*q);head=add(shoulderCenter,v(0,0,14));
  arms=[-1,1].map(s=>{const shoulder=add(shoulderCenter,v(0,s*10,0)),hand=v(0,s*18,55);return {shoulder,hand,elbow:bendJoint(shoulder,hand,20,20,v(-1,s*.2,0))};});
  legs=[-1,1].map(s=>{const root=add(hip,v(0,s*8,0)),knee=add(root,v(-7,0,-24)),ankle=add(knee,v(-24,0,-7));return {hip:root,knee,ankle};});
  fixtures.push([v(-24,-18,55),v(24,-18,55)],[v(-24,18,55),v(24,18,55)]);supports={hands:arms.map(a=>a.hand)};
 }else{
  const row=id==='invertedRow',copenhagen=id==='copenhagen';
  const theta=side?(copenhagen?Math.asin(4/80):Math.asin(21/80)):id==='plank'?Math.asin(18/80):row?.12+.23*q:.43-.25*q;
  const foot=v(45,0,copenhagen?20:side?3:2),axis=v(-Math.cos(theta),0,Math.sin(theta));
  hip=add(foot,mul(axis,50));shoulderCenter=add(foot,mul(axis,80));head=add(shoulderCenter,mul(axis,13));
  legs=[-1,1].map((s,i)=>{const offset=side?v(0,0,s*3):v(0,s*8,0),root=add(hip,offset),knee=add(root,mul(axis,-25)),ankle=add(foot,offset);
   if(copenhagen&&i===0){const k=add(root,v(22,0,-Math.sqrt(25**2-22**2))),a=add(k,v(24,0,-7));return {hip:root,knee:k,ankle:a};}return {hip:root,knee,ankle};});
  arms=[-1,1].map((s,i)=>{const shoulder=add(shoulderCenter,side?v(0,0,s*4):v(0,s*10,0));
   if(side&&i===1){const elbow=add(shoulder,v(0,0,20));return {shoulder,elbow,hand:add(elbow,v(0,0,20))};}
   if(hold){const elbow=add(shoulder,v(0,0,-20)),hand=add(elbow,v(-20,0,0));return {shoulder,elbow,hand};}
   const hand=row?v(-33,s*13,48):v(-30,s*13,0);return {shoulder,hand,elbow:bendJoint(shoulder,hand,20,20,v(1,s*.4,0))};
  });
  if(row)fixtures.push([v(-33,-28,48),v(-33,28,48)],[v(-33,-28,48),v(-33,-28,0)],[v(-33,28,48),v(-33,28,0)],[v(-40,-28,0),v(55,-28,0)]);
  if(copenhagen)fixtures.push([v(36,-12,23),v(56,-12,23)],[v(36,12,23),v(56,12,23)],[v(36,-12,23),v(36,12,23)],[v(56,-12,23),v(56,12,23)],[v(38,-12,23),v(38,-12,0)],[v(54,12,23),v(54,12,0)],[v(30,-18,0),v(62,-18,0)]);
  supports=hold?{forearm:[arms[0].elbow,arms[0].hand],feet:copenhagen?[legs[1].ankle]:legs.map(l=>l.ankle)}:{hands:arms.map(a=>a.hand),feet:legs.map(l=>l.ankle)};
 }
 const feet=legs.map(l=>{
  const ground=['pushUp','plank','invertedRow'].includes(id);
  const contact=ground?v(l.ankle.x,l.ankle.y,0):l.ankle;
  return {ankle:l.ankle,heel:contact,toe:add(contact,v(6,0,0))};
 });
 return {id,size,hip,shoulderCenter,head,arms,legs,feet,soles:[],fixtures,bench:null,equipment:{type:'machine',lines:[],rollers:[],grips:[]},supports,fixtureStyle:['invertedRow','copenhagen'].includes(id)?{width:2.4,opacity:.85}:undefined,staticHold:hold,camera:{yaw:side?.25:.45,elevation:.18,offsetY:145}};
}
const make=(id,label,url,movement)=>Object.freeze({id,label,duration:['deadBug','birdDog'].includes(id)?8:4,stillAt:2,loop:true,staticHold:['plank','sidePlank','copenhagen'].includes(id),viewBox:'-15 -15 215 190',sample:t=>sample(id,t),source:url,view:'体位独立建模 · 空心圆单线',support:'按动作设置手足、前臂、杠或凳面支撑。',movement});
const url=slug=>`https://www.strengthlog.com/${slug}/`;
export const BODYWEIGHT_CLIPS=Object.freeze({
 pushUp:make('pushUp','俯卧撑',url('push-up'),'固定双手与双脚，肩髋脚保持刚性直链，屈伸肘上下运动。'),
 plank:make('plank','前臂平板',url('plank'),'静态保持，无假重复；双前臂与脚支撑。'),
 sidePlank:make('sidePlank','侧平板',url('side-plank'),'静态侧支撑，下面前臂与脚外侧承重，上手上举。'),
 copenhagen:make('copenhagen','哥本哈根平板',url('copenhagen-plank'),'选择上腿脚踝凳面长杠杆静态版，下腿屈曲悬空，非动态抬髋。'),
 dips:make('dips','双杠臂屈伸',url('bar-dip'),'双杠握点世界固定，身体垂直升降，肘向后，腿屈曲悬空。'),
 invertedRow:make('invertedRow','反向划船',url('inverted-row'),'固定低杠握点和脚跟，身体刚性绕脚跟升降拉向杠。'),
 deadBug:make('deadBug','死虫',url('dead-bugs'),'仰卧骨盆背部固定，对侧手腿交替伸展再收回；非同时四肢摆动。'),
 birdDog:make('birdDog','鸟狗','https://www.acefitness.org/resources/everyone/exercise-library/14/bird-dog/','四点跪姿，对侧手腿交替离地伸展，非活动手膝固定承重，躯干保持稳定。'),
});
