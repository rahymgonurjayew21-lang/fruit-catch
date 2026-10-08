const PPD=50000,FALL_MS=4300,SPAWN_MS=800;
const FRUITS=[
  ["🍎",40,75],["🍊",60,8],["🍋",80,5],["🍌",100,3.5],["🍓",120,2.5],
  ["🫐",160,2],["🍉",200,1.5],["🍍",300,1],["🥝",400,.4],["✨",1000,.1]
];
const REWARD_BLOCK_ID="52384";
const INTERSTITIAL_BLOCK_ID="int-52381";
const TASK_BLOCK_ID="task-52383";
const REWARD_GOAL=5,DAILY_REWARD=10000;
const BACKEND_URL=""; // Put your public HTTPS FastAPI URL here after deployment.

let total=Number(localStorage.getItem("fruitCatchTotal")||0),round=0,playing=false,spawnTimer,raf,objects=new Set();
let rewardViews=Number(localStorage.getItem("fruitCatchRewardViews")||0);
let rewardDay=localStorage.getItem("fruitCatchRewardDay")||"";
let soundEnabled=localStorage.getItem("fruitCatchSound")!=="off";
let musicStarted=false;

const $=id=>document.getElementById(id);
const tg=window.Telegram?.WebApp;
if(tg){tg.ready();tg.expand();}

