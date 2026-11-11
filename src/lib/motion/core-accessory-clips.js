import {v,add,mul,bendJoint} from './candidate-clips.js';
const size=Object.freeze({upperArm:20,forearm:20,thigh:25,shin:25,headRadius:8});
const cycle=t=>(1-Math.cos(2*Math.PI*t/4))/2;
function sample(id,t){
 t=((t%4)+4)%4;
 const q=cycle(t),hanging=id==='hangingRaise',kneeling=id==='cableCrunch'||id==='abWheel';
 let hip,torsoChain,shoulderCenter,head,legs,arms;const fixtures=[];let equipment={type:'machine',lines:[],rollers:[],grips:[]},supports={};
 if(hanging){hip=v(0,0,54);shoulderCenter=v(0,0,81);head=v(0,0,94);legs=[-1,1].map(side=>{const root=add(hip,v(0,side*8,0)),a=q*1.4,knee=add(root,v(25*Math.sin(a),0,-25*Math.cos(a))),ankle=add(knee,v(25*Math.sin(a),0,-25*Math.cos(a)));return {hip:root,knee,ankle};});arms=[-1,1].map(side=>{const shoulder=add(shoulderCenter,v(0,side*10,0)),hand=v(0,side*21,119);return {shoulder,hand,elbow:bendJoint(shoulder,hand,20,20,v(0,side,0))};});fixtures.push([v(0,-32,119),v(0,32,119)]);supports={hands:arms.map(a=>a.hand),pelvis:hip};}
 else{
 if(id==='abWheel'){
  const angle=.25+.45*q,u=v(Math.sin(angle),0,Math.cos(angle));hip=add(v(0,0,2),mul(u,25));shoulderCenter=add(hip,v(27*Math.cos(.5-.2*q),0,27*Math.sin(.5-.2*q)));torsoChain=[hip,shoulderCenter];
 }else if(id==='cableCrunch'){
  hip=v(0,0,27);torsoChain=[hip];for(const a of[.2+.2*q,.2+.6*q,.2+1.2*q])torsoChain.push(add(torsoChain.at(-1),v(9*Math.sin(a),0,9*Math.cos(a))));shoulderCenter=torsoChain.at(-1);
 }else{
  hip=v(18,0,3);torsoChain=[hip];const angles=id==='crunch'?[0,0,.05+.5*q]:id==='sitUp'?[1.05*q,1.15*q,1.25*q]:[.75,.75,.75];
  for(const a of angles)torsoChain.push(add(torsoChain.at(-1),v(-9*Math.cos(a),0,9*Math.sin(a))));shoulderCenter=torsoChain.at(-1);
 }
 const last=torsoChain.at(-2),dx=shoulderCenter.x-last.x,dz=shoulderCenter.z-last.z,L=Math.hypot(dx,dz);head=add(shoulderCenter,v(dx/L*12,0,dz/L*12));
 legs=[-1,1].map(side=>{const root=add(hip,v(0,side*8,0));if(kneeling){const knee=v(0,side*8,2),ankle=v(-25,side*8,2);return {hip:root,knee,ankle};}const ankle=v(48,side*8,2);return {hip:root,knee:bendJoint(root,ankle,25,25,v(0,0,1)),ankle};});
 const twist=id==='twist'?.65*Math.sin(Math.PI*t/2):0,rotation=p=>v(p.x*Math.cos(twist)-p.y*Math.sin(twist),p.x*Math.sin(twist)+p.y*Math.cos(twist),p.z);
 arms=[-1,1].map(side=>{const shoulder=add(shoulderCenter,rotation(v(0,side*9,0)));let hand;
 if(id==='abWheel')hand=v(43+19*q,side*10,6);
 else if(id==='cableCrunch')hand=add(head,v(1,side*11,-3));
 else hand=add(shoulderCenter,rotation(v(16,side*3,8)));
 return {shoulder,hand,elbow:bendJoint(shoulder,hand,20,20,rotation(v(1,side,0)))};});
 supports=kneeling?{knees:legs.map(l=>l.knee),ankles:legs.map(l=>l.ankle)}:{pelvis:hip,feet:legs.map(l=>l.ankle),...(id==='crunch'?{lowBack:torsoChain[1]}:{})};
 if(id==='cableCrunch'){
 supports.pelvis=hip;const pulley=v(50,0,100),center=v(arms[0].hand.x,0,arms[0].hand.z),junction=add(center,v(Math.sqrt(24**2-11**2),0,0));equipment={type:'rope',pulley,junction,cable:[pulley,junction],branches:arms.map(a=>[junction,a.hand]),grips:arms.map(a=>a.hand),branchLength:24};
 }
 if(id==='abWheel'){
 const center=v(43+19*q,0,6),rotation=(center.x-43)/6;
 equipment={type:'machine',lines:[[add(center,v(0,-14,0)),add(center,v(0,14,0))],[center,add(center,v(6*Math.cos(rotation),0,6*Math.sin(rotation)))]],rollers:[{center,radius:6}],wheel:{center,radius:6,rotation,ground:v(center.x,0,0)},grips:arms.map(a=>a.hand)};
 }
 }
 const feet=legs.map(l=>({ankle:l.ankle,heel:l.ankle,toe:add(l.ankle,v(6,0,0))}));
 return {id,size,hip,shoulderCenter,head,torsoChain,arms,legs,feet,soles:[],fixtures,bench:null,equipment,supports,camera:{yaw:.5,elevation:.18,offsetY:147}};
}
const make=(id,label,slug,movement)=>Object.freeze({id,label,duration:4,stillAt:2,loop:true,viewBox:'-5 -10 210 190',sample:t=>sample(id,t),source:`https://www.strengthlog.com/${slug}/`,view:'独立体位 · 分段单线核心',support:'固定骨盆/低背、手杠或膝地面支撑，按动作分别定义。',movement});
export const CORE_ACCESSORY_CLIPS=Object.freeze({
 sitUp:make('sitUp','仰卧起坐','sit-up','屈膝脚固定，骨盆固定，上身较大幅卷起并绕髋折叠；动作库说明已同步为较大幅起坐版，区别于低背贴地卷腹。'),
 crunch:make('crunch','卷腹','crunch','骨盆与下背两段保持，只有上胸段小幅卷起，不是整身绕髋坐起。'),
 twist:make('twist','俄罗斯转体','core-twist','选双脚落地版，骨盆与后倾躯干中心固定，胸肩轴和双臂左右转动，非整个人漂移。'),
 hangingRaise:make('hangingRaise','悬垂举腿','hanging-leg-raise','单杠双握点与上身高度固定，髋屈双腿上抬，非引体身上移；选近直腿版。'),
 cableCrunch:make('cableCrunch','绳索卷腹','cable-crunch','跪姿固定髋/膝，高滑轮固定，分段脊柱向前卷曲，绳端保持头侧关系，非手臂下拉。'),
 abWheel:make('abWheel','跪姿健腹轮','kneeling-ab-wheel-roll-out','膝固定，轮接地滚动、轴角随位移变化，手握轮轴，肩髋协调前移，躯干段近直不腰折。'),
});
