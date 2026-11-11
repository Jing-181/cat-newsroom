import {v,add,mul,bendJoint} from './candidate-clips.js';
const size=Object.freeze({upperArm:23,forearm:22,thigh:22,shin:22,headRadius:9});
const smooth=t=>t*t*(3-2*t);
const phase=t=>{t=((t%5)+5)%5;return t<1.6?smooth(t/1.6):t<2?1:t<4.7?1-smooth((t-2)/2.7):0;};
const weight=(center,axis,half)=>({center,axis,ends:[-half,half].map(n=>add(center,mul(axis,n))),plates:[-half+1,half-1].map(n=>add(center,mul(axis,n)))});
function sample(kind,q){
 const seated=kind==='dumbbellShoulderPress',press=seated||kind==='strictPress',lateral=kind==='lateralRaise';
 const hip=v(0,0,seated?28:44),shoulderCenter=add(hip,v(0,0,27)),head=add(shoulderCenter,v(0,0,15));
 const legs=[-1,1].map(side=>{const root=add(hip,v(0,side*7,0)),ankle=v(seated?24:0,side*12,2);return {hip:root,knee:bendJoint(root,ankle,22,22,v(1,0,0)),ankle};});
 const soles=legs.map(l=>[v(l.ankle.x-3,l.ankle.y-2,0),v(l.ankle.x-3,l.ankle.y+2,0),v(l.ankle.x+8,l.ankle.y+2,0),v(l.ankle.x+8,l.ankle.y-2,0)]);
 const arms=[-1,1].map(side=>{
  const shoulder=add(shoulderCenter,v(0,side*13,0));
  if(press){
   // The bar stays anterior until above the head, then settles over the support line.
   const hand=seated?add(shoulderCenter,v(4,side*(30-9*q),8+34*q)):
    add(shoulderCenter,v(q<.65?14:14*(1-smooth((q-.65)/.35)),side*23,4+38*q));
   return {shoulder,hand,elbow:bendJoint(shoulder,hand,23,22,v(.65,side,-.2))};
  }
  // A fixed 24-degree elbow bend; rotate both bones together in distinct planes.
  const a=(8+82*q)*Math.PI/180,b=24*Math.PI/180;
  if(lateral){
   const elbow=add(shoulder,v(0,side*23*Math.sin(a),-23*Math.cos(a)));
   const hand=add(elbow,v(22*Math.sin(b),side*22*Math.cos(b)*Math.sin(a),-22*Math.cos(b)*Math.cos(a)));
   return {shoulder,elbow,hand};
  }
  const elbow=add(shoulder,v(23*Math.sin(a),0,-23*Math.cos(a)));
  const hand=add(elbow,v(22*Math.cos(b)*Math.sin(a),side*22*Math.sin(b),-22*Math.cos(b)*Math.cos(a)));
  return {shoulder,elbow,hand};
 });
 let equipment;
 if(kind==='strictPress')equipment={...weight(v(arms[0].hand.x,0,arms[0].hand.z),v(0,1,0),38),grips:arms.map(a=>a.hand),type:'barbell'};
 else equipment={type:'dumbbells',grips:arms.map(a=>a.hand),weights:arms.map(a=>weight(a.hand,lateral?v(1,0,0):v(0,1,0),6))};
 const fixtures=seated?[[v(-7,0,28),v(15,0,28)],[v(-7,0,28),v(-7,0,62)],[v(-5,0,28),v(-5,0,0)],[v(12,0,28),v(12,0,0)]]:[];
 return {id:kind,size,hip,shoulderCenter,head,arms,legs,soles,bench:null,fixtures,equipment,
  camera:{yaw:lateral?1.1:.6,elevation:.2,offsetY:151},supports:{ankles:legs.map(l=>l.ankle),soles,...(seated?{seat:hip}: {})}};
}
const make=(id,label,slug,movement)=>Object.freeze({id,label,duration:5,stillAt:1.8,loop:true,viewBox:'20 20 160 155',sample:t=>sample(id,phase(t)),
 source:`https://www.strengthlog.com/${slug}/`,view:id==='lateralRaise'?'偏正面三分之四 · 向两侧抬举':'三分之四 · 上肢比例强调',
 support:id==='dumbbellShoulderPress'?'采用坐姿版本，凳面/骨盆和双脚固定，背部靠垫。':'站姿双脚固定，骨盆与躯干稳定，不蹬腿借力。',movement});
export const SHOULDER_CLIPS=Object.freeze({
 strictPress:make('strictPress','站姿实力推','overhead-press','单根长杠双握点，从颈前向上推，过头后回到支撑线上；杠轴与双臂避开圆头。'),
 dumbbellShoulderPress:make('dumbbellShoulderPress','哑铃肩推（坐姿示范）','seated-dumbbell-shoulder-press','两件独立哑铃由耳侧向上推，双手保持头部两侧距离，顶端留少量屈肘。'),
 lateralRaise:make('lateralRaise','哑铃侧平举','dumbbell-lateral-raise','上臂在额状面向两侧抬至肩高，肘微屈固定，哑铃分别随手移动。'),
 frontRaise:make('frontRaise','哑铃前平举','dumbbell-front-raise','上臂在矢状面向前抬至肩高，双侧同步，肘微屈固定；不同于向两侧展开。'),
});
