import {
  state,
  apiRequest,
  uploadFile,
  mergeEvent,
  getEvent,
  getControlRoomEvent,
  ensureEvent,
  refreshEvents,
  refreshArtistProfile,
  refreshLibrary,
  refreshControlRoom,
  hydrateUser,
} from "./state.js";
import { h } from "./utils.js";
import { showToast, renderLoadingBar, setLoading, setNotice, setActiveNav } from "./ui.js";
import { closeChatStream, loadChatHistory, ensureChatStream, updateWatchChatPanel } from "./chat.js";
import { destroyPlayer, initHlsPlayer, getCameraStream, startCameraBroadcast, stopCameraBroadcast } from "./media.js";
import {
  renderHero,
  discoverView,
  eventDetailView,
  artistProfileView,
  libraryView,
  watchView,
  creatorView,
  controlRoomView,
  accountView,
  signInView,
  signUpView,
} from "./views.js";

const app = document.getElementById("app");

/* ── Nav buttons ── */

const navButtons = [...document.querySelectorAll(".nav-btn")];
navButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    await navigateTo(btn.dataset.route);
  });
});

/* ── Session ── */

function clearSession() {
  closeChatStream();
  state.token = "";
  state.user = null;
  state.libraryEvents = [];
  state.artistProfiles = {};
  state.artistEvents = {};
  state.controlRooms = {};
  state.streamInfoByEvent = {};
  state.chat = {};
  state.chatLoadedByEvent = {};
  localStorage.removeItem("ultra_fan_token");
}

function requireAuthRoute() {
  if (state.token) return true;
  setNotice("Sign in first to continue.", "info");
  state.route = "signin";
  state.routeEventId = null;
  setActiveNav("account");
  render();
  return false;
}

/* ── User Indicator ── */

function renderUserIndicator() {
  const el = document.getElementById("userIndicator");
  if (!el) return;

  if (state.user) {
    const initials = (state.user.displayName || "U")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2);
    el.innerHTML = `
      <div class="user-avatar">${h(initials)}</div>
      <span>${h(state.user.displayName)}</span>
    `;
  } else {
    el.innerHTML = `<button class="btn ghost" style="padding:0.35rem 0.75rem;font-size:0.8rem;">Sign In</button>`;
    el.querySelector("button")?.addEventListener("click", () => navigateTo("signin"));
  }
}

/* ── Router ── */

async function navigateTo(route, options = {}) {
  let resolvedRoute = route;
  if (route === "account" && !state.user) {
    resolvedRoute = "signin";
  }
  if ((route === "signin" || route === "signup") && state.user) {
    resolvedRoute = "account";
  }

  const targetEventId = options.eventId || null;
  const leavingWatch =
    state.route === "watch" &&
    (resolvedRoute !== "watch" || targetEventId !== state.routeEventId);
  if (leavingWatch) {
    closeChatStream();
  }

  const leavingControl =
    state.route === "control" &&
    (resolvedRoute !== "control" || targetEventId !== state.routeEventId);
  if (leavingControl && getCameraStream()) {
    stopCameraBroadcast();
  }

  state.route = resolvedRoute;
  state.routeEventId = targetEventId;
  setActiveNav(resolvedRoute);
  setLoading(true);

  try {
    if (resolvedRoute === "discover") {
      await refreshEvents();
    }

    if (resolvedRoute === "library") {
      if (!requireAuthRoute()) return;
      await refreshLibrary();
    }

    if (resolvedRoute === "event" || resolvedRoute === "watch") {
      if (options.eventId) {
        const event = await ensureEvent(options.eventId);
        if (event?.artistUserId) {
          try {
            await refreshArtistProfile(event.artistUserId);
          } catch {
            // Event details should still render even if profile enrichment fails.
          }
        }
      }
    }

    if (resolvedRoute === "watch" && options.eventId && state.token) {
      await loadChatHistory(options.eventId);
      ensureChatStream(options.eventId);
    }

    if (resolvedRoute === "creator") {
      await refreshEvents();
    }

    if (resolvedRoute === "artist") {
      if (options.eventId) {
        await refreshArtistProfile(options.eventId);
      }
    }

    if (resolvedRoute === "control") {
      if (!requireAuthRoute()) return;
      if (options.eventId) {
        await ensureEvent(options.eventId);
        await refreshControlRoom(options.eventId);
      }
    }
  } catch (err) {
    setNotice(err.message, "error");
  } finally {
    setLoading(false);
    render();
  }
}

