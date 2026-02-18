const statusElement = document.getElementById("connection-status");
const connectButton = document.getElementById("connect-spotify-button");
const disconnectButton =
  document.getElementById("disconnect-button") ?? document.getElementById("logout-button");
const disconnectedStepElement = document.getElementById("disconnected-step");
const connectedStepElement = document.getElementById("connected-step");
const connectedDisplayNameElement = document.getElementById("connected-display-name");
const playlistsStatusElement = document.getElementById("playlists-status");
const playlistsListElement = document.getElementById("playlists-list");
const playlistsPrevButton = document.getElementById("playlists-prev-button");
const playlistsNextButton = document.getElementById("playlists-next-button");
const playlistsPageSummaryElement = document.getElementById("playlists-page-summary");
const createPlaylistFormElement = document.getElementById("create-playlist-form");
const createPlaylistNameInput = document.getElementById("create-playlist-name");
const createPlaylistDescriptionInput = document.getElementById("create-playlist-description");
const createPlaylistPublicInput = document.getElementById("create-playlist-public");
const createPlaylistSubmitButton = document.getElementById("create-playlist-submit");
const createPlaylistStatusElement = document.getElementById("create-playlist-status");

const STEP_DISCONNECTED = "disconnected";
const STEP_CONNECTED = "connected";
const PLAYLISTS_PAGE_LIMIT = 10;
const SESSION_STORAGE_PREFIX = "spotify_shell:";
const SESSION_STORAGE_KEYS = {
  displayName: `${SESSION_STORAGE_PREFIX}display_name`,
};
const hasStepContainers =
  Boolean(disconnectedStepElement) &&
  Boolean(connectedStepElement) &&
  disconnectedStepElement !== connectedStepElement;
const playlistState = {
  limit: PLAYLISTS_PAGE_LIMIT,
  offset: 0,
  total: 0,
  items: [],
  loading: false,
  error: "",
  highlightedPlaylistId: "",
};
let playlistRequestSequence = 0;

function toInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function clampPlaylistLimit(limit) {
  return Math.min(PLAYLISTS_PAGE_LIMIT, Math.max(1, toInteger(limit, PLAYLISTS_PAGE_LIMIT)));
}

function clampPlaylistOffset(offset) {
  return Math.max(0, toInteger(offset, 0));
}

function showElement(element) {
  if (!element) {
    return;
  }

  element.classList.remove("hidden");
  element.hidden = false;
}

function hideElement(element) {
  if (!element) {
    return;
  }

  element.classList.add("hidden");
  element.hidden = true;
}

function getPlaylistName(playlist) {
  if (playlist && typeof playlist.name === "string" && playlist.name.trim()) {
    return playlist.name;
  }

  return "Untitled playlist";
}

function getPlaylistOwnerDisplayName(playlist) {
  if (
    playlist &&
    playlist.owner &&
    typeof playlist.owner.display_name === "string" &&
    playlist.owner.display_name.trim()
  ) {
    return playlist.owner.display_name;
  }

  return "Unknown owner";
}

function getPlaylistId(playlist) {
  if (playlist && typeof playlist.id === "string" && playlist.id.trim()) {
    return playlist.id;
  }

  return "";
}

function setCreatePlaylistStatus(message) {
  if (!createPlaylistStatusElement) {
    return;
  }

  createPlaylistStatusElement.textContent = message;
}

function setCreatePlaylistSubmitting(isSubmitting) {
  if (createPlaylistSubmitButton) {
    createPlaylistSubmitButton.disabled = isSubmitting;
  }
  if (createPlaylistNameInput) {
    createPlaylistNameInput.disabled = isSubmitting;
  }
  if (createPlaylistDescriptionInput) {
    createPlaylistDescriptionInput.disabled = isSubmitting;
  }
  if (createPlaylistPublicInput) {
    createPlaylistPublicInput.disabled = isSubmitting;
  }
}

function clearPlaylistHighlight() {
  playlistState.highlightedPlaylistId = "";
}

