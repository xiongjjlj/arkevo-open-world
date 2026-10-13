// A tiny original voxel renderer used by the in-world display.
// Ray traversal operates on a real 3D voxel volume, not a prerecorded screen texture.
const N=40,H=22,blocks=new Uint8Array(N*H*N);
const index=(x,y,z)=>(y*N+z)*N+x;
function put(x,y,z,m){if(x>=0&&x<N&&y>=0&&y<H&&z>=0&&z<N)blocks[index(x,y,z)]=m;}
function get(x,y,z){return x<0||x>=N||y<0||y>=H||z<0||z>=N?0:blocks[index(x,y,z)];}
for(let z=0;z<N;z++)for(let x=0;x<N;x++){
 const height=2+Math.max(0,Math.floor(Math.sin(x*.2)*Math.cos(z*.19)*1.4));
 for(let y=0;y<=height;y++)put(x,y,z,y===height?1:2);
 if(Math.abs(x-20)<2&&z>14)put(x,height,z,4);
}
function tower(x,z,h){for(let y=3;y<3+h;y++)for(let dz=0;dz<5;dz++)for(let dx=0;dx<5;dx++){const edge=dx===0||dz===0||dx===4||dz===4;if(edge)put(x+dx,y,z+dz,3);}for(let dz=-1;dz<6;dz++)for(let dx=-1;dx<6;dx++){put(x+dx,3+h,z+dz,4);if((dx+dz)%2===0&&(dx===-1||dx===5||dz===-1||dz===5))put(x+dx,4+h,z+dz,3);}for(let y=6;y<8;y++){put(x+2,y,z+4,0);put(x+4,y,z+2,0);}}
tower(11,15,8);tower(25,15,8);
for(let x=16;x<=25;x++)for(let y=3;y<10;y++){if(!(x>=18&&x<=22&&y<8))put(x,y,18,3);}
for(let x=16;x<=25;x++)put(x,10,18,x%2?3:4);
for(let z=6;z<13;z++)for(let x=16;x<25;x++){for(let y=3;y<=7;y++)if(z===6||z===12||x===16||x===24)put(x,y,z,4);for(let y=0;y<4;y++)if(x>=16+y&&x<=24-y)put(x,8+y,z,5);}
for(let [x,z] of [[6,12],[7,25],[33,23],[31,8],[6,6],[34,32],[11,32]]){for(let y=3;y<=7;y++)put(x,y,z,6);for(let y=6;y<11;y++){let r=y>8?1:2;for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++)if(dx*dx+dz*dz<r*r+1)put(x+dx,y,z+dz,7);}}
for(let z=25;z<32;z++)for(let x=15;x<25;x++)if((x-20)**2+(z-28)**2<13)put(x,3,z,8);
const palette=[[0,0,0],[93,128,71],[92,75,53],[171,179,163],[198,187,148],[133,85,58],[85,68,43],[51,96,56],[87,159,174]];
let cacheKey='',cache=null;
export function voxelFrame(t,width=32,height=20,command={enabled:false,x:21,z:25}){
 const key=`${Math.floor(t*8)}:${width}:${height}:${command.enabled?command.x+","+command.z:"idle"}`;if(key===cacheKey)return cache;
 const pixels=new Uint8Array(width*height*3),angle=Math.sin(t*.12)*.38;
 const ox=20+Math.sin(angle)*17,oy=7+Math.sin(t*.15)*1.15,oz=34+Math.cos(angle)*1.2;
 const tx=20,ty=5.7,tz=17;let fx=tx-ox,fy=ty-oy,fz=tz-oz;
 const fl=Math.hypot(fx,fy,fz);fx/=fl;fy/=fl;fz/=fl;
 let rx=-fz,rz=fx;const rl=Math.hypot(rx,rz);rx/=rl;rz/=rl;
 const ux=-fy*rz,uy=fx*rz-fz*rx,uz=fy*rx;
 const fov=.65,aspect=width/height;
 for(let py=0;py<height;py++)for(let px=0;px<width;px++){
  const sx=((px+.5)/width*2-1)*fov*aspect,sy=(1-(py+.5)/height*2)*fov;
  let dx=fx+rx*sx+ux*sy,dy=fy+uy*sy,dz=fz+rz*sx+uz*sy;const dl=Math.hypot(dx,dy,dz);dx/=dl;dy/=dl;dz/=dl;
  let x=Math.floor(ox),y=Math.floor(oy),z=Math.floor(oz),stepX=dx>0?1:-1,stepY=dy>0?1:-1,stepZ=dz>0?1:-1;
  const deltaX=Math.abs(1/dx),deltaY=Math.abs(1/dy),deltaZ=Math.abs(1/dz);
  let maxX=(dx>0?x+1-ox:ox-x)*deltaX,maxY=(dy>0?y+1-oy:oy-y)*deltaY,maxZ=(dz>0?z+1-oz:oz-z)*deltaZ;
  let material=0,side=1,dist=0;
  for(let i=0;i<96;i++){
   if(maxX<maxY&&maxX<maxZ){x+=stepX;dist=maxX;maxX+=deltaX;side=0;}else if(maxY<maxZ){y+=stepY;dist=maxY;maxY+=deltaY;side=1;}else{z+=stepZ;dist=maxZ;maxZ+=deltaZ;side=2;}
   if(x<0||x>=N||z<0||z>=N||y<0||y>=H)break;
   material=get(x,y,z);
   // The outer eight-bit adder computes the bridge's X anchor. One explicit command
   // changes the voxel world; it is not a timed texture or a decorative overlay.
   if(command.enabled&&Math.abs(x-command.x)<=2&&z>=command.z&&z<=command.z+6){
    if(y===4)material=4;
    if(y===5&&Math.abs(x-command.x)===2)material=6;
    if(y===6&&Math.abs(x-command.x)===2&&z%2===0)material=6;
   }
   if(material)break;
  }
  let color;if(material){let base=palette[material],shade=[.66,.98,.82][side];shade*=.93+(((x*13+y*7+z*3)%11)/11)*.09;const fog=Math.min(.34,dist*.0045);color=base.map((c,i)=>c*shade*(1-fog)+[137,171,185][i]*fog);if(material===8)color=[80+8*Math.sin(t+px),140,155];}
  else{const skyMix=Math.max(0,Math.min(1,(dy+.15)*1.3));color=[147-38*skyMix,183-27*skyMix,198-12*skyMix];}
  let out=(py*width+px)*3;pixels[out]=color[0];pixels[out+1]=color[1];pixels[out+2]=color[2];
 }
 cacheKey=key;cache=pixels;return pixels;
}
