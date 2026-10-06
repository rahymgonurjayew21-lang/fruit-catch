import asyncio
import os

from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart
from aiogram.types import (
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    WebAppInfo,
)
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
WEB_APP_URL = os.getenv("WEB_APP_URL")

if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN не найден в .env")

if not WEB_APP_URL:
    raise RuntimeError("WEB_APP_URL не найден в .env")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

# Для прототипа язык храним в памяти.
# В production его нужно хранить в PostgreSQL.
user_languages: dict[int, str] = {}


def language_keyboard():
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🇷🇺 Русский",
                    callback_data="lang:ru",
                ),
                InlineKeyboardButton(
                    text="🇹🇲 Türkmençe",
                    callback_data="lang:tk",
                ),
            ]
        ]
    )


def game_keyboard(lang: str):
    text = "🍎 Играть в Fruit Catch" if lang == "ru" else "🍎 Fruit Catch oýnamak"
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=text,
                    web_app=WebAppInfo(url=WEB_APP_URL),
                )
            ]
        ]
    )


@dp.message(CommandStart())
async def start(message: types.Message):
    user_languages.pop(message.from_user.id, None)

    await message.answer(
        "Выберите язык / Dil saýlaň:",
        reply_markup=language_keyboard(),
    )


@dp.callback_query(lambda c: c.data in {"lang:ru", "lang:tk"})
async def choose_language(callback: types.CallbackQuery):
    lang = callback.data.split(":", 1)[1]
    user_languages[callback.from_user.id] = lang

    if lang == "ru":
        text = "Добро пожаловать в игру Fruit Catch"
    else:
        text = "Fruit Catch oýnyňa hoş geldiňiz"

    await callback.message.edit_text(
        text,
        reply_markup=game_keyboard(lang),
    )
    await callback.answer()


async def main():
    print("🍎 Fruit Catch Bot запущен!")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
