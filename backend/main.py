import os
import sqlite3
import asyncio
import hashlib
import hmac
import json
import sqlite3
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import parse_qsl

from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException, Header
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo, CallbackQuery

load_dotenv()
BOT_TOKEN=os.getenv("BOT_TOKEN")
WEB_APP_URL=os.getenv("WEB_APP_URL")
REWARD_SECRET=os.getenv("ADSGRAM_REWARD_SECRET","")
DB_PATH=os.getenv("SQLITE_PATH",str(Path(__file__).resolve().parent/"fruitcatch.sqlite3"))
REWARD_GOAL=5
DAILY_REWARD=5000
POINTS_PER_DOLLAR=int(os.getenv("POINTS_PER_DOLLAR", "50000"))
BASE_DAILY_CAP_POINTS=round(0.10*POINTS_PER_DOLLAR)
CAP_EXTENSION_POINTS=BASE_DAILY_CAP_POINTS
MAX_SESSION_SECONDS=1800
MAX_SCORE_RATE_PER_SECOND=40
MAX_SCORE_START_BUFFER=500

if not BOT_TOKEN: raise RuntimeError("BOT_TOKEN не найден в .env")
if not WEB_APP_URL: raise RuntimeError("WEB_APP_URL не найден в .env")

app=FastAPI(title="Fruit Catch API")
app.add_middleware(CORSMiddleware,allow_origins=["*"],allow_credentials=False,allow_methods=["*"],allow_headers=["*"])
bot=Bot(token=BOT_TOKEN)
dp=Dispatcher()

def db():
    con=sqlite3.connect(DB_PATH)
    con.execute("PRAGMA journal_mode=WAL")
    return con

def init_db():
    con=db()
    con.execute("""CREATE TABLE IF NOT EXISTS users(
      telegram_id INTEGER PRIMARY KEY,
      points INTEGER NOT NULL DEFAULT 0,
      reward_views INTEGER NOT NULL DEFAULT 0,
      reward_day TEXT NOT NULL DEFAULT '',
      reward_granted_day TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      ad_views INTEGER NOT NULL DEFAULT 0,
      cap_ad_progress INTEGER NOT NULL DEFAULT 0,
      daily_cap_points INTEGER NOT NULL DEFAULT 5000,
      earned_today INTEGER NOT NULL DEFAULT 0,
      earned_day TEXT NOT NULL DEFAULT ''
    )""")
    # Safe in-place migration for existing installations.
    columns={r[1] for r in con.execute("PRAGMA table_info(users)").fetchall()}
    migrations={
      "ad_views":"INTEGER NOT NULL DEFAULT 0",
      "cap_ad_progress":"INTEGER NOT NULL DEFAULT 0",
      "daily_cap_points":"INTEGER NOT NULL DEFAULT 5000",
      "earned_today":"INTEGER NOT NULL DEFAULT 0",
      "earned_day":"TEXT NOT NULL DEFAULT ''",
    }
    for name,definition in migrations.items():
        if name not in columns: con.execute(f"ALTER TABLE users ADD COLUMN {name} {definition}")
    con.execute("""CREATE TABLE IF NOT EXISTS game_sessions(
      session_id TEXT PRIMARY KEY,
      telegram_id INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      score INTEGER NOT NULL DEFAULT 0,
      credited_points INTEGER NOT NULL DEFAULT 0
    )""")
    con.commit();con.close()
init_db()


def today_utc():
    return datetime.now(timezone.utc).date().isoformat()


def verify_telegram_init_data(init_data: str) -> int:
    if not BOT_TOKEN or not init_data:
        raise HTTPException(status_code=401, detail="Open the game inside Telegram")
    try:
        pairs=dict(parse_qsl(init_data, keep_blank_values=True))
        received_hash=pairs.pop("hash", "")
        auth_date=int(pairs.get("auth_date", "0"))
        if not received_hash or not auth_date:
            raise ValueError("missing hash/auth_date")
        if abs(datetime.now(timezone.utc).timestamp()-auth_date)>86400:
            raise HTTPException(status_code=401, detail="Telegram session expired; reopen the game")
        data_check_string="\n".join(f"{k}={v}" for k,v in sorted(pairs.items()))
        secret_key=hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
        expected=hmac.new(secret_key,data_check_string.encode(),hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected,received_hash):
            raise ValueError("invalid signature")
        user=json.loads(pairs["user"])
        return int(user["id"])
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Telegram authorization")


def get_user_id(x_telegram_init_data: str) -> int:
    return verify_telegram_init_data(x_telegram_init_data)


