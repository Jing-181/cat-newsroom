import {v,add,mul,bendJoint,length,sub} from './candidate-clips.js';
const size=Object.freeze({upperArm:23,forearm:22,thigh:25,shin:25,headRadius:9});
const smooth=x=>x*x*(3-2*x),cycle=t=>(1-Math.cos(2*Math.PI*t/4))/2;
export function ropeWave(hand,anchor,time,side){
 const shape=amplitude=>Array.from({length:41},(_,i)=>{const u=i/40;return v(hand.x+(anchor.x-hand.x)*u,hand.y+(anchor.y-hand.y)*u,hand.z*(1-u)+anchor.z*u+amplitude*Math.sin(Math.PI*u)*(1+Math.sin(2*Math.PI*(3*u-time)+side*Math.PI)));});
 const total=points=>points.slice(1).reduce((sum,p,i)=>sum+length(sub(p,points[i])),0);
 let lo=0,hi=40;for(let i=0;i<32;i++){const mid=(lo+hi)/2;if(total(shape(mid))<105)lo=mid;else hi=mid;}return shape((lo+hi)/2);
}
function sample(id,t){
 const q=cycle(t),carry=id==='farmer',seated=id==='arnold';let travel=0,hip=v(0,0,seated?28:46),ankles=[v(0,-12,2),v(0,12,2)],stance=[];
 if(carry){const n=Math.floor(t/4),u=((t%4)+4)%4,step=Math.floor(u/2),f=(u%2)/2,base=n*24,active=step;ankles=[v(base-12,-12,2),v(base,12,2)];if(step===1)ankles[0].x=base+12;ankles[active]=v(base+(step===0?-12:0)+24*smooth(f),ankles[active].y,2+5*Math.sin(Math.PI*f)**2);travel=base+step*12+12*smooth(f);hip=v(travel,0,44);stance=[1-active];}
 if(seated)ankles=[v(24,-12,2),v(24,12,2)];
 const shoulderCenter=add(hip,v(0,0,27)),head=add(shoulderCenter,v(0,0,15)),fixtures=[];
 const legs=ankles.map((ankle,i)=>{const root=add(hip,v(0,i?8:-8,0));return {hip:root,knee:bendJoint(root,ankle,25,25,v(1,0,0)),ankle};});
 const soles=legs.map(l=>[v(l.ankle.x-3,l.ankle.y-3,l.ankle.z-2),v(l.ankle.x-3,l.ankle.y+3,l.ankle.z-2),v(l.ankle.x+8,l.ankle.y+3,l.ankle.z-2),v(l.ankle.x+8,l.ankle.y-3,l.ankle.z-2)]);
 if(seated)fixtures.push([v(-6,-12,28),v(15,-12,28)],[v(-6,12,28),v(15,12,28)],[v(-6,-12,28),v(-6,12,28)],[v(15,-12,28),v(15,12,28)],[v(-4,-12,28),v(-4,-12,60)],[v(-4,12,28),v(-4,12,60)],[v(-4,-12,60),v(-4,12,60)],[v(-4,-12,28),v(-4,-12,0)],[v(12,12,28),v(12,12,0)],[v(-12,-18,0),v(32,-18,0)]);
 const brace=v(12,-20,52);
 const arms=[-1,1].map((side,i)=>{const shoulder=add(shoulderCenter,v(0,side*13,0));
 if(id==='crossFly'){const a=(5+75*q)*Math.PI/180,b=.28,elbow=add(shoulder,v(23*Math.cos(a),side*23*Math.sin(a),0));return {shoulder,elbow,hand:add(elbow,v(22*Math.cos(a-b),side*22*Math.sin(a-b),0))};}
 if(carry){const elbow=add(shoulder,v(0,0,-23));return {shoulder,elbow,hand:add(elbow,v(0,0,-22))};}
 if(id==='singlePush'&&i===1){const elbow=add(shoulder,v(0,0,-23)),a=(100-85*q)*Math.PI/180;return {shoulder,elbow,hand:add(elbow,v(22*Math.sin(a),0,-22*Math.cos(a)))};}
 const hand=id==='singlePush'?brace:id==='pallof'?add(shoulderCenter,v(10+31*q,side*2,-5)):id==='battle'?add(shoulderCenter,v(22,side*13,-21+side*8*Math.sin(2*Math.PI*t))):add(shoulderCenter,v(13*(1-q)+4*q,side*(10+12*q),5+37*q));
 return {shoulder,hand,elbow:bendJoint(shoulder,hand,23,22,v(id==='arnold'?.5:1,side,-.3))};
 });
 let equipment;
 if(carry||seated){equipment={type:'dumbbells',grips:arms.map(a=>a.hand),weights:arms.map((a,i)=>{const angle=seated?Math.PI*q/2:0,axis=v(Math.sin(angle),Math.cos(angle),0);return {center:a.hand,axis,ends:[-7,7].map(n=>add(a.hand,mul(axis,n))),plates:[-6,6].map(n=>add(a.hand,mul(axis,n)))};})};}
 else if(id==='crossFly'){const anchors=[v(24,65,73),v(24,-65,73)];equipment={type:'dualCable',anchors,cables:arms.map((a,i)=>[anchors[i],a.hand]),grips:arms.map(a=>a.hand)};}
 else if(id==='battle'){const anchors=[v(100,-13,0),v(100,13,0)],waves=arms.map((a,i)=>ropeWave(a.hand,anchors[i],t,i));equipment={type:'machine',lines:waves,rollers:[],anchors,grips:arms.map(a=>a.hand),ropeLength:105};}
 else{const pulley=id==='pallof'?v(0,-65,68):v(35,13,112),anchor=id==='pallof'?v(arms[0].hand.x,0,arms[0].hand.z):arms[1].hand;equipment={type:'cableHandle',pulley,anchor,cable:[pulley,anchor],handleLines:[[add(anchor,v(0,-3,0)),add(anchor,v(0,3,0))]],grips:id==='pallof'?arms.map(a=>a.hand):[arms[1].hand]};}
 const camera={yaw:.75,elevation:.2,offsetY:148,offsetX:100-travel*Math.cos(.75)};camera.offsetY-=travel*Math.sin(.75)*Math.sin(.2);
 return {id,size,hip,shoulderCenter,head,arms,legs,soles,fixtures,fixtureStyle:seated?{width:2.4,opacity:.85}:undefined,bench:null,equipment,camera,supports:carry?{stance,feet:stance.map(i=>ankles[i])}:{hip,ankles,...(seated?{seat:hip}:{}),...(id==='singlePush'?{brace}:{})}};
}
const make=(id,label,source,movement)=>Object.freeze({id,label,duration:4,stillAt:id==='battle'?.25:2,loop:true,viewBox:'-5 -10 235 190',sample:t=>sample(id,t),source,view:'三分之四 · 固定比例单线',support:'按动作固定滑轮/支撑，行走单独定义交替支撑相位。',movement});
const url=slug=>`https://www.strengthlog.com/${slug}/`;
export const FUNCTIONAL_CLIPS=Object.freeze({
 crossFly:make('crossFly','龙门架反向飞鸟',url('reverse-machine-fly'),'交叉握两侧肩高拉索，固定微屈肘向外展开；外部仅反飞鸟肩外展原则，交叉绳依catalog。'),
 arnold:make('arnold','阿诺德推举',url('arnold-press'),'坐姿两哑铃从胸前向上推，肘展开兼器械轴转向；线稿无掌面，不声称完整显示掌心旋转。'),
 singlePush:make('singlePush','单臂绳索下压','https://www.acefitness.org/resources/everyone/exercise-library/185/triceps-pushdowns/','右侧高锚伸肘下压，左手固定稳定，躯干不旋转。'),
 farmer:make('farmer','农夫行走',url('farmers-walk'),'两件负重随垂臂前移，小步交替支撑，跟随相机回环；不滑动植地脚。'),
 pallof:make('pallof','帕洛夫推',url('pallof-press'),'固定侧锚拉索，双手胸前向前伸，肩髋不旋转，不画转体代替抗旋。'),
 battle:make('battle','战绳','https://www.acefitness.org/resources/everyone/exercise-library/376/asynchronous-waves/','双手反相升降，波形沿绳传向固定远端，离散绳长保持；为程序波形示意非真实柔体仿真。'),
});
