from fastapi import FastAPI
app=FastAPI(title="Fruit Catch API")
@app.get("/health")
async def health(): return {"ok":True,"service":"fruit-catch"}