import {v,add,mul,bendJoint} from './candidate-clips.js';
const size=Object.freeze({upperArm:23,forearm:22,thigh:23,shin:23,headRadius:9});
const phase=t=>(1-Math.cos(2*Math.PI*t/4))/2;
const weight=center=>({center,ends:[add(center,v(0,-6,0)),add(center,v(0,6,0))],plates:[add(center,v(0,-5,0)),add(center,v(0,5,0))]});
function sample(id,q){
 const seated=['machineRow','machineShoulder','reversePec'].includes(id),bent=id==='reverseFly';
 const hip=v(bent?-14:0,0,seated?28:44),shoulderCenter=bent?v(16,0,49):add(hip,v(0,0,27));
 const head=add(shoulderCenter,v(0,0,15)),fixtures=[];
 const legs=[-1,1].map(side=>{const root=add(hip,v(0,side*7,0)),ankle=v(seated?24:0,side*12,2);return {hip:root,knee:bendJoint(root,ankle,23,23,v(1,0,0)),ankle};});
 const soles=legs.map(l=>[v(l.ankle.x-3,l.ankle.y-3,0),v(l.ankle.x-3,l.ankle.y+3,0),v(l.ankle.x+8,l.ankle.y+3,0),v(l.ankle.x+8,l.ankle.y-3,0)]);
 if(seated)fixtures.push([v(-6,0,28),v(15,0,28)],[v(-4,0,28),v(-4,0,0)],id==='reversePec'?[v(3,0,36),v(3,0,58)]:[v(-4,0,28),v(-4,0,60)]);
 const brace=v(0,-22,52);
 if(id==='cableLateral')fixtures.push([v(0,-22,0),v(0,-22,85)]);
 const arms=[-1,1].map(side=>{
  const shoulder=add(shoulderCenter,v(0,side*13,id==='shrug'?5*q:0));
  let hand,hint=v(-.5,side,-.2);
  if(id==='machineRow')hand=add(shoulderCenter,v(42-29*q,side*16,-7));
  else if(id==='machineShoulder'){hand=add(shoulderCenter,v(5,side*26,5+36*q));hint=v(.7,side,-.1);}
  else if(id==='facePull'){hand=add(shoulderCenter,v(40-29*q,side*(8+13*q),4+12*q));hint=v(-.2,side,1);}
  else if(id==='shrug'){const elbow=add(shoulder,v(0,0,-23));return {shoulder,elbow,hand:add(elbow,v(0,0,-22))};}
  else if(id==='cableLateral'&&side<0){hand=brace;hint=v(1,-1,0);}
  else {
   const bend=16*Math.PI/180;let upper,fore;
   if(id==='straightPulldown'){const a=(120-105*q)*Math.PI/180;upper=v(Math.sin(a),0,-Math.cos(a));fore=v(Math.sin(a-bend),0,-Math.cos(a-bend));}
   else if(id==='reversePec'){const a=(6+74*q)*Math.PI/180;upper=v(Math.cos(a),side*Math.sin(a),0);fore=v(Math.cos(a-bend),side*Math.sin(a-bend),0);}
   else {const a=(8+82*q)*Math.PI/180;upper=v(0,side*Math.sin(a),-Math.cos(a));fore=v(Math.sin(bend),side*Math.cos(bend)*Math.sin(a),-Math.cos(bend)*Math.cos(a));}
   const elbow=add(shoulder,mul(upper,23));return {shoulder,elbow,hand:add(elbow,mul(fore,22))};
  }
  return {shoulder,hand,elbow:bendJoint(shoulder,hand,23,22,hint)};
 });
 let equipment;
 if(['shrug','reverseFly'].includes(id))equipment={type:'dumbbells',weights:arms.map(a=>weight(a.hand)),grips:arms.map(a=>a.hand)};
 else if(id==='facePull'){
  const pulley=v(65,0,head.z),span=arms[1].hand.y,branchLength=25;
  const junction=v(arms[1].hand.x+Math.sqrt(branchLength**2-span**2),0,arms[1].hand.z);
  equipment={type:'rope',pulley,junction,cable:[pulley,junction],branches:arms.map(a=>[junction,a.hand]),branchLength,grips:arms.map(a=>a.hand)};
 }else if(id==='straightPulldown'||id==='cableLateral'){
  const lateral=id==='cableLateral',pulley=lateral?v(0,-30,5):v(50,0,118),grips=lateral?[arms[1].hand]:arms.map(a=>a.hand),anchor=lateral?arms[1].hand:v(arms[1].hand.x,0,arms[1].hand.z);
  equipment={type:'cableHandle',pulley,anchor,cable:[pulley,anchor],handleLines:lateral?[[add(anchor,v(0,-3,0)),add(anchor,v(0,3,0))]]:[[add(anchor,v(0,-19,0)),add(anchor,v(0,19,0))]],grips};
 }else{
  let guides=[];
  if(id==='machineRow')guides=[-1,1].map(side=>[add(shoulderCenter,v(13,side*16,-7)),add(shoulderCenter,v(42,side*16,-7))]);
  if(id==='machineShoulder')guides=[-1,1].map(side=>[add(shoulderCenter,v(5,side*26,5)),add(shoulderCenter,v(5,side*26,41))]);
  fixtures.push(...guides);
  const pivots=arms.map(a=>add(a.shoulder,v(0,0,10)));
  equipment={type:'machine',lines:arms.map((a,i)=>id==='reversePec'?[pivots[i],a.hand]:[add(a.hand,v(0,0,-3)),add(a.hand,v(0,0,3))]),rollers:[],guides,pivots,grips:arms.map(a=>a.hand)};
 }
 return {id,size,hip,shoulderCenter,head,arms,legs,soles,fixtures,bench:null,equipment,camera:{yaw:id==='reverseFly'?1.05:.8,elevation:.2,offsetY:148},supports:{hip,ankles:legs.map(l=>l.ankle),soles,...(seated?{seat:hip}:{}),...(id==='reversePec'?{chest:v(3,0,53)}:{}),...(id==='cableLateral'?{brace}:{})}};
}
const make=(id,label,slug,movement)=>Object.freeze({id,label,duration:4,stillAt:2,loop:true,viewBox:'0 -5 205 180',sample:t=>sample(id,phase(t)),source:`https://www.strengthlog.com/${slug}/`,view:'固定三分之四 · 上肢比例强调',support:'脚与骨盆稳定；机器固定座靠/胸垫，绳索固定滑轮；单臂侧举另手扶机。',movement});
export const SHOULDER_BACK_CLIPS=Object.freeze({
 machineRow:make('machineRow','器械划船','seated-machine-row','固定座靠与简化水平导向，屈肘拉手柄至体侧；非直臂下压。'),
 straightPulldown:make('straightPulldown','直臂下压','straight-arm-lat-pulldown','16°微屈肘保持不变，以肩为轴将长把由前上方压向大腿，不以屈肘模拟划船。'),
 shrug:make('shrug','哑铃耸肩','dumbbell-shrug','仅肩带垂直升降5绘图单位，双臂下垂不弯举，头和躯干不随之弹跳。'),
 machineShoulder:make('machineShoulder','器械推肩','machine-shoulder-press','固定座背，双手柄沿竖直导向上推；选简化导向型，不代表所有机器结构。'),
 cableLateral:make('cableLateral','绳索侧平举','cable-lateral-raise','低位滑轮固定，右臂向侧方抬起，左手扶机稳定；肘角固定。'),
 reversePec:make('reversePec','反向蝴蝶机','reverse-machine-fly','胸贴固定垫，微屈肘由前方向两侧后展开；机器联动简化。'),
 facePull:make('facePull','面拉','face-pull','额头高度固定滑轮，定长双绳分叉拉至面侧，肘向外且前臂上转；掌面不可见。'),
 reverseFly:make('reverseFly','俯身哑铃飞鸟','reverse-dumbbell-flyes','固定髋铰链俯身躯干，微屈肘随肩向两侧外展，双哑铃独立，无躯干甩动。'),
});
