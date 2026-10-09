const PPD=50000,FALL_MS=4300,SPAWN_MS=800;
// Fruit rewards reduced to roughly half; the server applies the daily USD cap.
const FRUITS=[
  ["🍎",20,75],["🍊",30,8],["🍋",40,5],["🍌",50,3.5],["🍓",60,2.5],
  ["🫐",80,2],["🍉",100,1.5],["🍍",150,1],["🥝",200,.4],["✨",500,.1]
];
const REWARD_BLOCK_ID="52384";
const INTERSTITIAL_BLOCK_ID="int-52381";
const TASK_BLOCK_ID="task-52383";
const REWARD_GOAL=5,DAILY_REWARD=5000;
const BACKEND_URL=""; // Set the public HTTPS FastAPI URL before publishing.

let total=0,round=0,playing=false,spawnTimer,raf,objects=new Set();
let rewardViews=0,adViewsToday=0,capAdProgress=0,dailyCapPoints=5000,earnedToday=0,bonusProgress=0,bonusGranted=false;
let activeSessionId="";
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
let musicWasPlayingBeforeHide=false;
function pauseMusicForBackground(){
  try{
    const a=getAudio("music");
    musicWasPlayingBeforeHide=!a.paused && soundEnabled;
    if(musicWasPlayingBeforeHide)a.pause();
  }catch(e){musicWasPlayingBeforeHide=false;}
}
function resumeMusicAfterBackground(){
  if(!musicWasPlayingBeforeHide || !soundEnabled)return;
  musicWasPlayingBeforeHide=false;
  try{
    const a=getAudio("music");
    a.play().then(()=>{musicStarted=true;}).catch(()=>{musicStarted=false;});
  }catch(e){musicStarted=false;}
}
// Mobile browsers may keep audio running when Telegram is sent to the background.
// Pause without resetting currentTime, then resume from the same position on return.
document.addEventListener("visibilitychange",()=>{
  if(document.hidden)pauseMusicForBackground();
  else resumeMusicAfterBackground();
});
window.addEventListener("pagehide",pauseMusicForBackground);
window.addEventListener("pageshow",()=>{if(!document.hidden)resumeMusicAfterBackground();});
function toggleSound(){
  soundEnabled=!soundEnabled;
  localStorage.setItem("fruitCatchSound",soundEnabled?"on":"off");
  $("soundToggle").textContent=soundEnabled?"🔊":"🔇";
  if(soundEnabled)startMusic();else stopMusic();
}
function render(){
  total=Math.max(0,total);
  $("totalScore").textContent=total.toLocaleString("ru-RU");
  $("gameTotal").textContent=total.toLocaleString("ru-RU");
  $("usd").textContent=`≈ $${(total/PPD).toFixed(2)}`;
  $("rewardProgress").textContent=`Лимит: ${capAdProgress}/3 рекламы · бонус: ${bonusGranted?"получен":`${bonusProgress}/${REWARD_GOAL}`}`;
  $("dailyCapInfo").textContent=`Дневной лимит: $${(dailyCapPoints/PPD).toFixed(2)} · заработано сегодня: $${(earnedToday/PPD).toFixed(2)}`;
  $("soundToggle").textContent=soundEnabled?"🔊":"🔇";
}
async function api(path,body){
  if(!BACKEND_URL)throw new Error("Не настроен адрес серверного API.");
  const initData=window.Telegram?.WebApp?.initData;
  if(!initData)throw new Error("Открой игру через Telegram, чтобы сервер мог проверить аккаунт.");
  const options={method:body?"POST":"GET",headers:{"X-Telegram-Init-Data":initData}};
  if(body){options.headers["Content-Type"]="application/json";options.body=JSON.stringify(body);}
  const response=await fetch(`${BACKEND_URL}${path}`,options);
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.detail||"Ошибка серверного API.");
  return data;
}
async function syncStatus(){
  const status=await api("/api/status");
  total=Number(status.points||0);adViewsToday=Number(status.ad_views_today||0);
  capAdProgress=Number(status.cap_ad_progress||0);dailyCapPoints=Number(status.daily_cap_points||5000);
  earnedToday=Number(status.earned_today||0);bonusProgress=Number(status.bonus_progress||0);
  bonusGranted=Boolean(status.bonus_granted);rewardViews=bonusProgress;render();return status;
}
function show(id){
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  $(id).classList.add("active");
}
function chooseFruit(){
  let r=Math.random()*100,a=0;
  for(const [emoji,value,chance] of FRUITS){a+=chance;if(r<a)return{emoji,value,bomb:false,hidden:false};}
  return{emoji:"🍎",value:20,bomb:false,hidden:false};
}
function chooseCamouflageFruit(kind="bomb"){
  const fruit=chooseFruit();
  return{...fruit,bomb:kind==="bomb",electric:kind==="electric",hidden:true,camouflage:true,kind};
}
function currentDifficulty(){
  const seconds=Math.max(0,performance.now()-gameStartedAt)/1000;
  // Difficulty rises with both time spent in the round and score earned this round.
  const timeLevel=Math.min(1,seconds/240); // reaches cap after 4 minutes
  const scoreLevel=Math.min(1,round/5000); // reaches cap at 5,000 round points
  return {timeLevel,scoreLevel,seconds};
}
function getTrapRates(){
  const {timeLevel,scoreLevel}=currentDifficulty();
  // The original bomb rates are increased by 20%, then adapt gradually.
  const normalBomb=.042 + timeLevel*.035 + scoreLevel*.055; // 4.2% -> max 13.2%
  const hiddenBomb=.012 + timeLevel*.020 + scoreLevel*.030; // 1.2% -> max 6.2%
  const electric=.015 + timeLevel*.015 + scoreLevel*.025; // 1.5% -> max 5.5%
  const hiddenElectric=.005 + timeLevel*.008 + scoreLevel*.015; // 0.5% -> max 2.8%
  return {normalBomb,hiddenBomb,electric,hiddenElectric};
}
function spawn(){
  if(!playing)return;
  const rates=getTrapRates();
  const roll=Math.random();
  let o;
  let edge=rates.normalBomb;
  if(roll<edge)o={emoji:"💣",value:0,bomb:true,electric:false,hidden:false,kind:"bomb"};
  else if(roll<(edge+=rates.hiddenBomb))o=chooseCamouflageFruit("bomb");
  else if(roll<(edge+=rates.electric))o={emoji:"⚡",value:0,bomb:false,electric:true,hidden:false,kind:"electric"};
  else if(roll<(edge+=rates.hiddenElectric))o=chooseCamouflageFruit("electric");
  else o=chooseFruit();

  const el=document.createElement("div");
  el.className="fruit";
  el.textContent=o.hidden?o.emoji:o.emoji;
  if(o.electric)el.classList.add("electric-trap");
  if(o.hidden)el.classList.add("camouflaged-trap");
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
function revealTrap(obj){
  obj.o.hidden=false;
  obj.el.textContent=obj.o.kind==="electric"?"⚡":"💣";
  obj.el.classList.remove("camouflaged-trap");
  if(obj.o.kind==="electric")obj.el.classList.add("electric-trap");
  createSparks(obj.el,obj.o.kind==="electric"?20:18);
}
function hit(obj){
  if(!objects.has(obj)||!playing)return;
  if(obj.o.hidden){
    revealTrap(obj);
    if(obj.o.kind==="electric")electricShock(obj);
    else bomb(obj);
    return;
  }
  if(obj.o.bomb){createSparks(obj.el,22);bomb(obj);return;}
  if(obj.o.electric){createSparks(obj.el,20);electricShock(obj);return;}
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
function electricShock(obj){
  const before=round,loss=Math.floor(before*.05);round=Math.max(0,before-loss);
  playSound("bomb",.7);floatText(obj.el,"⚡ −5%");
  obj.el.classList.add("electric-hit");
  document.body.animate([{filter:"brightness(1)"},{filter:"brightness(1.35) saturate(1.6)"},{filter:"brightness(1)"}],{duration:220});
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
    if(o.o.hidden&&t>=.58){revealTrap(o);}
    if(o.y>h+80){
      // Missing a normal fruit does not reduce the score.
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
async function start(){
  playSound("click",.55);startMusic();
  if(playing)return;
  try{
    const session=await api("/api/session/start",{});
    activeSessionId=session.session_id;
    await syncStatus();
  }catch(e){
    alert(`Не удалось начать защищённую игру: ${e.message}`);
    return;
  }
  stop();playing=true;round=0;
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
  playSound("click",.55);playing=false;stop();
  const scoreToSubmit=round;
  const durationSeconds=Math.max(0,(performance.now()-gameStartedAt)/1000);
  let credited=0;
  try{
    const result=await api("/api/session/finish",{session_id:activeSessionId,score:scoreToSubmit,duration_seconds:durationSeconds});
    credited=Number(result.credited_points||0);total=Number(result.points||0);
    earnedToday=Number(result.earned_today||0);dailyCapPoints=Number(result.daily_cap_points||dailyCapPoints);
    await syncStatus();
  }catch(e){
    alert(`Сервер не подтвердил результат, очки не начислены. ${e.message}`);
    try{await syncStatus();}catch(_e){}
  }
  await showInterstitial();
  $("earned").textContent="+"+credited.toLocaleString("ru-RU");
  $("earnedUsd").textContent=`≈ $${(credited/PPD).toFixed(2)} начислено`;
  show("result");
}
async function rewardAd(){
  if(!window.Adsgram){$("rewardInfo").textContent="AdsGram ещё не загрузился.";return;}
  playSound("click",.55);
  const btn=$("rewardAd");btn.disabled=true;$("rewardInfo").textContent="Загрузка рекламы…";
  const before=adViewsToday;
  try{
    const ad=window.Adsgram.init({blockId:REWARD_BLOCK_ID});
    let rewarded=false;
    const onReward=()=>{rewarded=true;};
    ad.addEventListener?.("onReward",onReward);
    await ad.show();
    if(!rewarded){$("rewardInfo").textContent="Реклама не была подтверждена. Если просмотр завершён, дождись ответа сервера.";return;}
    $("rewardInfo").textContent="Просмотр завершён. Проверяем подтверждение AdsGram на сервере…";
    let status=null;
    for(let i=0;i<5;i++){
      await new Promise(resolve=>setTimeout(resolve,900));
      try{status=await syncStatus();}catch(_e){}
      if(status&&adViewsToday>before)break;
    }
    if(status&&adViewsToday>before){
      $("rewardInfo").textContent=`Сервер подтвердил рекламу. Просмотров сегодня: ${adViewsToday}. ${bonusGranted?"Бонус +5 000 уже начислен сегодня.":`Бонус за 5 реклам: ${bonusProgress}/5.`} Лимит продлевается за каждые 3 подтверждённых просмотра.`;
    }else{
      $("rewardInfo").textContent="Реклама показана, но сервер пока не получил подтверждение AdsGram. Баланс не изменён; проверь настройку Reward URL.";
    }
  }catch(e){console.warn("AdsGram reward:",e);$("rewardInfo").textContent="Реклама не была засчитана сервером.";}
  finally{btn.disabled=false;}
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
  $("withdrawInfo").textContent="Вывод средств ещё не подключён к серверному API.";
};
const task=document.querySelector("adsgram-task");
if(task){
  task.addEventListener("reward",e=>console.log("AdsGram Task reward",e.detail||TASK_BLOCK_ID));
  task.addEventListener("onError",e=>console.warn("AdsGram Task error",e.detail||TASK_BLOCK_ID));
  task.addEventListener("onBannerNotFound",e=>console.warn("AdsGram Task: banner not found",e.detail||TASK_BLOCK_ID));
  task.addEventListener("onTooLongSession",()=>console.warn("AdsGram Task: restart app/session"));
}
render();
syncStatus().then(()=>{$("rewardInfo").textContent="Серверный баланс и дневной лимит синхронизированы.";}).catch(e=>{$("rewardInfo").textContent=`Баланс доступен только через сервер: ${e.message}`;});
