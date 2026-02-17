import base64
import hashlib
import json
import secrets
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

PENDING_AUTH_TTL_SECONDS = 600
PENDING_AUTH: dict[str, dict[str, Any]] = {}
TOKENS_BY_SESSION: dict[str, dict[str, Any]] = {}


def generate_session_id() -> str:
    return secrets.token_urlsafe(24)


def generate_state() -> str:
    return secrets.token_urlsafe(32)


def generate_code_verifier() -> str:
    verifier = secrets.token_urlsafe(96)
    return verifier[:128]


def generate_code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


def build_authorize_url(
    authorize_url: str,
    client_id: str,
    redirect_uri: str,
    scopes: str,
    state: str,
    code_challenge: str,
) -> str:
    query = urlencode(
        {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": scopes,
            "state": state,
            "code_challenge_method": "S256",
            "code_challenge": code_challenge,
        }
    )
    return f"{authorize_url}?{query}"


def store_pending_auth(state: str, session_id: str, verifier: str) -> None:
    PENDING_AUTH[state] = {
        "session_id": session_id,
        "verifier": verifier,
        "created_at": time.time(),
    }


def pop_pending_auth(state: str) -> dict[str, Any] | None:
    return PENDING_AUTH.pop(state, None)


def is_pending_auth_expired(record: dict[str, Any]) -> bool:
    created_at = float(record.get("created_at", 0))
    return (time.time() - created_at) > PENDING_AUTH_TTL_SECONDS


def exchange_code_for_tokens(
    token_url: str,
    client_id: str,
    code: str,
    redirect_uri: str,
    code_verifier: str,
) -> dict[str, Any]:
    payload = urlencode(
        {
            "grant_type": "authorization_code",
            "client_id": client_id,
            "code": code,
            "redirect_uri": redirect_uri,
            "code_verifier": code_verifier,
        }
    ).encode("utf-8")

    request = Request(
        token_url,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=15) as response:
            body = response.read().decode("utf-8")
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise ValueError(f"Token exchange failed: {error_body}") from exc
    except URLError as exc:
        raise ValueError("Token exchange failed: Spotify token endpoint unavailable") from exc

    token_data = json.loads(body)
    if "access_token" not in token_data:
        raise ValueError("Token exchange failed: access_token missing in response")
    return token_data


def store_tokens(session_id: str, token_data: dict[str, Any]) -> None:
    TOKENS_BY_SESSION[session_id] = {
        "token_data": token_data,
        "stored_at": time.time(),
    }


def get_tokens(session_id: str) -> dict[str, Any] | None:
    record = TOKENS_BY_SESSION.get(session_id)
    if not record:
        return None
    token_data = record.get("token_data")
    if not isinstance(token_data, dict):
        return None
    return token_data


def clear_tokens(session_id: str) -> None:
    TOKENS_BY_SESSION.pop(session_id, None)
