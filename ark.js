const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
const tasks=[
{tag:'BUILD / 从无到有',title:'接通第一块农田',description:'从河岸取水，选择合适的管件，将管线连接到营地。自行决定路径与放置顺序。',criteria:['农田状态显示已灌溉。','间隔 30 秒检查两次，均保持灌溉。','保留从水源到出水端的完整连接截图。']},
{tag:'REPAIR / 找到原因',title:'找出失效的连接',description:'在一套曾经正常运行的供水系统中，准备者移除一处管件。观察者从故障存档开始，找到并修复断点。',criteria:['定位缺失管件，并记录修复前证据。','修复后农田恢复灌溉。','保留修改位置与复验结果，避免重建整套系统。']},
{tag:'EXTEND / 复用经验',title:'把水送到第二块农田',description:'保留原有供水，在另一处预设农田上扩展支路。检查新连接是否影响原来的系统。',criteria:['两块农田都显示已灌溉。','间隔 30 秒复验，两处状态均保持。','记录新增管件数量和路径，供下一轮比较。']}
];
const steps=[
['PERCEPTION / 01','看清水源与目标','读取地形、农田位置、物品栏和当前状态。先确认自己看到了什么，再决定下一步。','游戏截图、农田状态、可用管件。','水源与目标位置、待确认的连接状态。'],
['PLANNER / 02','只规划下一段连接','提出一段可操作的路线，选择管件和放置位置。完成局部检查后，再继续扩展。','观察结果、当前任务、物资预算。','下一段路线与对应操作，不预填完整答案。'],
['TOOL USE / 03','让方案进入世界','通过键鼠选择物品、调整位置、放置与连接。每次操作后获取新画面，确认是否实际成功。','模型提出的操作与当前游戏画面。','操作记录、操作后截图、放置是否成功。'],
['VERIFIER / 04','检查实际状态','查看农田是否灌溉，并在短暂间隔后复验。不能只凭管线外观判断成功。','农田交互界面、修复前后截图。','逐项验收结果，以及仍然不成立的条件。'],
['ADAPTATION + MEMORY / 05','让下一次尝试更有依据','把失败位置、有效修改与复验结果记入任务记录。下一轮引用已验证的连接方式；改变起点后重新检查。','失败证据、修复动作、同条件复验。','可复用的操作记录与适用条件，不等同于模型权重更新。']
];
let taskIndex=0;
function chooseTask(i){taskIndex=i;all('[data-task]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.task)===i));const t=tasks[i];$('#taskTag').textContent=t.tag;$('#taskTitle').textContent=t.title;$('#briefTask').textContent=t.title;$('#taskDesc').textContent=t.description;$('#criteria').replaceChildren(...t.criteria.map(x=>{const li=document.createElement('li');li.textContent=x;return li}));}
function chooseStep(i){all('[data-step]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.step)===i));['stepCode','stepTitle','stepBody','stepInput','stepOutput'].forEach((id,j)=>$('#'+id).textContent=steps[i][j]);}
all('[data-task]').forEach(b=>b.onclick=()=>chooseTask(+b.dataset.task));all('[data-step]').forEach(b=>b.onclick=()=>chooseStep(+b.dataset.step));chooseTask(0);chooseStep(0);
$('#humanOpen').onclick=()=>$('#humanDialog').showModal();$('.close').onclick=()=>$('#humanDialog').close();$('#humanDialog').onclick=e=>{if(e.target===$('#humanDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close()}};
const video=$('#film');let hls,media,index=0,run=0;const titles=['建造一个能够运转的家','一座岛屿，无数种可能','走进红杉与巨兽的世界'];
function status(message){$('#loading').textContent=message;$('#loading').hidden=false;}
function fail(){status('影像暂时无法播放，可重试或打开官方来源。');$('#retry').hidden=false;}
async function playFilm(i){index=i;const token=++run;if(hls){hls.destroy();hls=null}video.pause();video.removeAttribute('src');video.load();all('[data-film]').forEach(b=>b.setAttribute('aria-pressed',+b.dataset.film===i));$('#filmTitle').textContent=titles[i];video.poster=media.screenshots[i].path_full;status('正在连接官方影像…');$('#retry').hidden=true;const src=media.movies[i].hls_h264;
const start=()=>{if(token!==run)return;video.play().catch(()=>status('点击画面中的播放按钮，开始观看。'));};
if(video.canPlayType('application/vnd.apple.mpegurl')){video.src=src;start();}else if(window.Hls&&Hls.isSupported()){hls=new Hls({maxBufferLength:20,maxMaxBufferLength:40,startLevel:1});hls.loadSource(src);hls.attachMedia(video);hls.on(Hls.Events.MANIFEST_PARSED,start);hls.on(Hls.Events.ERROR,(_,data)=>{if(token===run&&data.fatal)fail()});}else fail();}
video.addEventListener('playing',()=>{$('#loading').hidden=true;$('#retry').hidden=true});video.addEventListener('waiting',()=>status('官方影像缓冲中…'));video.addEventListener('error',()=>{if(video.getAttribute('src'))fail()});video.addEventListener('ended',()=>{video.currentTime=0;video.play().catch(()=>{})});$('#retry').onclick=()=>media?playFilm(index):loadMedia();all('[data-film]').forEach(b=>b.onclick=()=>{if(media)playFilm(+b.dataset.film)});
async function loadMedia(){try{const r=await fetch('ark-media.json');if(!r.ok)throw Error('Media unavailable');media=await r.json();await playFilm(0)}catch{fail()}}loadMedia();
