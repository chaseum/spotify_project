const CLIENT_ID = "e83c0b6cc06740c19752ad2cdcd08faf";
const REDIRECT_URI = "http://127.0.0.1:8000/auth/spotify/callback.html";
const SCOPES = ["user-read-private", "user-read-email"];
const CODE_VERIFIER_KEY = "spotify_pkce_verifier";
const CODE_VERIFIER_LENGTH = 128;
const CODE_VERIFIER_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

function base64UrlEncode(arrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(arrayBuffer);

  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function generateCodeVerifier() {
  const randomValues = new Uint8Array(CODE_VERIFIER_LENGTH);
  let verifier = "";
  crypto.getRandomValues(randomValues);

  for (let i = 0; i < randomValues.length; i += 1) {
    const index = randomValues[i] % CODE_VERIFIER_CHARS.length;
    verifier += CODE_VERIFIER_CHARS[index];
  }

  return verifier;
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

async function buildAuthorizeUrl() {
  const verifier = generateCodeVerifier();
  sessionStorage.setItem(CODE_VERIFIER_KEY, verifier);

  const challenge = await generateCodeChallenge(verifier);
  const authorizeUrl = new URL("https://accounts.spotify.com/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authorizeUrl.searchParams.set("scope", SCOPES.join(" "));
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("code_challenge", challenge);

  return authorizeUrl.toString();
}

async function startSpotifyLogin() {
  const authorizeUrl = await buildAuthorizeUrl();
  // Manual check: clicking the login button should redirect to Spotify authorize with PKCE params.
  window.location.assign(authorizeUrl);
}

window.startSpotifyLogin = startSpotifyLogin;
