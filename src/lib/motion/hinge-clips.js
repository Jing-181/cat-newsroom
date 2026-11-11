import {v,add,mul,sub,length,bendJoint} from './candidate-clips.js';
const phase=t=>(1-Math.cos(2*Math.PI*t/4))/2;
const weight=(center,half)=>({center,axis:v(0,1,0),ends:[-half,half].map(y=>add(center,v(0,y,0))),plates:[-half+1,half-1].map(y=>add(center,v(0,y,0)))});
function sample(id,q){
 const row=['barbellRow','singleRow','tbarRow'].includes(id),single=id==='singleRdl',bench=id==='singleRow',conventional=id==='deadlift';
 const size={upperArm:row?23:21,forearm:row?22:21,thigh:row?25:30,shin:row?25:30,headRadius:9};
 let hip,shoulderCenter,legs;
 if(row){hip=v(-15,0,43);shoulderCenter=bench?v(17,0,45):v(10,0,63);}
 else {const bend=conventional?1-q:q;hip=v(-3-15*bend,0,conventional?58-24*bend:Math.sqrt(56**2-(-3-15*bend)**2)+2);shoulderCenter=v(8,0,hip.z+Math.sqrt(30**2-(8-hip.x)**2));}
 const head=add(shoulderCenter,v(5,0,12));
 legs=[-1,1].map(side=>{const root=add(hip,v(0,side*10,0)),ankle=v(0,side*10,2);return {hip:root,knee:bendJoint(root,ankle,size.thigh,size.shin,v(1,0,0)),ankle};});
 if(single){const root=legs[0].hip,a=Math.atan2(shoulderCenter.x-hip.x,shoulderCenter.z-hip.z);const knee=add(root,v(-30*Math.sin(a),0,-30*Math.cos(a))),ankle=add(knee,v(-30*Math.sin(a+.06),0,-30*Math.cos(a+.06)));legs[0]={hip:root,knee,ankle};}
 const fixtures=[];
 if(bench){
  const root=legs[0].hip,knee=v(-15,-10,18),ankle=v(-40,-10,18);legs[0]={hip:root,knee,ankle};
  fixtures.push([v(-45,-10,18),v(35,-10,18)],[v(-35,-10,18),v(-35,-10,0)],[v(25,-10,18),v(25,-10,0)]);
 }
 const brace=v(32,-10,18),pivot=v(-45,0,0);
 const angle=(18+15*q)*Math.PI/180;
 const tEnd=add(pivot,v(60*Math.cos(angle),0,60*Math.sin(angle)));
 const center=id==='tbarRow'?tEnd:row?v(12-10*q,0,25+24*q):v(conventional?17:8,0,shoulderCenter.z-40);
 const arms=[-1,1].map(side=>{const shoulder=add(shoulderCenter,v(0,side*13,0));const hand=bench&&side<0?brace:add(center,v(0,side*(id==='tbarRow'?7:19),0));return {shoulder,hand,elbow:bendJoint(shoulder,hand,size.upperArm,size.forearm,row?v(-1,side*.35,.2):v(0,side,.1))};});
 let equipment;
 if(id==='tbarRow')equipment={type:'machine',lines:[[pivot,tEnd],[add(tEnd,v(0,-9,0)),add(tEnd,v(0,9,0))]],rollers:[{center:tEnd,radius:5}],grips:arms.map(a=>a.hand),pivot,tip:tEnd};
 else if(single||bench){const active=bench?[arms[1]]:arms;equipment={type:'dumbbells',weights:active.map(a=>weight(a.hand,6)),grips:active.map(a=>a.hand)};}
 else equipment={...weight(center,35),type:'barbell',grips:arms.map(a=>a.hand)};
 const feet=legs.map((l,i)=>{const lifted=(single||bench)&&i===0;return {ankle:l.ankle,heel:add(l.ankle,v(-3,0,lifted?0:-2)),toe:add(l.ankle,v(8,0,lifted?0:-2))};});
 return {id,size,hip,shoulderCenter,head,arms,legs,feet,soles:[],bench:null,fixtures,equipment,camera:{yaw:.55,elevation:.2,offsetY:148},supports:bench?{knee:legs[0].knee,hand:brace,foot:legs[1].ankle}:single?{foot:legs[1].ankle}:{feet:legs.map(l=>l.ankle)},torsoLength:length(sub(shoulderCenter,hip))};
}
const make=(id,label,slug,movement)=>Object.freeze({id,label,duration:4,stillAt:id==='deadlift'?0:2,loop:true,viewBox:'-5 15 195 160',sample:t=>sample(id,phase(t)),source:`https://www.strengthlog.com/${slug}/`,view:'三分之四 · 后链强调腿部／划船强调上肢',support:'固定实际承重点；单腿版仅一脚承重，单臂划船同侧手膝固定于凳面。',movement});
export const HINGE_CLIPS=Object.freeze({
 rdl:make('rdl','罗马尼亚硬拉','romanian-deadlift','从站姿起始，膝微屈保持，髋后移铰链下放；单长杠双握点。'),
 deadlift:make('deadlift','传统硬拉','deadlift','从低位屈髋屈膝起拉，杠从近地面升起；区别于站姿起始RDL。'),
 singleRdl:make('singleRdl','单腿RDL','single-leg-romanian-deadlift','右脚支撑，左腿后伸，骨盆不外翻，两件哑铃沿支撑侧前方下降；参考页杠铃版，哑铃选型依catalog。'),
 barbellRow:make('barbellRow','杠铃划船','barbell-row','稳定俯身，长杠拉向下腹，肘向后，不以起身带动。'),
 singleRow:make('singleRow','单臂哑铃划船','dumbbell-row','左手左膝支撑凳面，右脚踩地，右手单哑铃向髋部拉起。'),
 tbarRow:make('tbarRow','T杠划船','t-bar-row','杠长固定60单位，地面枢轴不动，负重端沿圆弧上拉；横把与双手随杠端运动。'),
});
