import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def get_current_user(access_token: str) -> dict[str, Any]:
    request = Request(
        "https://api.spotify.com/v1/me",
        headers={"Authorization": f"Bearer {access_token}"},
        method="GET",
    )

    try:
        with urlopen(request, timeout=15) as response:
            body = response.read().decode("utf-8")
    except HTTPError as exc:
        if exc.code in (401, 403):
            raise ValueError("Unauthorized Spotify token") from exc
        raise ValueError("Spotify API request failed") from exc
    except URLError as exc:
        raise ValueError("Spotify API unavailable") from exc

    return json.loads(body)
