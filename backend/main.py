import os
import sqlite3
import asyncio
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException
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
DAILY_REWARD=10000

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
      updated_at TEXT NOT NULL
    )""")
    con.commit();con.close()
init_db()

@app.get("/health")
def health(): return {"ok":True,"service":"fruit-catch"}

@app.get("/adsgram/reward")
def adsgram_reward(userid:int=Query(...),key:str=Query("")):
    if REWARD_SECRET and key!=REWARD_SECRET:
        raise HTTPException(status_code=403,detail="invalid reward key")
    today=datetime.now(timezone.utc).date().isoformat()
    con=db();cur=con.cursor()
    cur.execute("INSERT OR IGNORE INTO users(telegram_id,updated_at) VALUES(?,?)",(userid,today))
    views,day,granted_day,points=cur.execute(
        "SELECT reward_views,reward_day,reward_granted_day,points FROM users WHERE telegram_id=?",(userid,)
    ).fetchone()
    if day!=today: views=0
    if granted_day==today:
        bonus=0
    else:
        views+=1
        bonus=0
        if views>=REWARD_GOAL:
            bonus=DAILY_REWARD
            points+=bonus
            granted_day=today
            views=0
    cur.execute("""UPDATE users SET reward_views=?,reward_day=?,reward_granted_day=?,points=?,updated_at=?
                   WHERE telegram_id=?""",(views,today,granted_day,points,today,userid))
    con.commit();con.close()
    return {"ok":True,"telegram_id":userid,"reward_views":views,"bonus":bonus}

@app.get("/api/reward/status")
def reward_status(userid:int=Query(...)):
    today=datetime.now(timezone.utc).date().isoformat()
    con=db()
    row=con.execute(
        "SELECT reward_views,reward_day,reward_granted_day,points FROM users WHERE telegram_id=?",(userid,)
    ).fetchone()
    con.close()
    if not row:return {"reward_views":0,"points":0,"reward_day":today,"bonusGranted":False}
    views,day,granted_day,points=row
    return {
        "reward_views":0 if day!=today else views,
        "points":points,
        "reward_day":today,
        "bonusGranted":granted_day==today
    }

@dp.message(CommandStart())
async def start(message:types.Message):
    kb=InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="▶ Начать",callback_data="intro_start")]
    ])
    await message.answer(
        "🍓 Fruit Catch\n\n"
        "Игра, где нужно ловить падающие фрукты.\n"
        "Зарабатывай очки, избегай бомб, выполняй задания и получай бонусы за рекламу.\n\n"
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
              "⚠️ Пропустил фрукт — −10 очков. Ниже 0 очки не уходят.\n"
              "💣 Не нажимай на бомбы — они уменьшают очки текущей игры.\n"
              "🥷 Скрытые бомбы становятся чаще, чем дольше играешь.\n"
              "🎁 За 5 полных Rewarded-просмотров можно получить +10 000 очков, не чаще 1 раза в день.\n\n"
              "Удачной игры! 🍓")
        button="🍎 Открыть Fruit Catch"
    else:
        text=("📖 OÝNUŇ DÜZGÜNLERI\n\n"
              "🍎 Ýokardan düşýän miweleri tut — her miwe öz balyny berýär.\n"
              "⚠️ Miweni sypdyrsaň — −10 bal. Bal 0-dan aşak düşmeýär.\n"
              "💣 Bombalara basma — olar häzirki oýnuň balyny azaldýar.\n"
              "🥷 Oýun uzaldygyça gizlin bombalar has köp duşýar.\n"
              "🎁 5 sany doly Rewarded mahabat görlenden soň +10 000 bal almak bolýar, günde 1 gezek.\n\n"
              "Oýnuňyz şowly bolsun! 🍓")
        button="🍎 Fruit Catch aç"
    kb=InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text=button,web_app=WebAppInfo(url=WEB_APP_URL))]])
    await call.message.edit_text(text,reply_markup=kb)

async def bot_main():
    print("🍎 Fruit Catch Bot запущен!")
    await dp.start_polling(bot)

if __name__=="__main__":
    asyncio.run(bot_main())