function renderPlaylists() {
  const playlistItems = Array.isArray(playlistState.items) ? playlistState.items : [];

  if (playlistsListElement) {
    playlistsListElement.textContent = "";
    for (const playlist of playlistItems) {
      const itemElement = document.createElement("li");
      const playlistLabel = `${getPlaylistName(playlist)} - ${getPlaylistOwnerDisplayName(playlist)}`;
      const isHighlightedPlaylist =
        Boolean(playlistState.highlightedPlaylistId) &&
        getPlaylistId(playlist) === playlistState.highlightedPlaylistId;
      itemElement.textContent = isHighlightedPlaylist ? `[New] ${playlistLabel}` : playlistLabel;
      if (isHighlightedPlaylist) {
        itemElement.style.fontWeight = "700";
        itemElement.setAttribute("aria-current", "true");
      }
      playlistsListElement.appendChild(itemElement);
    }
  }

  if (playlistsStatusElement) {
    if (playlistState.loading) {
      playlistsStatusElement.textContent = "Loading playlists...";
    } else if (playlistState.error) {
      playlistsStatusElement.textContent = playlistState.error;
    } else if (playlistItems.length === 0) {
      playlistsStatusElement.textContent = "No playlists found.";
    } else {
      playlistsStatusElement.textContent = "";
    }
  }

  if (playlistsPageSummaryElement) {
    if (playlistState.total > 0 && playlistItems.length > 0) {
      const start = playlistState.offset + 1;
      const end = Math.min(playlistState.offset + playlistItems.length, playlistState.total);
      playlistsPageSummaryElement.textContent = `Showing ${start}-${end} of ${playlistState.total}`;
    } else {
      playlistsPageSummaryElement.textContent = "Showing 0-0 of 0";
    }
  }

  if (playlistsPrevButton) {
    playlistsPrevButton.disabled = playlistState.loading || playlistState.offset === 0;
  }

  if (playlistsNextButton) {
    playlistsNextButton.disabled =
      playlistState.loading ||
      playlistState.total === 0 ||
      playlistState.offset + playlistState.limit >= playlistState.total;
  }
}

function resetPlaylistState() {
  playlistState.limit = PLAYLISTS_PAGE_LIMIT;
  playlistState.offset = 0;
  playlistState.total = 0;
  playlistState.items = [];
  playlistState.loading = false;
  playlistState.error = "";
  clearPlaylistHighlight();
  renderPlaylists();
}

function renderDisconnectedStep() {
  if (statusElement) {
    statusElement.textContent = "Not connected.";
  }
  setCreatePlaylistStatus("");
  setCreatePlaylistSubmitting(false);

  if (hasStepContainers) {
    showElement(disconnectedStepElement);
    hideElement(connectedStepElement);
    return;
  }

  showElement(connectButton);
  hideElement(disconnectButton);
}

function renderConnectedStep(displayName) {
  if (statusElement) {
    statusElement.textContent = `Connected as ${displayName}`;
  }
  if (connectedDisplayNameElement) {
    connectedDisplayNameElement.textContent = displayName;
  }

  if (hasStepContainers) {
    hideElement(disconnectedStepElement);
    showElement(connectedStepElement);
  } else {
    hideElement(connectButton);
    showElement(disconnectButton);
  }

  try {
    sessionStorage.setItem(SESSION_STORAGE_KEYS.displayName, displayName);
  } catch (error) {
    // Ignore session storage errors to keep UI transitions working.
  }

  setCreatePlaylistSubmitting(false);
}

function renderStep(step, data = {}) {
  if (step === STEP_CONNECTED) {
    renderConnectedStep(data.displayName ?? "Spotify user");
    return;
  }

  renderDisconnectedStep();
}

function clearAppSessionStorage() {
  for (const key of Object.values(SESSION_STORAGE_KEYS)) {
    try {
      sessionStorage.removeItem(key);
    } catch (error) {
      // Ignore session storage errors to keep UI transitions working.
    }
  }
}

function clearUrlQueryString() {
  const cleanUrl = `${window.location.pathname}${window.location.hash}`;
  window.history.replaceState({}, document.title, cleanUrl);
}

async function parseJsonSafe(response) {
  const body = await response.text();
  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    return null;
  }
}

function getErrorMessage(payload, fallback) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  if (typeof payload.detail === "string" && payload.detail) {
    return payload.detail;
  }

  if (typeof payload.message === "string" && payload.message) {
    return payload.message;
  }

  return fallback;
}

async function apiFetch(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      ...options,
    });
  } catch (error) {
    throw { status: 0, message: "Network request failed" };
  }

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    const fallback = `Request failed with status ${response.status}`;
    throw {
      status: response.status,
      message: getErrorMessage(payload, fallback),
    };
  }

  return payload;
}

async function apiMe() {
  return apiFetch("/api/me", { method: "GET" });
}

async function apiGetMyPlaylists({ limit = PLAYLISTS_PAGE_LIMIT, offset = 0 } = {}) {
  const safeLimit = clampPlaylistLimit(limit);
  const safeOffset = clampPlaylistOffset(offset);
  const params = new URLSearchParams({
    limit: String(safeLimit),
    offset: String(safeOffset),
  });
  return apiFetch(`/api/me/playlists?${params.toString()}`, { method: "GET" });
}

