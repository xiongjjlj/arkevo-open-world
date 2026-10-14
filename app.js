import {chapters} from './chapters.js?v=4';
import {add8} from './logic.js';
import {experimentAt} from './experiments.js?v=4';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const video=$('#worldVideo'),director=$('#directorVideo'),canvas=$('#worldCanvas'),screen=$('#screen');
const params=new URLSearchParams(location.search);let chapter=chapters.find(x=>x.day===Number(params.get('day')))||chapters[3];
let mode='agent',adaptation=true,world=null,worldPromise=null,lastPhase=-1,loading=true,initialTime=params.has('t')&&Number.isFinite(Number(params.get('t')))?Math.min(59.9,Math.max(0,Number(params.get('t')))):(params.has('day')?0:42);let toastTimer,directorState='loading',cameraRequest=0;
const timeText=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const mediaNames={director:'DIRECTOR / 导演视角',agent:'AGENT POV / 第一人称',detail:'DETAIL / 同步三维特写'};
const trajectoryTimes=[0,12,24,36,42,48];
const phaseModules=[['perception','model','planner'],['model','planner','tools'],['perception','verifier'],['model','planner','tools'],['verifier','memory']];
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4700);}
$('.day-selector').innerHTML=chapters.map(c=>`<button class="day-card" data-day="${c.day}" aria-label="播放第 ${c.day} 天：${c.title}" aria-pressed="false"><div class="day-thumb"><img src="assets/day-${c.day}.jpg?v=4" alt="第${c.day}天的计算设施" loading="lazy"><span class="day-no">DAY ${String(c.day).padStart(2,'0')}</span><span class="day-duration">01:00</span></div><div class="day-details"><b>${c.title}<span>↗</span></b><small>${c.subtitle}</small></div></button>`).join('');
$('#evolutionGrid').innerHTML=chapters.map(c=>`<article class="evolution-card"><button class="evolution-image" data-day="${c.day}" aria-label="回看第 ${c.day} 天"><img src="assets/day-${c.day}.jpg?v=4" alt="第 ${c.day} 天，${c.title}" loading="lazy"><span>▶</span></button><span class="mono">DAY ${String(c.day).padStart(2,'0')}</span><h3>${c.archiveTitle}</h3><p>${c.archive}</p><div class="evolution-bottom"><span>${c.label}</span><b>01:00 ↗</b></div></article>`).join('');
async function ensureWorld(){if(worldPromise)return worldPromise;if(!worldPromise){worldPromise=import('./world.js?v=4').then(async({createWorld})=>{world=createWorld(canvas,{day:chapter.day,camera:mode==='director'?'orbit':mode,width:screen.clientWidth,height:screen.clientHeight});await world.ready;world.render(video.currentTime||0);return world;}).catch(e=>{worldPromise=null;toast('此设备暂时无法开启三维机位，已保留预录影像。');console.error(e);throw e;});}return worldPromise;}
function evidenceText(experiment){
 const x=experiment,d=x.displayValues;
 if(x.stage==='observe')return `SCAN · ${x.targetLabel} · 固定测试输入 ${d.inputValue}`;
 if(x.stage==='build')return `PLACE · ${x.targetLabel} · 测试尚未执行`;
 if(x.stage==='repair')return `CONNECT · ${x.targetLabel} · 保持同一输入，连接完成后复验`;
 const values=x.day===10?`像素差异 ${x.observed} / ${x.pixelCount}`:`预期 ${d.expectedValue} · 观测 ${d.observedValue}`;
 if(x.stage==='commit')return `COMMIT · ${values} · ${x.memory.id} v${x.memory.version}${x.day===10?' · 外层 20 + 1 → x=21 → 内层建桥':''}`;
 return `${x.tool} · ${d.inputValue} · ${values} · ${x.passed?'PASS':'FAIL'}`;
}
function drawEvidence(x){
 const d=x.displayValues,panel=$('#experimentEvidence');panel.dataset.status=x.status;
 $('#evidenceTool').textContent=x.tool;
 $('#evidenceResult').textContent=x.resultLabel;
 $('#evidenceTarget').textContent=x.targetLabel;
 $('#evidenceInput').textContent=d.inputValue;
 $('#evidenceExpected').textContent=x.day===10?`${d.expectedValue} 像素差异`:d.expectedValue;
 $('#evidenceObserved').textContent=x.tested?(x.day===10?`${d.observedValue} / ${x.pixelCount}`:d.observedValue):'待测';
 const detail=x.stage==='observe'?'锁定测试输入与预期，扫描可操作端口。':x.stage==='build'?'按模块接口装配；24 秒执行测试。':x.fault?(x.stage==='repair'?x.patch:x.diagnosis):x.day===10?`同一帧逐像素比较：${x.pixelCount-x.mismatchCount} / ${x.pixelCount} 一致。`:x.day===1?`真值表 00→${x.testCases[0].observed} · 01→${x.testCases[1].observed} · 10→${x.testCases[2].observed} · 11→${x.testCases[3].observed}`:`${x.coverage.passed} / ${x.coverage.total} 项检查通过 · ${d.detail}`;
 $('#evidenceDetail').textContent=detail+(x.day===10&&x.command.enabled?' 外层输入 20 + 1 → x=21 → 内层建桥。':'');
 $('#evidenceMemory').textContent=`${x.memory.id} · v${x.memory.version}${x.memory.committed?' 已保存':' 待验证回写'}`;
 $('#memoryCode').textContent=`MEMORY / ${x.memory.id} · v${x.memory.version}${x.memory.committed?' · COMMITTED':' · PENDING'}`;
 if(x.day===1&&x.tested){$('#truthTable').hidden=false;$('#truthTable').innerHTML=x.testCases.map(c=>`<span class="${c.passed?'pass':'fail'}" title="输入 ${c.name}，预期 ${c.expected}，观测 ${c.observed}">${c.name} → ${c.observed}<b>${c.passed?'✓':'×'}</b></span>`).join('');}else $('#truthTable').hidden=true;
}
function drawPhase(force=false){
 const t=Math.min(59.999,Math.max(0,video.currentTime||0)),x=experimentAt(chapter.day,t),phase=x.phase;
 $('#elapsed').textContent=timeText(t);$('#insetTime').textContent=mode==='director'?timeText(t):directorState==='error'?'重试':directorState!=='ready'?'缓冲':timeText(director.currentTime||0);$('#frameNumber').textContent=`FRAME ${String(Math.min(1439,Math.floor(t*24))).padStart(4,'0')}`;$('#seek').value=t;$('#seek').style.setProperty('--progress',`${t/60*100}%`);
 drawEvidence(x);
 if(x.stage===lastPhase&&!force)return;
 lastPhase=x.stage;const e=chapter.events[phase];
 $('#captionKicker').textContent=x.stage==='retest'?'RETEST · 同输入复验':e[4];
 $('#captionTitle').textContent=x.stage==='retest'?'同一个输入，这次得到了正确结果。':e[5];
 $('#captionBody').textContent=x.stage==='retest'?evidenceText(x):e[6];
 $('#actionTitle').textContent=x.stage==='retest'?'修复完成，同输入复验通过':e[0];
 $('#actionBody').textContent=x.stage==='retest'?evidenceText(x):e[1];
 $('#actionTag').textContent=x.stage==='retest'?'TEST PASSED':e[2];
 $('#eventNumber').textContent=`${String(chapter.day).padStart(2,'0')}.${String(trajectoryTimes.filter(v=>v<=t).length).padStart(2,'0')}`;
 const modules=x.stage==='retest'?['tools','verifier']:chapter.day===2&&phase===0?['memory','model','planner']:phaseModules[phase];
 $$('.module').forEach(el=>el.classList.toggle('active',modules.includes(el.dataset.module)&&!(el.dataset.module==='memory'&&!adaptation)));
 $$('.loop-track>span').forEach(el=>el.classList.toggle('active',adaptation&&Number(el.dataset.phase)===(x.stage==='retest'?2:[0,1,2,3,2][phase])));
 $('#perceptionStatus').textContent=['观察中','接收反馈','采样中','对比结果','已确认'][phase];
 $$('.event-row').forEach((row,i)=>{const current=t>=trajectoryTimes[i]&&(i===trajectoryTimes.length-1||t<trajectoryTimes[i+1]);row.classList.toggle('reached',t>=trajectoryTimes[i]);row.classList.toggle('current',current);row.setAttribute('aria-current',current?'step':'false');});
}
function updatePlay(){const paused=video.paused;document.body.classList.toggle('paused',paused);$('#play').setAttribute('aria-label',paused?'播放':'暂停');$('#play').title=paused?'播放':'暂停';$('#play').innerHTML=paused?'<svg viewBox="0 0 20 20"><path d="m6 4 10 6-10 6Z" fill="currentColor" stroke="none"/></svg>':'<svg class="pause-icon" viewBox="0 0 20 20"><path d="M6 4v12M14 4v12"/></svg>';updateSyncLabel();}
function updateSyncLabel(){
 $('#syncText').textContent=directorState==='error'?'导演连接中断':directorState!=='ready'?'导演缓冲中':video.paused?'同步已暂停':'画面同步';
}
function setDirectorState(state){
 directorState=state;$('#directorState').hidden=state==='ready';$('#directorStateText').textContent=state==='error'?'导演影像加载失败':'导演画面缓冲中';$('#retryDirector').hidden=state!=='error';updateSyncLabel();
}
function syncDirector(force=false){
 if(director.error||director.seeking||!Number.isFinite(director.duration)||!Number.isFinite(video.duration))return;
 const drift=director.currentTime-video.currentTime,abs=Math.abs(drift);
 if(abs>(force?.0001:.065)){director.currentTime=Math.min(video.currentTime,director.duration-.001);director.playbackRate=video.playbackRate;}
 else director.playbackRate=video.playbackRate*(!force&&abs>.018?(drift>0?.97:1.03):1);
}
function followPlayback(force=true){
 syncDirector(force);
 if(!video.paused&&!video.seeking&&video.readyState>=3&&!director.error)director.play().catch(()=>{});else director.pause();
}
async function play(){try{syncDirector(true);await video.play();followPlayback(false);}catch{updatePlay();}}
function retryDirector(){setDirectorState('loading');director.load();}
function updateDownload(){const pov=mode!=='director';$('#download').href=`assets/${pov?'pov-':''}day-${chapter.day}.mp4?v=4`;$('#download').download=`ARKEVO-Day-${chapter.day}-${pov?'POV':'Director'}.mp4`;}
director.addEventListener('loadedmetadata',()=>{director.currentTime=Number.isFinite(video.duration)?video.currentTime:initialTime;});
director.addEventListener('canplay',()=>{setDirectorState('ready');followPlayback(video.paused);});
director.addEventListener('playing',()=>setDirectorState('ready'));
director.addEventListener('waiting',()=>{if(!director.seeking)setDirectorState('loading');});
director.addEventListener('stalled',()=>{if(director.readyState<3)setDirectorState('loading');});
director.addEventListener('error',()=>setDirectorState('error'));
$('#retryDirector').addEventListener('click',retryDirector);
video.addEventListener('seeking',()=>{director.pause();syncDirector(true);});video.addEventListener('seeked',()=>followPlayback());
video.addEventListener('playing',()=>followPlayback());video.addEventListener('waiting',()=>director.pause());
video.addEventListener('play',()=>followPlayback());video.addEventListener('pause',()=>{director.pause();syncDirector(true);});
video.addEventListener('ratechange',()=>{director.playbackRate=video.playbackRate;});
function selectDay(day,start=0,autoplay=true){const c=chapters.find(x=>x.day===day);if(!c)return;chapter=c;lastPhase=-1;loading=true;setDirectorState('loading');initialTime=start;video.poster=`assets/pov-day-${day}.jpg?v=4`;director.pause();director.poster=`assets/day-${day}.jpg?v=4`;director.src=`assets/day-${day}.mp4?v=4`;director.load();const savedRate=video.playbackRate;video.defaultPlaybackRate=savedRate;video.src=`assets/pov-day-${day}.mp4?v=4`;video.load();video.playbackRate=savedRate;updateDownload();$('#screenDay').textContent=`DAY ${String(day).padStart(2,'0')}`;$('#screenTitle').textContent=c.title;$$('.day-card').forEach(btn=>{const active=Number(btn.dataset.day)===day;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));});$('#memoryCode').textContent=`MEMORY / ${c.memoryCode}`;$('#memoryTitle').textContent=c.memory;$('#memoryBody').textContent=c.memoryBody;$('#memoryTags').innerHTML=c.tags.map(t=>`<span>${t}</span>`).join('');$('#capabilityStage').textContent=c.boundary;$('#capabilityDescription').textContent=c.ability;$$('.scale-segments i').forEach((el,i)=>el.classList.toggle('filled',i<=chapters.indexOf(c)));$('#eventList').innerHTML=trajectoryTimes.map((t,i)=>{const e=c.events[Math.floor(t/12)],x=experimentAt(day,t),title=t===42?'修复完成，同输入复验':e[0];return `<button class="event-row${t===24?' failure':''}" data-time="${t}" aria-label="跳转到 ${t} 秒，${title}"><span class="event-time">${timeText(t)}</span><span class="event-dot"></span><div><h3>${title}</h3><p>${evidenceText(x)}</p></div><span class="event-kind">${x.tool}</span></button>`;}).join('');if(world){world.setDay(day);world.setComputeState?.(experimentAt(day,start).computeState);lastFrame=-1;}$('#mediaState').hidden=true;drawPhase(true);const newUrl=new URL(location.href);newUrl.searchParams.set('day',day);newUrl.searchParams.delete('t');history.replaceState(null,'',newUrl);video.dataset.autoplay=autoplay?'yes':'no';}
$$('[data-day]').forEach(el=>el.addEventListener('click',()=>{selectDay(Number(el.dataset.day));if(el.classList.contains('evolution-image'))$('#observation').scrollIntoView({behavior:'smooth'});}));
video.addEventListener('loadedmetadata',()=>{video.currentTime=Math.min(initialTime,video.duration-.1);loading=false;drawPhase(true);if(video.dataset.autoplay==='yes')play();});video.addEventListener('timeupdate',()=>drawPhase());video.addEventListener('play',updatePlay);video.addEventListener('pause',updatePlay);video.addEventListener('ended',()=>{video.currentTime=0;play();});video.addEventListener('error',()=>{loading=false;$('#mediaState').textContent='影像加载失败，点击播放重试';$('#mediaState').hidden=false;updatePlay();});video.addEventListener('canplay',()=>{$('#mediaState').hidden=true;});
$('#play').addEventListener('click',()=>{if(video.error){video.load();return play();}if(video.paused)play();else video.pause();});$('#mediaState').addEventListener('click',()=>{video.load();play();});
$('#seek').addEventListener('input',e=>{if(!Number.isFinite(video.duration))return;video.currentTime=Number(e.target.value);drawPhase(true);});$('#eventList').addEventListener('click',e=>{const row=e.target.closest('[data-time]');if(row&&Number.isFinite(video.duration)){video.currentTime=Number(row.dataset.time)+.05;drawPhase(true);screen.scrollIntoView({behavior:'smooth',block:'center'});}});
$('#speed').addEventListener('click',()=>{const speeds=[1,1.5,2,.5];video.playbackRate=speeds[(speeds.indexOf(video.playbackRate)+1)%speeds.length];$('#speed').textContent=`${video.playbackRate}×`;$('#speed').setAttribute('aria-label',`播放速度 ${video.playbackRate} 倍`);});
$('#mute').addEventListener('click',()=>{video.muted=!video.muted;const label=video.muted?'开启环境音':'关闭环境音';$('#mute').setAttribute('aria-label',label);$('#mute').title=label;$('#mute').innerHTML=video.muted?'<svg viewBox="0 0 20 20"><path d="m3 8 4 0 5-4v12l-5-4H3zM15 7l4 6m0-6-4 6"/></svg>':'<svg viewBox="0 0 20 20"><path d="m3 8 4 0 5-4v12l-5-4H3zM15 7q4 3 0 6M17 4q6 6 0 12"/></svg>';});
const playerPanel=$('.observation-panel');
function syncFullscreen(){const active=!!document.fullscreenElement||playerPanel.classList.contains('theater');$('#fullscreen').setAttribute('aria-label',active?'退出全屏':'全屏观看');$('#fullscreen').title=active?'退出全屏':'全屏观看';}
function setTheater(active){playerPanel.classList.toggle('theater',active);document.body.classList.toggle('theater-open',active);syncFullscreen();}
$('#fullscreen').addEventListener('click',async()=>{if(playerPanel.classList.contains('theater'))return setTheater(false);if(document.fullscreenElement){await document.exitFullscreen();return;}if(document.fullscreenEnabled&&playerPanel.requestFullscreen){try{await playerPanel.requestFullscreen();}catch{setTheater(true);}}else setTheater(true);syncFullscreen();});
document.addEventListener('fullscreenchange',syncFullscreen);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&playerPanel.classList.contains('theater'))setTheater(false);});
async function selectCamera(next){
 const request=++cameraRequest;
 if(next===mode)return;
 if(next==='director'&&directorState==='error'){retryDirector();toast('正在重新连接导演画面。');return;}
 const button=$(`[data-camera="${next}"]`);
 try{
  if(next==='detail'){button.disabled=true;const w=await ensureWorld();if(request!==cameraRequest)return;w.setDay(chapter.day);w.setCamera('detail');w.resize(screen.clientWidth,screen.clientHeight);w.render(video.currentTime||0);}
  mode=next;screen.dataset.view=mode;canvas.style.display=mode==='detail'?'block':'none';$('#cameraName').textContent=mediaNames[mode];
  $('#insetName').textContent=mode==='director'?'第一人称':'导演视角';$('#insetSwap').setAttribute('aria-label',mode==='director'?'将第一人称切换为主画面':'将导演视角切换为主画面');
  $$('[data-camera]').forEach(el=>{const selected=el.dataset.camera===mode;el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',String(selected));});updateDownload();syncDirector(true);
 }catch{}finally{button.disabled=false;}
}
$$('[data-camera]').forEach(btn=>btn.addEventListener('click',()=>selectCamera(btn.dataset.camera)));
$('#insetSwap').addEventListener('click',()=>{if(mode!=='director'&&directorState==='error')retryDirector();else selectCamera(mode==='director'?'agent':'director');});

new ResizeObserver(()=>{if(world){world.resize(screen.clientWidth,screen.clientHeight);world.setComputeState?.(experimentAt(chapter.day,video.currentTime||0).computeState);world.render(video.currentTime||0);lastFrame=video.currentTime||0;}}).observe(screen);
let lastFrame=-1;function frame(){requestAnimationFrame(frame);if(!video.paused&&!video.seeking)syncDirector();if(world&&mode==='detail'){const t=video.currentTime||0;if(t!==lastFrame){world.setComputeState?.(experimentAt(chapter.day,t).computeState);world.render(t);lastFrame=t;}}}frame();
$('#adaptToggle').addEventListener('click',()=>{adaptation=!adaptation;$('#adaptToggle').setAttribute('aria-checked',String(adaptation));$('#adaptation').classList.toggle('off',!adaptation);$('#adaptDescription').textContent=adaptation?'把这次的反馈，变成下一次的能力。':'架构示意：隐藏反馈回路高亮；实验轨迹继续回放。';drawPhase(true);toast(adaptation?'Adaptation 已接入：验证反馈可以写回规划与记忆。':'仅切换架构图高亮；测试结果与经验版本仍来自同一条确定性模拟轨迹。');});
$('#eventJump').addEventListener('click',()=>$('#trajectory').scrollIntoView({behavior:'smooth'}));
const moduleInfo={
perception:['Perception','把画面转化为可行动的观测。','主画面的第一人称观测帧、工具返回状态与历史观测。','可操作对象、空间关系、当前任务状态与变化。','从 Agent 光学传感器的视角定位元件与接线端口；导演小窗仅作为观众的外部参照。'],
model:['ARKEVO Model','在目标、观测与已有经验之间，提出下一步行动。','多模态观测、任务目标、可调用工具、历史执行结果。','面向任务的行动提议与需要进一步验证的假设。','结合可观察到的电路状态，确定下一轮要操作或检查的对象。'],
planner:['Planner','将目标拆解为有依赖顺序的执行步骤。','任务目标、可用模块、环境约束与验证反馈。','待执行步骤、部件依赖、局部修正方案。','把计算设施拆为逻辑、运算、存储与显示，按依赖连接。'],
tools:['Tool use','让模型的行动，真实作用于环境。','结构化的操作请求、目标对象与操作参数。','放置、连接、移动和检查的执行结果。','操作机器人与装配工具，完成当前模块的放置和连接。'],
verifier:['Verifier','用明确的条件，区分完成和看起来完成。','预期行为、测试输入、执行后的环境状态。','是否满足条件、偏差所在位置、可复现的测试结果。','比较电路输入与输出，将不符合预期的结果交给下一轮修正。'],
memory:['Memory','把成功结构与失败教训，变成可检索的经验。','经过验证的结构、失败条件、修正动作与结果。','可复用模块、操作约定与下次可检索的检查方法。','保存本节点的结构经验，为更复杂的组合任务提供起点。'],
adaptation:['Adaptation','把执行反馈接回下一轮，让策略有机会改变。','可复现的失败、验证结果、已有策略与经验记录。','修订后的计划、更新的经验、下一轮验证条件。','发现问题后，修改局部方案，再用相同条件验证改动。这里演示运行时适应，不代表模型权重训练。']};
$$('[data-module]').forEach(btn=>btn.addEventListener('click',()=>{const key=btn.dataset.module,info=moduleInfo[key];$('#moduleKicker').textContent=key==='adaptation'?'PLUGGABLE EXTENSION / 可插拔扩展':'HARNESS MODULE / 系统模块';$('#moduleTitle').textContent=info[0];$('#moduleLead').textContent=info[1];$('#moduleInput').textContent=info[2];$('#moduleOutput').textContent=info[3];$('#moduleExample').textContent=`DAY ${String(chapter.day).padStart(2,'0')} · ${info[4]}`;$('#circuitLab').hidden=key!=='verifier';if(key==='verifier')updateCircuit();$('#moduleDialog').showModal();}));
['aboutOpen','methodOpen'].forEach(id=>$('#'+id).addEventListener('click',()=>$('#aboutDialog').showModal()));$$('dialog').forEach(dialog=>{dialog.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});});
document.addEventListener('keydown',e=>{if($('dialog[open]')||/INPUT|TEXTAREA|BUTTON/.test(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();video.paused?play():video.pause();}if(e.code==='ArrowRight'&&Number.isFinite(video.duration)){video.currentTime=Math.min(video.duration-.1,video.currentTime+5);e.preventDefault();}if(e.code==='ArrowLeft'&&Number.isFinite(video.duration)){video.currentTime=Math.max(0,video.currentTime-5);e.preventDefault();}});
selectDay(chapter.day,initialTime,!matchMedia('(prefers-reduced-motion:reduce)').matches);

function updateCircuit(){let a=Math.max(0,Math.min(255,Math.trunc(Number($('#inputA').value)||0))),b=Math.max(0,Math.min(255,Math.trunc(Number($('#inputB').value)||0)));const r=add8(a,b);$('#circuitResult').textContent=r.sum;$('#bitDisplay').innerHTML=[...r.bits].reverse().map((bit,i)=>`<span class="${bit.sum?'on':''}"><b>${bit.sum}</b><small>b${7-i}</small></span>`).join('');$('#carryResult').textContent=`CARRY ${r.carry}`;$('#circuitCheck').textContent=r.carry?'✓ 低八位输出 · 进位为 1':'✓ 门级计算与整数结果一致';}
['inputA','inputB'].forEach(id=>{$('#'+id).addEventListener('input',updateCircuit);$('#'+id).addEventListener('change',e=>{e.target.value=Math.max(0,Math.min(255,Math.trunc(Number(e.target.value)||0)));updateCircuit();});});
