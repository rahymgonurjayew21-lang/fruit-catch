const PPD=50000,FALL_MS=4300,SPAWN_MS=800,HIDDEN_RATE=.035,HIDDEN_LINE=.58,NORMAL_BOMB_RATE=.07;
const FRUITS=[["🍎",40,75],["🍊",60,8],["🍋",80,5],["🍌",100,3.5],["🍓",120,2.5],["🫐",160,2],["🍉",200,1.5],["🍍",300,1],["🥝",400,.4],["✨",1000,.1]];
const REWARD_BLOCK_ID="52384";
const INTERSTITIAL_BLOCK_ID="int-52381";
const TASK_BLOCK_ID="task-52383";
const REWARD_GOAL=5,DAILY_REWARD=10000;
// Replace this with the public URL of your FastAPI backend when deployed.
const BACKEND_URL="";

let total=Number(localStorage.getItem("fruitCatchTotal")||0),round=0,playing=false,spawnTimer,raf,objects=new Set();
let rewardViews=Number(localStorage.getItem("fruitCatchRewardViews")||0);
let rewardDay=localStorage.getItem("fruitCatchRewardDay")||"";

const $=id=>document.getElementById(id);
const usd=p=>(p/PPD).toFixed(2);
const tg=window.Telegram?.WebApp;
if(tg){tg.ready();tg.expand();}
function todayKey(){return new Date().toISOString().slice(0,10)}
function resetDailyIfNeeded(){const d=todayKey();if(rewardDay!==d){rewardDay=d;rewardViews=0;localStorage.setItem("fruitCatchRewardDay",d);localStorage.setItem("fruitCatchRewardViews","0");}}
function saveTotal(){localStorage.setItem("fruitCatchTotal",String(Math.max(0,total)));}
function render(){resetDailyIfNeeded();total=Math.max(0,total);saveTotal();$("totalScore").textContent=total.toLocaleString("ru-RU");$("gameTotal").textContent=total.toLocaleString("ru-RU");$("usd").textContent=`≈ $${usd(total)}`;$("rewardProgress").textContent=`${rewardViews}/${REWARD_GOAL}`;}
function show(id){document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));$(id).classList.add("active");}
function chooseFruit(){let r=Math.random()*100,a=0;for(const [emoji,value,chance] of FRUITS){a+=chance;if(r<a)return{emoji,value,bomb:false,hidden:false}}return{emoji:"🍎",value:40,bomb:false,hidden:false};}
function chooseCamouflageFruit(){const fruit=chooseFruit();return{...fruit,bomb:true,hidden:true,camouflage:true};}
function spawn(){if(!playing)return;let roll=Math.random(),o;if(roll<NORMAL_BOMB_RATE)o={emoji:"💣",value:0,bomb:true,hidden:false};else if(roll<NORMAL_BOMB_RATE+HIDDEN_RATE)o=chooseCamouflageFruit();else o=chooseFruit();let el=document.createElement("div");el.className="fruit";el.textContent=o.emoji;let w=$("field").clientWidth,x=Math.max(5,Math.random()*(w-65));el.style.left=x+"px";$("field").appendChild(el);let obj={el,o,x,start:performance.now(),y:-70};objects.add(obj);el.addEventListener("pointerdown",e=>{e.preventDefault();e.stopPropagation();hit(obj);});}
function createSparks(el){let r=el.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let flash=document.createElement("div");flash.className="tap-flash";flash.style.left=cx+"px";flash.style.top=cy+"px";document.body.appendChild(flash);setTimeout(()=>flash.remove(),320);for(let i=0;i<14;i++){let spark=document.createElement("span");spark.className="spark";spark.style.left=cx+"px";spark.style.top=cy+"px";let a=Math.PI*2*i/14+(Math.random()-.5)*.25,d=28+Math.random()*45;spark.style.setProperty("--dx",Math.cos(a)*d+"px");spark.style.setProperty("--dy",Math.sin(a)*d+"px");spark.style.setProperty("--size",2+Math.random()*4+"px");document.body.appendChild(spark);setTimeout(()=>spark.remove(),520);}}
function hit(obj){if(!objects.has(obj)||!playing)return;if(obj.o.hidden){obj.o.hidden=false;obj.el.textContent="💣";bomb(obj);return}if(obj.o.bomb){bomb(obj);return}round+=obj.o.value;createSparks(obj.el);floatText(obj.el,"+"+obj.o.value.toLocaleString("ru-RU"));obj.el.classList.add("hit");setTimeout(()=>remove(obj),300);}
function bomb(obj){let before=round,loss=Math.floor(before*.10);round=Math.max(0,before-loss);floatText(obj.el,"−10%");obj.el.classList.add("bomb-hit");document.body.animate([{filter:"brightness(1)"},{filter:"brightness(1.65)"},{filter:"brightness(1)"}],{duration:260});setTimeout(()=>remove(obj),420);}
function floatText(el,text){let r=el.getBoundingClientRect(),f=document.createElement("div");f.className="float";f.textContent=text;f.style.left=r.left+"px";f.style.top=r.top+"px";document.body.appendChild(f);setTimeout(()=>f.remove(),750);}
function remove(o){objects.delete(o);o.el.remove();}
function tick(now){if(!playing)return;let h=$("field").clientHeight;for(const o of [...objects]){let t=(now-o.start)/FALL_MS;o.y=-70+t*(h+100);o.el.style.transform=`translateY(${o.y}px) rotate(${Math.sin(t*10)*8}deg)`;if(o.o.hidden&&t>=HIDDEN_LINE){o.o.hidden=false;o.el.textContent="💣"}if(o.y>h+80)remove(o)}$("roundScore").textContent=round.toLocaleString("ru-RU");raf=requestAnimationFrame(tick);}
function stop(){clearInterval(spawnTimer);cancelAnimationFrame(raf);for(const o of objects)o.el.remove();objects.clear();}
function start(){stop();playing=true;round=0;$("roundScore").textContent="0";show("game");spawn();spawnTimer=setInterval(spawn,SPAWN_MS);raf=requestAnimationFrame(tick);}
async function showInterstitial(){if(!window.Adsgram)return;try{const ad=window.Adsgram.init({blockId:INTERSTITIAL_BLOCK_ID});await ad.show();}catch(e){console.warn("AdsGram interstitial:",e)}}
async function finish(){if(!playing)return;playing=false;stop();total+=round;render();await showInterstitial();$("earned").textContent="+"+round.toLocaleString("ru-RU");$("earnedUsd").textContent=`≈ $${usd(round)}`;show("result");}
async function rewardAd(){resetDailyIfNeeded();if(rewardViews>=REWARD_GOAL){$("rewardInfo").textContent="Сегодня лимит уже выполнен.";return}if(!window.Adsgram){$("rewardInfo").textContent="AdsGram ещё не загрузился.";return}const btn=$("rewardAd");btn.disabled=true;$("rewardInfo").textContent="Загрузка рекламы…";try{const ad=window.Adsgram.init({blockId:REWARD_BLOCK_ID});const result=await ad.show();if(result?.done){rewardViews++;localStorage.setItem("fruitCatchRewardViews",String(rewardViews));$("rewardProgress").textContent=`${rewardViews}/${REWARD_GOAL}`;$("rewardInfo").textContent=rewardViews>=REWARD_GOAL?"Реклама просмотрена 5/5. Награда отправлена серверу.":"Просмотр засчитан.";if(rewardViews>=REWARD_GOAL){$("rewardInfo").textContent="5/5 просмотрено. Сервер AdsGram обработает награду; повторная награда сегодня заблокирована.";}}}catch(e){console.warn("AdsGram reward:",e);$("rewardInfo").textContent="Реклама не была засчитана."}finally{btn.disabled=false}}
$("startHome").onclick=start;$("again").onclick=start;$("homeAgain").onclick=()=>{render();show("home")};$("endGame").onclick=()=>{if(confirm(`Закончить игру?\nСейчас заработано: ${round.toLocaleString("ru-RU")} очков`))finish()};$("rewardAd").onclick=rewardAd;
$("withdraw").onclick=()=>{$("withdrawInfo").textContent=total>=250000?"Заявка будет отправлена на сервер.":"Минимум для вывода — $5 (250 000 очков)."};
const task=document.querySelector("adsgram-task");if(task){task.addEventListener("reward",()=>console.log("AdsGram Task reward",TASK_BLOCK_ID));task.addEventListener("onError",()=>console.warn("AdsGram Task error"));task.addEventListener("onBannerNotFound",()=>console.warn("AdsGram Task: banner not found"));}
render();
