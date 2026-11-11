import {v,add,mul,bendJoint} from './candidate-clips.js';
const size=Object.freeze({upperArm:23,forearm:22,thigh:23,shin:23,headRadius:9});
const phase=t=>(1-Math.cos(2*Math.PI*t/4))/2;
export const FLY_VARIANTS=Object.freeze({machineFlat:{mode:'press',tilt:0},machineIncline:{mode:'press',tilt:Math.PI/6},machineDecline:{mode:'press',tilt:-Math.PI/9},dumbbellFly:{mode:'fly',incline:0},inclineFly:{mode:'fly',incline:Math.PI/6},pecDeck:{mode:'pec'},cableHigh:{mode:'cable',level:1},cableMid:{mode:'cable',level:0},cableLow:{mode:'cable',level:-1}});
function sample(id,q){
 const variant=FLY_VARIANTS[id],lying=variant.mode==='fly',standing=variant.mode==='cable';
 const a=variant.incline||0,axis=v(Math.cos(a),0,-Math.sin(a)),normal=v(Math.sin(a),0,Math.cos(a));
 const hip=v(0,0,standing?44:28);
 const tilt=variant.tilt||0;
 const shoulderCenter=lying?add(hip,mul(axis,-30)):add(hip,v(-25*Math.sin(tilt),0,25*Math.cos(tilt)));
 const head=lying?add(shoulderCenter,mul(axis,-15)):add(shoulderCenter,v(0,0,14));
 const legs=[-1,1].map(side=>{const root=add(hip,v(0,side*7,0)),ankle=v(standing?(side<0?-8:8):26,side*13,2);return {hip:root,knee:bendJoint(root,ankle,23,23,v(1,0,0)),ankle};});
 const soles=legs.map(l=>[v(l.ankle.x-3,l.ankle.y-3,0),v(l.ankle.x-3,l.ankle.y+3,0),v(l.ankle.x+8,l.ankle.y+3,0),v(l.ankle.x+8,l.ankle.y-3,0)]);
 const press=variant.mode==='press';
 const arms=[-1,1].map(side=>{
  const shoulder=add(shoulderCenter,v(0,side*12,0));
  if(press){const hand=add(shoulderCenter,v((12+29*q)*Math.cos(tilt),side*19,(12+29*q)*Math.sin(tilt)));return {shoulder,hand,elbow:bendJoint(shoulder,hand,23,22,v(-.2,side,-1))};}
  const angle=(75-72*q)*Math.PI/180,bend=16*Math.PI/180;
  const elevation=standing?variant.level*(18-36*q)*Math.PI/180:0;
  const forward=lying?normal:v(Math.cos(elevation),0,Math.sin(elevation));
  const across=v(0,side,0);
  const upper=add(mul(forward,Math.cos(angle)),mul(across,Math.sin(angle)));
  const fore=add(mul(forward,Math.cos(angle-bend)),mul(across,Math.sin(angle-bend)));
  const elbow=add(shoulder,mul(upper,23)),hand=add(elbow,mul(fore,22));
  return {shoulder,elbow,hand};
 });
 const fixtures=[];
 if(!standing){if(lying){const p=add(hip,mul(normal,-4));fixtures.push([add(p,mul(axis,-48)),add(p,mul(axis,12))],[p,v(p.x,0,0)]);}else fixtures.push([v(-8,0,28),v(14,0,28)],[hip,shoulderCenter],[v(-5,0,28),v(-5,0,0)]);}
 if(id==='inclineFly'){
  const base=add(hip,mul(normal,-4)),top=add(base,mul(axis,-45));
  fixtures.push([top,v(top.x,0,0)],[v(top.x-5,0,0),v(18,0,0)]);
 }
 let equipment;
 if(lying)equipment={type:'dumbbells',grips:arms.map(a=>a.hand),weights:arms.map(arm=>({center:arm.hand,ends:[add(arm.hand,mul(axis,-6)),add(arm.hand,mul(axis,6))],plates:[add(arm.hand,mul(axis,-5)),add(arm.hand,mul(axis,5))]}))};
 else if(standing){const anchors=[-1,1].map(side=>v(-15,side*65,variant.level===1?103:variant.level===-1?10:69));equipment={type:'dualCable',anchors,cables:arms.map((a,i)=>[anchors[i],a.hand]),grips:arms.map(a=>a.hand)};}
 else if(press){const guides=arms.map((arm,i)=>{const side=i?1:-1;return [add(shoulderCenter,v(12*Math.cos(tilt),side*19,12*Math.sin(tilt))),add(shoulderCenter,v(41*Math.cos(tilt),side*19,41*Math.sin(tilt)))];});fixtures.push(...guides);equipment={type:'machine',lines:arms.map(arm=>[add(arm.hand,v(0,0,-4)),add(arm.hand,v(0,0,4))]),rollers:[],guides,grips:arms.map(a=>a.hand)};}
 else {const pivots=arms.map(a=>add(a.shoulder,v(0,0,12)));fixtures.push(...pivots.map(p=>[add(p,v(0,0,-40)),p]));equipment={type:'machine',lines:arms.flatMap((arm,i)=>[[pivots[i],arm.hand],[arm.elbow,arm.hand]]),rollers:arms.map(a=>({center:a.elbow,radius:2})),pivots,grips:arms.map(a=>a.hand)};}
 return {id,size,hip,shoulderCenter,head,arms,legs,soles,fixtures,fixtureStyle:id==='inclineFly'?{width:2.4,opacity:.85}:undefined,bench:null,equipment,variant,camera:{yaw:lying?.55:1.1,elevation:.2,offsetY:146},supports:{hip,back:shoulderCenter,ankles:legs.map(l=>l.ankle),soles}};
}
const make=(id,label,slug,movement)=>Object.freeze({id,label,duration:4,stillAt:2,loop:true,viewBox:'5 5 195 170',sample:t=>sample(id,phase(t)),source:`https://www.strengthlog.com/${slug}/`,view:'三分之四 · 固定比例上肢',support:'固定双脚与骨盆；坐/卧姿保持座背接触，绳索版前后站立。',movement});
export const FLY_CLIPS=Object.freeze({
 machineFlat:make('machineFlat','水平推胸机','machine-chest-press','固定座背与水平导向手柄，屈伸肘向前推；简化直线导向型号。'),
 machineIncline:make('machineIncline','上斜推胸机','machine-chest-press','靠背后倾30°，手柄沿前上30°导向移动；型号角度按catalog示意，外部仅通用推胸机。'),
 machineDecline:make('machineDecline','下斜推胸机','machine-chest-press','座背前倾20°示意下斜推向，手柄沿前下20°导向；非特定厂商机器复刻。'),
 dumbbellFly:make('dumbbellFly','哑铃飞鸟','dumbbell-chest-fly','水平仰卧，16°微屈肘固定，通过肩内收合拢两件独立哑铃，不用卧推屈肘轨迹。'),
 inclineFly:make('inclineFly','上斜哑铃飞鸟','dumbbell-chest-fly','真实30°斜凳与仰卧轴，固定肘角绕肩内收；上斜角度依catalog，参考为通用飞鸟。'),
 pecDeck:make('pecDeck','蝴蝶机夹胸','pec-deck','固定座靠、双侧枢轴/臂垫与手柄内收；选择微屈手柄型，非90°屈肘垫式。'),
 cableHigh:make('cableHigh','高位绳索夹胸','standing-cable-chest-fly','高位固定滑轮，双手从较高侧方沿弧向前下合拢，肘角固定。'),
 cableMid:make('cableMid','中位绳索夹胸','standing-cable-chest-fly','中位固定滑轮，双手水平内收，肘角固定。'),
 cableLow:make('cableLow','低位绳索夹胸','standing-cable-chest-fly','低位固定滑轮，双手由低向前上合拢，肘角固定。'),
});
