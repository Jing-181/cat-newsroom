import {v,add,mul,bendJoint} from './candidate-clips.js';
const size=Object.freeze({upperArm:23,forearm:22,thigh:22,shin:22,headRadius:9});
const smooth=t=>t*t*(3-2*t);
const phase=t=>{t=((t%5)+5)%5;return t<1.6?smooth(t/1.6):t<2?1:t<4.7?1-smooth((t-2)/2.7):0;};
export const BACK_VARIANTS=Object.freeze({
 pulldownWide:{family:'pulldown',halfGrip:28,grip:'正手',handle:'bar'},
 pulldownClose:{family:'pulldown',halfGrip:7,grip:'中立握',handle:'v'},
 pulldownReverse:{family:'pulldown',halfGrip:13,grip:'反手',handle:'bar'},
 pulldownSingle:{family:'pulldown',halfGrip:13,grip:'单手正握',handle:'single'},
 rowClose:{family:'row',halfGrip:7,grip:'中立握',handle:'v'},
 rowWide:{family:'row',halfGrip:26,grip:'正手',handle:'bar'},
});
function sample(id,q){
 const variant=BACK_VARIANTS[id],row=variant.family==='row',single=variant.handle==='single';
 const hip=v(0,0,28),lean=(row?4-7*q:0-4*q)*Math.PI/180;
 const shoulderCenter=add(hip,v(27*Math.sin(lean),0,27*Math.cos(lean))),head=add(shoulderCenter,v(0,0,15));
 const center=row?v(41-29*q,0,variant.halfGrip>20?49:42):v(15,0,91-37*q);
 const pulley=row?v(60,0,42):v(22,single?13:0,113);
 const brace=v(20,-21,48);
 const arms=[-1,1].map(side=>{
  // Small scapular excursion; torso lean stays restrained, pelvis never slides.
  const shoulder=add(shoulderCenter,v(1.5*(1-q),side*13,1-q));
  const hand=single&&side<0?brace:single?v(15,13,91-39*q):add(center,v(0,side*variant.halfGrip,0));
  const hint=single&&side<0?v(1,-1,0):row?v(-1,side*(variant.halfGrip>20?1:.3),-.2):v(-.7,side*(variant.halfGrip>20?1:.35),-.6);
  return {shoulder,hand,elbow:bendJoint(shoulder,hand,23,22,hint)};
 });
 const legs=[-1,1].map(side=>{const root=add(hip,v(0,side*7,0)),ankle=v(row?34:22,side*12,2);return {hip:root,knee:bendJoint(root,ankle,22,22,v(1,0,0)),ankle};});
 const soles=legs.map(l=>[v(l.ankle.x-3,l.ankle.y-2,0),v(l.ankle.x-3,l.ankle.y+2,0),v(l.ankle.x+8,l.ankle.y+2,0),v(l.ankle.x+8,l.ankle.y-2,0)]);
 const grips=single?[arms[1].hand]:arms.map(a=>a.hand);
 const anchor=single?add(grips[0],v(0,0,3)):variant.handle==='v'?add(center,v(3,0,2)):center;
 let handleLines;
 if(single)handleLines=[[add(grips[0],v(0,-4,0)),anchor,add(grips[0],v(0,4,0))]];
 else if(variant.handle==='v')handleLines=[[grips[0],anchor,grips[1]]];
 else handleLines=[[add(center,v(0,-variant.halfGrip-5,0)),add(center,v(0,variant.halfGrip+5,0))]];
 const fixtures=[[v(-8,0,28),v(18,0,28)],[v(-5,0,28),v(-5,0,0)],[v(15,0,28),v(15,0,0)]];
 if(row)fixtures.push([v(34,-20,0),v(34,-20,8)],[v(34,20,0),v(34,20,8)]);
 else fixtures.push([v(15,-20,32),v(15,20,32)]);
 if(id==='pulldownReverse')fixtures.push([v(-8,-11,28),v(18,-11,28)],[v(-8,11,28),v(18,11,28)],[v(-5,-11,28),v(-5,-11,0)],[v(15,11,28),v(15,11,0)],[v(15,-20,32),v(15,-20,0)],[v(-12,-20,0),v(32,-20,0)]);
 if(single)fixtures.push([v(20,-21,0),v(20,-21,90)]);
 return {id,size,hip,shoulderCenter,head,arms,legs,soles,bench:null,fixtures,fixtureStyle:id==='pulldownReverse'?{width:2.4,opacity:.85}:undefined,camera:{yaw:row?.55:1.02,elevation:.2,offsetY:149},
  supports:{seat:hip,ankles:legs.map(l=>l.ankle),soles,...(single?{brace}:{} )},
  equipment:{type:'cableHandle',pulley,anchor,cable:[pulley,anchor],handleLines,grips,variant}};
}
const source=slug=>`https://www.strengthlog.com/${slug}/`;
const make=(id,label,slug)=>Object.freeze({id,label,duration:5,stillAt:1.8,loop:true,viewBox:'20 20 160 155',sample:t=>sample(id,phase(t)),source:source(slug),
 view:'固定三分之四 · 上肢强调',support:BACK_VARIANTS[id].family==='row'?'凳面、骨盆、双脚踏板与前方滑轮固定；肩胛随伸拉小幅前后移动。':'凳面、骨盆、双脚、膝垫与高位滑轮固定；单臂版另一手固定扶机。',
 movement:`${BACK_VARIANTS[id].family==='row'?'水平拉向腹部/下胸':'由高位拉至上胸/体侧'}；${BACK_VARIANTS[id].grip}，${BACK_VARIANTS[id].handle==='single'?'单侧活动':`握距${BACK_VARIANTS[id].halfGrip*2}绘图单位`}。同族共享求解，握距/器械/单双侧真实不同；火柴人不显示掌面，正反手仅由说明识别。`});
export const BACK_CLIPS=Object.freeze({
 pulldownWide:make('pulldownWide','宽握高位下拉','lat-pulldown-with-pronated-grip'),
 pulldownClose:make('pulldownClose','窄握高位下拉','neutral-close-grip-lat-pulldown'),
 pulldownReverse:make('pulldownReverse','反手高位下拉','lat-pulldown-with-supinated-grip'),
 pulldownSingle:make('pulldownSingle','单臂绳索下拉','one-handed-lat-pulldown'),
 rowClose:make('rowClose','窄握坐姿绳索划船','cable-close-grip-seated-row'),
 rowWide:make('rowWide','宽握坐姿绳索划船','cable-wide-grip-seated-row'),
});
