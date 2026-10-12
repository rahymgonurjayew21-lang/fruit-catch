const PPD=50000,FALL_MS=4300,SPAWN_MS=800;
// Fruit rewards reduced to roughly half; the server applies the daily USD cap.
const FRUITS=[
  ["🍎",10,75],["🍊",15,8],["🍋",20,5],["🍌",25,3.5],["🍓",30,2.5],
  ["🫐",40,2],["🍉",50,1.5],["🍍",75,1],["🥝",100,.4],["✨",250,.1]
];
const REWARD_BLOCK_ID="52384";
const INTERSTITIAL_BLOCK_ID="int-52381";
const TASK_BLOCK_ID="task-52383";
const REWARD_GOAL=5,DAILY_REWARD=5000;
// Keep the public HTTPS API URL from your currently working deployment here.
// The supplied archive did not contain the live URL, so replace the placeholder with that same URL.
const BACKEND_URL="https://YOUR-BACKEND-DOMAIN";
const TEST_MODE=!BACKEND_URL || BACKEND_URL.includes("YOUR-BACKEND-DOMAIN");
const OFFLINE_TOTAL_KEY="fruitCatchOfflineTestPoints";
const TUTORIAL_KEY="fruitCatchTutorialCompletedV7"; // show expanded danger tutorial once after this update
let tutorialRunning=false,tutorialStage=0,tutorialDemoPoints=0,tutorialTarget=null;
let total=Number(localStorage.getItem(OFFLINE_TOTAL_KEY)||0),round=0,playing=false,spawnTimer,raf,objects=new Set();
// Only local offline test data is reset. Live API balances are never changed by the client.
if(TEST_MODE){total=0;localStorage.setItem(OFFLINE_TOTAL_KEY,"0");}
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
  lightning:"assets/audio/lightning.mp3",
  click:"assets/audio/click.mp3"
};
const audioCache={};
function getAudio(name){
  if(!audioCache[name]){audioCache[name]=new Audio(audioFiles[name]);audioCache[name].preload="auto";}
  return audioCache[name];
}
function playSound(name,volume=0.75){
  if(!soundEnabled)return;
  if(name==="lightning"){
    // A distinct synthesized electric crackle works even before a custom MP3 is supplied.
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(Ctx){
        const ctx=new Ctx(),now=ctx.currentTime;
        const osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
        osc.type="sawtooth";osc.frequency.setValueAtTime(950,now);osc.frequency.exponentialRampToValueAtTime(95,now+.19);
        filter.type="highpass";filter.frequency.value=380;
        gain.gain.setValueAtTime(Math.max(.001,volume*.22),now);gain.gain.exponentialRampToValueAtTime(.001,now+.22);
        osc.connect(filter);filter.connect(gain);gain.connect(ctx.destination);osc.start(now);osc.stop(now+.23);
        const buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*.12),ctx.sampleRate),data=buffer.getChannelData(0);
        for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
        const noise=ctx.createBufferSource(),ng=ctx.createGain();noise.buffer=buffer;ng.gain.value=volume*.16;noise.connect(ng);ng.connect(ctx.destination);noise.start(now);noise.stop(now+.12);
        setTimeout(()=>ctx.close().catch(()=>{}),500);return;
      }
    }catch(e){}
  }
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
const LANG_KEY="fruitCatchLanguage";
let language=localStorage.getItem(LANG_KEY)==="tk"?"tk":"ru";
function initHomeAmbience(){
  const home=$("home");if(!home)return;
  home.querySelectorAll(":scope > .home-ambience").forEach(el=>el.remove());
  const layer=document.createElement("div");
  layer.className="home-ambience";layer.setAttribute("aria-hidden","true");
  const fruits=FRUITS.map(f=>f[0]);
  const width=home.clientWidth||window.innerWidth;
  const cols=width<380?3:width<700?4:5;
  const count=width<380?15:width<700?20:25;
  const rows=Math.ceil(count/cols);
  let seed=73021;const rnd=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  for(let i=0;i<count;i++){
    const floater=document.createElement("span");
    floater.className="home-fruit-floater";floater.textContent=fruits[i%fruits.length];
    const col=i%cols,row=Math.floor(i/cols);
    const cellW=100/cols,cellH=100/rows;
    floater.style.left=(col*cellW+cellW*.12+rnd()*cellW*.38)+"%";
    floater.style.top=(row*cellH+cellH*.12+rnd()*cellH*.38)+"%";
    floater.style.setProperty("--float-size",`clamp(44px, ${Math.min(10, 100/cols*0.42)}vw, 96px)`);
    floater.style.setProperty("--float-blur",`${width<380?9:width<700?11:14}px`);
    floater.style.setProperty("--float-opacity",[".18",".22",".20",".24"][i%4]);
    floater.style.setProperty("--float-delay",`${i*-.37}s`);
    floater.style.setProperty("--float-duration",`${8+(i%5)*.7}s`);
    floater.style.setProperty("--float-rotate",`${i%2?14:-12}deg`);
    layer.appendChild(floater);
  }
  home.prepend(layer);
}

