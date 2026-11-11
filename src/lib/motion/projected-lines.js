// Split an orthographically projected segment at a head disk and its depth plane.
// Only the portions inside the disk AND behind the head plane are removed.
export function clipBehindHead(a,b,head,radius){
 const dx=b.x-a.x,dy=b.y-a.y,dz=b.depth-a.depth;
 const ox=a.x-head.x,oy=a.y-head.y,A=dx*dx+dy*dy,B=2*(ox*dx+oy*dy),C=ox*ox+oy*oy-radius*radius;
 const cuts=[0,1];
 if(A>1e-12){const disc=B*B-4*A*C;if(disc>=0){const root=Math.sqrt(disc);for(const t of [(-B-root)/(2*A),(-B+root)/(2*A)])if(t>0&&t<1)cuts.push(t);}}
 if(Math.abs(dz)>1e-12){const t=(head.depth-a.depth)/dz;if(t>0&&t<1)cuts.push(t);}
 cuts.sort((x,y)=>x-y);
 const at=t=>({x:a.x+dx*t,y:a.y+dy*t,depth:a.depth+dz*t});
 const output=[];
 for(let i=1;i<cuts.length;i++){
  const mid=at((cuts[i-1]+cuts[i])/2);
  if(Math.hypot(mid.x-head.x,mid.y-head.y)<radius&&mid.depth<head.depth)continue;
  if(cuts[i]-cuts[i-1]>1e-10)output.push([at(cuts[i-1]),at(cuts[i])]);
 }
 return output;
}
export function clipPolylineBehindHead(points,head,radius){return points.slice(1).flatMap((p,i)=>clipBehindHead(points[i],p,head,radius));}
