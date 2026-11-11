import {v,add,mul,bendJoint} from './candidate-clips.js';
const smooth=t=>t*t*(3-2*t),cycle=t=>(1-Math.cos(2*Math.PI*t/4))/2;
const size=Object.freeze({thigh:30,shin:30,upperArm:16,forearm:16,headRadius:9});
function walk(t){
 // Two forward steps, not planted-foot animation. World positions continue across cycles;
 // the camera tracks progression. Translation resets only after both legs advance equally.
 const cycleIndex=Math.floor(t/8),local=((t%8)+8)%8,step=Math.floor(local/4),u=(local%4)/4,base=cycleIndex*40;
 const feet=[v(base-20,-10,2),v(base,10,2)];if(step===1)feet[0].x=base+20;
 const active=step===0?0:1,target=base+(step===0?20:40),start=feet[active].x;
 const lift=u<.35?smooth(u/.35):1;
 feet[active]=v(start+(target-start)*lift,feet[active].y,2+(u<.35?8*Math.sin(Math.PI*lift)**2:0));
 const descend=u<.35?0:u<.65?smooth((u-.35)/.3):1-smooth((u-.65)/.35);
 const pelvisX=base+(step===0?0:20)+20*smooth(u);
 return {feet,hip:v(pelvisX,0,46-12*descend),active,planted:u>=.35,travel:pelvisX};
}
function sample(id,t){
 const q=cycle(t),press=id==='legPress'||id==='singlePress',single=id==='singlePress',walking=id==='walkingLunge';
 let hip,ankles,shoulderCenter,contacts,walkState;
 const fixtures=[],rails=[];
 if(press){hip=v(-20,0,25);ankles=[-1,1].map(side=>v(15+16*q,side*11,46+9*q));if(single)ankles[0]=v(2,-16,2);shoulderCenter=v(-38,0,43);contacts={seat:hip,back:shoulderCenter};fixtures.push([v(-40,0,43),v(-20,0,25),v(-8,0,25)]);}
 else if(id==='bulgarian'){hip=v(0,0,49-17*q);ankles=[v(-30,-10,21),v(23,10,2)];contacts={rear:ankles[0],front:ankles[1]};fixtures.push([v(-39,-10,21),v(-22,-10,21)],[v(-34,-10,21),v(-34,-10,0)]);}
 else if(walking){walkState=walk(t);hip=walkState.hip;ankles=walkState.feet;contacts={phase:walkState.planted?'double':'swing',active:walkState.active,planted:ankles.filter((_,i)=>i!==walkState.active||walkState.planted)};}
 else if(id==='lateralLunge'){const shift=20*Math.sin(Math.PI*t/4)**3;hip=v(-5*Math.abs(shift)/20,shift,48-13*Math.abs(shift)/20);ankles=[v(0,-32,2),v(0,32,2)];contacts={feet:ankles};}
 else{hip=v(-9-10*q,0,56-22*q);ankles=[v(8,-13,2),v(8,13,2)];contacts={feet:ankles};}
 if(!shoulderCenter)shoulderCenter=id==='smithSquat'?v(0,0,hip.z+Math.sqrt(27**2-hip.x**2)):add(hip,v(3,0,Math.sqrt(27**2-9)));
 const head=add(shoulderCenter,v(0,0,14));
 const legs=ankles.map((ankle,i)=>{const root=add(hip,v(0,i?9:-9,0));return {hip:root,knee:bendJoint(root,ankle,30,30,v(1,0,press?1:0)),ankle};});
 const platformNormal=v(16/Math.hypot(16,9),0,9/Math.hypot(16,9));
 const platformTangent=v(-platformNormal.z,0,platformNormal.x);
 const feet=legs.map((l,i)=>{
 if(press&&(!single||i===1)){
  const contact=add(l.ankle,mul(platformNormal,2));
  return {ankle:l.ankle,heel:add(contact,mul(platformTangent,-5.5)),toe:add(contact,mul(platformTangent,5.5)),contact};
 }
 const elevated=id==='bulgarian'&&i===0;const z=elevated?21:l.ankle.z-2;return {ankle:l.ankle,heel:v(l.ankle.x-3,l.ankle.y,z),toe:v(l.ankle.x+8,l.ankle.y,z)};});
 let equipment={type:'machine',lines:[],rollers:[],grips:[]};
 if(press){const center=add(v(15+16*q,0,46+9*q),mul(platformNormal,2));
 const lo=add(center,mul(platformTangent,-9)),hi=add(center,mul(platformTangent,9));
 equipment.lines.push([add(lo,v(0,-23,0)),add(lo,v(0,23,0))],[add(hi,v(0,-23,0)),add(hi,v(0,23,0))],[add(lo,v(0,-23,0)),add(hi,v(0,-23,0))],[add(lo,v(0,23,0)),add(hi,v(0,23,0))]);rails.push([v(15,-24,46),v(31,-24,55)],[v(15,24,46),v(31,24,55)]);fixtures.push(...rails);equipment.platform=center;equipment.platformNormal=platformNormal;equipment.contacts=feet.filter((_,i)=>!single||i===1).map(f=>f.contact);}
 if(id==='smithSquat'){rails.push([v(-3,-35,10),v(-3,-35,95)],[v(-3,35,10),v(-3,35,95)]);fixtures.push(...rails);const center=add(shoulderCenter,v(-3,0,0));equipment={type:'barbell',center,ends:[add(center,v(0,-35,0)),add(center,v(0,35,0))],plates:[add(center,v(0,-32,0)),add(center,v(0,32,0))],grips:[add(center,v(0,-21,0)),add(center,v(0,21,0))]};}
 const arms=[-1,1].map((side,i)=>{const shoulder=add(shoulderCenter,v(0,side*9,0)),hand=id==='smithSquat'?equipment.grips[i]:add(hip,v(8,side*16,8));return {shoulder,hand,elbow:bendJoint(shoulder,hand,16,16,v(1,side,0))};});
 const camera={yaw:id==='lateralLunge'?1.2:.55,elevation:.2,offsetY:148};if(walking)camera.offsetX=100-walkState.travel*Math.cos(camera.yaw),camera.offsetY=148-walkState.travel*Math.sin(camera.yaw)*Math.sin(camera.elevation);
 return {id,size,hip,shoulderCenter,head,legs,arms,feet,soles:[],bench:null,fixtures,rails,equipment,supports:contacts,walkState,camera};
}
const make=(id,label,slug,movement)=>Object.freeze({id,label,duration:['walkingLunge','lateralLunge'].includes(id)?8:4,stillAt:id==='walkingLunge'?2.5:2,loop:true,viewBox:'5 10 190 165',sample:t=>sample(id,t),source:`https://www.strengthlog.com/${slug}/`,view:'三分之四 · 下肢比例强调',support:'支撑依据动作区分：地面/凳面/固定座靠/移动踏板。',movement});
export const COMPOUND_LEG_CLIPS=Object.freeze({
 bulgarian:make('bulgarian','保加利亚分腿蹲','bulgarian-split-squat','自重示范；前脚地面、后脚背凳面固定，屈髋膝下沉。'),
 walkingLunge:make('walkingLunge','行走弓步','dumbbell-walking-lunge','自重示范，两步前行：迈步离地、落地下降、起身换腿。跟随相机回环，不把所有脚永远钉住。'),
 lateralLunge:make('lateralLunge','侧弓步','side-lunges-bodyweight','宽站距固定，额状面左右移重心、屈一侧膝再换边；采用catalog宽站版，不重复侧迈步。'),
 smithSquat:make('smithSquat','史密斯深蹲','smith-machine-squat','双脚略前于杠垂线，单长杠沿固定竖直导轨，髋膝下蹲后站起。'),
 legPress:make('legPress','腿举','leg-press','固定座靠与骨盆，双脚随倾斜轨道踏板运动，屈伸膝推板；选择简化倾斜导轨型号。'),
 singlePress:make('singlePress','单腿腿举','leg-press','右脚与移动踏板接触，左脚固定于底部休息位；单腿要求来自catalog，外部仅通用腿举正文。'),
});
