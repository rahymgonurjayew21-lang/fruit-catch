const PPD=50000,FALL_MS=4300,HIDDEN_RATE=.008,HIDDEN_LINE=.58;
const FRUITS=[["🍎",100,75],["🍊",150,8],["🍋",200,5],["🍌",250,3.5],["🍓",300,2.5],["🫐",400,2],["🍉",500,1.5],["🍍",750,1],["🥝",1000,.4],["✨",2500,.1]];
let total=0,round=0,playing=false,spawnTimer,raf,objects=new Set();

const $=id=>document.getElementById(id);
const usd=p=>(p/PPD).toFixed(2);
function render(){total=Math.max(0,total);$("totalScore").textContent=total.toLocaleString("ru-RU");$("gameTotal").textContent=total.toLocaleString("ru-RU");$("usd").textContent=`≈ $${usd(total)}`;}
function show(id){document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));$(id).classList.add("active");}
function chooseFruit(){let r=Math.random()*100,a=0;for(const [emoji,value,chance] of FRUITS){a+=chance;if(r<a)return{emoji,value,bomb:false,hidden:false}}return{emoji:"💣",value:0,bomb:true,hidden:false};}
function spawn(){if(!playing)return;let hidden=Math.random()<HIDDEN_RATE;let o=hidden?{emoji:"❓",value:0,bomb:true,hidden:true}:chooseFruit();let el=document.createElement("div");el.className="fruit";el.textContent=o.emoji;let w=$("field").clientWidth,x=Math.max(5,Math.random()*(w-65));el.style.left=x+"px";$("field").appendChild(el);let obj={el,o,x,start:performance.now(),y:-70};objects.add(obj);el.addEventListener("pointerdown",e=>{e.preventDefault();hit(obj)});}
function hit(obj){if(!objects.has(obj)||!playing)return;if(obj.o.hidden){obj.o.hidden=false;obj.el.textContent="💣";bomb(obj);return}if(obj.o.bomb){bomb(obj);return}round+=obj.o.value;floatText(obj.el,"+"+obj.o.value.toLocaleString("ru-RU"));obj.el.classList.add("hit");setTimeout(()=>remove(obj),300);}
function bomb(obj){let before=round,loss=Math.floor(before*.10);round=Math.max(0,before-loss);floatText(obj.el,"−10%");obj.el.classList.add("bomb-hit");document.body.animate([{filter:"brightness(1)"},{filter:"brightness(1.65)"},{filter:"brightness(1)"}],{duration:260});setTimeout(()=>remove(obj),420);}
function floatText(el,text){let r=el.getBoundingClientRect(),f=document.createElement("div");f.className="float";f.textContent=text;f.style.left=r.left+"px";f.style.top=r.top+"px";document.body.appendChild(f);setTimeout(()=>f.remove(),750);}
function remove(o){objects.delete(o);o.el.remove();}
function tick(now){if(!playing)return;let h=$("field").clientHeight;for(const o of [...objects]){let t=(now-o.start)/FALL_MS;o.y=-70+t*(h+100);o.el.style.transform=`translateY(${o.y}px) rotate(${Math.sin(t*10)*8}deg)`;if(o.o.hidden&&t>=HIDDEN_LINE){o.o.hidden=false;o.el.textContent="💣"}if(o.y>h+80)remove(o)}$("roundScore").textContent=round.toLocaleString("ru-RU");raf=requestAnimationFrame(tick);}
function stop(){clearInterval(spawnTimer);cancelAnimationFrame(raf);for(const o of objects)o.el.remove();objects.clear();}
function start(){stop();playing=true;round=0;$("roundScore").textContent="0";show("game");spawn();spawnTimer=setInterval(spawn,650);raf=requestAnimationFrame(tick);}
function finish(){if(!playing)return;playing=false;stop();total+=round;render();$("earned").textContent="+"+round.toLocaleString("ru-RU");$("earnedUsd").textContent=`≈ $${usd(round)}`;show("result");}
$("startHome").onclick=start;$("again").onclick=start;$("homeAgain").onclick=()=>{render();show("home")};
$("endGame").onclick=()=>{if(confirm(`Закончить игру?\nСейчас заработано: ${round.toLocaleString("ru-RU")} очков`))finish()};
$("withdraw").onclick=()=>{$("withdrawInfo").textContent=total>=250000?"Заявка будет отправлена на сервер.":"Минимум для вывода — $5 (250 000 очков)."};
render();