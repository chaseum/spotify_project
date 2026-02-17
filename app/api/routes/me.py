from fastapi import APIRouter, HTTPException, Request

from app.services.spotify_client import get_current_user
from app.services.spotify_oauth import get_tokens

SESSION_COOKIE_NAME = "spotify_session_id"

router = APIRouter(tags=["spotify-me"])


@router.get("/api/me")
async def get_me(request: Request) -> dict:
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    if not session_id:
        raise HTTPException(status_code=401, detail="Not authorized")

    token_data = get_tokens(session_id)
    if not token_data:
        raise HTTPException(status_code=401, detail="Not authorized")

    access_token = token_data.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise HTTPException(status_code=401, detail="Not authorized")

    try:
        return get_current_user(access_token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