/* ── View dispatch ── */

function renderRouteContent() {
  if (state.route === "discover") return discoverView();
  if (state.route === "event") return eventDetailView(state.routeEventId);
  if (state.route === "artist") return artistProfileView(state.routeEventId);
  if (state.route === "library") return libraryView();
  if (state.route === "watch") return watchView(state.routeEventId);
  if (state.route === "creator") return creatorView();
  if (state.route === "control") return controlRoomView(state.routeEventId);
  if (state.route === "signin") return signInView();
  if (state.route === "signup") return signUpView();
  if (state.route === "account") return accountView();
  return accountView();
}

function appTemplate() {
  return `
    ${renderHero()}
    ${renderRouteContent()}
  `;
}

/* ── Actions ── */

async function onBuy(eventId) {
  if (!requireAuthRoute()) return;

  setLoading(true);
  try {
    await apiRequest(`/events/${eventId}/purchase`, { method: "POST" });
    await refreshLibrary();
    setNotice("Ticket purchase confirmed.", "success");
  } catch (err) {
    setNotice(err.message, "error");
  } finally {
    setLoading(false);
    render();
  }
}

async function onCheckAccess(eventId) {
  if (!requireAuthRoute()) return;

  setLoading(true);
  try {
    await ensureEvent(eventId);
    const data = await apiRequest(`/events/${eventId}/access-token`);
    state.streamInfoByEvent[eventId] = data;
    setNotice("Playback token issued.", "success");
    await navigateTo("watch", { eventId });
  } catch (err) {
    setNotice(err.message, "error");
    setLoading(false);
    render();
  }
}

async function onOpenControlRoom(eventId) {
  if (!requireAuthRoute()) return;

  setLoading(true);
  try {
    await ensureEvent(eventId);
    await refreshControlRoom(eventId);
    await navigateTo("control", { eventId });
  } catch (err) {
    setNotice(err.message, "error");
    setLoading(false);
    render();
  }
}

async function onControlAction(eventId, actionPath, successMessage) {
  if (!requireAuthRoute()) return;

  setLoading(true);
  try {
    await apiRequest(`/events/${eventId}${actionPath}`, { method: "POST" });
    await refreshControlRoom(eventId);
    await refreshEvents();
    setNotice(successMessage, "success");
  } catch (err) {
    setNotice(err.message, "error");
  } finally {
    setLoading(false);
    render();
  }
}

function copyText(text, label) {
  const value = String(text || "");
  if (!value) {
    setNotice(`${label} unavailable for this event.`, "error");
    render();
    return;
  }

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(value).then(() => {
      setNotice(`${label} copied.`, "success");
      render();
    });
    return;
  }

  setNotice(`${label}: ${value}`, "info");
  render();
}

/* ── Event Handlers ── */

function bindAction(action, handler) {
  for (const el of app.querySelectorAll(`[data-action='${action}']`)) {
    el.addEventListener("click", handler);
  }
}