const audioFiles={
  music:"assets/audio/background.mp3",
  fruit:"assets/audio/fruit-pop.mp3",
  bomb:"assets/audio/bomb.mp3",
  click:"assets/audio/click.mp3"
};
const audioCache={};
function getAudio(name){
  if(!audioCache[name]){audioCache[name]=new Audio(audioFiles[name]);audioCache[name].preload="auto";}
  return audioCache[name];
}
function playSound(name,volume=0.75){
  if(!soundEnabled)return;
  try{const a=getAudio(name);a.currentTime=0;a.volume=volume;a.play().catch(()=>{});}catch(e){}
}
function startMusic(){
  if(!soundEnabled||musicStarted)return;
  musicStarted=true;
  try{const a=getAudio("music");a.loop=true;a.volume=.22;a.play().catch(()=>{musicStarted=false;});}catch(e){}
}
function stopMusic(){try{const a=getAudio("music");a.pause();a.currentTime=0;}catch(e){} musicStarted=false;}
function toggleSound(){
  soundEnabled=!soundEnabled;
  localStorage.setItem("fruitCatchSound",soundEnabled?"on":"off");
  $("soundToggle").textContent=soundEnabled?"🔊":"🔇";
  if(soundEnabled)startMusic();else stopMusic();
}
function todayKey(){return new Date().toISOString().slice(0,10)}
function resetDailyIfNeeded(){
  const d=todayKey();
  if(rewardDay!==d){
    rewardDay=d;rewardViews=0;
    localStorage.setItem("fruitCatchRewardDay",d);
    localStorage.setItem("fruitCatchRewardViews","0");
  }
}
function saveTotal(){localStorage.setItem("fruitCatchTotal",String(Math.max(0,total)));}
function render(){
  resetDailyIfNeeded();total=Math.max(0,total);saveTotal();
  $("totalScore").textContent=total.toLocaleString("ru-RU");
  $("gameTotal").textContent=total.toLocaleString("ru-RU");
  $("usd").textContent=`≈ $${(total/PPD).toFixed(2)}`;
  $("rewardProgress").textContent=`${rewardViews}/${REWARD_GOAL}`;
  $("soundToggle").textContent=soundEnabled?"🔊":"🔇";
}
function show(id){
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  $(id).classList.add("active");
}
function chooseFruit(){
  let r=Math.random()*100,a=0;
  for(const [emoji,value,chance] of FRUITS){a+=chance;if(r<a)return{emoji,value,bomb:false,hidden:false};}
  return{emoji:"🍎",value:40,bomb:false,hidden:false};
}
function chooseCamouflageFruit(){
  const fruit=chooseFruit();
  return{...fruit,bomb:true,hidden:true,camouflage:true};
}
function currentDifficulty(){
  const seconds=performance.now()-gameStartedAt;
  const minutes=seconds/60000;
  return Math.min(1,minutes/4);
}
function spawn(){
  if(!playing)return;
  const d=currentDifficulty();
  const normalBombRate=.035 + d*.075; // 3.5% -> 11%
  const hiddenBombRate=.010 + d*.040; // 1% -> 5%
  let roll=Math.random(),o;
  if(roll<normalBombRate)o={emoji:"💣",value:0,bomb:true,hidden:false};
  else if(roll<normalBombRate+hiddenBombRate)o=chooseCamouflageFruit();
  else o=chooseFruit();

  const el=document.createElement("div");
  el.className="fruit";el.textContent=o.emoji;
  const w=$("field").clientWidth,x=Math.max(5,Math.random()*(w-65));
  el.style.left=x+"px";$("field").appendChild(el);
  const obj={el,o,x,start:performance.now(),y:-70};
  objects.add(obj);
  el.addEventListener("pointerdown",e=>{e.preventDefault();e.stopPropagation();hit(obj);});
}
function createSparksAt(cx,cy,count=14){
  const flash=document.createElement("div");
  flash.className="tap-flash";flash.style.left=cx+"px";flash.style.top=cy+"px";
  document.body.appendChild(flash);setTimeout(()=>flash.remove(),320);
  for(let i=0;i<count;i++){
    const spark=document.createElement("span");spark.className="spark";
    spark.style.left=cx+"px";spark.style.top=cy+"px";
    const a=Math.PI*2*i/count+(Math.random()-.5)*.25,d=28+Math.random()*45;
    spark.style.setProperty("--dx",Math.cos(a)*d+"px");
    spark.style.setProperty("--dy",Math.sin(a)*d+"px");
    spark.style.setProperty("--size",2+Math.random()*4+"px");
    document.body.appendChild(spark);setTimeout(()=>spark.remove(),520);
  }
}
function createSparks(el,count=14){
  const r=el.getBoundingClientRect();
  createSparksAt(r.left+r.width/2,r.top+r.height/2,count);
}
function hit(obj){
  if(!objects.has(obj)||!playing)return;
  if(obj.o.hidden){obj.o.hidden=false;obj.el.textContent="💣";createSparks(obj.el,18);bomb(obj);return;}
  if(obj.o.bomb){createSparks(obj.el,22);bomb(obj);return;}
  round+=obj.o.value;createSparks(obj.el,14);playSound("fruit",.72);
  floatText(obj.el,"+"+obj.o.value.toLocaleString("ru-RU"));
  obj.el.classList.add("hit");setTimeout(()=>remove(obj),300);
}
function bomb(obj){
  const before=round,loss=Math.floor(before*.10);round=Math.max(0,before-loss);
  playSound("bomb",.85);floatText(obj.el,"−10%");
  obj.el.classList.add("bomb-hit");
  document.body.animate([{filter:"brightness(1)"},{filter:"brightness(1.7)"},{filter:"brightness(1)"}],{duration:260});
  setTimeout(()=>remove(obj),420);
}
function floatText(el,text){
  const r=el.getBoundingClientRect(),f=document.createElement("div");
  f.className="float";f.textContent=text;f.style.left=r.left+"px";f.style.top=r.top+"px";
  document.body.appendChild(f);setTimeout(()=>f.remove(),750);
}
function remove(o){objects.delete(o);o.el.remove();}
function tick(now){
  if(!playing)return;
  const h=$("field").clientHeight;
  for(const o of [...objects]){
    const t=(now-o.start)/FALL_MS;
    o.y=-70+t*(h+100);
    o.el.style.transform=`translateY(${o.y}px) rotate(${Math.sin(t*10)*8}deg)`;
    if(o.o.hidden&&t>=.58){o.o.hidden=false;o.el.textContent="💣";}
    if(o.y>h+80){
      if(!o.o.bomb)round=Math.max(0,round-10);
      remove(o);
    }
  }
  $("roundScore").textContent=round.toLocaleString("ru-RU");
  raf=requestAnimationFrame(tick);
}
function stop(){
  clearInterval(spawnTimer);cancelAnimationFrame(raf);
  for(const o of objects)o.el.remove();objects.clear();
}
let gameStartedAt=0;
function start(){
  playSound("click",.55);startMusic();stop();playing=true;round=0;
  gameStartedAt=performance.now();$("roundScore").textContent="0";show("game");
  spawn();spawnTimer=setInterval(spawn,SPAWN_MS);raf=requestAnimationFrame(tick);
}
async function showInterstitial(){
  if(!window.Adsgram)return;
  try{
    const ad=window.Adsgram.init({blockId:INTERSTITIAL_BLOCK_ID});
    await ad.show();
  }catch(e){console.warn("AdsGram interstitial:",e)}
}
async function finish(){
  if(!playing)return;
  playSound("click",.55);playing=false;stop();total+=round;render();
  await showInterstitial();
  $("earned").textContent="+"+round.toLocaleString("ru-RU");
  $("earnedUsd").textContent=`≈ $${(round/PPD).toFixed(2)}`;
  show("result");
}
async function syncRewardStatus(){
  if(!BACKEND_URL||!tg?.initDataUnsafe?.user?.id)return null;
  try{
    const id=tg.initDataUnsafe.user.id;
    const r=await fetch(`${BACKEND_URL}/api/reward/status?userid=${encodeURIComponent(id)}`);
    if(!r.ok)return null;
    return await r.json();
  }catch(e){return null}
}
async function rewardAd(){
  resetDailyIfNeeded();
  if(rewardViews>=REWARD_GOAL){$("rewardInfo").textContent="Сегодня лимит уже выполнен.";return;}
  if(!window.Adsgram){$("rewardInfo").textContent="AdsGram ещё не загрузился.";return;}
  playSound("click",.55);
  const btn=$("rewardAd");btn.disabled=true;$("rewardInfo").textContent="Загрузка рекламы…";
  try{
    const ad=window.Adsgram.init({blockId:REWARD_BLOCK_ID});
    let rewarded=false;
    const onReward=()=>{rewarded=true;};
    ad.addEventListener?.("onReward",onReward);
    await ad.show();
    if(rewarded){
      rewardViews++;
      localStorage.setItem("fruitCatchRewardViews",String(rewardViews));
      $("rewardProgress").textContent=`${rewardViews}/${REWARD_GOAL}`;
      if(rewardViews<REWARD_GOAL){
        $("rewardInfo").textContent=`Просмотр засчитан: ${rewardViews}/${REWARD_GOAL}.`;
      }else{
        $("rewardInfo").textContent="5/5. Проверяем серверную награду…";
        const status=await syncRewardStatus();
        if(status?.bonusGranted){
          total+=DAILY_REWARD;saveTotal();render();
          $("rewardInfo").textContent="🎉 +10 000 очков начислено!";
        }else if(status){
          $("rewardInfo").textContent="5/5 засчитано. Сервер подтвердит награду после Reward-события AdsGram.";
        }else{
          $("rewardInfo").textContent="5/5 засчитано. Награда будет подтверждена сервером.";
        }
      }
    }else{
      $("rewardInfo").textContent="Реклама не была досмотрена до конца.";
    }
  }catch(e){console.warn("AdsGram reward:",e);$("rewardInfo").textContent="Реклама не была засчитана."}
  finally{btn.disabled=false}
}
function buttonClick(){playSound("click",.5);startMusic();}
document.querySelectorAll("button").forEach(b=>b.addEventListener("pointerdown",buttonClick,{passive:true}));
$("startHome").onclick=start;$("again").onclick=start;
$("homeAgain").onclick=()=>{buttonClick();render();show("home");};
$("endGame").onclick=()=>{if(confirm(`Закончить игру?\nСейчас заработано: ${round.toLocaleString("ru-RU")} очков`))finish();};
$("rewardAd").onclick=rewardAd;
$("soundToggle").onclick=()=>{toggleSound();};
$("withdraw").onclick=()=>{
  buttonClick();
  $("withdrawInfo").textContent=total>=250000?"Заявка будет отправлена на сервер.":"Минимум для вывода — $5 (250 000 очков).";
};
const task=document.querySelector("adsgram-task");
if(task){
  task.addEventListener("reward",e=>console.log("AdsGram Task reward",e.detail||TASK_BLOCK_ID));
  task.addEventListener("onError",e=>console.warn("AdsGram Task error",e.detail||TASK_BLOCK_ID));
  task.addEventListener("onBannerNotFound",e=>console.warn("AdsGram Task: banner not found",e.detail||TASK_BLOCK_ID));
  task.addEventListener("onTooLongSession",()=>console.warn("AdsGram Task: restart app/session"));
}
render();