def ensure_user(cur, userid, today):
    cur.execute("INSERT OR IGNORE INTO users(telegram_id,updated_at) VALUES(?,?)",(userid,today))
    row=cur.execute("SELECT points,reward_views,reward_day,reward_granted_day,updated_at,ad_views,cap_ad_progress,daily_cap_points,earned_today,earned_day FROM users WHERE telegram_id=?",(userid,)).fetchone()
    points,reward_views,reward_day,granted_day,updated_at,ad_views,cap_progress,cap_points,earned,earned_day=row
    if reward_day!=today:
        reward_views=0;ad_views=0;cap_progress=0;cap_points=BASE_DAILY_CAP_POINTS;earned=0;earned_day=today
    elif earned_day!=today:
        earned=0;earned_day=today
    cur.execute("""UPDATE users SET reward_views=?,reward_day=?,ad_views=?,cap_ad_progress=?,daily_cap_points=?,earned_today=?,earned_day=?,updated_at=? WHERE telegram_id=?""",
      (reward_views,today,ad_views,cap_progress,cap_points,earned,earned_day,today,userid))
    return {"points":points,"reward_views":reward_views,"reward_day":today,"reward_granted_day":granted_day,
      "ad_views":ad_views,"cap_ad_progress":cap_progress,"daily_cap_points":cap_points,"earned_today":earned}


class FinishSession(BaseModel):
    session_id: str = Field(min_length=20, max_length=80)
    score: int = Field(ge=0, le=10_000_000)
    duration_seconds: float = Field(ge=0, le=MAX_SESSION_SECONDS)


@app.get("/health")
def health(): return {"ok":True,"service":"fruit-catch"}


@app.get("/adsgram/reward")
def adsgram_reward(userid:int=Query(...),key:str=Query("")):
    # Configure a long random ADSGRAM_REWARD_SECRET. Without it, never accept public reward callbacks.
    if not REWARD_SECRET or not hmac.compare_digest(key,REWARD_SECRET):
        raise HTTPException(status_code=403,detail="reward callback is not authorized")
    today=today_utc();con=db();cur=con.cursor()
    cur.execute("BEGIN IMMEDIATE")
    state=ensure_user(cur,userid,today)
    views=state["ad_views"]+1
    cap_progress=state["cap_ad_progress"]+1
    cap_points=state["daily_cap_points"]
    if cap_progress>=3:
        cap_points+=CAP_EXTENSION_POINTS
        cap_progress-=3
    reward_views=state["reward_views"]+1
    points=state["points"]
    granted_day=state["reward_granted_day"]
    bonus=0
    if reward_views>=REWARD_GOAL and granted_day!=today:
        bonus=DAILY_REWARD
        points+=bonus
        granted_day=today
        reward_views=0
    cur.execute("""UPDATE users SET points=?,reward_views=?,reward_day=?,reward_granted_day=?,ad_views=?,cap_ad_progress=?,daily_cap_points=?,updated_at=? WHERE telegram_id=?""",
      (points,reward_views,today,granted_day,views,cap_progress,cap_points,today,userid))
    con.commit();con.close()
    return {"ok":True,"telegram_id":userid,"ad_views_today":views,"cap_ad_progress":cap_progress,
      "daily_cap_points":cap_points,"bonus":bonus,"points":points}


@app.get("/api/status")
def api_status(x_telegram_init_data: str = Header(default="")):
    userid=get_user_id(x_telegram_init_data);today=today_utc();con=db();cur=con.cursor()
    con.execute("BEGIN IMMEDIATE")
    state=ensure_user(cur,userid,today)
    con.commit();con.close()
    return {"points":state["points"],"ad_views_today":state["ad_views"],
      "cap_ad_progress":state["cap_ad_progress"],"daily_cap_points":state["daily_cap_points"],
      "earned_today":state["earned_today"],"bonus_progress":state["reward_views"],
      "bonus_goal":REWARD_GOAL,"bonus_granted":state["reward_granted_day"]==today,
      "points_per_dollar":POINTS_PER_DOLLAR}


@app.post("/api/session/start")
def session_start(x_telegram_init_data: str = Header(default="")):
    userid=get_user_id(x_telegram_init_data);today=today_utc();sid=str(uuid.uuid4())
    con=db();cur=con.cursor();cur.execute("BEGIN IMMEDIATE")
    ensure_user(cur,userid,today)
    cur.execute("INSERT INTO game_sessions(session_id,telegram_id,started_at) VALUES(?,?,?)",
      (sid,userid,datetime.now(timezone.utc).isoformat()))
    con.commit();con.close()
    return {"session_id":sid}


