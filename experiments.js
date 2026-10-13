import {nand, fullAdder} from './logic.js';
import {voxelFrame} from './mini-world.js?v=3';

// Deterministic, seekable simulations. Every result below is computed from the
// circuit, memory or pixel-addressing model; the film only schedules the actions.
// 24: test, 36: begin repair, 42: close the connection and retest, 48: commit.
export const REPAIR_TIME=42;
export const COMMIT_TIME=48;
const hex=n=>`0x${n.toString(16).toUpperCase().padStart(2,'0')}`;
const bitString=n=>n.toString(2).padStart(8,'0');
const check=(name,input,expected,observed)=>({name,input,expected,observed,passed:expected===observed});

export function runNand(fault=false){
 const testCases=[[0,0],[0,1],[1,0],[1,1]].map(([a,b])=>{
  // Disconnected B is pulled down to 0 at the physical gate terminal.
  const effectiveB=fault?0:b;
  return {...check(`${a}${b}`,{a,b},Number(!(a&&b)),nand(a,effectiveB)),effectiveB};
 });
 return {input:{a:1,b:1},expected:0,observed:testCases[3].observed,testCases,
  probe:{a:1,sourceB:1,gateB:fault?0:1,connected:!fault},
  diagnosis:'B 源端为 1，门端为 0；输入支路断开。',patch:'连接 input.B → NAND.B；复验全部 4 组输入。',
  target:'NAND.B',targetLabel:'NAND 输入支路 B',memoryId:'GATE-001',
  memorySummary:'接线后枚举 00、01、10、11，核对门端电平与真值表。',
  displayValues:{inputLabel:'A / B',inputValue:'1 / 1',expectedValue:'0',observedValue:String(testCases[3].observed),detail:`B terminal ${fault?0:1}`}};
}

export function add8WithCarryLink(a,b,fault=false){
 a&=255;b&=255;let carry=0,sum=0;const bits=[];
 for(let i=0;i<8;i++){
  const suppliedCarry=carry,cin=fault&&i===4?0:carry;
  const bit={...fullAdder((a>>i)&1,(b>>i)&1,cin),index:i,suppliedCarry};
  bits.push(bit);sum|=bit.sum<<i;carry=bit.cout;
 }
 return {a,b,sum,carry,bits};
}

export function runAdder(fault=false){
 const computeState=add8WithCarryLink(127,1,fault);
 const testCases=[[0,0],[7,1],[15,1],[127,1],[255,1]].map(([a,b])=>{
  const r=add8WithCarryLink(a,b,fault);
  return {...check(`${a}+${b}`,{a,b},(a+b)&255,r.sum),expectedCarry:(a+b)>>8,observedCarry:r.carry,passed:r.sum===((a+b)&255)&&r.carry===((a+b)>>8)};
 });
 return {input:{a:127,b:1},expected:128,observed:computeState.sum,computeState,testCases,
  probe:{sourceBit:3,targetBit:4,sourceCarry:computeState.bits[3].cout,targetCarry:computeState.bits[4].cin,connected:!fault},
  diagnosis:'b3.cout = 1，b4.cin = 0；第 3 → 4 位进位断开（位号从 0 开始）。',
  patch:'连接 b3.cout → b4.cin；保持 127 + 1 复验。',
  target:'ADDER.b3.cout→b4.cin',targetLabel:'进位线 b3 → b4',memoryId:'ADDER-008',
  memorySummary:'跨位边界 15 + 1、127 + 1、255 + 1 必须随模块复验。',
  displayValues:{inputLabel:'A + B',inputValue:'127 + 1',expectedValue:'128',observedValue:String(computeState.sum),detail:bitString(computeState.sum)}};
}

export function runRam(fault=false){
 const address=0x1D,data=0xAD,ram=new Uint8Array(32);
 // Only the WRITE decoder A3 is stuck low. The independent read port addresses
 // the requested location correctly, exposing the misdirected write.
 const writeAddress=fault?address&~(1<<3):address;
 ram[writeAddress]=data;
 const observed=ram[address],aliasObserved=ram[0x15];
 const testCases=[check('read requested address',{address},data,observed),check('no stray write',{address:0x15},0,aliasObserved),check('write decoder',{address},address,writeAddress)];
 return {input:{address,data},expected:data,observed,ram,writeAddress,readAddress:address,testCases,
  probe:{addressBit:3,requestedA3:(address>>3)&1,writeA3:(writeAddress>>3)&1,aliasAddress:0x15,aliasObserved},
  diagnosis:`写入译码 A3 被钳为 0：${hex(address)} → ${hex(0x15)}；原地址读回 0。`,
  patch:`解除写地址 A3 钳位；重置测试 RAM，重放 write(${hex(address)}, ${hex(data)}) / read(${hex(address)})。`,
  target:'RAM.writeDecoder.A3',targetLabel:'RAM 写地址译码 A3',memoryId:'SYSTEM-032',
  memorySummary:'写后读回原地址，同时检查地址别名，避免数据写到错误位置。',
  displayValues:{inputLabel:'WRITE',inputValue:`${hex(address)} ← ${hex(data)}`,expectedValue:String(data),observedValue:String(observed),detail:`write ${hex(writeAddress)} / read ${hex(address)}`}};
}

export function addressFramebuffer(source,width,height,stride){
 const framebuffer=new Uint8Array(width*height*3);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const sourceOffset=(y*stride+x)*3,destination=(y*width+x)*3;
  framebuffer[destination]=source[sourceOffset];
  framebuffer[destination+1]=source[sourceOffset+1];
  framebuffer[destination+2]=source[sourceOffset+2];
 }
 return framebuffer;
}

