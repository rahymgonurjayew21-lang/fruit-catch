# Fruit Catch V2
Prototype of the Fruit Catch Telegram Mini App.

Rules:
- all objects use the same base fall speed;
- missed fruits have no penalty;
- fruit chances: apple 75%, orange 8%, lemon 5%, banana 3.5%, strawberry 2.5%, blueberry 2%, watermelon 1.5%, pineapple 1%, kiwi 0.4%, golden 0.1%;
- normal bomb: -10% of current round score;
- hidden bomb: before the invisible horizontal line it looks like `❓`; crossing the line reveals `💣`; tapping it before or after the line triggers the same -10%;
- 50,000 points = $1; minimum withdrawal $5.

IMPORTANT: the current frontend is a visual prototype. It stores the demo score locally and is NOT safe for real money. Production must validate Telegram initData, create server-side sessions, verify gameplay, calculate authoritative rewards on the server, use PostgreSQL transactions/locks, prevent replay/double credit, and implement the payout queue/fund entirely server-side.
