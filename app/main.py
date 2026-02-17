from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes.auth_spotify import router as auth_spotify_router
from app.api.routes.config import router as config_router
from app.api.routes.health import router as health_router
from app.api.routes.me import router as me_router

WEB_DIR = Path(__file__).resolve().parent / "web"

app = FastAPI(title="Spotify Project API")
app.include_router(health_router)
app.include_router(auth_spotify_router)
app.include_router(config_router)
app.include_router(me_router)


@app.get("/", include_in_schema=False)
async def read_index() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")


app.mount("/web", StaticFiles(directory=WEB_DIR), name="web")
