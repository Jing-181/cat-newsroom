// Test adapter consumes the real skin's emitted SVG attributes, not a second pose renderer.
// Unsupported SVG syntax fails loudly so newly introduced primitives cannot escape coverage.
import assert from 'node:assert/strict';
export function svgNode(tag='svg') { return {tag,attrs:{},children:[],setAttribute(k,v){this.attrs[k]=String(v);},append(...nodes){this.children.push(...nodes);},remove(){this.removed=true;}}; }
export function withSvgDocument(fn){const old=global.document;global.document={createElementNS:(_,tag)=>svgNode(tag)};try{return fn();}finally{global.document=old;}}
export function pathPoints(d){
 const tokens=(d||'').match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/g)||[];
 const points=[];let i=0,x=0,y=0,command;
 const n=()=>{const value=Number(tokens[i++]);assert.ok(Number.isFinite(value),'numeric SVG operand');return value;};
 const add=(px,py)=>points.push({x:px,y:py});
 while(i<tokens.length){if(/^[a-z]$/i.test(tokens[i]))command=tokens[i++];
 if(command==='M'||command==='L'){x=n();y=n();add(x,y);if(command==='M')command='L';}
 else if(command==='H'){x=n();add(x,y);}else if(command==='V'){y=n();add(x,y);}
 else if(command==='a'){
 const rx=n(),ry=n(),rotation=n(),large=n(),sweep=n(),dx=n(),dy=n();
 assert.ok(rx===ry&&rotation===0&&dy===0&&Math.abs(dx)===2*rx,'only emitted circular semicircles are supported');
 assert.ok((large===0||large===1)&&(sweep===0||sweep===1));
 const cx=x+dx/2;add(cx-rx,y-ry);add(cx+rx,y+ry);x+=dx;y+=dy;add(x,y);
 }else throw new Error(`Unhandled SVG path command ${command}`);
 }
 return points;
}
export function svgBounds(svg){
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 const visit=(node,inherited={})=>{
 const attrs={...inherited,...node.attrs};if(attrs.visibility==='hidden'||attrs.display==='none')return;
 assert.ok(!attrs.transform,'visible transforms need explicit bounds support');
 const stroke=attrs.stroke==='none'?0:Number(attrs['stroke-width']||1)/2;
 const include=p=>{minX=Math.min(minX,p.x-stroke);maxX=Math.max(maxX,p.x+stroke);minY=Math.min(minY,p.y-stroke);maxY=Math.max(maxY,p.y+stroke);};
 if(node.tag==='path')pathPoints(node.attrs.d).forEach(include);
 else if(node.tag==='circle'){const x=Number(attrs.cx),y=Number(attrs.cy),r=Number(attrs.r);assert.ok([x,y,r].every(Number.isFinite));include({x:x-r,y:y-r});include({x:x+r,y:y+r});}
 else assert.ok(['svg','g'].includes(node.tag),`unhandled primitive ${node.tag}`);
 node.children.forEach(child=>visit(child,attrs));
 };visit(svg);return {minX,minY,maxX,maxY};
}
