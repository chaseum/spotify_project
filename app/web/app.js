const statusElement = document.getElementById("connection-status");
const connectButton = document.getElementById("connect-spotify-button");
const logoutButton = document.getElementById("logout-button");

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

async function refreshConnectionStatus() {
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

function connectSpotify() {
  window.location.assign("/auth/spotify/login");
}

async function logoutSpotify() {
  try {
    await fetch("/auth/logout", { credentials: "same-origin" });
  } finally {
    await refreshConnectionStatus();
  }
}

connectButton.addEventListener("click", connectSpotify);
logoutButton.addEventListener("click", logoutSpotify);
refreshConnectionStatus();
