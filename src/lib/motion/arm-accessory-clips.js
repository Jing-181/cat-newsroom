import {v,add,mul,bendJoint} from './candidate-clips.js';
const size=Object.freeze({upperArm:23,forearm:22,thigh:23,shin:23,headRadius:9});
const phase=t=>(1-Math.cos(2*Math.PI*t/4))/2;
const weight=(center,half=6)=>({center,ends:[add(center,v(0,-half,0)),add(center,v(0,half,0))],plates:[add(center,v(0,-half+1,0)),add(center,v(0,half-1,0))]});
function sample(id,q){
 const lying=id==='skull',incline=id==='inclineCurl',preacher=id==='preacher',wrist=id==='wrist';
 const seated=lying||incline||preacher||wrist,hip=v(0,0,seated?28:44),shoulderCenter=lying?v(-30,0,28):incline?v(-13,0,51):add(hip,v(0,0,27));
 const head=lying?v(-46,0,29):add(shoulderCenter,v(0,0,15)),fixtures=[];
 const legs=[-1,1].map(side=>{const root=add(hip,v(0,side*7,0)),ankle=v(seated?25:0,side*12,2);return {hip:root,knee:bendJoint(root,ankle,23,23,v(1,0,0)),ankle};});
 const soles=legs.map(l=>[v(l.ankle.x-3,l.ankle.y-3,0),v(l.ankle.x-3,l.ankle.y+3,0),v(l.ankle.x+8,l.ankle.y+3,0),v(l.ankle.x+8,l.ankle.y-3,0)]);
 if(seated)fixtures.push(lying?[v(-57,0,25),v(10,0,25)]:[v(-7,0,25),v(15,0,25)],[v(-5,0,25),v(-5,0,0)],[v(9,0,25),v(9,0,0)]);
 if(incline){
  fixtures.push([hip,shoulderCenter]);
  for(const side of[-1,1])fixtures.push([v(0,side*10,28),v(-13,side*10,51)],[v(-7,side*10,25),v(15,side*10,25)],[v(-7,side*10,25),v(-7,side*10,0)]);
  fixtures.push([v(-13,-10,51),v(-13,10,51)],[v(-18,-16,0),v(20,-16,0)]);
 }
 const arms=[-1,1].map(side=>{
  const shoulder=add(shoulderCenter,v(0,side*13,0));let elbow,hand,joint;
  if(preacher){elbow=add(shoulder,v(14,0,-Math.sqrt(23**2-14**2)));const a=(-48+110*q)*Math.PI/180;hand=add(elbow,v(22*Math.cos(a),0,22*Math.sin(a)));fixtures.push([shoulder,elbow]);}
  else if(wrist){elbow=add(shoulder,v(0,0,-23));joint=add(elbow,v(22,0,0));const a=(-35+70*q)*Math.PI/180;hand=add(joint,v(6*Math.cos(a),0,6*Math.sin(a)));fixtures.push([elbow,joint]);}
  else if(id==='overhead'||lying){elbow=add(shoulder,v(0,0,23));const a=(lying?8+104*q:112-104*q)*Math.PI/180;hand=add(elbow,v(-22*Math.sin(a),0,22*Math.cos(a)));}
  else{elbow=add(shoulder,v(0,0,-23));const a=(id==='barPushdown'?100-85*q:12+113*q)*Math.PI/180;hand=add(elbow,v(22*Math.sin(a),0,-22*Math.cos(a)));}
  return {shoulder,elbow,hand,...(joint?{wrist:joint}:{})};
 });
 if(preacher){
  const top=arms[0].shoulder,bottom=arms[0].elbow;
  fixtures.push([v(top.x,-18,top.z),v(top.x,18,top.z)],[v(bottom.x,-18,bottom.z),v(bottom.x,18,bottom.z)],
   [v(top.x,-18,top.z),v(bottom.x,-18,bottom.z)],[v(top.x,18,top.z),v(bottom.x,18,bottom.z)],
   [v(bottom.x,-18,bottom.z),v(bottom.x,-18,0)],[v(bottom.x,18,bottom.z),v(bottom.x,18,0)]);
 }
 const grips=arms.map(a=>a.hand),center=v(grips[0].x,0,grips[0].z);let equipment;
 if(['inclineCurl','wrist'].includes(id))equipment={type:'dumbbells',weights:arms.map(a=>weight(a.hand)),grips};
 else if(['cableCurl','barPushdown'].includes(id)){const pulley=v(42,0,id==='barPushdown'?112:4);equipment={type:'cableHandle',pulley,anchor:center,cable:[pulley,center],handleLines:[[add(center,v(0,-20,0)),add(center,v(0,20,0))]],grips};}
 else if(id==='cableHammer'||id==='overhead'){
  const pulley=id==='overhead'?v(-55,0,4):v(42,0,4),branchLength=22;
  const junction=add(center,v(id==='overhead'?-Math.sqrt(22**2-13**2):0,0,id==='overhead'?0:-Math.sqrt(22**2-13**2)));
  equipment={type:'rope',pulley,junction,cable:[pulley,junction],branches:grips.map(g=>[junction,g]),branchLength,grips};
 }else equipment={...weight(center,30),type:'barbell',grips};
 return {id,size,hip,shoulderCenter,head,legs,arms,soles,fixtures,fixtureStyle:(incline||preacher)?{width:2.4,opacity:.85}:undefined,bench:null,equipment,camera:{yaw:.6,elevation:.2,offsetY:148},supports:{hip,ankles:legs.map(l=>l.ankle),soles,...(seated?{seat:hip}:{}),...(preacher?{upperPads:arms.map(a=>[a.shoulder,a.elbow])}:{}),...(wrist?{forearms:arms.map(a=>[a.elbow,a.wrist])}:{})}};
}
const make=(id,label,slug,movement)=>Object.freeze({id,label,duration:4,stillAt:2,loop:true,viewBox:'0 -10 205 185',sample:t=>sample(id,phase(t)),source:`https://www.strengthlog.com/${slug}/`,view:'三分之四 · 上肢强调',support:'骨盆/双脚固定，按动作设置上臂垫、前臂支撑或固定凳面；握姿掌面在线稿不可见。',movement});
export const ARM_ACCESSORY_CLIPS=Object.freeze({
 preacher:make('preacher','牧师凳弯举','barbell-preacher-curl','上臂固定贴斜垫，仅肘屈伸；选择凳+杠版本，不冒充特定机器。'),
 cableCurl:make('cableCurl','绳索弯举','cable-curl-with-bar','低滑轮固定、直把双握点，上臂固定向肩弯举；反手掌面仅说明。'),
 inclineCurl:make('inclineCurl','上斜哑铃弯举','incline-dumbbell-curl','靠斜凳后倾，双上臂垂直位于躯干后侧，独立哑铃随前臂屈伸。'),
 reverseCurl:make('reverseCurl','反握弯举','reverse-barbell-curl','单长杠、肩宽握距、固定上臂；与普通弯举同族轨迹，正握掌面不可见，不宣称视觉表达该差别。'),
 wrist:make('wrist','腕弯举','barbell-wrist-curl','前臂固定凳面，腕轴不动，仅6单位手段上下旋转，肘不弯举；采用哑铃器械。'),
 barPushdown:make('barPushdown','直杆下压','tricep-pushdown-with-bar','高滑轮连接一根直杆双握点，上臂固定，伸肘下压，不是双绳分叉。'),
 overhead:make('overhead','过顶绳索臂屈伸','overhead-cable-triceps-extension','上臂固定头侧，屈肘落向耳后再伸起；采用低锚绳索版本，动作库说明已同步为绳索，非哑铃变式。'),
 skull:make('skull','仰卧臂屈伸','barbell-lying-triceps-extension','水平凳固定，上臂垂直且不晃动，长杠向额头后方下落，保留头部间隙。'),
 cableHammer:make('cableHammer','绳索锤式弯举','cable-curl-with-rope','低位滑轮、两根定长分支绳，中立握向肩弯举；掌面不可见，绳端可辨。'),
});
