import { v, add, mul, sub, length, bendJoint } from './candidate-clips.js';
const size = Object.freeze({ thigh: 30, shin: 30, upperArm: 16, forearm: 16, headRadius: 9 });
const smooth = x => x*x*(3-2*x);
const phase = t => { t=((t%5)+5)%5; return t<1.6?smooth(t/1.6):t<2.2?1:t<4.8?1-smooth((t-2.2)/2.6):0; };
const axisPad = (center, half=13) => [add(center,v(0,-half,0)),add(center,v(0,half,0))];
function footAt(toe, q) {
  const angle=(-8+36*q)*Math.PI/180;
  const heel=add(toe,v(-15*Math.cos(angle),0,15*Math.sin(angle)));
  const ankle=add(toe,v(-11*Math.cos(angle)+3*Math.sin(angle),0,11*Math.sin(angle)+3*Math.cos(angle)));
  return {toe,heel,ankle};
}
function sample(kind,q) {
  const standing=kind==='standingCalf', calf=standing||kind==='seatedCalf';
  let hip,shoulderCenter,head,legs,feet;
  const seatHip=v(-25,0,43);
  if(calf) {
    feet=[-1,1].map(side=>footAt(v(16,side*11,8),q));
    if(standing) {
      const ankle=feet[0].ankle;
      hip=v(ankle.x-3,0,ankle.z+58);
      legs=feet.map((f,i)=>{const root=add(hip,v(0,i?11:-11,0));return {hip:root,knee:bendJoint(root,f.ankle,30,30,v(1,0,0)),ankle:f.ankle};});
    } else {
      hip=seatHip;
      legs=feet.map((f,i)=>{const root=add(hip,v(0,i?11:-11,0));return {hip:root,knee:bendJoint(root,f.ankle,30,30,v(1,0,1)),ankle:f.ankle};});
    }
  } else {
    hip=seatHip;
    // Extension raises the shin from vertical; curl starts near straight and bends down/back.
    const angle=(kind==='legExtension'?90-80*q:12+98*q)*Math.PI/180;
    legs=[-1,1].map(side=>{const root=add(hip,v(0,side*11,0)),knee=add(root,v(30,0,0));return {hip:root,knee,ankle:add(knee,v(30*Math.cos(angle),0,-30*Math.sin(angle)))};});
    feet=legs.map(l=>({ankle:l.ankle,heel:add(l.ankle,v(-2,0,-2)),toe:add(l.ankle,v(8,0,-2))}));
  }
  shoulderCenter=add(hip,v(0,0,25));head=add(shoulderCenter,v(0,0,14));
  const arms=[-1,1].map(side=>{const shoulder=add(shoulderCenter,v(0,side*9,0));const hand=standing?add(shoulder,v(12,side*6,-12)):add(hip,v(5,side*16,3));return {shoulder,elbow:bendJoint(shoulder,hand,16,16,v(1,side,0)),hand};});
  const fixedLines=standing?[[v(26,-20,0),v(26,-20,92)],[v(26,20,0),v(26,20,92)]]:
    [[v(-31,0,43),v(2,0,43)],[v(-31,0,43),v(-31,0,72)],[v(-28,0,43),v(-28,0,0)],[v(0,0,43),v(0,0,0)]];
  const lines=[...fixedLines],rollers=[];
  if(calf) {
    lines.push([v(12,-24,8),v(24,-24,8),v(24,24,8),v(12,24,8)]);
    if(standing) { lines.push(axisPad(add(shoulderCenter,v(0,0,1)),18)); }
    else {
      legs.forEach(l=>{
        const direction=mul(sub(l.knee,l.hip),1/30),normal=v(-direction.z,0,direction.x);
        const contact=add(l.hip,mul(direction,26)),center=add(contact,mul(normal,3));
        rollers.push({center,radius:3,contact,normal});
        lines.push(axisPad(center,5),[add(center,v(0,-5,0)),add(center,v(8,-5,7))]);
      });
      lines.push([v(-31,-16,43),v(-6,-16,43)],[v(-31,16,43),v(-6,16,43)],
        [v(-28,-16,43),v(-28,-16,0)],[v(-6,16,43),v(-6,16,0)],
        [v(12,-24,8),v(12,-24,0)],[v(24,24,8),v(24,24,0)]);
    }
  } else {
    legs.forEach(l=>{
      const direction=mul(sub(l.ankle,l.knee),1/30);
      // Front shin pad for extension, posterior lower-calf pad for seated curl.
      const normal=v(-direction.z,0,direction.x),sign=kind==='legExtension'?1:-1;
      const contact=add(l.knee,mul(direction,26)),center=add(contact,mul(normal,sign*3));
      rollers.push({center,contact,normal:mul(normal,sign),radius:3,pivot:l.knee});
      lines.push([l.knee,center]);
    });
    if(kind==='legCurl') lines.push(axisPad(v(-2,0,46),19));
  }
  const supports=calf?{forefeet:feet.map(f=>f.toe),...(standing?{}:{seat:hip})}:{seat:hip,knees:legs.map(l=>l.knee)};
  return {id:kind,size,hip,shoulderCenter,head,arms,legs,feet,soles:[],bench:null,camera:{yaw:.5,elevation:.23,offsetY:148},supports,
    equipment:{type:'machine',lines,rollers,fixedLines,grips:arms.map(a=>a.hand)}, kneeAngles:legs.map(l=>{
      const a=sub(l.hip,l.knee),b=sub(l.ankle,l.knee);return Math.acos((a.x*b.x+a.y*b.y+a.z*b.z)/(length(a)*length(b)));})};
}
const make=(id,label,source,movement)=>Object.freeze({id,label,duration:5,stillAt:1.8,loop:true,viewBox:'20 20 160 155',sample:t=>sample(id,phase(t)),source,
  view:'正交三分之四 · 下肢比例强调',support:id==='standingCalf'?'前掌固定于踏板，脚跟悬空；膝保持微屈，身体随踝升降。':'骨盆保持凳面接触；坐姿固定，器械转轴与膝关系明确。',movement});
export const LEG_CLIPS=Object.freeze({
  standingCalf:make('standingCalf','站姿提踵','https://www.acefitness.org/resources/everyone/exercise-library/51/calf-raises/','以前掌为固定支点抬落脚跟，肩部负载垫随身体升降；本图为器械踏板变式。'),
  seatedCalf:make('seatedCalf','坐姿提踵','https://www.strengthlog.com/seated-calf-raise/','固定凳面和前掌，屈膝坐姿提踵；大腿下端护垫随膝轻微升降，不将整个座椅抬起。'),
  legExtension:make('legExtension','坐姿腿屈伸','https://www.strengthlog.com/leg-extension/','固定大腿与膝轴，前侧胫骨下端滚垫随小腿向前上方抬起，接近伸直但不反折。'),
  legCurl:make('legCurl','坐姿腿弯举','https://www.strengthlog.com/seated-leg-curl/','采用坐姿变式：固定大腿上方压垫，后侧小腿滚垫随屈膝向下后方移动，与腿屈伸方向及垫位不同。'),
});
