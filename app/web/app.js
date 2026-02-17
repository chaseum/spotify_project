const statusElement = document.getElementById("connection-status");
const connectButton = document.getElementById("connect-spotify-button");
const logoutButton = document.getElementById("logout-button");

const DEFAULT_SPOTIFY_SCOPES = "user-read-private user-read-email";
const DEFAULT_SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const DEFAULT_SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const DEFAULT_SPOTIFY_REDIRECT_URI = "http://127.0.0.1:8000/";

const STORAGE_ACCESS_TOKEN = "spotify_access_token";
const STORAGE_REFRESH_TOKEN = "spotify_refresh_token";
const STORAGE_EXPIRES_AT = "spotify_expires_at";
const STORAGE_PKCE_CODE_VERIFIER = "spotify_pkce_code_verifier";
const STORAGE_PKCE_STATE = "spotify_pkce_state";

let spotifyConfig = {
  clientId: "",
  scopes: DEFAULT_SPOTIFY_SCOPES,
  authorizeUrl: DEFAULT_SPOTIFY_AUTHORIZE_URL,
  tokenUrl: DEFAULT_SPOTIFY_TOKEN_URL,
  redirectUri: DEFAULT_SPOTIFY_REDIRECT_URI,
};

function setConnected(displayName) {
  statusElement.textContent = `Connected as ${displayName}`;
  connectButton.hidden = true;
  logoutButton.hidden = false;
}

function setDisconnected() {
  statusElement.textContent = "Not connected.";
  connectButton.hidden = false;
  logoutButton.hidden = true;
}

function toBase64Url(bytes) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomUrlSafeString(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

function generateCodeVerifier() {
  return randomUrlSafeString(64);
}

function generateState() {
  return randomUrlSafeString(32);
}

function getStringValue(value, fallback = "") {
  return typeof value === "string" && value ? value : fallback;
}

async function loadSpotifyConfig() {
  const response = await fetch("/api/config", { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error("Failed to load /api/config");
  }

  const data = await response.json();
  const clientId = getStringValue(data.spotify_client_id);
  if (!clientId) {
    throw new Error("Spotify config missing spotify_client_id");
  }

  spotifyConfig = {
    clientId,
    scopes: getStringValue(data.spotify_scopes, DEFAULT_SPOTIFY_SCOPES),
    authorizeUrl: getStringValue(data.spotify_authorize_url, DEFAULT_SPOTIFY_AUTHORIZE_URL),
    tokenUrl: getStringValue(data.spotify_token_url, DEFAULT_SPOTIFY_TOKEN_URL),
    redirectUri: getStringValue(data.spotify_redirect_uri, DEFAULT_SPOTIFY_REDIRECT_URI),
  };
}

async function generateCodeChallenge(verifier) {
  const encodedVerifier = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", encodedVerifier);
  return toBase64Url(new Uint8Array(digest));
}

function buildAuthorizeUrl({ authorizeUrl, clientId, redirectUri, scopes, state, codeChallenge }) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  });
  return `${authorizeUrl}?${params.toString()}`;
}

function clearUrlQueryString() {
  const cleanUrl = `${window.location.pathname}${window.location.hash}`;
  window.history.replaceState({}, document.title, cleanUrl);
}

function clearStoredTokens() {
  sessionStorage.removeItem(STORAGE_ACCESS_TOKEN);
  sessionStorage.removeItem(STORAGE_REFRESH_TOKEN);
  sessionStorage.removeItem(STORAGE_EXPIRES_AT);
}

function clearStoredPkceState() {
  sessionStorage.removeItem(STORAGE_PKCE_CODE_VERIFIER);
  sessionStorage.removeItem(STORAGE_PKCE_STATE);
}

function getValidAccessToken() {
  const accessToken = sessionStorage.getItem(STORAGE_ACCESS_TOKEN);
  const expiresAtRaw = sessionStorage.getItem(STORAGE_EXPIRES_AT);
  const expiresAt = Number(expiresAtRaw);
  if (!accessToken || !Number.isFinite(expiresAt)) {
    clearStoredTokens();
    return null;
  }

  if (Date.now() >= expiresAt) {
    clearStoredTokens();
    return null;
  }

  return accessToken;
}