export function compareFramebuffers(expected,observed,width){
 let mismatchCount=0,firstMismatch=null;
 for(let i=0;i<expected.length;i+=3){
  if(expected[i]!==observed[i]||expected[i+1]!==observed[i+1]||expected[i+2]!==observed[i+2]){
   mismatchCount++;
   if(!firstMismatch)firstMismatch={x:(i/3)%width,y:Math.floor(i/3/width),expected:Array.from(expected.slice(i,i+3)),observed:Array.from(observed.slice(i,i+3))};
  }
 }
 return {mismatchCount,pixelCount:expected.length/3,firstMismatch};
}

// A bounded cache avoids repeating the ray traversal when UI and world ask for
// the same video frame. Quantization is explicit, so cache history never changes
// the render time fed into mini-world's own eight-Hz cache.
const displayCache=new Map();
function framebufferChecksum(bytes){
 let hash=2166136261;
 for(const byte of bytes){hash^=byte;hash=Math.imul(hash,16777619);}
 return (hash>>>0).toString(16).padStart(8,'0');
}
export function runDisplay(frameTime,fault=false,commandEnabled=false){
 const width=64,height=40,stride=fault?63:64;
 frameTime=Math.floor(frameTime*8)/8;
 const cacheKey=`${frameTime}:${stride}:${commandEnabled}`;
 if(displayCache.has(cacheKey))return displayCache.get(cacheKey);
 const commandCalculation=add8WithCarryLink(20,1,false);
 const command={enabled:commandEnabled,x:commandCalculation.sum,z:25,expression:`20 + 1 = ${commandCalculation.sum}`};
 const expectedFramebuffer=voxelFrame(frameTime,width,height,command).slice();
 const framebuffer=addressFramebuffer(expectedFramebuffer,width,height,stride);
 const comparison=compareFramebuffers(expectedFramebuffer,framebuffer,width);
 const {mismatchCount,pixelCount,firstMismatch}=comparison;
 const testCases=[check('all RGB pixels',{frameTime,width,height},0,mismatchCount)];
 if(commandEnabled)testCases.push(check('bridge x from NAND adder',{a:20,b:1},21,commandCalculation.sum));
 const result={input:{frameTime,width,height,commandEnabled},expected:0,observed:mismatchCount,command,commandCalculation,
  framebuffer,expectedFramebuffer,width,height,stride,frameTime,...comparison,testCases,
  framebufferChecksum:framebufferChecksum(framebuffer),expectedChecksum:framebufferChecksum(expectedFramebuffer),
  probe:{expectedStride:64,observedStride:stride,firstMismatch},
  diagnosis:'显示读取按 y × 63 + x 寻址；每行少跨过一个像素，行偏移持续累积。',
  patch:'设置 framebuffer.stride = 64；用同一帧逐像素比较 RGB。',
  target:'FRAMEBUFFER.stride',targetLabel:'显示缓冲区行跨度',memoryId:'WORLD-001',
  memorySummary:'像素地址 = y × width + x；锁定测试帧，比较全部 2,560 个像素。',
  displayValues:{inputLabel:commandEnabled?'COMMAND':'FRAME',inputValue:commandEnabled?`20 + 1 → X=${command.x}`:`64 × 40 · ${frameTime.toFixed(3)}s`,expectedValue:'0',observedValue:String(mismatchCount),detail:`stride ${stride} / ${pixelCount} pixels`}};
 displayCache.set(cacheKey,result);
 if(displayCache.size>12)displayCache.delete(displayCache.keys().next().value);
 return result;
}

const staticCache=new Map();
function staticExperiment(day,fault){
 const key=`${day}:${fault}`;
 if(!staticCache.has(key))staticCache.set(key,({1:runNand,2:runAdder,5:runRam})[day](fault));
 return staticCache.get(key);
}

export function experimentAt(day,time){
 if(![1,2,5,10].includes(day))throw new RangeError(`Unknown experiment day: ${day}`);
 time=Number.isFinite(time)?Math.max(0,Math.min(59.999,time)):0;
 const phase=Math.floor(time/12),fault=time<REPAIR_TIME,tested=time>=24;
 const stage=time<12?'observe':time<24?'build':time<36?'diagnose':time<42?'repair':time<48?'retest':'commit';
 const tool={observe:'SCAN',build:'PLACE',diagnose:'PROBE',repair:'CONNECT',retest:'TEST',commit:'COMMIT'}[stage];
 // The exact same 24-second voxel frame is held during diagnosis and repair.
 // Motion resumes at 48 seconds from that frame, without a temporal jump.
 const frameTime=time<24?time:time<48?24:time-24;
 const data=day===10?runDisplay(frameTime,fault,time>=48):staticExperiment(day,fault);
 const computedPassed=data.testCases.every(c=>c.passed);
 const status=!tested?'pending':stage==='repair'?'repairing':!computedPassed?'failed':stage==='commit'?'committed':'passed';
 const committed=time>=COMMIT_TIME&&computedPassed;
 const memory={id:data.memoryId,version:committed?1:0,committed,summary:data.memorySummary};
 return {...data,day,time,phase,stage,tool,fault,tested,status,passed:tested?computedPassed:null,memory,
  coverage:{passed:data.testCases.filter(c=>c.passed).length,total:data.testCases.length},
  resultLabel:{pending:'待测试',failed:'失败 · 已定位',repairing:'修复中',passed:'同输入复验通过',committed:'通过 · 经验已保存'}[status]};
}
