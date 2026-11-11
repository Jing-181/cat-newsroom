import {v,add,mul,bendJoint} from './candidate-clips.js';
const size=Object.freeze({thigh:30,shin:30,upperArm:16,forearm:16,headRadius:9});
const phase=t=>(1-Math.cos(2*Math.PI*t/4))/2;
function sample(id,q){
 let hip,shoulderCenter,legs,feet;const fixtures=[],pads=[],rails=[];let supports={};
 const machine=id==='adduction'||id==='abduction';
 if(machine){hip=v(0,0,34);shoulderCenter=v(0,0,59);const angle=(id==='adduction'?55-45*q:10+45*q)*Math.PI/180;legs=[-1,1].map(side=>{const root=add(hip,v(0,side*7,0)),knee=add(root,v(30*Math.cos(angle),side*30*Math.sin(angle),0)),ankle=add(knee,v(0,0,-30));pads.push({center:add(knee,v(0,side*(id==='adduction'?-3:3),0)),radius:3,contact:knee});return {hip:root,knee,ankle};});fixtures.push([v(-6,0,34),v(24,0,34)],[v(-5,0,34),v(-5,0,64)]);supports={seat:hip,back:shoulderCenter};}
 else if(id==='nordic'){const a=q*.9,u=v(Math.sin(a),0,Math.cos(a));hip=add(v(0,0,3),mul(u,30));shoulderCenter=add(hip,mul(u,27));legs=[-1,1].map(side=>{const knee=v(0,side*10,3),ankle=v(-30,side*10,3);return {hip:add(hip,v(0,side*10,0)),knee,ankle};});supports={knees:legs.map(l=>l.knee),ankles:legs.map(l=>l.ankle)};fixtures.push([v(-35,-20,2),v(8,-20,2)],[v(-30,-20,5),v(-30,20,5)]);}
 else if(id==='backExtension'){hip=v(0,0,47);const a=Math.PI/4+q*.9;shoulderCenter=add(hip,v(27*Math.sin(a),0,27*Math.cos(a)));legs=[-1,1].map(side=>{const root=add(hip,v(0,side*10,0)),ankle=v(-37,side*10,4);return {hip:root,knee:bendJoint(root,ankle,30,30,v(1,0,0)),ankle};});supports={pelvis:hip,ankles:legs.map(l=>l.ankle)};fixtures.push([v(-37,0,0),hip],[v(-7,-20,45),v(-7,20,45)],[v(-37,-20,6),v(-37,20,6)]);}
 else if(id==='thrust'){shoulderCenter=v(-27,0,32);const a=(-35+35*q)*Math.PI/180;hip=add(shoulderCenter,v(27*Math.cos(a),0,27*Math.sin(a)));legs=[-1,1].map(side=>{const root=add(hip,v(0,side*10,0)),ankle=v(38,side*10,2);return {hip:root,knee:bendJoint(root,ankle,30,30,v(0,0,1)),ankle};});supports={upperBack:shoulderCenter,ankles:legs.map(l=>l.ankle)};fixtures.push([v(-35,-22,32),v(-25,22,32)],[v(-30,0,32),v(-30,0,0)]);}
 else if(id==='singleCalf'){const a=(-8+36*q)*Math.PI/180,toe=v(12,10,8),ankle=add(toe,v(-11*Math.cos(a)+3*Math.sin(a),0,11*Math.sin(a)+3*Math.cos(a)));hip=v(ankle.x-3,0,ankle.z+58);shoulderCenter=add(hip,v(0,0,27));legs=[-1,1].map(side=>{const root=add(hip,v(0,side*10,0));if(side>0)return {hip:root,knee:bendJoint(root,ankle,30,30,v(1,0,0)),ankle};const knee=add(root,v(0,0,-30));return {hip:root,knee,ankle:add(knee,v(-24,0,-18))};});feet=legs.map((l,i)=>i?{ankle,heel:add(toe,v(-15*Math.cos(a),0,15*Math.sin(a))),toe}:{ankle:l.ankle,heel:l.ankle,toe:add(l.ankle,v(8,0,0))});supports={forefoot:toe,brace:v(12,-23,82)};fixtures.push([v(12,-23,0),v(12,-23,100)],[v(8,0,8),v(20,20,8)]);}
 else {hip=v(-14+12*q,0,49-20*q);shoulderCenter=add(hip,v(-15,0,22.45));legs=[-1,1].map(side=>{const root=add(hip,v(0,side*10,0)),ankle=v(15,side*12,2);return {hip:root,knee:bendJoint(root,ankle,30,30,v(1,0,0)),ankle};});supports={ankles:legs.map(l=>l.ankle)};rails.push([v(-29,-25,71.45),v(-17,-25,51.45)],[v(-29,25,71.45),v(-17,25,51.45)]);fixtures.push(...rails,[v(6,-25,0),v(24,25,0)]);}
 if(id==='nordic'){
  fixtures.push([v(-30,-20,5),v(-30,-20,0)],[v(-30,20,5),v(-30,20,0)],
   [v(-34,-20,0),v(-26,-20,0)],[v(-34,20,0),v(-26,20,0)]);
  legs.forEach(l=>{const center=add(l.ankle,v(0,0,3));pads.push({center,radius:3,contact:l.ankle});});
 }
 if(machine){
  fixtures.push([v(-6,-18,34),v(24,-18,34)],[v(-6,18,34),v(24,18,34)],[v(-6,-18,34),v(-6,18,34)],
   [v(-5,-18,34),v(-5,-18,64)],[v(-5,18,34),v(-5,18,64)],[v(-5,-18,64),v(-5,18,64)],
   [v(-5,-18,34),v(-5,-18,0)],[v(20,18,34),v(20,18,0)],[v(-12,-23,0),v(30,-23,0)]);
 }
 if(id==='thrust'){
  fixtures.splice(0,fixtures.length,[v(-40,-22,32),v(-27,-22,32)],[v(-40,22,32),v(-27,22,32)],
   [v(-27,-22,32),v(-27,22,32)],[v(-40,-22,32),v(-40,22,32)],
   [v(-36,-20,32),v(-36,-20,0)],[v(-29,20,32),v(-29,20,0)],[v(-44,-25,0),v(45,-25,0)]);
 }
 const head=add(shoulderCenter,v(0,0,14));if(!feet)feet=legs.map(l=>({ankle:l.ankle,heel:add(l.ankle,v(-3,0,-2)),toe:add(l.ankle,v(8,0,-2))}));
 const center=id==='thrust'?add(hip,v(0,0,3)):null;
 const arms=[-1,1].map(side=>{const shoulder=add(shoulderCenter,v(0,side*9,0));const hand=id==='singleCalf'&&side<0?supports.brace:center?add(center,v(0,side*18,0)):add(shoulderCenter,v(10,side*14,-15));return {shoulder,hand,elbow:bendJoint(shoulder,hand,16,16,v(1,side,0))};});
 let equipment={type:'machine',lines:[],rollers:pads,grips:[]};
 if(id==='hack'){equipment.lines.push([hip,shoulderCenter],[add(shoulderCenter,v(0,-18,0)),add(shoulderCenter,v(0,18,0))]);equipment.sled={back:hip,shoulder:shoulderCenter};}
 if(center)equipment={type:'barbell',center,ends:[add(center,v(0,-35,0)),add(center,v(0,35,0))],plates:[add(center,v(0,-32,0)),add(center,v(0,32,0))],grips:arms.map(a=>a.hand),hipContact:hip};
 return {id,size,hip,shoulderCenter,head,legs,arms,feet,soles:[],fixtures,fixtureStyle:(id==='nordic'||machine||id==='thrust')?{width:2.4,opacity:.85}:undefined,rails,bench:null,equipment,supports,camera:{yaw:machine?1.05:.6,elevation:.2,offsetY:148}};
}
const make=(id,label,slug,movement)=>Object.freeze({id,label,duration:4,stillAt:2,loop:true,viewBox:'-5 -10 205 190',sample:t=>sample(id,phase(t)),source:`https://www.strengthlog.com/${slug}/`,view:'三分之四 · 下肢比例突出',support:'按动作设置前掌/膝轴/脚踝/上背或机器座靠支撑。',movement});
export const LOWER_ACCESSORY_CLIPS=Object.freeze({
 hack:make('hack','哈克深蹲','hack-squat-machine','固定脚与斜导轨，背/肩垫随滑架沿斜线下降；简化斜轨型号。'),
 thrust:make('thrust','臀推','hip-thrust','上背凳沿与双脚固定，髋升降，单长杠在髋前上方承载；不把杠画进腹部。'),
 adduction:make('adduction','坐姿腿内收','hip-adduction-machine','固定座背，髋带双腿由宽向窄旋转；抵抗垫在腿内侧，动作库垫侧说明已依据参考同步纠正。'),
 abduction:make('abduction','坐姿腿外展','hip-abduction-machine','固定座背，由窄向宽展开；抵抗垫在腿外侧。动作库垫侧说明已依据参考同步纠正。'),
 nordic:make('nordic','北欧腿弯举','nordic-hamstring-eccentric','膝轴与脚踝固定，膝到肩近直线整体前倾；仅有限幅度受控往返，不演示触地反弹/手撑恢复。'),
 backExtension:make('backExtension','山羊挺身','back-extension','骨盆垫/脚踝固定，以髋为轴下放躯干再回到腿躯干近直线，不过伸。'),
 singleCalf:make('singleCalf','单腿提踵','standing-calf-raise','右前掌固定踏板，另一腿悬空，左手扶固定柱；单腿变式依catalog，外部参考支持足踝原则。'),
});