function renderFruitGallery(){
  const container=$("fruitRow");if(!container)return;
  container.innerHTML="";
  [...FRUITS].sort((a,b)=>a[1]-b[1]).forEach(([emoji,value])=>{
    const item=document.createElement("div");item.className="fruit-item";
    const icon=document.createElement("span");icon.className="fruit-item-emoji";icon.textContent=emoji;
    const val=document.createElement("span");val.className="fruit-item-val";val.textContent=`+${value}`;
    item.append(icon,val);container.appendChild(item);
  });
}

const TEXT={
 ru:{score:"ОБЩИЙ СЧЁТ",daily:"Дневной лимит",earned:"заработано сегодня",adTitle:"🎁 БОНУС ЗА РЕКЛАМУ",adNote:"3 подтверждённые рекламы → ещё $0,10 дневного лимита. За 5 реклам — +5 000 очков раз в день.",watch:"📺 СМОТРЕТЬ РЕКЛАМУ",start:"▶ НАЧАТЬ ИГРУ",withdraw:"💸 ВЫВЕСТИ",gameTotal:"Общий счёт:",end:"⏹ ЗАКОНЧИТЬ ИГРУ",adLabel:"РЕКЛАМА",result:"🎉 ИГРА ОКОНЧЕНА",points:"очков заработано",again:"▶ ИГРАТЬ СНОВА",home:"⌂ ГЛАВНЫЙ ЭКРАН",galleryTitle:"НАГРАДЫ ЗА ФРУКТЫ",limit:"Лимит",bonus:"бонус",received:"получен",danger:"Опасность",bomb:"Бомба",lightning:"Молния",confirm:"Закончить игру?\nСейчас заработано: ",apiRequired:"Сервер не подтвердил результат, очки не начислены. ",fruitFallback:"🍎",offline:"ТЕСТОВЫЙ РЕЖИМ: API не настроен. Реальные начисления недоступны.",tutWelcome:"Добро пожаловать! Давай быстро научимся играть.",tutApple1:"Лови фрукты: нажми на яблоко, чтобы получить очки.",tutApple2:"Отлично! Появилось ещё одно яблоко. Нажми на него.",tutBomb:"А теперь нажми на бомбу и посмотри, что произойдёт. Это только тренировка — настоящий счёт не изменится.",tutDone:"Готово! Собирай фрукты и избегай бомб и молний. Они отнимают часть очков раунда.",tutSkip:"Пропустить обучение",tutStart:"Начать игру",tutDemo:"Учебные очки",tutPenalty:"Бомба: −20% (пример)"},
 tk:{score:"UMUMY BAL",daily:"Gündelik çäk",earned:"şu gün gazanyldy",adTitle:"🎁 MAHABAT BONUSY",adNote:"3 tassyklanan mahabat → gündelik çäge ýene $0,10 goşýar. 5 mahabatdan soň günde 1 gezek +5 000 bal.",watch:"📺 MAHABATY GÖR",start:"▶ OÝNA BAŞLA",withdraw:"💸 PUL ÇYKAR",gameTotal:"Umumy bal:",end:"⏹ OÝNY TAMAMLA",adLabel:"MAHABAT",result:"🎉 OÝUN TAMAMLANDY",points:"bal gazanyldy",again:"▶ TÄZEDEN OÝNA",home:"⌂ ESASY MENÝU",galleryTitle:"MIWE SYLAGLARY",limit:"Çäk",bonus:"bonus",received:"alyndy",danger:"Howp",bomb:"Bomba",lightning:"Ýyldyrym",confirm:"Oýny tamamlamalymy?\nGazanylan bal: ",apiRequired:"Serwer netijäni tassyklamady, bal goşulmady. ",fruitFallback:"🍎",offline:"Synag tertibi: API sazlanmady. Hakyky sylaglar elýeterli däl.",tutWelcome:"Hoş geldiň! Geliň, oýnamagy çalt öwreneliň.",tutApple1:"Miwe ýygnamak üçin almanyň üstüne bas.",tutApple2:"Gowy! Ýene bir alma peýda boldy. Oňa bas.",tutBomb:"Indi bomba basyp, näme bolýandygyny gör. Bu diňe türgenleşik — hakyky bal üýtgemez.",tutDone:"Taýýar! Miweleri ýygna, bombalardan we ýyldyrymdan gaça dur. Olar tapgyryň balyny azaldýar.",tutSkip:"Okuwy geçmek",tutStart:"Oýna başla",tutDemo:"Okuw baly",tutPenalty:"Bomba: −20% (mysal)"}
};
function tr(key){return (TEXT[language]||TEXT.ru)[key]||TEXT.ru[key]||key;}
function applyLanguage(){
  document.documentElement.lang=language==="tk"?"tk":"ru";
  const map={totalLabel:"score",gameTotalLabel:"gameTotal",adTitle:"adTitle",adNote:"adNote",rewardAd:"watch",startHome:"start",withdraw:"withdraw",endGame:"end",adLabel:"adLabel",resultTitle:"result",resultPoints:"points",again:"again",homeAgain:"home",galleryTitle:"galleryTitle"};
  for(const [id,key] of Object.entries(map)){const el=$(id);if(el)el.textContent=tr(key);}
  const switcher=document.querySelector(".language-switch");if(switcher)switcher.dataset.active=language;
  document.querySelectorAll(".lang-btn").forEach(b=>{b.classList.toggle("selected",b.dataset.lang===language);b.setAttribute("aria-pressed",String(b.dataset.lang===language));});
  render();
  if(tutorialRunning)renderTutorialStep();
}
function setLanguage(next){
  const switcher=document.querySelector(".language-switch");if(switcher)switcher.classList.add("switching");
  language=next==="tk"?"tk":"ru";localStorage.setItem(LANG_KEY,language);applyLanguage();
  if(switcher)setTimeout(()=>switcher.classList.remove("switching"),380);
}
function render(){
  total=Math.max(0,total);
  $("totalScore").textContent=total.toLocaleString(language==="tk"?"tk-TM":"ru-RU");
  $("gameTotal").textContent=total.toLocaleString(language==="tk"?"tk-TM":"ru-RU");
  $("usd").textContent=`≈ $${(total/PPD).toFixed(2)}`;
  $("rewardProgress").textContent=`${tr("limit")}: ${capAdProgress}/3 · ${tr("bonus")}: ${bonusGranted?tr("received"):`${bonusProgress}/${REWARD_GOAL}`}`;
  $("dailyCapInfo").textContent=`${tr("daily")}: $${(dailyCapPoints/PPD).toFixed(2)} · ${tr("earned")}: $${(earnedToday/PPD).toFixed(2)}`;
  $("soundToggle").textContent=soundEnabled?"🔊":"🔇";
}
async function api(path,body){
  if(TEST_MODE)throw new Error("Укажи текущий рабочий HTTPS URL API в BACKEND_URL.");
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
  if(TEST_MODE){
    total=Math.max(0,Number(localStorage.getItem(OFFLINE_TOTAL_KEY)||0));
    render();
    return {offline:true,points:total};
  }
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
  return{emoji:"🍎",value:10,bomb:false,hidden:false};
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
  const hiddenBomb=Math.min(.30,(.012 + timeLevel*.020 + scoreLevel*.030)*2); // hidden bombs doubled
  const electric=.015 + timeLevel*.015 + scoreLevel*.025; // 1.5% -> max 5.5%
  const hiddenElectric=Math.min(.14,(.005 + timeLevel*.008 + scoreLevel*.015)*2); // hidden lightning doubled
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
function createLightningArea(cx,cy){
  // A visible electric strike spreads over the play field, then fades quickly.
  const zone=document.createElement("div");zone.className="lightning-zone";
  zone.style.left=cx+"px";zone.style.top=cy+"px";document.body.appendChild(zone);
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("viewBox","0 0 220 220");svg.setAttribute("class","lightning-bolts");svg.setAttribute("aria-hidden","true");
  const paths=["M112 15 L94 66 L116 60 L78 119 L101 111 L87 158","M55 47 L74 73 L53 95 L81 102","M163 43 L145 77 L169 89 L133 123","M42 132 L69 126 L77 151 L101 166","M179 132 L150 130 L143 154 L121 174"];
  for(const d of paths){const path=document.createElementNS("http://www.w3.org/2000/svg","path");path.setAttribute("d",d);path.setAttribute("class","bolt-path");svg.appendChild(path);}
  zone.appendChild(svg);
  const ring=document.createElement("span");ring.className="lightning-ring";zone.appendChild(ring);
  createSparksAt(cx,cy,34);
  document.body.animate([{filter:"brightness(1)"},{filter:"brightness(1.75) saturate(1.8)"},{filter:"brightness(1)"}],{duration:360});
  setTimeout(()=>zone.remove(),650);
}
function revealTrap(obj){
  obj.o.hidden=false;
  obj.el.textContent=obj.o.kind==="electric"?"⚡":"💣";
  obj.el.classList.remove("camouflaged-trap");
  if(obj.o.kind==="electric")obj.el.classList.add("electric-trap");
  obj.el.classList.remove("camouflaged-trap");
  obj.el.classList.add("trap-reveal");
  createSparks(obj.el,18);
  setTimeout(()=>obj.el.classList.remove("trap-reveal"),420);
  // Reveal only the existing object; keep the spark burst but never create a duplicate sprite.
}
function hit(obj){
  // Lock on the first pointer event, before any effect/animation can run.
  if(!objects.has(obj)||!playing||obj.consumed)return;
  obj.consumed=true;obj.el.style.pointerEvents="none";
  if(obj.o.hidden){
    revealTrap(obj);
    if(obj.o.kind==="electric")electricShock(obj);
    else bomb(obj);
    return;
  }
  if(obj.o.bomb){bomb(obj);return;}
  if(obj.o.electric){electricShock(obj);return;}
  round+=obj.o.value;playSound("fruit",.72);
  // Restore the white flash and spark burst. Remove the fruit immediately so it cannot score twice.
  createSparks(obj.el,18);
  floatText(obj.el,"+"+obj.o.value.toLocaleString(language==="tk"?"tk-TM":"ru-RU"));
  remove(obj);
}
function currentPenaltyRates(){
  const {timeLevel,scoreLevel}=currentDifficulty();
  const ramp=Math.min(1,Math.max(timeLevel,scoreLevel));
  return {bomb:Math.round(20+20*ramp),lightning:Math.round(30+30*ramp)};
}
function showPenalty(obj,kind,percent){
  const name=kind==="bomb"?tr("bomb"):tr("lightning");
  floatText(obj.el,`${kind==="bomb"?"💣":"⚡"} ${name} −${percent}%`,kind);
  const badge=document.createElement("div");badge.className=`penalty-banner ${kind}-penalty`;badge.textContent=`${name}: −${percent}%`;
  document.body.appendChild(badge);setTimeout(()=>badge.remove(),1250);
}
function createBombExplosion(cx,cy){
  // One area-wide explosion effect; particles are sparks, never duplicate fruit sprites.
  const blast=document.createElement("div");blast.className="bomb-blast";
  blast.style.left=cx+"px";blast.style.top=cy+"px";document.body.appendChild(blast);
  const ring=document.createElement("span");ring.className="bomb-ring";blast.appendChild(ring);
  const core=document.createElement("span");core.className="bomb-core";blast.appendChild(core);
  for(let i=0;i<26;i++){
    const ember=document.createElement("span");ember.className="bomb-ember";
    const angle=(Math.PI*2*i/26)+(Math.random()-.5)*.2;
    const distance=42+Math.random()*90;
    ember.style.setProperty("--dx",Math.cos(angle)*distance+"px");
    ember.style.setProperty("--dy",Math.sin(angle)*distance+"px");
    ember.style.setProperty("--size",(3+Math.random()*6)+"px");
    blast.appendChild(ember);
  }
  document.body.animate([{filter:"brightness(1)"},{filter:"brightness(1.42) saturate(1.3)"},{filter:"brightness(1)"}],{duration:330});
  setTimeout(()=>blast.remove(),760);
}
function bomb(obj){
  if(obj.effectApplied)return;obj.effectApplied=true;
  const rect=obj.el.getBoundingClientRect();
  const before=round,percent=currentPenaltyRates().bomb,loss=Math.floor(before*percent/100);round=Math.max(0,before-loss);
  // Keep the explosion VFX, but remove the actual bomb immediately.
  showPenalty(obj,"bomb",percent);remove(obj);
  createBombExplosion(rect.left+rect.width/2,rect.top+rect.height/2);
  playSound("bomb",.85);
}
function electricShock(obj){
  if(obj.effectApplied)return;obj.effectApplied=true;
  const rect=obj.el.getBoundingClientRect();
  const before=round,percent=currentPenaltyRates().lightning,loss=Math.floor(before*percent/100);round=Math.max(0,before-loss);
  showPenalty(obj,"lightning",percent);remove(obj);
  createLightningArea(rect.left+rect.width/2,rect.top+rect.height/2);
  playSound("lightning",.85);
}
function floatText(el,text,kind=""){
  const r=el.getBoundingClientRect(),f=document.createElement("div");
  f.className=`float ${kind}`.trim();f.textContent=text;f.style.left=r.left+"px";f.style.top=r.top+"px";
  document.body.appendChild(f);setTimeout(()=>f.remove(),750);
}
function remove(o){if(!o)return;o.consumed=true;objects.delete(o);o.el.style.pointerEvents="none";o.el.remove();}
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
  $("roundScore").textContent=round.toLocaleString(language==="tk"?"tk-TM":"ru-RU");
  const penalties=currentPenaltyRates();const risk=$("riskInfo");if(risk)risk.textContent=`${tr("danger")}: 💣 ${penalties.bomb}% · ⚡ ${penalties.lightning}%`;
  raf=requestAnimationFrame(tick);
}
function stop(){
  clearInterval(spawnTimer);cancelAnimationFrame(raf);
  for(const o of objects)o.el.remove();objects.clear();
}
let gameStartedAt=0;
function ensureTutorialUI(){
  let overlay=$("tutorialOverlay");if(overlay)return overlay;
  overlay=document.createElement("div");overlay.id="tutorialOverlay";overlay.className="tutorial-overlay";
  overlay.innerHTML=`<div class="tutorial-card"><div class="tutorial-kicker">FRUIT CATCH · TUTORIAL</div><div id="tutorialTitle" class="tutorial-title"></div><div id="tutorialMessage" class="tutorial-message"></div><div id="tutorialDemoScore" class="tutorial-demo-score"></div><div class="tutorial-progress"><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="tutorial-actions"><button id="tutorialSkip" class="tutorial-skip"></button><button id="tutorialContinue" class="primary tutorial-continue" hidden></button></div></div>`;
  $("game").appendChild(overlay);
  $("tutorialSkip").addEventListener("click",()=>finishTutorial(true));
  $("tutorialContinue").addEventListener("click",()=>finishTutorial(false));
  return overlay;
}
function renderTutorialStep(){
  if(!tutorialRunning)return;
  const title=$("tutorialTitle"),message=$("tutorialMessage"),score=$("tutorialDemoScore"),skip=$("tutorialSkip"),cont=$("tutorialContinue");
  if(!title||!message)return;
  const titles=[tr("tutWelcome"),tr("tutApple1"),tr("tutApple2"),tr("tutBomb"),"Молния", "Скрытая бомба", "Скрытая молния"];
  const msgs=["🍎  →  👆","🍎  +10","🍎  +10","💣  →  💥","⚡  →  ⚡️💥","🍎  →  ─── →  💣","🍎  →  ─── →  ⚡"];
  title.textContent=tutorialStage>=7?"Готово!":titles[Math.min(tutorialStage,6)];
  message.textContent=tutorialStage>=7?"🍎 + ⚡ − 💣":msgs[Math.min(tutorialStage,6)];
  score.textContent=`${tr("tutDemo")}: ${tutorialDemoPoints}`;
  skip.textContent=tr("tutSkip");cont.textContent=tr("tutStart");cont.hidden=tutorialStage!==7;skip.hidden=tutorialStage===7;
  const dots=document.querySelectorAll(".tutorial-progress i");dots.forEach((dot,i)=>dot.classList.toggle("done",i<tutorialStage));
}
function clearTutorialTarget(){if(tutorialTarget){tutorialTarget.remove();tutorialTarget=null;}}
function createTutorialTarget(emoji,kind,topPercent,onTap,hidden=false){
  clearTutorialTarget();const field=$("field");
  const target=document.createElement("button");target.type="button";target.className=`fruit tutorial-target ${kind==="bomb"?"tutorial-bomb":kind==="electric"?"tutorial-lightning":""} ${hidden?"tutorial-hidden-trap":""}`;target.textContent=hidden?"🍎":emoji;
  target.setAttribute("aria-label",hidden?"Скрытая ловушка":kind==="bomb"?tr("bomb"):kind==="electric"?tr("lightning"):"Apple");target.style.left="calc(50% - 29px)";target.style.top=`${topPercent}%`;target.style.transform="none";
  field.appendChild(target);tutorialTarget=target;
  if(hidden){
    const line=document.createElement("div");line.className="tutorial-reveal-line";line.textContent="ЛИНИЯ ОБНАРУЖЕНИЯ";field.appendChild(line);
    target.style.top="-64px";target.classList.add("tutorial-falling-hidden");
    // Let the disguised fruit visibly fall from the top and reveal only as it crosses the line.
    requestAnimationFrame(()=>{if(tutorialRunning&&tutorialTarget===target)target.style.top="calc(58% - 30px)";});
    setTimeout(()=>{if(!tutorialRunning||tutorialTarget!==target)return;target.textContent=emoji;target.classList.remove("tutorial-hidden-trap","tutorial-falling-hidden");target.classList.add(kind==="bomb"?"tutorial-bomb":"tutorial-lightning","tutorial-revealed");playSound("fruit",.68);createSparksAt(target.getBoundingClientRect().left+target.offsetWidth/2,target.getBoundingClientRect().top+target.offsetHeight/2,16);setTimeout(()=>playSound(kind==="bomb"?"bomb":"lightning",.8),180);},2050);
  }
  target.addEventListener("pointerdown",e=>{e.preventDefault();e.stopPropagation();if(!tutorialRunning||target!==tutorialTarget||target.dataset.consumed==="1")return;target.dataset.consumed="1";target.style.pointerEvents="none";const r=target.getBoundingClientRect();
    if(kind==="fruit"){createSparksAt(r.left+r.width/2,r.top+r.height/2,14);playSound("fruit",.72);tutorialDemoPoints+=10;}
    else if(kind==="bomb"){createBombExplosion(r.left+r.width/2,r.top+r.height/2);playSound("bomb",.85);}
    else {createLightningArea(r.left+r.width/2,r.top+r.height/2);playSound("lightning",.85);}
    if(kind!=="fruit"){const badge=document.createElement("div");badge.className=`penalty-banner ${kind}-penalty`;badge.textContent=kind==="bomb"?"💣 −20% (пример)":"⚡ −30% (пример)";document.body.appendChild(badge);setTimeout(()=>badge.remove(),1250);}
    target.classList.add("tutorial-collected");setTimeout(()=>{target.remove();if(tutorialTarget===target)tutorialTarget=null;field.querySelectorAll(".tutorial-reveal-line").forEach(n=>n.remove());onTap();},180);
  });
}
function runTutorial(){
  tutorialRunning=true;tutorialStage=0;tutorialDemoPoints=0;stop();show("game");
  const overlay=ensureTutorialUI();overlay.hidden=false;renderTutorialStep();
  setTimeout(()=>{if(!tutorialRunning)return;tutorialStage=1;renderTutorialStep();createTutorialTarget("🍎","fruit",17,()=>{
    tutorialStage=2;renderTutorialStep();setTimeout(()=>{if(!tutorialRunning)return;createTutorialTarget("🍎","fruit",37,()=>{
      tutorialStage=3;renderTutorialStep();setTimeout(()=>{if(!tutorialRunning)return;createTutorialTarget("💣","bomb",26,()=>{
        tutorialStage=4;renderTutorialStep();setTimeout(()=>{if(!tutorialRunning)return;createTutorialTarget("⚡","electric",42,()=>{
          tutorialStage=5;renderTutorialStep();setTimeout(()=>{if(!tutorialRunning)return;createTutorialTarget("💣","bomb",25,()=>{tutorialStage=6;renderTutorialStep();setTimeout(()=>{if(!tutorialRunning)return;createTutorialTarget("⚡","electric",38,()=>{tutorialStage=7;renderTutorialStep();},true);},350);},true);
        },350);
        });},350);
      });},350);
    });},350);
  });},650);
}
function finishTutorial(skipped){
  if(!tutorialRunning)return;tutorialRunning=false;clearTutorialTarget();
  const overlay=$("tutorialOverlay");if(overlay)overlay.hidden=true;
  localStorage.setItem(TUTORIAL_KEY,"1");
  // Tutorial points and demo penalties never touch the real or test balance.
  start(true);
}
async function start(skipTutorial=false){
  playSound("click",.55);startMusic();
  if(playing||tutorialRunning)return;
  if(!skipTutorial&&!localStorage.getItem(TUTORIAL_KEY)){runTutorial();return;}
  if(!TEST_MODE){
    try{
      const session=await api("/api/session/start",{});
      activeSessionId=session.session_id;
      await syncStatus();
    }catch(e){
      alert(`Не удалось начать защищённую игру: ${e.message}`);
      return;
    }
  }else{
    activeSessionId="offline-test";
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
  if(TEST_MODE){
    // Local-only test mode: convenient for gameplay testing, never trusted for real rewards.
    credited=Math.max(0,Math.floor(scoreToSubmit));
    total+=credited;
    localStorage.setItem(OFFLINE_TOTAL_KEY,String(total));
    render();
  }else{
    try{
      const result=await api("/api/session/finish",{session_id:activeSessionId,score:scoreToSubmit,duration_seconds:durationSeconds});
      credited=Number(result.credited_points||0);total=Number(result.points||0);
      earnedToday=Number(result.earned_today||0);dailyCapPoints=Number(result.daily_cap_points||dailyCapPoints);
      await syncStatus();
    }catch(e){
      alert(`Сервер не подтвердил результат, очки не начислены. ${e.message}`);
      try{await syncStatus();}catch(_e){}
    }
  }
  await showInterstitial();
  $("earned").textContent="+"+credited.toLocaleString(language==="tk"?"tk-TM":"ru-RU");
  $("earnedUsd").textContent=`≈ $${(credited/PPD).toFixed(2)} ${language==="tk"?"goşuldy":"начислено"}`;
  show("result");
}
async function rewardAd(){
  if(!window.Adsgram){$("rewardInfo").textContent="AdsGram ещё не загрузился.";return;}
  if(TEST_MODE){
    $("rewardInfo").textContent="Тестовый режим без сервера: рекламу можно проверить, но бонусы и дневной лимит не начисляются без серверного подтверждения.";
  }
  playSound("click",.55);
  const btn=$("rewardAd");btn.disabled=true;$("rewardInfo").textContent="Загрузка рекламы…";
  const before=adViewsToday;
  try{
    const ad=window.Adsgram.init({blockId:REWARD_BLOCK_ID});
    let rewarded=false;
    const onReward=()=>{rewarded=true;};
    ad.addEventListener?.("onReward",onReward);
    await ad.show();
    if(TEST_MODE){
      $("rewardInfo").textContent="Тестовый режим без сервера: показ рекламы не меняет баланс и дневной лимит.";
      return;
    }
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
$("startHome").addEventListener("click",()=>start(false));$("again").addEventListener("click",()=>start(false));
$("homeAgain").onclick=()=>{buttonClick();render();show("home");};
$("endGame").onclick=()=>{if(confirm(`Закончить игру?\nСейчас заработано: ${round.toLocaleString(language==="tk"?"tk-TM":"ru-RU")} очков`))finish();};
$("rewardAd").onclick=rewardAd;
$("soundToggle").onclick=()=>{toggleSound();};
$("withdraw").onclick=()=>{
  buttonClick();
  $("withdrawInfo").textContent=language==="tk"?"Pul çykarmak entek serwer API-sine birikdirilmedi.":"Вывод средств ещё не подключён к серверному API.";
};
const task=document.querySelector("adsgram-task");
if(task){
  task.addEventListener("reward",e=>console.log("AdsGram Task reward",e.detail||TASK_BLOCK_ID));
  task.addEventListener("onError",e=>console.warn("AdsGram Task error",e.detail||TASK_BLOCK_ID));
  task.addEventListener("onBannerNotFound",e=>console.warn("AdsGram Task: banner not found",e.detail||TASK_BLOCK_ID));
  task.addEventListener("onTooLongSession",()=>console.warn("AdsGram Task: restart app/session"));
}
document.querySelectorAll(".lang-btn").forEach(b=>b.addEventListener("click",()=>setLanguage(b.dataset.lang)));
applyLanguage();
renderFruitGallery();
initHomeAmbience();
syncStatus().then(()=>{
  $("rewardInfo").textContent=!TEST_MODE
    ?(language==="tk"?"Serwer balansy we gündelik çäk sinhronlaşdy.":"Серверный баланс и дневной лимит синхронизированы.")
    :tr("offline");
}).catch(e=>{$("rewardInfo").textContent=`${language==="tk"?"Balans diňe serwer arkaly elýeterli":"Баланс доступен только через сервер"}: ${e.message}`;});

window.addEventListener("resize",()=>{clearTimeout(window.__fruitBgResize);window.__fruitBgResize=setTimeout(initHomeAmbience,160);});
