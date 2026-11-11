import {v,add,mul,bendJoint} from './candidate-clips.js';
const size=Object.freeze({upperArm:25,forearm:23,thigh:23,shin:23,headRadius:9});
const phase=t=>(1-Math.cos(2*Math.PI*t/4))/2;
const weight=(center,half)=>({center,axis:v(0,1,0),ends:[-half,half].map(y=>add(center,v(0,y,0))),plates:[-half+1,half-1].map(y=>add(center,v(0,y,0)))});
export const CHEST_VARIANTS=Object.freeze({
 dumbbellBench:{angle:0,kind:'dumbbells'},inclineDumbbellBench:{angle:Math.PI/6,kind:'dumbbells'},
 inclineBarbellBench:{angle:Math.PI/6,kind:'barbell'},closeBench:{angle:0,kind:'barbell',close:true},
 smithBench:{angle:0,kind:'barbell',smith:true},singleDumbbellBench:{angle:0,kind:'dumbbells',single:true},
});
function sample(id,q){
 const variant=CHEST_VARIANTS[id],a=variant.angle,axis=v(Math.cos(a),0,-Math.sin(a)),normal=v(Math.sin(a),0,Math.cos(a));
 const hip=v(8,0,32),shoulderCenter=add(hip,mul(axis,-32)),head=add(add(hip,mul(axis,-49)),mul(normal,1));
 const contact=p=>add(p,mul(normal,-9));
 const brace=add(hip,v(0,-12,0));
 const grip=variant.close?13:24;
 const x=shoulderCenter.x+(variant.smith?10:5+8*q);
 const height=shoulderCenter.z+43-33*q;
 const center=v(x,0,height);
 const arms=[-1,1].map(side=>{
  const shoulder=add(shoulderCenter,v(0,side*12,0));
  const hand=variant.single&&side<0?brace:v(x,side*(variant.kind==='dumbbells'?20+4*q:grip),height);
  const hint=variant.single&&side<0?v(1,-1,0):v(variant.close?1:.75,side*(variant.close?.25:1),-.9*q);
  return {shoulder,hand,elbow:bendJoint(shoulder,hand,25,23,hint)};
 });
 const legs=[-1,1].map(side=>{const root=add(hip,v(0,side*7,0)),ankle=v(36,side*16,2);return {hip:root,knee:bendJoint(root,ankle,23,23,v(1,side*.1,0)),ankle};});
 const soles=legs.map(l=>[v(l.ankle.x-3,l.ankle.y-3,0),v(l.ankle.x-3,l.ankle.y+3,0),v(l.ankle.x+9,l.ankle.y+3,0),v(l.ankle.x+9,l.ankle.y-3,0)]);
 const backStart=contact(add(hip,mul(axis,-60))),backEnd=contact(hip);
 const fixtures=[[backStart,backEnd],[backEnd,add(backEnd,v(12,0,0))],[backStart,v(backStart.x,0,0)],[backEnd,v(backEnd.x,0,0)]];
 const rails=variant.smith?[-38,38].map(y=>[v(x,y,15),v(x,y,95)]):[];fixtures.push(...rails);
 const active=variant.single?[arms[1]]:arms;
 const equipment=variant.kind==='dumbbells'?{type:'dumbbells',weights:active.map(arm=>weight(arm.hand,6)),grips:active.map(arm=>arm.hand)}:
  {...weight(center,38),type:'barbell',grips:arms.map(arm=>arm.hand)};
 return {id,size,hip,shoulderCenter,head,arms,legs,soles,fixtures,fixtureStyle:(variant.smith||variant.single||variant.close)?{width:2.4,opacity:.85}:undefined,bench:null,equipment,rails,variant,
  camera:{yaw:.48,elevation:.5,offsetY:139},supports:{seat:contact(hip),back:contact(shoulderCenter),head:contact(head),ankles:legs.map(l=>l.ankle),soles,...(variant.single?{brace}:{})},benchPlane:{origin:contact(hip),normal,axis}};
}
const make=(id,label,slug,movement)=>Object.freeze({id,label,duration:4,stillAt:2,loop:true,viewBox:'15 15 175 160',sample:t=>sample(id,phase(t)),source:`https://www.strengthlog.com/${slug}/`,
 view:CHEST_VARIANTS[id].angle?'30°上斜凳 · 三分之四':'水平凳 · 三分之四',support:'凳面、头背与骨盆接触及双脚固定；上肢比例突出，骨长固定。',movement});
export const CHEST_CLIPS=Object.freeze({
 dumbbellBench:make('dumbbellBench','哑铃卧推','dumbbell-chest-press','两件独立哑铃落至胸侧，推起时握距略收；肘朝外及脚端，掌面在线稿中不可见。'),
 inclineDumbbellBench:make('inclineDumbbellBench','上斜哑铃卧推','dumbbell-incline-press','30°斜凳与身体接触一致，两件独立哑铃向上推，非将平卧人物整幅旋转。'),
 inclineBarbellBench:make('inclineBarbellBench','上斜杠铃卧推','incline-bench-press','30°斜凳，单根长杠双握点落向上胸再推起；掌面与个体握姿差异未绘制。'),
 closeBench:make('closeBench','窄距卧推','close-grip-bench-press','肩宽握距26绘图单位，肘朝脚端且较贴身；单长杠落至较低胸部，不同于宽握版。'),
 smithBench:make('smithBench','史密斯卧推','smith-machine-bench-press','两条世界固定竖直导轨，长杠端沿轨升降；选择竖直导轨型号，不模拟倾斜型号。'),
 singleDumbbellBench:make('singleDumbbellBench','单臂哑铃卧推','dumbbell-chest-press','仅右侧哑铃运动，左手固定于腹侧，骨盆不旋转；单臂稳定手依据catalog，外部参考仅为通用哑铃卧推。'),
});