function attachEventHandlers() {
  // Simple navigation actions
  const NAV_ACTIONS = { "go-discover": "discover", "go-library": "library", "go-creator": "creator", "go-signin": "signin", "go-signup": "signup" };
  for (const [action, route] of Object.entries(NAV_ACTIONS)) {
    bindAction(action, () => navigateTo(route));
  }

  bindAction("go-account", () => navigateTo(state.user ? "account" : "signin"));

  bindAction("view-event", async function () {
    await navigateTo("event", { eventId: this.dataset.id });
  });

  bindAction("view-artist", async function () {
    await navigateTo("artist", { eventId: this.dataset.id });
  });

  // Make entire cards clickable (skip if a button inside was clicked)
  for (const card of app.querySelectorAll("article.card[data-action='view-event']")) {
    card.addEventListener("click", async (e) => {
      if (e.target.closest("button")) return;
      await navigateTo("event", { eventId: card.dataset.id });
    });
  }

  bindAction("buy", async function () {
    await onBuy(this.dataset.id);
  });

  bindAction("check-access", async function () {
    await onCheckAccess(this.dataset.id);
  });

  bindAction("open-control-room", async function () {
    await onOpenControlRoom(this.dataset.id);
  });

  bindAction("control-start-rehearsal", async function () {
    await onControlAction(this.dataset.id, "/broadcast/rehearsal/start", "Broadcast moved to READY state.");
  });

  bindAction("control-go-live", async function () {
    await onControlAction(this.dataset.id, "/broadcast/go-live", "Broadcast is now LIVE.");
  });

  bindAction("control-end", async function () {
    await onControlAction(this.dataset.id, "/broadcast/end", "Broadcast ended.");
  });

  bindAction("start-camera", async function () {
    const event = getControlRoomEvent(state.routeEventId);
    const whipUrl = event?.whipUrl;
    if (!whipUrl) {
      showToast("Stream key not available yet.", "error");
      return;
    }
    await startCameraBroadcast(whipUrl);
  });

  bindAction("stop-camera", () => {
    stopCameraBroadcast();
  });

  bindAction("copy-ingest", function () {
    const event = getControlRoomEvent(this.dataset.id);
    copyText(event?.ingestUrl, "Server URL");
  });

  bindAction("copy-key", function () {
    const event = getControlRoomEvent(this.dataset.id);
    copyText(event?.streamKey, "Stream key");
  });

  bindAction("chat-send", async function () {
    if (!requireAuthRoute()) return;

    const eventId = this.dataset.id;
    const input = document.getElementById("chatInput");
    const message = input?.value?.trim();
    if (!message) return;

    try {
      await apiRequest(`/events/${eventId}/chat/messages`, {
        method: "POST",
        body: { body: message },
      });
      if (input) input.value = "";
    } catch (err) {
      setNotice(err.message, "error");
      render();
    }
  });

  bindAction("logout", async () => {
    clearSession();
    setNotice("Signed out.", "success");
    await navigateTo("discover");
  });

  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(signupForm);
      const body = {
        email: String(formData.get("email") || "").trim(),
        password: String(formData.get("password") || ""),
        displayName: String(formData.get("displayName") || "").trim(),
        role: String(formData.get("role") || "fan"),
      };
      const organizationId = String(formData.get("organizationId") || "").trim();
      if (organizationId) body.organizationId = organizationId;

      setLoading(true);
      try {
        const data = await apiRequest("/auth/signup", { method: "POST", body, auth: false });
        state.token = data.accessToken;
        state.user = data.user;
        localStorage.setItem("ultra_fan_token", state.token);
        await refreshEvents();
        await refreshLibrary();
        setNotice("Account created and signed in.", "success");
        await navigateTo("discover");
      } catch (err) {
        setNotice(err.message, "error");
        setLoading(false);
        render();
      }
    });
  }

  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(loginForm);
      const body = {
        email: String(formData.get("email") || "").trim(),
        password: String(formData.get("password") || ""),
      };

      setLoading(true);
      try {
        const data = await apiRequest("/auth/login", { method: "POST", body, auth: false });
        state.token = data.accessToken;
        state.user = data.user;
        localStorage.setItem("ultra_fan_token", state.token);
        await refreshEvents();
        await refreshLibrary();
        setNotice("Logged in successfully.", "success");
        await navigateTo("discover");
      } catch (err) {
        setNotice(err.message, "error");
        setLoading(false);
        render();
      }
    });
  }

  const createEventForm = document.getElementById("createEventForm");
  if (createEventForm) {
    createEventForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(createEventForm);
      const startsAtLocal = String(formData.get("startsAt") || "");
      const body = {
        title: String(formData.get("title") || "").trim(),
        description: String(formData.get("description") || "").trim(),
        venue: String(formData.get("venue") || "").trim(),
        startsAt: startsAtLocal ? new Date(startsAtLocal).toISOString() : "",
        durationMin: Number(formData.get("durationMin") || 90),
        priceUsd: Number(formData.get("priceUsd") || 0),
        replayHours: Number(formData.get("replayHours") || 24),
        published: Boolean(formData.get("published")),
      };
      const imageUrl = String(formData.get("imageUrl") || "").trim();
      const imageFile = createEventForm.querySelector('input[name="imageFile"]')?.files?.[0];

      setLoading(true);
      try {
        if (imageFile) {
          body.imageUrl = await uploadFile(imageFile);
        } else if (imageUrl) {
          body.imageUrl = imageUrl;
        }
        const data = await apiRequest("/events", { method: "POST", body });
        if (data.event) mergeEvent(data.event);
        await refreshEvents();
        setNotice("Event created successfully.", "success");
        await navigateTo("creator");
      } catch (err) {
        setNotice(err.message, "error");
        setLoading(false);
        render();
      }
    });
  }

  const creatorProfileForm = document.getElementById("creatorProfileForm");
  if (creatorProfileForm) {
    creatorProfileForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(creatorProfileForm);
      const profileImageFile = creatorProfileForm.querySelector('input[name="profileImageFile"]')?.files?.[0];
      const body = {
        displayName: String(formData.get("displayName") || "").trim(),
        bio: String(formData.get("bio") || "").trim(),
        hometown: String(formData.get("hometown") || "").trim(),
        websiteUrl: String(formData.get("websiteUrl") || "").trim(),
      };

      setLoading(true);
      try {
        if (profileImageFile) {
          body.profileImageUrl = await uploadFile(profileImageFile);
        }
        const data = await apiRequest("/me/creator-profile", {
          method: "PATCH",
          body,
        });
        if (data.user) {
          state.user = data.user;
        }
        if (state.user?.id) {
          await refreshArtistProfile(state.user.id);
        }
        setNotice("Creator profile updated.", "success");
      } catch (err) {
        setNotice(err.message, "error");
      } finally {
        setLoading(false);
        render();
      }
    });
  }
}

