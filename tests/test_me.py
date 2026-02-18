import pytest
from fastapi.testclient import TestClient

import app.api.routes.me as me_route
import app.services.spotify_client as spotify_client
from app.main import app

client = TestClient(app)


def test_api_me_returns_profile(monkeypatch) -> None:
    monkeypatch.setattr(
        me_route,
        "get_current_user_for_session",
        lambda session_id: {"display_name": "Test User"},
    )

    response = client.get("/api/me", cookies={me_route.SESSION_COOKIE_NAME: "session-123"})

    assert response.status_code == 200
    assert response.json() == {"display_name": "Test User"}


def test_api_me_playlists_returns_payload(monkeypatch) -> None:
    monkeypatch.setattr(
        me_route,
        "get_my_playlists_for_session",
        lambda session_id, limit, offset: {
            "items": [{"name": "Road Trip", "owner": {"display_name": "Test User"}}],
            "limit": limit,
            "offset": offset,
            "total": 1,
        },
    )

    response = client.get(
        "/api/me/playlists?limit=10&offset=0",
        cookies={me_route.SESSION_COOKIE_NAME: "session-123"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "items": [{"name": "Road Trip", "owner": {"display_name": "Test User"}}],
        "limit": 10,
        "offset": 0,
        "total": 1,
    }


def test_api_me_playlists_rejects_limit_above_10() -> None:
    response = client.get(
        "/api/me/playlists?limit=11&offset=0",
        cookies={me_route.SESSION_COOKIE_NAME: "session-123"},
    )

    assert response.status_code == 422


def test_get_current_user_for_session_refreshes_and_retries(monkeypatch) -> None:
    session_id = "session-123"
    initial_tokens = {"access_token": "expired-access", "refresh_token": "refresh-123"}
    state: dict[str, object] = {"calls": 0, "stored_tokens": None}

    monkeypatch.setattr(spotify_client, "get_tokens", lambda value: initial_tokens if value == session_id else None)
    monkeypatch.setattr(spotify_client, "clear_tokens", lambda _: None)

    def fake_get_current_user(access_token: str) -> dict:
        state["calls"] = int(state["calls"]) + 1
        if state["calls"] == 1:
            raise spotify_client.SpotifyClientError(
                status_code=401,
                message="Expired token",
                auth_error=True,
            )
        assert access_token == "new-access"
        return {"display_name": "Refreshed User"}

    monkeypatch.setattr(spotify_client, "get_current_user", fake_get_current_user)
    monkeypatch.setattr(
        spotify_client,
        "_refresh_access_token",
        lambda refresh_token: {"access_token": "new-access", "expires_in": 3600},
    )

    def fake_store_tokens(stored_session_id: str, token_data: dict) -> None:
        state["stored_tokens"] = (stored_session_id, token_data)

    monkeypatch.setattr(spotify_client, "store_tokens", fake_store_tokens)

    profile = spotify_client.get_current_user_for_session(session_id)

    assert profile == {"display_name": "Refreshed User"}
    assert state["calls"] == 2
    assert state["stored_tokens"] == (
        session_id,
        {"access_token": "new-access", "refresh_token": "refresh-123", "expires_in": 3600},
    )


def test_get_my_playlists_for_session_refreshes_and_retries(monkeypatch) -> None:
    session_id = "session-123"
    initial_tokens = {"access_token": "expired-access", "refresh_token": "refresh-123"}
    state: dict[str, object] = {"calls": 0, "stored_tokens": None}

    monkeypatch.setattr(spotify_client, "get_tokens", lambda value: initial_tokens if value == session_id else None)
    monkeypatch.setattr(spotify_client, "clear_tokens", lambda _: None)

    def fake_get_my_playlists(access_token: str, limit: int = 10, offset: int = 0) -> dict:
        state["calls"] = int(state["calls"]) + 1
        if state["calls"] == 1:
            raise spotify_client.SpotifyClientError(
                status_code=401,
                message="Expired token",
                auth_error=True,
            )
        assert access_token == "new-access"
        assert limit == 10
        assert offset == 20
        return {"items": [], "limit": 10, "offset": 20, "total": 0}

    monkeypatch.setattr(spotify_client, "get_my_playlists", fake_get_my_playlists)
    monkeypatch.setattr(
        spotify_client,
        "_refresh_access_token",
        lambda refresh_token: {"access_token": "new-access", "expires_in": 3600},
    )

    def fake_store_tokens(stored_session_id: str, token_data: dict) -> None:
        state["stored_tokens"] = (stored_session_id, token_data)

    monkeypatch.setattr(spotify_client, "store_tokens", fake_store_tokens)

    payload = spotify_client.get_my_playlists_for_session(session_id, limit=10, offset=20)

    assert payload == {"items": [], "limit": 10, "offset": 20, "total": 0}
    assert state["calls"] == 2
    assert state["stored_tokens"] == (
        session_id,
        {"access_token": "new-access", "refresh_token": "refresh-123", "expires_in": 3600},
    )


def test_get_current_user_for_session_fails_when_refresh_token_missing(monkeypatch) -> None:
    monkeypatch.setattr(spotify_client, "get_tokens", lambda _: {"access_token": "expired-access"})
    monkeypatch.setattr(
        spotify_client,
        "get_current_user",
        lambda _: (_ for _ in ()).throw(
            spotify_client.SpotifyClientError(
                status_code=401,
                message="Expired token",
                auth_error=True,
            )
        ),
    )
    clear_state = {"called": False}
    monkeypatch.setattr(
        spotify_client,
        "clear_tokens",
        lambda _: clear_state.__setitem__("called", True),
    )

    with pytest.raises(spotify_client.SpotifyClientError) as exc_info:
        spotify_client.get_current_user_for_session("session-123")

    assert exc_info.value.status_code == 401
    assert exc_info.value.auth_error is True
    assert clear_state["called"] is True


def test_api_create_my_playlist_returns_payload(monkeypatch) -> None:
    def fake_create_my_playlist_for_session(
        session_id: str,
        name: str,
        description: str | None,
        public: bool,
    ) -> dict:
        assert session_id == "session-123"
        assert name == "Road Trip Mix"
        assert description == "Weekend drive"
        assert public is False
        return {"id": "playlist-1", "name": name}

    monkeypatch.setattr(me_route, "create_my_playlist_for_session", fake_create_my_playlist_for_session)

    response = client.post(
        "/api/me/playlists",
        cookies={me_route.SESSION_COOKIE_NAME: "session-123"},
        json={"name": "  Road Trip Mix  ", "description": "  Weekend drive  ", "public": False},
    )

    assert response.status_code == 200
    assert response.json() == {"id": "playlist-1", "name": "Road Trip Mix"}


def test_api_create_my_playlist_requires_session_cookie() -> None:
    response = client.post("/api/me/playlists", json={"name": "Road Trip Mix"})

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authorized"}


def test_api_create_my_playlist_rejects_empty_name() -> None:
    response = client.post(
        "/api/me/playlists",
        cookies={me_route.SESSION_COOKIE_NAME: "session-123"},
        json={"name": "   ", "description": "Notes"},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Playlist name is required"}


def test_api_create_my_playlist_maps_auth_error_to_401(monkeypatch) -> None:
    def raise_auth_error(*args, **kwargs):
        raise spotify_client.SpotifyClientError(
            status_code=403,
            message="Token expired",
            auth_error=True,
        )

    monkeypatch.setattr(me_route, "create_my_playlist_for_session", raise_auth_error)

    response = client.post(
        "/api/me/playlists",
        cookies={me_route.SESSION_COOKIE_NAME: "session-123"},
        json={"name": "Road Trip Mix"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Token expired"}


def test_api_create_my_playlist_maps_non_auth_error_status(monkeypatch) -> None:
    def raise_request_error(*args, **kwargs):
        raise spotify_client.SpotifyClientError(
            status_code=400,
            message="Bad request",
            auth_error=False,
        )

    monkeypatch.setattr(me_route, "create_my_playlist_for_session", raise_request_error)

    response = client.post(
        "/api/me/playlists",
        cookies={me_route.SESSION_COOKIE_NAME: "session-123"},
        json={"name": "Road Trip Mix"},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Bad request"}


def test_create_my_playlist_uses_me_playlists_endpoint(monkeypatch) -> None:
    state: dict[str, object] = {}

    def fake_spotify_request_json(
        path: str,
        access_token: str,
        method: str = "GET",
        json_payload: dict | None = None,
    ) -> dict:
        state["path"] = path
        state["access_token"] = access_token
        state["method"] = method
        state["json_payload"] = json_payload
        return {"id": "playlist-1", "name": "Road Trip Mix"}

    monkeypatch.setattr(spotify_client, "_spotify_request_json", fake_spotify_request_json)

    payload = spotify_client.create_my_playlist(
        access_token="access-123",
        name="  Road Trip Mix  ",
        description="Weekend drive",
        public=False,
    )

    assert payload == {"id": "playlist-1", "name": "Road Trip Mix"}
    assert state == {
        "path": "/v1/me/playlists",
        "access_token": "access-123",
        "method": "POST",
        "json_payload": {
            "name": "Road Trip Mix",
            "description": "Weekend drive",
            "public": False,
        },
    }


def test_create_my_playlist_for_session_refreshes_and_retries(monkeypatch) -> None:
    session_id = "session-123"
    initial_tokens = {"access_token": "expired-access", "refresh_token": "refresh-123"}
    state: dict[str, object] = {"calls": 0, "stored_tokens": None}

    monkeypatch.setattr(spotify_client, "get_tokens", lambda value: initial_tokens if value == session_id else None)
    monkeypatch.setattr(spotify_client, "clear_tokens", lambda _: None)

    def fake_create_my_playlist(
        access_token: str,
        name: str,
        description: str | None = None,
        public: bool = False,
    ) -> dict:
        state["calls"] = int(state["calls"]) + 1
        if state["calls"] == 1:
            raise spotify_client.SpotifyClientError(
                status_code=401,
                message="Expired token",
                auth_error=True,
            )
        assert access_token == "new-access"
        assert name == "Road Trip Mix"
        assert description == "Weekend drive"
        assert public is False
        return {"id": "playlist-1", "name": "Road Trip Mix"}

    monkeypatch.setattr(spotify_client, "create_my_playlist", fake_create_my_playlist)
    monkeypatch.setattr(
        spotify_client,
        "_refresh_access_token",
        lambda refresh_token: {"access_token": "new-access", "expires_in": 3600},
    )

    def fake_store_tokens(stored_session_id: str, token_data: dict) -> None:
        state["stored_tokens"] = (stored_session_id, token_data)

    monkeypatch.setattr(spotify_client, "store_tokens", fake_store_tokens)

    payload = spotify_client.create_my_playlist_for_session(
        session_id=session_id,
        name="Road Trip Mix",
        description="Weekend drive",
        public=False,
    )

    assert payload == {"id": "playlist-1", "name": "Road Trip Mix"}
    assert state["calls"] == 2
    assert state["stored_tokens"] == (
        session_id,
        {"access_token": "new-access", "refresh_token": "refresh-123", "expires_in": 3600},
    )
