import os
import asyncio
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo, CallbackQuery
load_dotenv()
BOT_TOKEN=os.getenv("BOT_TOKEN")
WEB_APP_URL=os.getenv("WEB_APP_URL")
if not BOT_TOKEN: raise RuntimeError("BOT_TOKEN не найден в .env")
if not WEB_APP_URL: raise RuntimeError("WEB_APP_URL не найден в .env")
bot=Bot(token=BOT_TOKEN)
dp=Dispatcher()
@dp.message(CommandStart())
async def start(message: types.Message):
    kb=InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="🇷🇺 Русский",callback_data="lang_ru"),InlineKeyboardButton(text="🇹🇲 Türkmençe",callback_data="lang_tk")]])
    await message.answer("🌍 Выберите язык / Dil saýlaň:",reply_markup=kb)
@dp.callback_query(lambda c: c.data in {"lang_ru","lang_tk"})
async def language(call: CallbackQuery):
    await call.answer()
    ru=call.data=="lang_ru"
    text="🍓 Добро пожаловать в игру Fruit Catch!" if ru else "🍓 Fruit Catch oýnuna hoş geldiňiz!"
    button="🍎 Играть в Fruit Catch" if ru else "🍎 Fruit Catch oýnamak"
    kb=InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text=button,web_app=WebAppInfo(url=WEB_APP_URL))]])
    await call.message.edit_text(text,reply_markup=kb)
async def main():
    print("🍎 Fruit Catch Bot запущен!")
    await dp.start_polling(bot)
if __name__=="__main__": asyncio.run(main())
