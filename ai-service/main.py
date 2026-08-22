import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from assistant import router as assistant_router
from summarizer import router as summarizer_router

load_dotenv()

app = FastAPI(title="Healthcare AI Service")

allowed_origins = [
    origin
    for origin in (os.environ.get("CLIENT_ORIGIN"), os.environ.get("SERVER_ORIGIN"))
    if origin
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins or ["http://localhost:5173", "http://localhost:5000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(summarizer_router)
app.include_router(assistant_router)