async function apiCreateMyPlaylist({ name, description = "", public: isPublic = false } = {}) {
  const safeName = typeof name === "string" ? name.trim() : "";
  if (!safeName) {
    throw { status: 422, message: "Playlist name is required." };
  }

  const payload = {
    name: safeName,
    public: Boolean(isPublic),
  };
  const safeDescription = typeof description === "string" ? description.trim() : "";
  if (safeDescription) {
    payload.description = safeDescription;
  }

  return apiFetch("/api/me/playlists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function loadMyPlaylists(offset = 0, { clearHighlight = false } = {}) {
  const requestedOffset = clampPlaylistOffset(offset);
  const requestSequence = playlistRequestSequence + 1;
  playlistRequestSequence = requestSequence;
  if (clearHighlight) {
    clearPlaylistHighlight();
  }

  playlistState.loading = true;
  playlistState.error = "";
  playlistState.offset = requestedOffset;
  playlistState.items = [];
  renderPlaylists();

  try {
    const payload = await apiGetMyPlaylists({
      limit: playlistState.limit,
      offset: requestedOffset,
    });
    if (requestSequence !== playlistRequestSequence) {
      return;
    }

    playlistState.items = payload && Array.isArray(payload.items) ? payload.items : [];
    playlistState.limit = clampPlaylistLimit(payload && payload.limit);
    playlistState.offset = clampPlaylistOffset(payload && payload.offset);
    playlistState.total = Math.max(0, toInteger(payload && payload.total, 0));
    playlistState.loading = false;
    playlistState.error = "";
    renderPlaylists();
  } catch (error) {
    if (requestSequence !== playlistRequestSequence) {
      return;
    }

    playlistState.loading = false;
    playlistState.error =
      error && typeof error.message === "string" && error.message
        ? error.message
        : "Failed to load playlists.";
    playlistState.items = [];
    playlistState.total = 0;
    renderPlaylists();
  }
}

async function refreshConnectionStatus() {
  try {
    const profile = await apiMe();
    const displayName =
      profile && typeof profile.display_name === "string" && profile.display_name
        ? profile.display_name
        : "Spotify user";
    renderStep(STEP_CONNECTED, { displayName });
    await loadMyPlaylists(0, { clearHighlight: true });
  } catch (error) {
    renderStep(STEP_DISCONNECTED);
    resetPlaylistState();
  }
}

async function connectSpotify() {
  window.location.assign("/api/auth/spotify/login");
}

async function disconnectSpotify() {
  try {
    await apiFetch("/api/auth/logout", { method: "GET" });
  } finally {
    clearAppSessionStorage();
    setCreatePlaylistStatus("");
    await refreshConnectionStatus();
  }
}

async function createPlaylist(event) {
  event.preventDefault();

  const nameValue = createPlaylistNameInput && typeof createPlaylistNameInput.value === "string"
    ? createPlaylistNameInput.value.trim()
    : "";
  const descriptionValue =
    createPlaylistDescriptionInput && typeof createPlaylistDescriptionInput.value === "string"
      ? createPlaylistDescriptionInput.value.trim()
      : "";
  const isPublic = Boolean(createPlaylistPublicInput && createPlaylistPublicInput.checked);

  if (!nameValue) {
    setCreatePlaylistStatus("Playlist name is required.");
    if (createPlaylistNameInput) {
      createPlaylistNameInput.focus();
    }
    return;
  }

  setCreatePlaylistSubmitting(true);
  setCreatePlaylistStatus("Creating playlist...");

  try {
    const createdPlaylist = await apiCreateMyPlaylist({
      name: nameValue,
      description: descriptionValue,
      public: isPublic,
    });
    playlistState.highlightedPlaylistId = getPlaylistId(createdPlaylist);
    await loadMyPlaylists(0);
    if (createPlaylistFormElement) {
      createPlaylistFormElement.reset();
    }
    setCreatePlaylistStatus(`Created playlist "${getPlaylistName(createdPlaylist)}".`);
  } catch (error) {
    setCreatePlaylistStatus(
      error && typeof error.message === "string" && error.message
        ? error.message
        : "Failed to create playlist.",
    );
  } finally {
    setCreatePlaylistSubmitting(false);
  }
}

if (connectButton) {
  connectButton.addEventListener("click", () => {
    void connectSpotify();
  });
}
if (disconnectButton) {
  disconnectButton.addEventListener("click", () => {
    void disconnectSpotify();
  });
}
if (playlistsPrevButton) {
  playlistsPrevButton.addEventListener("click", () => {
    void loadMyPlaylists(Math.max(0, playlistState.offset - playlistState.limit), {
      clearHighlight: true,
    });
  });
}
if (playlistsNextButton) {
  playlistsNextButton.addEventListener("click", () => {
    void loadMyPlaylists(playlistState.offset + playlistState.limit, {
      clearHighlight: true,
    });
  });
}
if (createPlaylistFormElement) {
  createPlaylistFormElement.addEventListener("submit", (event) => {
    void createPlaylist(event);
  });
}

async function initializeApp() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("code") || params.has("state") || params.has("error")) {
    clearUrlQueryString();
  }

  renderStep(STEP_DISCONNECTED);
  resetPlaylistState();
  await refreshConnectionStatus();
}

window.apiMe = apiMe;
window.apiGetMyPlaylists = apiGetMyPlaylists;
window.apiCreateMyPlaylist = apiCreateMyPlaylist;

void initializeApp();