@app.post("/api/session/finish")
def session_finish(payload:FinishSession,x_telegram_init_data: str = Header(default="")):
    userid=get_user_id(x_telegram_init_data);today=today_utc();now=datetime.now(timezone.utc)
    con=db();cur=con.cursor();cur.execute("BEGIN IMMEDIATE")
    session=cur.execute("SELECT started_at,status FROM game_sessions WHERE session_id=? AND telegram_id=?",
      (payload.session_id,userid)).fetchone()
    if not session:
        con.rollback();con.close();raise HTTPException(status_code=404,detail="Game session not found")
    started_at,status=session
    if status!="active":
        con.rollback();con.close();raise HTTPException(status_code=409,detail="Game session already completed")
    try: started=datetime.fromisoformat(started_at)
    except Exception: started=now
    elapsed=max(0,(now-started).total_seconds())
    if elapsed>MAX_SESSION_SECONDS+60 or abs(elapsed-payload.duration_seconds)>90:
        con.rollback();con.close();raise HTTPException(status_code=400,detail="Game duration validation failed")
    max_plausible=int(MAX_SCORE_START_BUFFER + min(elapsed,MAX_SESSION_SECONDS)*MAX_SCORE_RATE_PER_SECOND)
    if payload.score>max_plausible:
        con.rollback();con.close();raise HTTPException(status_code=400,detail="Score is not plausible for this session")
    state=ensure_user(cur,userid,today)
    remaining=max(0,state["daily_cap_points"]-state["earned_today"])
    credited=min(payload.score,remaining)
    new_points=state["points"]+credited
    new_earned=state["earned_today"]+credited
    cur.execute("UPDATE users SET points=?,earned_today=?,earned_day=?,updated_at=? WHERE telegram_id=?",
      (new_points,new_earned,today,today,userid))
    cur.execute("UPDATE game_sessions SET finished_at=?,status='finished',score=?,credited_points=? WHERE session_id=?",
      (now.isoformat(),payload.score,credited,payload.session_id))
    con.commit();con.close()
    return {"ok":True,"score":payload.score,"credited_points":credited,"points":new_points,
      "earned_today":new_earned,"daily_cap_points":state["daily_cap_points"],
      "remaining_today":max(0,state["daily_cap_points"]-new_earned),"points_per_dollar":POINTS_PER_DOLLAR}


@dp.message(CommandStart())
async def start(message:types.Message):
    kb=InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="▶ Начать",callback_data="intro_start")]
    ])
    await message.answer(
        "🍓 Fruit Catch\n\n"
        "Игра, где нужно ловить падающие фрукты.\n"
        "Лови фрукты, набирай очки, избегай бомб и электрических ловушек. Получай бонусы за подтверждённые просмотры рекламы.\n\n"
        "Нажми «Начать», чтобы продолжить.",
        reply_markup=kb
    )

@dp.callback_query(lambda c:c.data=="intro_start")
async def intro_start(call:CallbackQuery):
    await call.answer()
    kb=InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="🇷🇺 Русский",callback_data="lang_ru"),
        InlineKeyboardButton(text="🇹🇲 Türkmençe",callback_data="lang_tk")
    ]])
    await call.message.edit_text("🌍 Выберите язык / Dil saýlaň:",reply_markup=kb)

@dp.callback_query(lambda c:c.data in {"lang_ru","lang_tk"})
async def language(call:CallbackQuery):
    await call.answer()
    ru=call.data=="lang_ru"
    if ru:
        text=("📖 ПРАВИЛА ИГРЫ\n\n"
              "🍎 Лови падающие фрукты — каждый фрукт даёт свои очки.\n"
              "✅ Пропущенный фрукт не отнимает очки.\n"
              "💣 Обычные и скрытые бомбы уменьшают очки текущего раунда на 10%.\n"
              "⚡ Электрические ловушки уменьшают очки текущего раунда на 5%; скрытые разряды раскрываются во время падения.\n"
              "📈 Чем дольше раунд и чем больше очков набрано за него, тем выше вероятность появления ловушек. Сложность растёт постепенно и ограничена.\n"
              "🎁 За каждые 3 подтверждённых просмотра открывается ещё $0,10 дневного лимита. За 5 просмотров — бонус +5 000 очков раз в день.\n\n"
              "Удачной игры! 🍓")
        button="🍎 Открыть Fruit Catch"
    else:
        text=("📖 OÝNUŇ DÜZGÜNLERI\n\n"
              "🍎 Ýokardan düşýän miweleri tut — her miwe öz balyny berýär.\n"
              "✅ Miweni sypdyrsaň bal aýrylmaýar.\n"
              "💣 Adaty we gizlin bombalar häzirki tapgyryň balyny 10% azaldýar.\n"
              "⚡ Elektrik duzaklary baly 5% azaldýar; gizlin elektrik duzaklary gaçyp barýarka açylýar.\n"
              "📈 Tapgyr näçe uzak dowam etse we bal näçe köp bolsa, duzaklaryň çykma ähtimallygy şonça artýar. Kynçylyk kem-kemden we çäkli ýokarlanýar.\n"
              "🎁 Her 3 tassyklanan mahabat görlende gündelik çäk ýene $0,10 artýar. 5 mahabatdan soň günde 1 gezek +5 000 bal bonus berilýär.\n\n"
              "Oýnuňyz şowly bolsun! 🍓")
        button="🍎 Fruit Catch aç"
    kb=InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text=button,web_app=WebAppInfo(url=WEB_APP_URL))]])
    await call.message.edit_text(text,reply_markup=kb)

async def bot_main():
    print("🍎 Fruit Catch Bot запущен!")
    await dp.start_polling(bot)

if __name__=="__main__":
    asyncio.run(bot_main())
