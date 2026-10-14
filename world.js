import {mergeGeometries} from './vendor/utils/BufferGeometryUtils.js';
import {RGBELoader} from './vendor/loaders/RGBELoader.js';
import {experimentAt} from './experiments.js?v=4';
import {stateAt} from './logic.js';
import * as THREE from './vendor/three.module.js';
import {EffectComposer} from './vendor/postprocessing/EffectComposer.js';
import {RenderPass} from './vendor/postprocessing/RenderPass.js';
import {SSAOPass} from './vendor/postprocessing/SSAOPass.js';
import {OutputPass} from './vendor/postprocessing/OutputPass.js';

// Original procedural environment. Every state is a deterministic function of time.
export function createWorld(canvas, options = {}) {
  let day = options.day || 1, cameraMode = options.camera || 'orbit';
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false, powerPreference:'high-performance'});
  renderer.setPixelRatio(options.pixelRatio || Math.min(window.devicePixelRatio || 1, (options.width||1280)>1400?1:1.5));
  renderer.setSize(options.width || canvas.clientWidth || 1280, options.height || canvas.clientHeight || 720, false);
  renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=.84;
  renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;let frameNumber=0; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene(); scene.background=new THREE.Color('#b5d1d3'); scene.fog=new THREE.FogExp2('#879aa6',.0032);
  const camera=new THREE.PerspectiveCamera(42,1,.1,500); const v=new THREE.Vector3();
  const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));const aoPass=new SSAOPass(scene,camera,canvas.width,canvas.height,16);aoPass.kernelRadius=.85;aoPass.minDistance=.0008;aoPass.maxDistance=.045;composer.addPass(aoPass);aoPass.setSize(Math.round(canvas.width*.55),Math.round(canvas.height*.55));composer.addPass(new OutputPass());
  const hemi=new THREE.HemisphereLight('#bfdae7','#27322d',.85); scene.add(hemi);
  const sun=new THREE.DirectionalLight('#ffe0b2',4.3); sun.position.set(-62,40,24); sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-75,right:75,top:70,bottom:-60,near:1,far:170});sun.shadow.bias=-.00025;sun.shadow.normalBias=.035;scene.add(sun);
  const fill=new THREE.DirectionalLight('#c5e6ff',.65);fill.position.set(40,20,-35);scene.add(fill);
  const envCanvas=document.createElement('canvas');envCanvas.width=1024;envCanvas.height=512;const ec=envCanvas.getContext('2d');let eg=ec.createLinearGradient(0,0,0,512);eg.addColorStop(0,'#9bb4c1');eg.addColorStop(.46,'#e7f0ef');eg.addColorStop(.52,'#b9b6a1');eg.addColorStop(1,'#444e44');ec.fillStyle=eg;ec.fillRect(0,0,1024,512);ec.fillStyle='#fff3d6';ec.fillRect(140,135,80,90);const et=new THREE.CanvasTexture(envCanvas);et.mapping=THREE.EquirectangularReflectionMapping;scene.environment=new THREE.PMREMGenerator(renderer).fromEquirectangular(et).texture;scene.environmentIntensity=.58;
  const mat=(color,roughness=.65,metalness=.05)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  const M={stone:mat('#7c8680',.72,.15),stoneLight:mat('#a0aba1',.63,.2),edge:mat('#7e9692',.57),dark:mat('#354c4b',.61),copper:mat('#96735b',.28,.84),wood:mat('#94714e',.8),woodLight:mat('#c9a774',.72),glass:mat('#365a60',.24,.65),ground:mat('#687567',.94),robot:mat('#fa913d',.31,.4),black:mat('#253631',.5,.4),cyan:new THREE.MeshStandardMaterial({color:'#65eadd',emissive:'#19b8a4',emissiveIntensity:1.8,roughness:.3}),whiteGlow:new THREE.MeshStandardMaterial({color:'#fff2b2',emissive:'#ffd86a',emissiveIntensity:1.2,roughness:.4})};
  const textureManager=new THREE.LoadingManager();const texturesReady=new Promise(resolve=>{textureManager.onLoad=resolve;});const texLoader=new THREE.TextureLoader(textureManager);const loadTex=(name,rep=1,srgb=false)=>{let t=texLoader.load('./textures/'+name+'.jpg');t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rep,rep);t.anisotropy=8;if(srgb)t.colorSpace=THREE.SRGBColorSpace;return t;};const rockMap=loadTex('rock-color',3,true),rockNormal=loadTex('rock-normal',3),rockRough=loadTex('rock-rough',3);const rockMat=new THREE.MeshStandardMaterial({color:'#aab0a4',map:rockMap,normalMap:rockNormal,normalScale:new THREE.Vector2(.75,.75),roughnessMap:rockRough,roughness:.92});
  const grain=document.createElement('canvas');grain.width=grain.height=256;const gc=grain.getContext('2d'),gi=gc.createImageData(256,256);for(let i=0;i<gi.data.length;i+=4){const n=203+((Math.sin(i*13.173)*15293)%1)*18;gi.data[i]=gi.data[i+1]=gi.data[i+2]=n;gi.data[i+3]=255;}gc.putImageData(gi,0,0);const grainTex=new THREE.CanvasTexture(grain);grainTex.wrapS=grainTex.wrapT=THREE.RepeatWrapping;grainTex.repeat.set(3,3);for(let key of ['stone','stoneLight','dark','edge','wood','woodLight']){M[key].map=grainTex;M[key].bumpMap=grainTex;M[key].bumpScale=.10;}
  let computeState=null;const computeVisuals=[];
  const geometries=[]; const objects=[]; const animated=[];const dayGroups={};
  const boxG=new THREE.BoxGeometry(1,1,1); const cylG=new THREE.CylinderGeometry(1,1,1,64); const sphereG=new THREE.SphereGeometry(1,24,16);
  const make=(g,m,parent=scene)=>{let o=new THREE.Mesh(g,m);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
  const box=(parent,x,y,z,w,h,d,m)=>{const o=make(boxG,m,parent);o.position.set(x,y,z);o.scale.set(w,h,d);return o;};
  const cyl=(parent,x,y,z,r,h,m,r2=r)=>{const o=make(r2===r?cylG:new THREE.CylinderGeometry(r2/r,1,1,64),m,parent);o.position.set(x,y,z);o.scale.set(r,h,r);return o;};
  const sphere=(p,x,y,z,r,m)=>{const o=make(sphereG,m,p);o.position.set(x,y,z);o.scale.setScalar(r);return o;};
  const beam=(p,a,b,r,m)=>{let diff=new THREE.Vector3().subVectors(b,a);let o=make(cylG,m,p);o.position.copy(a).add(b).multiplyScalar(.5);o.scale.set(r,diff.length(),r);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),diff.normalize());return o;};
  const torus=(p,x,y,z,r,t,m,arc=Math.PI*2)=>{let g=new THREE.TorusGeometry(r,t,12,120,arc),o=make(g,m,p);o.position.set(x,y,z);return o;};
  const glowLine=(p,points,color='#84ded0')=>{let g=new THREE.BufferGeometry().setFromPoints(points);let l=new THREE.Line(g,new THREE.LineBasicMaterial({color,transparent:true,opacity:.7}));p.add(l);return l;};
  const noise=(x,z)=>Math.sin(x*.16+Math.sin(z*.11)*2)*Math.cos(z*.13)+Math.sin(x*.43-z*.24)*.27+Math.cos(z*.71+x*.51)*.12;
  const smooth=(a,b,t)=>{t=THREE.MathUtils.clamp((t-a)/(b-a),0,1);return t*t*(3-2*t);};
  const sky=make(new THREE.SphereGeometry(240,48,24),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{},vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 p;void main(){float h=normalize(p).y;vec3 c=mix(vec3(.73,.82,.81),vec3(.31,.54,.68),smoothstep(0.,.85,h));float s=pow(max(dot(normalize(p),normalize(vec3(-.6,.62,.4))),0.),140.); c+=vec3(1.,.73,.43)*s*.8;gl_FragColor=vec4(c,1.);}'}));sky.castShadow=false;sky.receiveShadow=false;
  const waterNormals=texLoader.load('./textures/waternormals.jpg');waterNormals.wrapS=waterNormals.wrapT=THREE.RepeatWrapping;waterNormals.repeat.set(65,65);waterNormals.anisotropy=8;
  const waterMaterial=new THREE.MeshPhysicalMaterial({color:'#153e4a',metalness:.52,roughness:.22,normalMap:waterNormals,normalScale:new THREE.Vector2(.22,.22),envMapIntensity:1.1,clearcoat:.35,clearcoatRoughness:.16});waterMaterial.userData.time={value:0};waterMaterial.onBeforeCompile=shader=>{shader.uniforms.worldTime=waterMaterial.userData.time;shader.vertexShader='uniform float worldTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.z += sin(position.x*.17+worldTime*.38)*.075 + sin(position.y*.21-worldTime*.23)*.05;');};
  const water=make(new THREE.PlaneGeometry(2400,2400,150,150),waterMaterial);water.rotation.x=-Math.PI/2;water.position.y=-2.65;water.receiveShadow=false;water.castShadow=false;
  const environmentReady=new Promise(resolve=>new RGBELoader().load('./textures/rocky_ridge_puresky_1k.hdr',texture=>{texture.mapping=THREE.EquirectangularReflectionMapping;scene.environment=new THREE.PMREMGenerator(renderer).fromEquirectangular(texture).texture;scene.environmentIntensity=.75;scene.environmentRotation.y=.75;scene.background=texture;scene.backgroundIntensity=.92;scene.backgroundRotation.y=.75;scene.backgroundBlurriness=.015;sky.visible=false;resolve();},undefined,()=>resolve()));
  function terrain(cx,cz,rx,rz,height,seed=0){
    let g=new THREE.PlaneGeometry(rx*2,rz*2,210,170);g.rotateX(-Math.PI/2);let pos=g.attributes.position,cols=[];
    for(let i=0;i<pos.count;i++){let x=pos.getX(i),z=pos.getZ(i),u=x/rx,q=z/rz,dist=Math.sqrt(u*u+q*q);let ridge=Math.max(0,1-dist);let y=-4+Math.pow(ridge,.55)*height+noise(x+seed,z-seed)*Math.min(ridge*9,4.4)+Math.sin(x*.87+z*.3)*Math.sin(z*.83)*ridge*.9;if(seed!==0){y=-4+Math.pow(ridge,.64)*height*(.53+.58*Math.abs(noise(x*.30+seed,z*.33-seed)))+ridge*(Math.sin(x*.53+z*.20)*Math.cos(z*.49)*2.8+Math.sin(x*1.72-z*.94)*.45);}if(seed===0){let flat=1-smooth(40.0,51.5,Math.sqrt(x*x+z*z));y=THREE.MathUtils.lerp(y,-.12+noise(x,z)*.04,flat);}pos.setY(i,y);let c=new THREE.Color(y>1.5?'#6b7468':y>-.8?'#869075':'#6c756d');c.multiplyScalar(.83+Math.sin(i*13.13)*.035+noise(x,z)*.09);cols.push(c.r,c.g,c.b);}
    g.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));g.computeVertexNormals();let o=make(g,new THREE.MeshStandardMaterial({vertexColors:true,map:loadTex('rock-color',seed===0?14:20,true),normalMap:loadTex('rock-normal',seed===0?14:20),normalScale:new THREE.Vector2(.32,.32),roughness:1}));o.position.set(cx,0,cz);return o;
  }
  terrain(0,0,64,54,9,0);terrain(-115,-140,80,40,33,3);terrain(75,-165,98,55,42,5);terrain(145,-100,65,36,29,13);terrain(-152,10,56,38,23,21);
  function rock(x,z,s,seed){let g=new THREE.SphereGeometry(1,15,10),p=g.attributes.position;for(let i=0;i<p.count;i++){let xx=p.getX(i),yy=p.getY(i),zz=p.getZ(i);let d=1+.13*Math.sin(xx*8+yy*7+zz*4+seed)+.05*Math.cos(zz*15+seed);p.setXYZ(i,xx*d,yy*d,zz*d);}g.computeVertexNormals();let o=make(g,rockMat);o.position.set(x,-1.3,z);o.scale.set(s,s*.53,s*.72);o.rotation.y=seed;return o;}
  for(let i=0;i<47;i++){let a=i*2.3999,r=48+Math.sin(i*4)*7;rock(Math.cos(a)*r,Math.sin(a)*r*.72,1.2+(Math.sin(i*9)+1)*1.5,i);}
  const vegetation=new THREE.Group();scene.add(vegetation);
  const twigG=new THREE.PlaneGeometry(1,2);const uvs=twigG.attributes.uv;for(let i=0;i<uvs.count;i++){uvs.setXY(i,uvs.getX(i)*.23+.002,uvs.getY(i)*.44+.55);}const foliageMat=new THREE.MeshStandardMaterial({color:'#9fad8e',map:loadTex('twig_diff',1,true),alphaMap:loadTex('twig_alpha',1),normalMap:loadTex('twig_nor_gl',1),normalScale:new THREE.Vector2(.5,.5),alphaTest:.40,side:THREE.DoubleSide,roughness:.9});
  const leaves=new THREE.InstancedMesh(twigG,foliageMat,48000);leaves.castShadow=false;leaves.receiveShadow=true;vegetation.add(leaves);const branches=new THREE.InstancedMesh(new THREE.CylinderGeometry(.25,1,1,7),M.wood,12000);branches.castShadow=true;vegetation.add(branches);let leafIndex=0,branchIndex=0;const ld=new THREE.Object3D(),bd=new THREE.Object3D();
  for(let i=0;i<145;i++){let a=i*2.3999,r=43+((i*7.13)%14),x=Math.cos(a)*r,z=Math.sin(a)*r*.84;if(z>22&&Math.abs(x)<22)continue;let h=4.5+(Math.sin(i*7)+1)*2.1;cyl(vegetation,x,h*.46-.08,z,.12,h*.92,M.wood);for(let j=0;j<9;j++){let q=j/9,y=h*(.24+q*.7),rad=(1-q)*h*.24+.10;for(let k=0;k<7;k++){let ang=k*Math.PI*2/7+j*.53;let start=new THREE.Vector3(x,y,z),end=new THREE.Vector3(x+Math.sin(ang)*rad,y+.12, z+Math.cos(ang)*rad);let diff=end.clone().sub(start);bd.position.copy(start).add(end).multiplyScalar(.5);bd.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),diff.clone().normalize());bd.scale.set(.025,diff.length(),.025);bd.updateMatrix();branches.setMatrixAt(branchIndex++,bd.matrix);for(let n=0;n<5;n++){let part=.26+n*.16;ld.position.set(x+Math.sin(ang)*rad*part,y+.10+Math.sin(n+j)*.10,z+Math.cos(ang)*rad*part);ld.scale.set(.28+rad*.17,.28+rad*.12,1);ld.rotation.set(.12+Math.sin(k)*.32,ang+n*.8,Math.sin(n)*.45);ld.updateMatrix();leaves.setMatrixAt(leafIndex++,ld.matrix);}}}}leaves.count=leafIndex;branches.count=branchIndex;
  // Precision-cut stone promenade with contact seams and copper inlay.
  cyl(scene,0,.07,0,19.3,.25,M.dark);cyl(scene,0,.22,0,18.9,.22,M.stone);
  for(let r of [6,12.7,18.4]){let ring=torus(scene,0,.345,0,r,.045,M.copper);ring.rotation.x=Math.PI/2;}
  for(let i=0;i<32;i++){let a=i*Math.PI/16;beam(scene,new THREE.Vector3(Math.sin(a)*6,.35,Math.cos(a)*6),new THREE.Vector3(Math.sin(a)*18.8,.35,Math.cos(a)*18.8),.022,M.edge);}
  for(let i=0;i<12;i++){let a=i*Math.PI/6;cyl(scene,Math.sin(a)*19,.9,Math.cos(a)*19,.16,1.6,M.dark);sphere(scene,Math.sin(a)*19,1.76,Math.cos(a)*19,.18,M.whiteGlow);}
  // Dock and stacked field supplies remain visible throughout the experiment.
  box(scene,-18,.35,14,7,.45,6,M.wood);for(let i=0;i<16;i++)box(scene,-21+i*.42,.59,14,.38,.08,5.8,i%3===0?M.woodLight:M.wood);
  for(let x of [-20.8,-15.2])for(let z of [11.2,16.7])cyl(scene,x,-.4,z,.24,3.2,M.wood);
  for(let i=0;i<7;i++){let o=box(scene,-19+(i%3)*1.4,1+Math.floor(i/3)*.7,13.8,1.15,.66,1.2,i%2?M.dark:M.woodLight);box(scene,o.position.x,o.position.y+.35,o.position.z,1.2,.07,1.24,M.copper);}
  function newDay(d){let g=new THREE.Group();dayGroups[d]=g;scene.add(g);return g;}
  function schedule(o,start,dur=4,opts={}){animated.push({o,start,dur,base:o.position.clone(),scale:o.scale.clone(),...opts});return o;}
  function column(p,x,z,height,start){let g=new THREE.Group();p.add(g);g.position.set(x,.34,z);cyl(g,0,.14,0,.78,.28,M.stoneLight);cyl(g,0,.43,0,.58,.30,M.copper);cyl(g,0,height/2,0,.40,height-.7,M.stoneLight);cyl(g,0,height-.3,0,.59,.25,M.copper);cyl(g,0,height-.10,0,.72,.20,M.stoneLight);if(start!==undefined)schedule(g,start,3);return g;}
  // Day 01: a small beam bridge; a failed span is measured and replaced.
  let d1=newDay(1);for(let z of [-3.8,3.8]){box(d1,0,.7,z,9,.75,2.6,M.stone);for(let x of [-3.5,3.5])cyl(d1,x,1.25,z,.4,1.0,M.stoneLight);}
  for(let i=0;i<11;i++){let z=-3.5+i*.7;let o=box(d1,0,1.4,z,7.4,.27,.60,M.woodLight);schedule(o,2+i*.7,1.2);}
  for(let x of [-3.3,3.3]){let o=box(d1,x,1.18,0,.26,.34,8.2,M.wood);schedule(o,29,3);for(let z of [-3.5,0,3.5]){let b=box(d1,x,2.15,z,.18,1.4,.18,M.wood);schedule(b,37+z*.3,2);}let b=box(d1,x,2.8,0,.16,.15,8,M.woodLight);schedule(b,42,3);}
  for(let z of [-2.7,-1.1,.5,2.1]){let o=beam(d1,new THREE.Vector3(-3,1.17,z),new THREE.Vector3(3,1.17,z+.6),.075,M.copper);schedule(o,31+z,2);}
  // Day 02: a full stone arcade built across the tidal edge.
  let d2=newDay(2);for(let side of [-1,1]){box(d2,side*11.5,.6,2,3.8,.55,13,M.stoneLight);for(let j=0;j<5;j++)column(d2,side*11.5,-3.2+j*2.6,4.8);}
  for(let i=0;i<13;i++){let x=-10.8+i*1.8;let o=box(d2,x,4.75,2,1.72,.45,6.7,M.stoneLight);schedule(o,2+i*1.2,2);box(d2,x,.64,-1.35,.07,.05,2,M.edge);}
  for(let z of [-1.25,5.25]){let arch=torus(d2,0,.65,z,10.5,.40,M.stoneLight,Math.PI);arch.scale.y=.38;schedule(arch,9,6);for(let x of [-7,-3.5,0,3.5,7]){let beamO=box(d2,x,3.25,z,.20,2.5,.20,M.copper);schedule(beamO,23+(x+7)*.35,2);}let rail=box(d2,0,5.75,z,23,.14,.14,M.copper);schedule(rail,36,4);}
  for(let i=0;i<14;i++){let x=-11.4+i*1.75;for(let z of [-1.15,5.15]){let b=box(d2,x,5.32,z,.095,1.05,.095,M.dark);schedule(b,31+i*.65,1.5);}}
  // Day 05: a programmable annular observatory with a suspended calculator.
  let d5=newDay(5); buildObservatory(d5,false);
  // Day 10: a world-making machine, complete with a nested world simulation.
  let d10=newDay(10); buildObservatory(d10,true);
  function buildObservatory(p,final){
    cyl(p,0,.6,0,12.6,.6,M.stoneLight);cyl(p,0,.94,0,11.9,.15,M.dark);cyl(p,0,1.05,0,10.8,.12,M.stone);
    for(let i=0;i<16;i++){let a=i*Math.PI/8,x=Math.sin(a)*11.7,z=Math.cos(a)*11.7;column(p,x,z,7.4,final?undefined:i*.62);let cap=box(p,x,7.83,z,4.2,.50,1.65,M.stoneLight);cap.rotation.y=a;schedule(cap,final?0:12+i*.5,2);let light=box(p,x,7.54,z,3.5,.10,1.71,M.cyan);light.rotation.y=a;schedule(light,final?0:22+i*.35,1);}
    for(let y of [8.1,8.48]){let ring=torus(p,0,y,0,11.7,.26,M.copper);ring.rotation.x=Math.PI/2;schedule(ring,final?0:22,4);}
    for(let i=0;i<10;i++){let a=i*Math.PI/5,r=8.3;let g=new THREE.Group();p.add(g);g.position.set(Math.sin(a)*r,1.1,Math.cos(a)*r);g.rotation.y=a;box(g,0,1.0,0,2.5,1.8,1.45,M.dark);box(g,0,2.01,0,2.6,.18,1.55,M.stoneLight);for(let j=0;j<7;j++){box(g,-.95+j*.32,1.25,.745,.14,.9,.035,j%3===0?M.cyan:M.copper);}schedule(g,final?0:27+i*.7,2);}
    cyl(p,0,1.25,0,4.4,.6,M.dark);cyl(p,0,1.58,0,4.1,.1,M.copper);
    let orb=torus(p,0,5,0,3.8,.16,M.copper);orb.rotation.y=.5;schedule(orb,final?0:36,4);let orb2=torus(p,0,5,0,3.8,.10,M.cyan);orb2.rotation.x=.8;schedule(orb2,final?0:39,4);objects.push({type:'gyro',o:orb2,day:final?10:5});
    for(let i=0;i<7;i++){let o=cyl(p,0,2.15+i*.40,0,2.9-i*.2,.16,i%2?M.copper:M.dark);schedule(o,final?0:31+i*.7,2);}
    if(!final){for(let i=0;i<28;i++){let a=i*2.3999;let o=sphere(p,Math.sin(a)*2.25,4.0+(i%7)*.38,Math.cos(a)*2.25,.11,i%3?M.cyan:M.whiteGlow);schedule(o,42+i*.15,1);}return;}
    // Tall buttressed crown, subtly asymmetric towers and elevated walkways.
    for(let i=0;i<8;i++){let a=i*Math.PI/4,r=15.7,x=Math.sin(a)*r,z=Math.cos(a)*r;let g=new THREE.Group();p.add(g);g.position.set(x,.34,z);g.rotation.y=a;const h=z>9?8.5:i%2?12:15.8;box(g,0,h/2,0,1.15,h,1.8,M.stoneLight);box(g,0,h/2,.91,.72,h-.8,.06,M.dark);for(let j=0;j<7;j++){box(g,0,1.3+j*(h-1)/7,.96,.74,.055,.045,M.cyan);}box(g,0,h+.16,0,1.65,.28,2.2,M.copper);for(let s of [-1,1])beam(g,new THREE.Vector3(s*1.8,0,0),new THREE.Vector3(s*.8,h*.72,0),.16,M.copper);schedule(g,3+i*1.5,3);}
    for(let y of [11.4,12.0]){let o=torus(p,0,y,0,15.6,.24,y<12?M.stoneLight:M.copper);o.rotation.x=Math.PI/2;schedule(o,16,5);}
    for(let i=0;i<24;i++){let a=i*Math.PI/12;let o=box(p,Math.sin(a)*15.6,11.65,Math.cos(a)*15.6,3.85,.13,1.3,M.dark);o.rotation.y=a;schedule(o,18+i*.18,2);}
    // A monumental circular display holds a second, smaller landscape.
    let screen=new THREE.Group();p.add(screen);screen.position.set(0,13.0,-9.8);screen.scale.setScalar(1.45);let outer=torus(screen,0,0,0,5.9,.32,M.copper);let inner=torus(screen,0,0,.07,5.50,.065,M.cyan);let disk=make(new THREE.CircleGeometry(5.48,120),new THREE.MeshStandardMaterial({color:'#1d3e45',emissive:'#12363d',emissiveIntensity:.6,roughness:.4,metalness:.3}),screen);disk.position.z=-.08;
    let nested=new THREE.Group();screen.add(nested);nested.visible=false;nested.position.set(0,-1.15,.48);let land=cyl(nested,0,0,0,3.35,.35,M.ground);land.scale.z=.40;let lake=cyl(nested,0,.20,0,3.13,.025,M.glass);lake.scale.z=.43;
    for(let i=0;i<9;i++){let x=(i%3-1)*1.55,z=(Math.floor(i/3)-1)*.68;let h=.40+(i%4)*.4;box(nested,x,h/2+.3,z,.75,h,.66,i%2?M.stoneLight:M.edge);box(nested,x,h+.31,z,.87,.08,.76,M.copper);for(let j=0;j<3;j++)box(nested,x-.2+j*.2,h*.5+.3,z+.34,.07,.13,.02,M.cyan);}
    for(let i=0;i<8;i++){let a=i*Math.PI/4;let cone=make(new THREE.ConeGeometry(.36,.9,18),M.ground,nested);cone.position.set(Math.sin(a)*2.8,.75,Math.cos(a)*1.0);}
    schedule(screen,15,2,{screen:true});objects.push({type:'nested',o:nested,day:10});
    for(let i=0;i<48;i++){let a=i*Math.PI/24;let dot=sphere(screen,Math.sin(a)*5.67,Math.cos(a)*5.67,.17,.045,i%4===0?M.whiteGlow:M.cyan);objects.push({type:'pulse',o:dot,index:i,day:10});}
    for(let side of [-1,1]){beam(p,new THREE.Vector3(side*4,1.5,-3),new THREE.Vector3(side*4,7,-3),.28,M.copper);box(p,side*4,3,-3,1.1,4.3,1.1,M.stoneLight);}
    let halo=torus(p,0,18.8,0,8,.13,M.cyan);halo.rotation.x=Math.PI/2;schedule(halo,39,5);let ring=torus(p,0,18.8,0,8.5,.18,M.copper);ring.rotation.x=Math.PI/2;schedule(ring,36,4);
    for(let i=0;i<8;i++){let a=i*Math.PI/4;let o=beam(p,new THREE.Vector3(Math.sin(a)*11.7,8.3,Math.cos(a)*11.7),new THREE.Vector3(Math.sin(a)*8.5,18.8,Math.cos(a)*8.5),.13,M.copper);schedule(o,30+i*.9,3);}
  }
  // Electronic structures are explicit components: diodes, relays, registers and data buses.
  function label(p,text,x,y,z,w=3,color='#b2d5c8'){
    const c=document.createElement('canvas');c.width=1024;c.height=160;const ctx=c.getContext('2d');ctx.fillStyle='#213a37';ctx.fillRect(0,0,1024,160);ctx.strokeStyle='#789989';ctx.lineWidth=3;ctx.strokeRect(6,6,1012,148);ctx.fillStyle=color;let fontSize=72;ctx.font=`600 ${fontSize}px monospace`;while(ctx.measureText(text).width>960&&fontSize>24){fontSize-=2;ctx.font=`600 ${fontSize}px monospace`;}ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,84);let tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;let o=make(new THREE.PlaneGeometry(w,w*160/1024),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}),p);o.position.set(x,y,z);o.castShadow=false;return o;
  }
  function compact(group){const groups=new Map();for(const o of [...group.children]){if(!o.isMesh||o.isInstancedMesh)continue;let arr=groups.get(o.material)||[];arr.push(o);groups.set(o.material,arr);}for(const [m,arr] of groups){if(arr.length<2)continue;const gs=arr.map(o=>{o.updateMatrix();return o.geometry.clone().applyMatrix4(o.matrix);});const merged=mergeGeometries(gs);if(!merged)continue;arr.forEach(o=>group.remove(o));make(merged,m,group);gs.forEach(g=>g.dispose());}}
  function bank(parent,x,y,z,cols,rows,name,start=0){
    let g=new THREE.Group();parent.add(g);g.position.set(x,y,z);const w=cols*.29+.5,h=rows*.34+.8;
    box(g,0,h/2,0,w+.18,h+.18,.66,M.copper);box(g,0,h/2,.08,w,h,.62,M.dark);box(g,0,.04,.1,w+.45,.14,.92,M.stoneLight);label(g,name,0,h-.09,.41,w*.9);
    for(let edge of [-1,1]){box(g,edge*w/2,h/2,.40,.055,h-.16,.16,M.copper);for(let bolt=0;bolt<5;bolt++)sphere(g,edge*w/2,.2+bolt*(h-.4)/4,.49,.045,M.stoneLight);}for(let r=0;r<rows;r++){box(g,0,.40+r*.34,.42,w-.14,.04,.04,M.copper);}
    const diodeG=new THREE.CylinderGeometry(.049,.049,.21,12);diodeG.rotateX(Math.PI/2);const diodeM=new THREE.MeshStandardMaterial({color:'#9fa987',emissive:'#143025',emissiveIntensity:.30,roughness:.34,metalness:.45});
    let inst=new THREE.InstancedMesh(diodeG,diodeM,cols*rows),ob=new THREE.Object3D();inst.castShadow=true;g.add(inst);
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){let i=r*cols+c;ob.position.set((c-(cols-1)/2)*.29,.56+r*.34,.47);ob.rotation.z=(r%2)*Math.PI/2;ob.updateMatrix();inst.setMatrixAt(i,ob.matrix);inst.setColorAt(i,new THREE.Color('#2e6556'));}
    computeVisuals.push({type:'bank',o:inst,count:cols*rows,seed:x*13+z*7,group:parent});compact(g);schedule(g,start,3);return g;
  }
  function bus(parent,a,b,index=0,start=0){
    let g=new THREE.Group();parent.add(g);let mid=new THREE.Vector3(b.x,a.y,a.z);beam(g,a,mid,.050,M.copper);beam(g,mid,b,.050,M.copper);let path=[a,mid,b];glowLine(g,path,'#296d60');const dot=sphere(g,a.x,a.y,a.z,.085,M.cyan);computeVisuals.push({type:'bus',o:dot,path,index,group:parent});compact(g);schedule(g,start,1.5);
  }
  function alu(parent,y,start=0){let g=new THREE.Group();parent.add(g);g.position.y=y;box(g,0,.30,0,5.0,.55,3.5,M.dark);box(g,0,.61,0,4.7,.06,3.2,M.copper);for(let i=0;i<8;i++){let x=-1.96+i*.56;box(g,x,.87,0,.39,.49,2.6,M.black);for(let z of [-1.12,-.7,-.28,.14,.56,.98]){let tube=cyl(g,x,1.21,z,.11,.33,M.glass);cyl(g,x,1.39,z,.095,.055,M.cyan);}}label(g,'8-BIT  /  ARITHMETIC CORE',0,.31,1.77,4.2);compact(g);schedule(g,start,4);return g;}
  // The early bridge is a workbench for the first reversible logic experiment.
  alu(d2,4.99,12);
  for(let i=0;i<8;i++){let g=bank(d2,-8+i*2.24,5.0,1.8,4,3,'BIT '+i,2+i*1.5);g.scale.setScalar(.9);for(let bit=0;bit<3;bit++)bus(d2,new THREE.Vector3(-8+i*2.24,5.11,2.8+bit*.18),new THREE.Vector3(-5+i*1.30,5.11,-.85+bit*.18),bit,12);}
  for(let [d,final]of [[d5,false],[d10,true]]){
    let stage=final?0:12;alu(d,2.1,stage);
    for(let side of [-1,1])for(let j=0;j<3;j++){
      let g=bank(d,side*7.2,1.10,-6+j*4.3,16,16,(side<0?'REG ':'RAM ')+String(j+1).padStart(2,'0'),stage+j*3);g.rotation.y=side<0?.18:-.18;
      for(let i=0;i<8;i++){let z=-6+j*4.3+i*.15;bus(d,new THREE.Vector3(side*7.1,1.21,z),new THREE.Vector3(side*2.6,1.21,z),i,stage+9);bus(d,new THREE.Vector3(side*2.6,1.21,z),new THREE.Vector3(side*(2.2-i*.18),2.25,1.25),i,stage+12);}
    }
    for(let side of [-1,1]){let console=new THREE.Group();d.add(console);console.position.set(side*5.5,1.1,8.4);box(console,0,.9,0,3.1,1.7,1.6,M.dark);box(console,0,1.80,0,3.25,.15,1.8,M.copper);for(let r=0;r<3;r++)for(let c=0;c<10;c++){cyl(console,-1.29+c*.28,1.91,-.55+r*.47,.06,.10,(r+c)%3?M.cyan:M.whiteGlow);}label(console,side<0?'INPUT BUS / 8':'OUTPUT / 8',0,1,.83,2.7);schedule(console,final?0:28,3);}
    // Bus bridge under a 32 x 20 addressable screen.
    for(let i=0;i<16;i++)bus(d,new THREE.Vector3(-2.1+i*.28,2.75,-1.7),new THREE.Vector3(-2.1+i*.28,5.1,-3),i,final?20:35);
    if(final){
      let disp=new THREE.Group();d.add(disp);disp.position.set(0,13.15,-8.68);disp.scale.setScalar(1.45);box(disp,0,0,0,9.55,5.98,.23,M.black);box(disp,0,-3.13,0,9.6,.20,.48,M.copper);label(disp,'WORLD ENGINE   /   64 × 40',0,-3.15,.26,8.5).scale.y=.55;
      const px=new THREE.InstancedMesh(boxG,new THREE.MeshBasicMaterial({color:'#ffffff'}),2560);disp.add(px);const q=new THREE.Object3D();for(let yy=0;yy<40;yy++)for(let xx=0;xx<64;xx++){q.position.set((xx-31.5)*.1405,(19.5-yy)*.1405,.16);q.scale.set(.1404,.1404,.026);q.updateMatrix();px.setMatrixAt(yy*64+xx,q.matrix);px.setColorAt(yy*64+xx,new THREE.Color('#82b2b2'));}computeVisuals.push({type:'screen',o:px,group:d});
      const cmdCanvas=document.createElement('canvas');cmdCanvas.width=1536;cmdCanvas.height=144;const cmdTex=new THREE.CanvasTexture(cmdCanvas);cmdTex.colorSpace=THREE.SRGBColorSpace;const cmdPanel=make(new THREE.PlaneGeometry(9.1,.86),new THREE.MeshBasicMaterial({map:cmdTex}),disp);cmdPanel.position.set(0,3.62,.26);cmdPanel.castShadow=false;computeVisuals.push({type:'command',canvas:cmdCanvas,texture:cmdTex,group:d,key:''});schedule(disp,17,6);
    }
  }
  // The late system expands beyond the core into an industrial computation campus.
  for(const [g,final] of [[d5,false],[d10,true]]){
    const count=final?24:8,radius=final?29:22;let yard=cyl(g,0,.24,0,final?38:27,.18,M.dark);cyl(g,0,.36,0,final?37.7:26.7,.08,M.edge);yard.receiveShadow=true;
    for(let i=0;i<count;i++){
      const side=i%2===0?-1:1,row=Math.floor(i/2),x=side*(18+(row%3)*6.2),z=-20+Math.floor(row/3)*12+(row%3)*1.5;
      let group=new THREE.Group();g.add(group);group.position.set(x,.47,z);box(group,0,.20,0,5.7,.35,4.5,M.dark);
      let rack=bank(group,0,.44,0,18,22,'MEM '+String(i).padStart(2,'0'),0);rack.rotation.y=side<0?.15:-.15;
      for(let fan=0;fan<3;fan++){let housing=cyl(group,-1.7+fan*1.7,8.45,-.04,.63,.40,M.dark);let ring=torus(group,-1.7+fan*1.7,8.70,-.04,.57,.035,M.copper);ring.rotation.x=Math.PI/2;for(let fin=0;fin<8;fin++){let blade=box(group,-1.7+fan*1.7,8.67,-.04,.09,.05,1.03,M.copper);blade.rotation.y=fin*Math.PI/8;}}
      for(let side2 of [-1,1]){box(group,side2*2.75,4.6,-.5,.13,8.4,.20,M.copper);box(group,side2*2.75,4.6,-1.0,.10,8.4,.10,M.dark);}
      schedule(group,final?5+i*.74:12+i*2.1,4);
      for(let lane=0;lane<5;lane++){
        let a=new THREE.Vector3(x,.75+lane*.19,z+1.2),b=new THREE.Vector3(side*13,.75+lane*.19,z+1.2),c=new THREE.Vector3(side*13,.75+lane*.19,8.0);
        bus(g,a,b,lane,final?12+i*.4:23);bus(g,b,c,lane,final?14+i*.4:25);
      }
      if(i%3===0){let arch=new THREE.Group();g.add(arch);arch.position.set(x,0,z+5);for(let s2 of [-1,1])box(arch,s2*3,2.3,0,.20,4.3,.25,M.dark);box(arch,0,4.5,0,6.3,.22,.6,M.copper);for(let cable=0;cable<6;cable++)box(arch,0,4.8+cable*.14,0,6.3,.075,.075,M.black);schedule(arch,final?12+i*.7:29,3);}
    }
    for(let side of [-1,1]){
      for(let z=-20;z<=23;z+=4){box(g,side*12.7,.48,z,.06,.03,2.7,M.whiteGlow);box(g,side*36.1,.49,z,.06,.03,2.7,M.copper);}
      for(let level of [1.6,3.5])for(let lane=0;lane<8;lane++){let o=beam(g,new THREE.Vector3(side*(12+lane*.22),level,-27),new THREE.Vector3(side*(12+lane*.22),level,22),.062,lane%3?M.copper:M.dark);schedule(o,final?15+lane*.6:33+lane*.5,3);}
    }
  }
  function crane(p,x,z,mirrored){let g=new THREE.Group();p.add(g);g.position.set(x,.5,z);box(g,0,.35,0,3,.7,3,M.dark);cyl(g,0,.95,0,.85,.65,M.copper);let b1=new THREE.Vector3(0,1.2,0),b2=new THREE.Vector3(mirrored*1.1,5.8,0),b3=new THREE.Vector3(mirrored*3.6,5.2,.5);beam(g,b1,b2,.22,M.dark);beam(g,b1.clone().add(new THREE.Vector3(0,0,.45)),b2.clone().add(new THREE.Vector3(0,0,.45)),.11,M.copper);sphere(g,b2.x,b2.y,b2.z,.42,M.copper);beam(g,b2,b3,.18,M.stoneLight);sphere(g,b3.x,b3.y,b3.z,.26,M.dark);beam(g,b3,new THREE.Vector3(b3.x,3.4,b3.z),.10,M.dark);for(let d of [-1,1])beam(g,new THREE.Vector3(b3.x,3.4,b3.z),new THREE.Vector3(b3.x+d*.35,2.9,b3.z),.08,M.copper);label(g,'ASSEMBLY / '+(mirrored<0?'01':'02'),0,.37,1.52,2.6);schedule(g,4,4);return g;}
  for(let side of [-1,1]){crane(d10,side*8.4,24.5,side);for(let lane=0;lane<12;lane++){let o=beam(d10,new THREE.Vector3(side*(5+lane*.22),.65,30),new THREE.Vector3(side*(5+lane*.22),.65,13),.045,lane%4===0?M.cyan:M.copper);schedule(o,10+lane*.8,2);}for(let j=0;j<6;j++){box(d10,side*20,.60,26+j*.8,9,.10,.12,M.dark);}box(d10,side*20,.53,27.8,9,.14,5,M.stone);}
  // Observable experiments: a probe, a physical patch cable, and a result instrument share one executable state.
  const instruments={};
  const toolMaterials={probe:mat('#e6c58a',.3,.7),patch:mat('#426c58',.45,.2),bad:new THREE.MeshStandardMaterial({color:'#eb824c',emissive:'#9b2e10',emissiveIntensity:.4}),ok:new THREE.MeshStandardMaterial({color:'#a3d7b0',emissive:'#2a8550',emissiveIntensity:.5})};
  function testRig(d,parent,width,height,position){
    const rig=new THREE.Group();parent.add(rig);rig.position.copy(position);
    box(rig,0,height/2,-.15,width+.30,height+.32,.64,M.copper);box(rig,0,height/2,.10,width,height,.60,M.dark);
    for(let side of [-1,1]){box(rig,side*(width/2+.12),height/2,.20,.16,height+.55,.65,M.stoneLight);box(rig,side*width*.38,-.65,0,.20,1.35,.70,M.dark);box(rig,side*width*.38,-1.27,.2,1.5,.18,1.35,M.stoneLight);}
    const panelCanvas=document.createElement('canvas');panelCanvas.width=1536;panelCanvas.height=576;const panelTexture=new THREE.CanvasTexture(panelCanvas);panelTexture.colorSpace=THREE.SRGBColorSpace;
    const panel=make(new THREE.PlaneGeometry(width*.88,height*.45),new THREE.MeshBasicMaterial({map:panelTexture}),rig);panel.position.set(0,height*.765,.423);panel.castShadow=false;
    const count=d===1?3:8,nodes=[];for(let i=0;i<count;i++){
      const nodeStart=rig.children.length;const x=(i-(count-1)/2)*(width*.83/count);box(rig,x,height*.245,.48,width*.70/count,height*.26,.18,M.black);
      for(let pin=0;pin<5;pin++)for(let s of [-1,1])box(rig,x+s*width*.39/count,height*.245+(pin-2)*height*.042,.57,.055,.055,.16,M.copper);
      const led=sphere(rig,x,height*.28,.65,.095,toolMaterials.ok);nodes.push(led);
      const labels=d===1?['IN A','IN B','NAND OUT']:Array.from({length:8},(_,i)=>d===2?'BIT '+i:d===5?'ADDR '+i:'STR '+i);label(rig,labels[i],x,height*.105,.605,width*.72/count,'#d3d5b4');
      if(i<count-1)beam(rig,new THREE.Vector3(x+width*.37/count,height*.29,.53),new THREE.Vector3(x+width*.46/count,height*.29,.53),.035,M.copper);
      const component=new THREE.Group();const meshes=rig.children.slice(nodeStart);rig.add(component);for(const o of meshes)component.add(o);schedule(component,6+i*4,4);
    }
    const jackY=height*.405,left=new THREE.Vector3(-width*.075,jackY,.66),right=new THREE.Vector3(width*.075,jackY,.66);
    for(const pos of [left,right]){const ring=torus(rig,pos.x,pos.y,pos.z,.13,.036,M.copper);sphere(rig,pos.x,pos.y,pos.z-.07,.093,M.black);}
    const lead=new THREE.Line(new THREE.BufferGeometry().setFromPoints([left,new THREE.Vector3(0,jackY+.54,.98),right]),new THREE.LineBasicMaterial({color:'#d78f54'}));rig.add(lead);
    const plug=new THREE.Group();rig.add(plug);let plugBody=cyl(plug,0,0,0,.10,.36,toolMaterials.probe);plugBody.rotation.x=Math.PI/2;sphere(plug,0,0,.16,.095,M.dark);
    const pcbGlow=glowLine(rig,[new THREE.Vector3(-width*.45,.2,.48),new THREE.Vector3(-width*.45,height*.45,.48),new THREE.Vector3(width*.45,height*.45,.48)],'#66846b');
    const connectorLabel=d===1?'INPUT B / J02':d===2?'CARRY / C3 > C4':d===5?'ADDRESS / A3':'STRIDE / 63 > 64';label(rig,connectorLabel,0,height*.455,.48,width*.58,'#d6bc80').scale.y=(height*.13)/(width*.58*160/1024);
    const crate=new THREE.Group();rig.add(crate);crate.position.set(-width*.52,-.95,1.2);box(crate,0,.20,0,1.55,.55,1.15,M.black);box(crate,0,.50,0,1.5,.08,1.1,M.copper);for(let i=0;i<3;i++){let o=box(crate,-.42+i*.42,.59,0,.28,.1,.80,i===0?toolMaterials.probe:i===1?M.cyan:M.copper);}
    const sockets=new THREE.Group();rig.add(sockets);sockets.position.set(width*.48,-.4,.30);for(let i=0;i<4;i++){const connector=torus(sockets,0,i*.25,0,.075,.022,M.copper);}
    const entry={rig,panelCanvas,panelTexture,nodes,left,right,lead,plug,width,height,lastKey:'',position};instruments[d]=entry;
    return entry;
  }
  testRig(1,d1,7.8,4.4,new THREE.Vector3(0,1.8,-.7));
  testRig(2,d2,11.8,4.9,new THREE.Vector3(0,5.25,5.65));
  testRig(5,d5,8.6,4.6,new THREE.Vector3(0,1.9,13.9));
  testRig(10,d10,8.6,4.6,new THREE.Vector3(0,1.9,26.5));
  function updateInstrument(d,t,e){
    const it=instruments[d],dy=it.height;
    const p=t<36?0:smooth(36,42,t);it.plug.position.copy(it.right);it.plug.position.y+=(1-p)*.58;it.plug.position.z+=(1-p)*.7;it.plug.rotation.x=(1-p)*.55;
    it.lead.geometry.setFromPoints([it.left,new THREE.Vector3(0,it.left.y+.24+(1-p)*.30,.98),it.plug.position]);it.lead.geometry.computeBoundingSphere();it.lead.material.color.set(e.fault?'#d19458':'#a9d8b0');
    for(let i=0;i<it.nodes.length;i++){let on=d===1?[1,e.probe.gateB,e.observed][i]:d===2?e.computeState.bits[i].sum:(d===5?e.writeAddress:d===10?e.stride:e.observed)>>i&1;it.nodes[i].material=e.fault&&i===(d===1?1:d===2?4:d===5?3:6)?toolMaterials.bad:on?toolMaterials.ok:M.black;}
    const key=[e.stage,e.displayValues?.observedValue,e.displayValues?.expectedValue,e.displayValues?.detail,e.status].join('|');if(key===it.lastKey)return;it.lastKey=key;
    const c=it.panelCanvas.getContext('2d'),W=1536,H=576,bad=e.fault&&t>=24; c.fillStyle='#101e1b';c.fillRect(0,0,W,H);c.strokeStyle='#49645a';c.lineWidth=3;c.strokeRect(3,3,W-6,H-6);
    c.textBaseline='middle';c.font='500 35px monospace';c.fillStyle='#97b6a7';c.fillText('ARKEVO / '+(d===1?'GATE BENCH':d===2?'8-BIT ARITHMETIC':d===5?'MEMORY CONTROLLER':'FRAMEBUFFER ADDRESSING'),45,48);
    c.textAlign='right';c.fillStyle=bad?'#f0a176':'#bbd9a7';c.fillText(e.stage==='repair'?'PATCHING':t<24?'TEST READY':e.status.toUpperCase(),W-45,48);c.textAlign='left';
    c.strokeStyle='#3b534a';c.beginPath();c.moveTo(40,86);c.lineTo(W-40,86);c.stroke();
    const vals=e.displayValues||{inputLabel:'INPUT',inputValue:e.input,expectedValue:e.expected,observedValue:e.observed,detail:e.target};
    const cols=[45,570,1080];const labels=[vals.inputLabel||'INPUT',d===10?'EXPECTED ERRORS':'EXPECTED',d===10?'PIXEL ERRORS':'OBSERVED'];const values=[vals.inputValue,vals.expectedValue,t<24?'—':vals.observedValue];
    for(let i=0;i<3;i++){c.fillStyle='#8caa99';c.font='28px monospace';c.fillText(labels[i],cols[i],140);c.fillStyle=i===2&&bad?'#ffb180':'#e0ead9';const value=String(values[i]);c.font=`600 ${value.length>12?39:value.length>7?51:76}px monospace`;c.fillText(value,cols[i],219);}
    c.strokeStyle='#3b534a';c.beginPath();c.moveTo(40,278);c.lineTo(W-40,278);c.stroke();
    c.fillStyle=bad?'#f0a176':'#b7d49f';c.font='500 32px monospace';const detail=d===1?(e.fault?'J02  OPEN / INPUT B DISCONNECTED':'J02  CLOSED / 4 CASES VERIFIED'):d===2?(e.fault?'C3 > C4  OPEN / CARRY LOST':'C3 > C4  CLOSED / 127 + 1 = 128'):d===5?(e.fault?'A3 STUCK LOW / WRITE 0x15 != READ 0x1D':'A3 RESTORED / WRITE == READ 0x1D'):(e.fault?'STRIDE 63 / ADDRESS MISMATCH':'STRIDE 64 / PIXEL MATCH');c.fillText(t<24?'INSTRUMENT ARMED / SAME INPUT BEFORE & AFTER':detail,45,331);
    c.fillStyle='#799b89';c.font='27px monospace';c.fillText('TOOL   '+e.tool,45,409);c.fillText('TARGET   '+(d===1?'NAND.B / J02':d===2?'ADDER / CARRY[3:4]':d===5?'RAM / ADDRESS[3]':'DISPLAY / ROW STRIDE'),45,466);
    c.fillStyle='#b1c69a';c.font='26px monospace';c.fillText(t>=48?(d===10?'COMMAND EXECUTED / BRIDGE @ X = 20 + 1 = 21':'CHECKPOINT COMMITTED / REUSABLE IN NEXT BUILD'):t>=42?'RETEST / IDENTICAL INPUT, NEW CONNECTION':t>=36?'RECONNECT / APPLY PATCH, THEN RE-RUN':t>=24?'PROBE / ISOLATE THE FAULT':'SCAN / ASSEMBLE / PREPARE TEST',45,529);
    it.panelTexture.needsUpdate=true;
  }

  // Mobile manipulator: tools reach the same named circuit connection that the verifier reports.
  const robot=new THREE.Group();scene.add(robot);cyl(robot,0,.5,0,.54,.38,M.black);let body=cyl(robot,0,1.08,0,.41,.75,M.robot);cyl(robot,0,1.5,0,.45,.12,M.copper);let head=box(robot,0,1.83,.04,.83,.46,.57,M.stoneLight);box(robot,0,1.86,.333,.58,.16,.035,M.black);box(robot,0,1.86,.357,.36,.047,.025,M.cyan);
  for(let s of [-1,1]){let wheel=cyl(robot,s*.54,.4,0,.29,.15,M.dark);wheel.rotation.z=Math.PI/2;let rim=cyl(robot,s*.63,.4,0,.17,.03,M.copper);rim.rotation.z=Math.PI/2;}
  const arm=new THREE.Group();robot.add(arm);arm.position.set(.43,1.45,.04);const upper=beam(arm,new THREE.Vector3(),new THREE.Vector3(.33,.40,.2),.09,M.dark);sphere(arm,.33,.4,.2,.15,M.copper);beam(arm,new THREE.Vector3(.33,.4,.2),new THREE.Vector3(.55,.20,.75),.075,M.stoneLight);sphere(arm,.55,.20,.75,.12,M.cyan);
  const sensorMast=cyl(robot,0,2.3,.10,.065,1.1,M.dark);const sensorHead=box(robot,0,2.9,.13,.40,.22,.30,M.stoneLight);const sensorLens=box(robot,0,2.9,.292,.23,.10,.035,M.black);
  const drone=new THREE.Group();scene.add(drone);sphere(drone,0,0,0,.25,M.robot);for(let i=0;i<4;i++){let a=i*Math.PI/2+Math.PI/4;beam(drone,new THREE.Vector3(),new THREE.Vector3(Math.sin(a)*.65,0,Math.cos(a)*.65),.05,M.dark);let r=torus(drone,Math.sin(a)*.65,.035,Math.cos(a)*.65,.24,.035,M.dark);r.rotation.x=Math.PI/2;}
  const beamMat=new THREE.LineBasicMaterial({color:'#8dfbf0',transparent:true,opacity:.68});const toolBeam=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),beamMat);scene.add(toolBeam);
  const probeShaft=make(new THREE.CylinderGeometry(.025,.045,1,12),toolMaterials.probe);const probeTip=sphere(scene,0,0,0,.085,toolMaterials.bad);const connectorTool=new THREE.Group();scene.add(connectorTool);for(let side of [-1,1]){box(connectorTool,side*.11,0,0,.075,.40,.10,M.copper);box(connectorTool,side*.15,-.3,0,.13,.3,.16,M.black);}
  const sparkG=new THREE.BufferGeometry(),sparkA=new Float32Array(30*3);sparkG.setAttribute('position',new THREE.BufferAttribute(sparkA,3));const sparks=new THREE.Points(sparkG,new THREE.PointsMaterial({color:'#ffeeaa',size:.075,transparent:true,opacity:.9}));scene.add(sparks);
  const scan=new THREE.Group();scene.add(scan);for(let i=0;i<4;i++){let o=torus(scan,0,.4+i*.12,0,2.0+i*.18,.014,M.cyan);o.rotation.x=Math.PI/2;}
  function buildBounds(o){let p=o;while(p.parent&&p.parent!==scene)p=p.parent;return p;}
  for(const a of animated)a.group=buildBounds(a.o);
  compact(vegetation);compact(scene);
  function render(t=0){
    renderer.shadowMap.needsUpdate=true;
    t=Math.max(0,Math.min(59.999,t));const experiment=experimentAt(day,t);updateInstrument(day,t,experiment);let bt=t<12?0:t<24?(t-12)*60/12:60;for(let [d,g]of Object.entries(dayGroups))g.visible=+d===day;
    waterMaterial.userData.time.value=t;waterNormals.offset.set(t*.0015,t*.0007);
    for(const a of animated){if(!a.group.visible)continue;let k=a.start===0?1:smooth(a.start,a.start+a.dur,bt);a.o.visible=k>.002;a.o.scale.copy(a.scale);a.o.position.copy(a.base);a.o.position.y+=(1-k)*2.1;if(a.fail){if(t>24&&t<36){let f=smooth(24,26,t);a.o.position.y-=f*1.12;a.o.rotation.x=f*.18;a.o.rotation.z=f*.13;}else{a.o.rotation.x=0;a.o.rotation.z=0;}}}
    for(const a of objects){if(a.day!==day)continue;if(a.type==='gyro'){a.o.rotation.x=.8+Math.sin(t*.25)*.25;a.o.rotation.y=t*.18;}if(a.type==='nested')a.o.rotation.y=Math.sin(t*.12)*.21;if(a.type==='pulse')a.o.visible=((a.index+Math.floor(t*2))%8)>1;}
    let a=t*.105;const rr=day===1?5.3:day===2?9.2:day===5?18:29;
    const rig=instruments[day],rigPos=rig.position,inspecting=t>=23;
    const bodyScale=day>=5?1.35:1,baseY=day===2?5.0:.42;
    const approach=smooth(0,22,t),eyeY=rigPos.y+rig.height*.62+(day===10?smooth(46,49,t)*1.6:0),eyeLocal=(eyeY-baseY)/bodyScale;
    robot.scale.setScalar(bodyScale);robot.position.set(rigPos.x+rig.width*(.10+Math.sin(t*.15)*.055*(1-approach)),baseY,rigPos.z+rig.width*(1.22-.32*approach));robot.rotation.y=Math.PI;
    arm.rotation.z=t>=24?.26:Math.sin(t*2)*.20;arm.rotation.x=t>=24?-.18:Math.sin(t*1.3)*.16;
    sensorMast.position.y=(1.85+eyeLocal)/2;sensorMast.scale.y=Math.max(.2,eyeLocal-1.85)/1.1;sensorHead.position.y=eyeLocal;sensorLens.position.y=eyeLocal;

    drone.position.set(inspecting?rigPos.x-rig.width*.48:Math.sin(t*.11+1)*rr,inspecting?rigPos.y+rig.height+1:5.0+Math.sin(t*.3)*1.8,inspecting?rigPos.z+1.5:Math.cos(t*.11+1)*rr);drone.rotation.y=-t*.18;
    const patchTarget=rig.right.clone().add(rig.position),testTarget=rig.left.clone().add(rig.position);
    let target=inspecting?(t>=36&&t<42?patchTarget:testTarget):new THREE.Vector3(Math.sin(a+.3)*(rr-.8),day===1?1.4:day===2?4.9:day===5?5.3:11.8,Math.cos(a+.3)*(rr-.8));
    if(t>=12&&t<24){const installing=animated.filter(o=>o.group===dayGroups[day]&&o.start>0&&bt>=o.start&&bt<o.start+o.dur).at(-1);if(installing){scene.updateMatrixWorld(true);target=installing.o.getWorldPosition(new THREE.Vector3());}}
    robot.updateMatrixWorld(true);let origin=new THREE.Vector3(.98,1.65,.78).applyMatrix4(robot.matrixWorld);toolBeam.geometry.setFromPoints([origin,target]);toolBeam.visible=inspecting?t<48:t>=12&&t<24;toolBeam.material.color.set(t>=36&&t<42?'#f5b97f':t>=24?'#a9dcb8':'#8dfbf0');toolBeam.material.opacity=.55;
    const probing=t>=24&&t<36||t>=42&&t<48;probeShaft.visible=probeTip.visible=probing;const pv=target.clone().sub(origin);probeShaft.position.copy(origin).add(target).multiplyScalar(.5);probeShaft.scale.set(1,pv.length(),1);probeShaft.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),pv.normalize());probeTip.position.copy(target);probeTip.material=experiment.fault?toolMaterials.bad:toolMaterials.ok;connectorTool.visible=t>=36&&t<42;connectorTool.position.copy(rig.plug.position).add(rig.position);connectorTool.position.z+=.30;toolBeam.visible=toolBeam.visible&&!probing;
    for(let i=0;i<30;i++){let life=(t*2+i*.19)%1;sparkA[i*3]=target.x+Math.sin(i*24)*life*.12;sparkA[i*3+1]=target.y+Math.cos(i*13)*life*.16-life*.1;sparkA[i*3+2]=target.z+Math.sin(i*19)*life*.12;}sparkG.attributes.position.needsUpdate=true;sparks.visible=t>=36&&t<40;
    scan.position.copy(target);scan.position.y=day===2?5.04:.42;scan.scale.setScalar(.4);scan.visible=t<12;
    const logicState=experiment.computeState||computeState||stateAt(day,0),caValue=logicState.a,cbValue=logicState.b,sumValue=experiment.observed;
    const co=new THREE.Color();for(const it of computeVisuals){if(!buildBounds(it.group).visible)continue;
      if(it.type==='bank'){for(let i=0;i<it.count;i++){const b=logicState.bits[i%8];let on=day===1?[1,experiment.probe.gateB,experiment.observed][i%3]:day===2?[b.a,b.b,b.cin,b.sum,b.cout][Math.floor(i/8)%5]:day===5?(experiment.ram[Math.floor(i/8)%32]>>(i%8))&1:(experiment.framebuffer[(i*3)%experiment.framebuffer.length]>>(i%8))&1;co.set(on?'#80d9ab':'#173b31');if(experiment.fault&&t>=24&&i%29===0)co.set('#ee713b');it.o.setColorAt(i,co);}it.o.instanceColor.needsUpdate=true;}
      if(it.type==='bus'){it.o.visible=Boolean((sumValue>>(it.index%8))&1);let k=((t*.65+it.index*.13)%1);let a=it.path[0],b=it.path[1],c=it.path[2];if(k<.5)it.o.position.lerpVectors(a,b,k*2);else it.o.position.lerpVectors(b,c,(k-.5)*2);}
      if(it.type==='command'){const k=experiment.stage;if(k!==it.key){it.key=k;const c=it.canvas.getContext('2d');c.fillStyle='#142822';c.fillRect(0,0,1536,144);c.fillStyle=experiment.fault?'#ebb285':'#c3db9f';c.textBaseline='middle';c.textAlign='center';c.font='600 43px monospace';c.fillText(t>=48?'INPUT 20 + 1  >  X = 21  >  BUILD BRIDGE':t>=42?'STRIDE 64  /  2,560 PIXELS MATCH':'STRIDE 63  /  DISPLAY ADDRESS ERROR',768,72);it.texture.needsUpdate=true;}}
      if(it.type==='screen'){const pixels=experiment.framebuffer;for(let i=0;i<2560;i++){co.setRGB(pixels[i*3]/255,pixels[i*3+1]/255,pixels[i*3+2]/255,THREE.SRGBColorSpace);it.o.setColorAt(i,co);}it.o.instanceColor.needsUpdate=true;}
    }
    let camPos,targetPos;const activeCamera=cameraMode==='director'?(day===10&&t>=44&&t<54?'screen':t<12?'orbit':t<48?'detail':'orbit'):cameraMode==='agent'?'firstperson':cameraMode;
    robot.updateMatrixWorld(true);const sensorEye=new THREE.Vector3(0,eyeLocal,.42).applyMatrix4(robot.matrixWorld);
    const sensorTarget=new THREE.Vector3(rigPos.x+rig.width*.035,rigPos.y+rig.height*.56,rigPos.z);
    if(day===10&&t>=46){const lookUp=smooth(46,49,t);sensorTarget.lerp(new THREE.Vector3(0,13.4,-8.5),lookUp);}
    // The primary feed is the robot's raised optical sensor, with its own body below the eye line.
    robot.visible=activeCamera!=='firstperson';sensorHead.visible=sensorLens.visible=activeCamera!=='firstperson';
    camera.fov=activeCamera==='firstperson'?54:42;
    if(activeCamera==='firstperson'){camPos=sensorEye;targetPos=sensorTarget;
    }else if(activeCamera==='screen'){camPos=new THREE.Vector3(1.1,14.0,12.8);targetPos=new THREE.Vector3(0,13.4,-8.5);
    }else if(activeCamera==='inspection'){
      camPos=new THREE.Vector3(rigPos.x+rig.width*.17,rigPos.y+rig.height*.63,rigPos.z+rig.width*1.48);targetPos=new THREE.Vector3(rigPos.x,rigPos.y+rig.height*.46,rigPos.z);
    }else if(activeCamera==='detail'){
      const r=day===1?12:day===2?24:day===5?33:44;let ca=.20+Math.sin(t*.07)*.16;camPos=new THREE.Vector3(Math.sin(ca)*r,day===1?5:day===2?11:day===5?17:22,Math.cos(ca)*r);targetPos=new THREE.Vector3(0,day===1?1.3:day===2?3.2:day===5?4.4:8,0);
    }else{
      const r=day===1?22:day===2?38:day===5?60:87;let ca=.32+Math.sin(t*.023)*.20;camPos=new THREE.Vector3(Math.sin(ca)*r,day===1?10:day===2?17:day===5?30:44,Math.cos(ca)*r);targetPos=new THREE.Vector3(0,day===1?1.3:day===2?2:day===5?4.3:7.5,0);
    }
    camera.position.copy(camPos);camera.lookAt(targetPos);camera.aspect=canvas.width/canvas.height;camera.updateProjectionMatrix();composer.render();
  }
  return {ready:Promise.all([environmentReady,texturesReady]).then(()=>{frameNumber=0;}),render,setComputeState(state){computeState=state;},setDay(d){day=+d;},setCamera(c){cameraMode=c;},resize(w,h){renderer.setSize(w,h,false);composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(w,h);aoPass.setSize(Math.round(w*renderer.getPixelRatio()*.55),Math.round(h*renderer.getPixelRatio()*.55));camera.aspect=w/h;camera.updateProjectionMatrix();},dispose(){composer.dispose();renderer.dispose();scene.traverse(o=>{o.geometry?.dispose();if(o.material&&o.material.dispose)o.material.dispose();});},renderer,scene,camera};
}
