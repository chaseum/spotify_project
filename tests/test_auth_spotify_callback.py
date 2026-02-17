from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_callback_redirects_to_frontend_when_cookie_state_missing() -> None:
    response = client.get(
        "/auth/spotify/callback?code=abc123&state=frontend-state",
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"] == "/?code=abc123&state=frontend-state"


def test_callback_returns_400_when_missing_callback_params() -> None:
    response = client.get("/auth/spotify/callback", follow_redirects=False)

    assert response.status_code == 400
    assert response.json() == {"detail": "Missing authorization code"}