window.getValidAccessToken = getValidAccessToken;

async function handleSpotifyRedirectCallback() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  const code = params.get("code");
  const returnedState = params.get("state");
  if (error) {
    console.error("Spotify authorization failed", error);
    clearUrlQueryString();
    return;
  }

  if (!code) {
    return;
  }

  const storedState = sessionStorage.getItem(STORAGE_PKCE_STATE);
  const codeVerifier = sessionStorage.getItem(STORAGE_PKCE_CODE_VERIFIER);
  if (!returnedState || !storedState || returnedState !== storedState) {
    console.error("Spotify authorization failed: invalid OAuth state");
    clearStoredPkceState();
    clearUrlQueryString();
    return;
  }

  if (!codeVerifier) {
    console.error("Spotify authorization failed: missing PKCE code verifier");
    clearStoredPkceState();
    clearUrlQueryString();
    return;
  }

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: spotifyConfig.clientId,
      code,
      redirect_uri: spotifyConfig.redirectUri,
      code_verifier: codeVerifier,
    });
    const response = await fetch(spotifyConfig.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const tokenData = await response.json();
    if (!response.ok) {
      const errorMessage = tokenData.error_description || tokenData.error || "Token exchange failed";
      throw new Error(errorMessage);
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = Number(tokenData.expires_in);
    if (typeof accessToken !== "string" || !accessToken) {
      throw new Error("Token exchange failed: access_token missing in response");
    }
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new Error("Token exchange failed: expires_in missing in response");
    }

    const expiresAt = Date.now() + expiresIn * 1000;
    sessionStorage.setItem(STORAGE_ACCESS_TOKEN, accessToken);
    sessionStorage.setItem(
      STORAGE_REFRESH_TOKEN,
      typeof refreshToken === "string" ? refreshToken : "",
    );
    sessionStorage.setItem(STORAGE_EXPIRES_AT, String(expiresAt));
    clearStoredPkceState();
    clearUrlQueryString();
    console.log("login ok", expiresAt);
  } catch (exchangeError) {
    console.error("Spotify token exchange failed", exchangeError);
    clearUrlQueryString();
  }
}

async function refreshConnectionStatus() {
  const accessToken = getValidAccessToken();
  if (accessToken) {
    setConnected("Spotify user");
    return;
  }

  try {
    const response = await fetch("/api/me", { credentials: "same-origin" });
    if (!response.ok) {
      setDisconnected();
      return;
    }

    const profile = await response.json();
    const displayName = profile.display_name || "Spotify user";
    setConnected(displayName);
  } catch (error) {
    setDisconnected();
  }
}

async function connectSpotify() {
  if (!spotifyConfig.clientId) {
    console.error("Spotify login start failed: config unavailable");
    return;
  }

  try {
    const codeVerifier = generateCodeVerifier();
    const state = generateState();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    sessionStorage.setItem(STORAGE_PKCE_CODE_VERIFIER, codeVerifier);
    sessionStorage.setItem(STORAGE_PKCE_STATE, state);

    const authorizeUrl = buildAuthorizeUrl({
      authorizeUrl: spotifyConfig.authorizeUrl,
      clientId: spotifyConfig.clientId,
      redirectUri: spotifyConfig.redirectUri,
      scopes: spotifyConfig.scopes,
      state,
      codeChallenge,
    });
    window.location.assign(authorizeUrl);
  } catch (startError) {
    console.error("Spotify login start failed", startError);
  }
}

async function logoutSpotify() {
  clearStoredTokens();
  clearStoredPkceState();

  try {
    await fetch("/auth/logout", { credentials: "same-origin" });
  } finally {
    await refreshConnectionStatus();
  }
}

connectButton.addEventListener("click", () => {
  void connectSpotify();
});
logoutButton.addEventListener("click", logoutSpotify);

async function initializeApp() {
  try {
    await loadSpotifyConfig();
  } catch (configError) {
    console.error("Failed to load Spotify config", configError);
    clearUrlQueryString();
    setDisconnected();
    connectButton.disabled = true;
    return;
  }

  await handleSpotifyRedirectCallback();
  await refreshConnectionStatus();
}

void initializeApp();
