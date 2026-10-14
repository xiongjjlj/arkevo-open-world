// Human-authored circuits are evaluated independently of the prerecorded demonstration.
export const STAGES=[
 {name:'第一道逻辑',short:'NAND 门',goal:'让输出仅在 A、B 都为 1 时为 0；其余输入均输出 1。',total:4,max:3,kind:'NAND',inputs:['A','B','0','1'],outputs:['Y']},
 {name:'一个完整的加法单元',short:'全加器',goal:'只用 NAND 门，计算 A + B + Cin。S 是低位，Cout 是进位。',total:8,max:12,kind:'NAND',inputs:['A','B','Cin','0','1'],outputs:['S','Cout']},
 {name:'八位计算系统',short:'八位加法器',goal:'复用你验证过的全加器，计算任意两个 0–255 整数。S0 是最低位，Cout 保留溢出进位。',total:65536,max:8,kind:'FA',inputs:[...Array.from({length:8},(_,i)=>`A${i}`),...Array.from({length:8},(_,i)=>`B${i}`),'0','1'],outputs:[...Array.from({length:8},(_,i)=>`S${i}`),'Cout']}
];
export const blankModel=stage=>({stage,nodes:[],outputs:Object.fromEntries(STAGES[stage].outputs.map(k=>[k,'']))});
export function sourceOptions(model){return [...STAGES[model.stage].inputs,...model.nodes.flatMap(n=>model.stage===2?[`${n.id}.S`,`${n.id}.C`]:[`${n.id}.Y`])];}
export function addNode(model){const spec=STAGES[model.stage];if(model.nodes.length>=spec.max)return null;let i=1;const prefix=model.stage===2?'F':'G';while(model.nodes.some(n=>n.id===prefix+i))i++;const node={id:prefix+i,a:'',b:'',...(model.stage===2?{cin:''}:{})};model.nodes.push(node);return node;}
export function removeNode(model,id){model.nodes=model.nodes.filter(n=>n.id!==id);for(const n of model.nodes)for(const k of ['a','b','cin'])if(n[k]?.startsWith(id+'.'))n[k]='';for(const k in model.outputs)if(model.outputs[k].startsWith(id+'.'))model.outputs[k]='';}
export function compile(model,cell){
 if(!model||!STAGES[model.stage]||!Array.isArray(model.nodes)||model.nodes.length>STAGES[model.stage].max)throw Error('电路结构无效');
 const spec=STAGES[model.stage],nodes=new Map(model.nodes.map(n=>[n.id,n]));if(nodes.size!==model.nodes.length)throw Error('元件编号重复');
 const code=[],slots=new Map(spec.inputs.map((x,i)=>[x,i])),visiting=new Set();
 const unit=model.stage===2?compile(cell):null;
 function resolve(source){
  if(!source)throw Error('仍有端口未连接');if(slots.has(source))return slots.get(source);
  const [id,port]=source.split('.'),n=nodes.get(id);if(!n||!(model.stage===2?['S','C']:['Y']).includes(port))throw Error(`无效信号源：${source}`);
  if(visiting.has(id))throw Error(`检测到闭环：${id} 的输出回到了自己的输入`);
  visiting.add(id);const a=resolve(n.a),b=resolve(n.b),cin=model.stage===2?resolve(n.cin):null;visiting.delete(id);
  const index=spec.inputs.length+code.length;code.push({a,b,cin,port});slots.set(source,index);return index;
 }
 const outputs=spec.outputs.map(k=>resolve(model.outputs[k]));
 return input=>{const values=spec.inputs.map(x=>x==='0'?0:x==='1'?1:input[x]&1);for(const op of code){if(model.stage===2){const r=unit({A:values[op.a],B:values[op.b],Cin:values[op.cin]});values.push(op.port==='S'?r.S:r.Cout);}else values.push(1-(values[op.a]&values[op.b]));}return Object.fromEntries(spec.outputs.map((key,i)=>[key,values[outputs[i]]]));};
}
export function testCase(stage,i){
 if(stage===0){const A=i>>1,B=i&1;return {input:{A,B},expected:{Y:1-(A&B)},label:`${A} · ${B}`};}
 if(stage===1){const A=(i>>2)&1,B=(i>>1)&1,Cin=i&1,n=A+B+Cin;return {input:{A,B,Cin},expected:{S:n&1,Cout:n>>1},label:`${A} + ${B} + ${Cin}`};}
 const a=i>>8,b=i&255,n=a+b;return {input:Object.fromEntries([...Array.from({length:8},(_,k)=>[`A${k}`,(a>>k)&1]),...Array.from({length:8},(_,k)=>[`B${k}`,(b>>k)&1])]),expected:{...Object.fromEntries(Array.from({length:8},(_,k)=>[`S${k}`,(n>>k)&1])),Cout:n>>8},label:`${a} + ${b}`};
}
export const sameOutput=(actual,expected)=>Object.keys(expected).every(k=>actual[k]===expected[k]);
export function summarize(stage,output){if(stage===0)return String(output.Y);if(stage===1)return `S=${output.S} · Cout=${output.Cout}`;return `${Array.from({length:8},(_,k)=>output[`S${k}`]<<k).reduce((a,b)=>a+b,0)} · Cout=${output.Cout}`;}
export function validSavedModel(m,stage){if(!m||m.stage!==stage||!Array.isArray(m.nodes)||m.nodes.length>STAGES[stage].max)return false;const ids=new Set();for(const n of m.nodes){if(!n||!new RegExp(stage===2?'^F[1-8]$':'^G([1-9]|1[0-2])$').test(n.id)||ids.has(n.id))return false;ids.add(n.id);for(const k of stage===2?['a','b','cin']:['a','b'])if(typeof n[k]!=='string')return false;}const sources=new Set(['',...sourceOptions(m)]);return m.nodes.every(n=>(stage===2?['a','b','cin']:['a','b']).every(k=>sources.has(n[k])))&&m.outputs&&STAGES[stage].outputs.every(k=>sources.has(m.outputs[k]));}