/* ── Render ── */

function render() {
  destroyPlayer();
  app.innerHTML = appTemplate();
  attachEventHandlers();
  renderUserIndicator();
  renderLoadingBar();

  const cameraStream = getCameraStream();
  if (state.route === "control" && cameraStream) {
    const preview = document.getElementById("cameraPreview");
    const overlay = document.getElementById("cameraOverlay");
    if (preview) {
      preview.srcObject = cameraStream;
      if (overlay) overlay.style.display = "none";
    }
  }

  if (state.route === "watch" && state.routeEventId) {
    const streamInfo = state.streamInfoByEvent[state.routeEventId];
    const event = getEvent(state.routeEventId);
    if (streamInfo?.hlsUrl && event?.broadcastState === "live") {
      initHlsPlayer(streamInfo.hlsUrl);
    }

    if (state.token) {
      if (!state.chatLoadedByEvent[state.routeEventId]) {
        loadChatHistory(state.routeEventId)
          .then(() => updateWatchChatPanel(state.routeEventId))
          .catch((err) => setNotice(err.message, "error"));
      }
      ensureChatStream(state.routeEventId);
    }
  } else {
    closeChatStream();
  }
}

/* ── Init ── */

async function init() {
  setLoading(true);
  try {
    await hydrateUser(clearSession);
    await refreshEvents();
    await refreshLibrary();
  } catch (err) {
    setNotice(err.message, "error");
  } finally {
    setLoading(false);
    setActiveNav(state.route);
    render();
  }
}

init();
