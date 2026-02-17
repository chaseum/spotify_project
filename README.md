Manual smoke test checklist (copy into your README and reuse):

Login redirects and returns successfully (PKCE).

/me loads and displays your name.

/me/playlists paginates.

Create playlist works with POST /me/playlists.

Playlist items load via /items for owned playlists; graceful message otherwise.

Search paginates with limit 10 and offset.

Add track uses playlist /items endpoint; library save uses /me/library.
