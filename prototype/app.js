const CREATOR_ROLES = new Set(["creator", "org_admin", "support_admin"]);

const state = {
  route: "discover",
  routeEventId: null,
  apiBase: localStorage.getItem("ultra_fan_api_base") || "http://localhost:4000",
  token: localStorage.getItem("ultra_fan_token") || "",
  user: null,
  events: [],
  libraryEvents: [],
  controlRooms: {},
  chat: {},
  streamInfoByEvent: {},
  loading: false,
  notice: null,
};

const app = document.getElementById("app");
const navButtons = [...document.querySelectorAll(".nav-btn")];

navButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    await navigateTo(btn.dataset.route);
  });
});

function h(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(iso) {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMoney(amount) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(amount || 0));
}

function getLocalDateTimeInputValue(hoursAhead = 48) {
  const date = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function statusBadge(stateLabel) {
  const label = ["offline", "ready", "live", "ended"].includes(stateLabel) ? stateLabel : "offline";
  return `<span class="badge ${label}">${label.toUpperCase()}</span>`;
}

function isCreatorUser() {
  return Boolean(state.user && CREATOR_ROLES.has(state.user.role));
}

function canManageEvent(event) {
  if (!state.user || !event) return false;
  if (state.user.role === "support_admin") return true;
  if (event.artistUserId && event.artistUserId === state.user.id) return true;
  return Boolean(state.user.organizationId && event.organizationId && state.user.organizationId === event.organizationId);
}

function listManagedEvents() {
  return state.events.filter(canManageEvent);
}

function hasTicket(eventId) {
  return state.libraryEvents.some((event) => event.id === eventId);
}

function setActiveNav(route) {
  navButtons.forEach((button) => button.classList.remove("active"));

  let navRoute = route;
  if (route === "event" || route === "watch") navRoute = "discover";
  if (route === "control") navRoute = "creator";

  navButtons.find((button) => button.dataset.route === navRoute)?.classList.add("active");
}

/* ── Toast Notification System ── */

function showToast(message, tone = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const icons = { success: "\u2713", error: "\u2717", info: "\u2139" };
  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[tone] || icons.info}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-out");
    toast.addEventListener("animationend", () => toast.remove());
  }, 3500);
}

/* ── Loading Bar ── */

function renderLoadingBar() {
  const existing = document.querySelector(".loading-bar");
  if (state.loading && !existing) {
    const bar = document.createElement("div");
    bar.className = "loading-bar";
    document.body.appendChild(bar);
  } else if (!state.loading && existing) {
    existing.remove();
  }
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
    el.querySelector("button")?.addEventListener("click", () => navigateTo("account"));
  }
}

/* ── State Helpers ── */

function setLoading(loading) {
  state.loading = loading;
  renderLoadingBar();
}

function setNotice(message, tone = "info") {
  if (!message) {
    state.notice = null;
    return;
  }
  state.notice = { message, tone };
  showToast(message, tone);
}

function clearSession() {
  state.token = "";
  state.user = null;
  state.libraryEvents = [];
  state.controlRooms = {};
  state.streamInfoByEvent = {};
  localStorage.removeItem("ultra_fan_token");
}

function requireAuthRoute() {
  if (state.token) return true;
  setNotice("Sign in first to continue.", "info");
  state.route = "account";
  state.routeEventId = null;
  setActiveNav("account");
  render();
  return false;
}

function normalizeApiError(payload, status) {
  if (typeof payload?.error === "string") return payload.error;

  if (payload?.error?.fieldErrors) {
    const details = Object.entries(payload.error.fieldErrors)
      .map(([field, messages]) => `${field}: ${(messages || []).join(", ")}`)
      .filter(Boolean)
      .join(" | ");
    if (details) return details;
  }

  if (Array.isArray(payload?.error)) {
    return payload.error.join(", ");
  }

  if (payload?.message) return payload.message;

  return `Request failed (${status})`;
}

async function apiRequest(path, opts = {}) {
  const headers = {
    "content-type": "application/json",
    ...(opts.headers || {}),
  };

  if (opts.auth !== false && state.token) {
    headers.authorization = `Bearer ${state.token}`;
  }

  let response;
  try {
    response = await fetch(`${state.apiBase}${path}`, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new Error("Could not reach API. Verify API Base URL and backend status.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(normalizeApiError(payload, response.status));
  }

  return payload;
}

function mergeEvent(event) {
  if (!event?.id) return;

  state.events = [event, ...state.events.filter((item) => item.id !== event.id)];
  state.libraryEvents = state.libraryEvents.map((item) => (item.id === event.id ? { ...item, ...event } : item));
}

function getEvent(eventId) {
  return state.events.find((event) => event.id === eventId) || state.libraryEvents.find((event) => event.id === eventId) || null;
}

function getControlRoomEvent(eventId) {
  const event = getEvent(eventId);
  if (!event) return null;

  const controlRoom = state.controlRooms[eventId];
  if (!controlRoom) return event;

  return {
    ...event,
    title: controlRoom.title || event.title,
    ingestUrl: controlRoom.ingestUrl || event.ingestUrl,
    streamKey: controlRoom.streamKey || event.streamKey,
    broadcastState: controlRoom.broadcastState || event.broadcastState,
    rehearsalActive: Boolean(controlRoom.rehearsalActive),
  };
}

function mergeControlRoom(data) {
  if (!data?.eventId) return;

  state.controlRooms[data.eventId] = data;
  const current = getEvent(data.eventId);
  mergeEvent({
    ...(current || {}),
    id: data.eventId,
    title: data.title || current?.title || "Untitled event",
    ingestUrl: data.ingestUrl || current?.ingestUrl || "",
    streamKey: data.streamKey || current?.streamKey || "",
    broadcastState: data.broadcastState || current?.broadcastState || "offline",
    rehearsalActive: Boolean(data.rehearsalActive),
  });
}

async function ensureEvent(eventId) {
  const existing = getEvent(eventId);
  if (existing) return existing;

  const data = await apiRequest(`/events/${eventId}`, { auth: false });
  mergeEvent(data.event);
  return data.event;
}

async function refreshEvents() {
  const data = await apiRequest("/events", { auth: false });
  const publishedEvents = Array.isArray(data.events) ? data.events : [];
  const localManagedDrafts = state.events.filter((event) => !event.published && canManageEvent(event));
  state.events = [
    ...publishedEvents,
    ...localManagedDrafts.filter((draftEvent) => !publishedEvents.some((event) => event.id === draftEvent.id)),
  ];
}

async function refreshLibrary() {
  if (!state.token) {
    state.libraryEvents = [];
    return;
  }

  const data = await apiRequest("/me/library");
  state.libraryEvents = Array.isArray(data.events) ? data.events : [];
}

async function refreshControlRoom(eventId) {
  const data = await apiRequest(`/events/${eventId}/control-room`);
  mergeControlRoom(data);
}

async function hydrateUser() {
  if (!state.token) return;

  try {
    const data = await apiRequest("/me");
    state.user = data.user;
  } catch {
    clearSession();
  }
}

async function navigateTo(route, options = {}) {
  state.route = route;
  state.routeEventId = options.eventId || null;
  setActiveNav(route);
  setLoading(true);

  try {
    if (route === "discover") {
      await refreshEvents();
    }

    if (route === "library") {
      if (!requireAuthRoute()) return;
      await refreshLibrary();
    }

    if (route === "event" || route === "watch") {
      if (options.eventId) {
        await ensureEvent(options.eventId);
      }
    }

    if (route === "creator") {
      await refreshEvents();
    }

    if (route === "control") {
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

/* ── View: Hero ── */

function renderHero() {
  if (state.route !== "discover") return "";

  return `
    <section class="hero">
      <h1>Live concerts,<br>everywhere.</h1>
      <p class="hero-subtitle">Experience world-class performances streamed live from the biggest stages. Get your ticket, show up, feel the energy.</p>
      <div class="hero-cta">
        <button class="btn" data-action="go-discover" style="background:rgba(255,255,255,0.12);border-color:rgba(255,255,255,0.2);color:#fff;backdrop-filter:blur(4px);">Browse Events</button>
      </div>
    </section>
  `;
}

/* ── View: Discover ── */

function discoverView() {
  const publishedEvents = state.events.filter((event) => event.published !== false);
  const cards = publishedEvents
    .map((event) => {
      const ticketLabel = hasTicket(event.id) ? "Ticketed \u2713" : formatMoney(event.priceUsd);
      return `
        <article class="card" data-action="view-event" data-id="${h(event.id)}">
          <div class="media">
            ${event.imageUrl ? `<img src="${h(event.imageUrl)}" alt="${h(event.title)}" />` : ""}
            <div class="card-badge">${statusBadge(event.broadcastState)}</div>
          </div>
          <div class="card-body">
            <h3>${h(event.title)}</h3>
            <p class="card-meta">${h(event.venue)} &middot; ${h(formatDateTime(event.startsAt))}</p>
            <p class="card-price">${ticketLabel}</p>
            <div class="card-actions">
              <button class="btn primary" data-action="view-event" data-id="${h(event.id)}">View Details</button>
              <button class="btn" data-action="buy" data-id="${h(event.id)}">Get Ticket</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  return `
    <div style="margin-top:1.5rem;">
      <h2 class="section-title">Upcoming Events</h2>
      <p class="section-subtitle">Grab your tickets before they sell out</p>
    </div>
    <section class="grid">
      ${cards || `<article class="panel" style="grid-column:1/-1;text-align:center;padding:3rem;"><p class="muted">No events available yet. Check back soon.</p></article>`}
    </section>
  `;
}

/* ── View: Event Detail ── */

function eventDetailView(eventId) {
  const event = getEvent(eventId);
  if (!event) {
    return `<section class="panel" style="text-align:center;padding:3rem;"><p class="muted">Event not found.</p></section>`;
  }

  const userHasTicket = hasTicket(event.id);

  return `
    <section class="hero" style="min-height:180px;margin-bottom:1.5rem;${event.imageUrl ? `background-image:linear-gradient(rgba(10,10,15,0.55),rgba(10,10,15,0.75)),url('${h(event.imageUrl)}');background-size:cover;background-position:center;` : ""}">
      <div class="row" style="justify-content:space-between;align-items:flex-start;position:relative;">
        <div>
          <h1>${h(event.title)}</h1>
          <p class="hero-subtitle">${h(event.venue)} &middot; ${h(formatDateTime(event.startsAt))}</p>
        </div>
        <div style="position:relative;">${statusBadge(event.broadcastState)}</div>
      </div>
    </section>

    <section class="layout">
      <article class="panel">
        <h3>About This Event</h3>
        <p style="margin-top:0.5rem;color:var(--ink-secondary);">${h(event.description)}</p>
        <p style="margin-top:0.75rem;"><strong style="color:var(--accent);font-size:1.25rem;">${h(formatMoney(event.priceUsd))}</strong></p>
        <div class="row" style="margin-top:1rem;">
          <button class="btn primary" data-action="buy" data-id="${h(event.id)}">${userHasTicket ? "Ticket Purchased" : "Buy Ticket"}</button>
          <button class="btn" data-action="check-access" data-id="${h(event.id)}">Enter Stream</button>
          ${canManageEvent(event) ? `<button class="btn ghost" data-action="open-control-room" data-id="${h(event.id)}">Control Room</button>` : ""}
        </div>
      </article>

      <aside class="panel">
        <h3>Event Info</h3>
        <div style="margin-top:0.75rem;display:grid;gap:0.75rem;">
          <div class="kpi"><p class="label">Date</p><p class="value" style="font-size:1rem;">${h(formatDateTime(event.startsAt))}</p></div>
          <div class="kpi"><p class="label">Venue</p><p class="value" style="font-size:1rem;">${h(event.venue)}</p></div>
          <div class="kpi"><p class="label">Duration</p><p class="value" style="font-size:1rem;">${event.durationMin ? event.durationMin + " min" : "TBD"}</p></div>
        </div>
        <div class="row" style="margin-top:1rem;">
          <button class="btn ghost" data-action="go-discover">Back to Events</button>
          <button class="btn ghost" data-action="go-library">My Library</button>
          ${!state.user ? `<button class="btn" data-action="go-account">Sign In</button>` : ""}
        </div>
      </aside>
    </section>
  `;
}

/* ── View: Library ── */

function libraryView() {
  if (!state.user) {
    return `
      <section class="panel" style="text-align:center;padding:3rem;">
        <h2>My Library</h2>
        <p class="muted" style="margin:0.75rem 0;">Sign in to see your purchased events.</p>
        <button class="btn primary" data-action="go-account">Sign In</button>
      </section>
    `;
  }

  const cards = state.libraryEvents
    .map(
      (event) => `
        <article class="card">
          <div class="media">
            ${event.imageUrl ? `<img src="${h(event.imageUrl)}" alt="${h(event.title)}" />` : ""}
            <div class="card-badge">${statusBadge(event.broadcastState)}</div>
          </div>
          <div class="card-body">
            <h3>${h(event.title)}</h3>
            <p class="card-meta">${h(formatDateTime(event.startsAt))} &middot; ${h(event.venue)}</p>
            <div class="card-actions">
              <button class="btn primary" data-action="check-access" data-id="${h(event.id)}">Watch Now</button>
              <button class="btn ghost" data-action="view-event" data-id="${h(event.id)}">Details</button>
            </div>
          </div>
        </article>
      `,
    )
    .join("");

  return `
    <div>
      <h2 class="section-title">My Library</h2>
      <p class="section-subtitle">${state.libraryEvents.length} event${state.libraryEvents.length !== 1 ? "s" : ""} in your collection</p>
    </div>
    <section class="grid">${cards || `<article class="panel" style="grid-column:1/-1;text-align:center;padding:3rem;"><p class="muted">No tickets yet. Browse events to get started.</p><button class="btn primary" data-action="go-discover" style="margin-top:0.75rem;">Discover Events</button></article>`}</section>
  `;
}

/* ── View: Watch ── */

function watchView(eventId) {
  const event = getEvent(eventId);
  if (!event) {
    return `<section class="panel" style="text-align:center;padding:3rem;"><p class="muted">Event not found.</p></section>`;
  }

  const streamInfo = state.streamInfoByEvent[eventId];
  const hasAccess = Boolean(streamInfo);

  let playerContent;
  if (event.broadcastState === "live" && hasAccess) {
    playerContent = `
      <div>
        <div class="play-icon">\u25B6</div>
        <h3>Stream Active</h3>
        <p>Connected &middot; Token expires in ${streamInfo.expiresInSec}s</p>
      </div>
    `;
  } else if (event.broadcastState === "live") {
    playerContent = `
      <div>
        <div class="play-icon">\u25B6</div>
        <h3>Stream is Live</h3>
        <p>Request access to start watching</p>
      </div>
    `;
  } else if (event.broadcastState === "ready") {
    playerContent = `<div><h3>Starting Soon</h3><p>The artist is preparing. Stream will begin shortly.</p></div>`;
  } else if (event.broadcastState === "ended") {
    playerContent = `<div><h3>Stream Ended</h3><p>This broadcast has concluded.</p></div>`;
  } else {
    playerContent = `<div><h3>Waiting for Stream</h3><p>The broadcast hasn't started yet. Check back at showtime.</p></div>`;
  }

  const chatItems = (state.chat[eventId] || [])
    .map((item) => `<div class="chat-message"><strong>${h(item.user)}</strong> ${h(item.message)}</div>`)
    .join("");

  return `
    <div style="margin-bottom:1rem;">
      <div class="row" style="justify-content:space-between;align-items:center;">
        <div>
          <h2 class="section-title">${h(event.title)}</h2>
          <p class="section-subtitle" style="margin-bottom:0;">${h(event.venue)} &middot; ${h(formatDateTime(event.startsAt))}</p>
        </div>
        ${statusBadge(event.broadcastState)}
      </div>
    </div>

    <section class="layout">
      <article>
        <div class="player">${playerContent}</div>
        <div class="row" style="margin-top:0.85rem;">
          <button class="btn primary" data-action="check-access" data-id="${h(event.id)}">Request Access</button>
          <button class="btn ghost" data-action="view-event" data-id="${h(event.id)}">Event Details</button>
        </div>
      </article>

      <aside class="chat-panel">
        <div class="chat-header">Live Chat</div>
        <div class="chat-messages">${chatItems || `<p class="muted" style="font-size:0.85rem;">No messages yet. Be the first!</p>`}</div>
        <div class="chat-input-row">
          <input id="chatInput" placeholder="Say something..." />
          <button class="btn" data-action="chat-send" data-id="${h(event.id)}">Send</button>
        </div>
      </aside>
    </section>
  `;
}

/* ── View: Creator Studio ── */

function creatorView() {
  if (!state.user) {
    return `
      <section class="panel" style="text-align:center;padding:3rem;">
        <h2>Creator Studio</h2>
        <p class="muted" style="margin:0.75rem 0;">Sign in with a creator account to manage events.</p>
        <button class="btn primary" data-action="go-account">Sign In</button>
      </section>
    `;
  }

  if (!isCreatorUser()) {
    return `
      <section class="panel" style="text-align:center;padding:3rem;">
        <h2>Creator Studio</h2>
        <p class="muted" style="margin:0.75rem 0;">Your role is <strong>${h(state.user.role)}</strong>. Creator or admin access is required.</p>
      </section>
    `;
  }

  const managedEvents = listManagedEvents();
  const liveCount = managedEvents.filter((e) => e.broadcastState === "live").length;
  const publishedCount = managedEvents.filter((e) => e.published).length;

  const cards = managedEvents
    .map(
      (event) => `
        <article class="card">
          <div class="card-body">
            <div class="row" style="justify-content:space-between;">
              <h4>${h(event.title)}</h4>
              ${statusBadge(event.broadcastState)}
            </div>
            <p class="card-meta">${h(formatDateTime(event.startsAt))} &middot; ${h(event.venue)}</p>
            <div class="card-actions">
              <button class="btn primary" data-action="open-control-room" data-id="${h(event.id)}">Control Room</button>
              <button class="btn ghost" data-action="view-event" data-id="${h(event.id)}">Fan View</button>
            </div>
          </div>
        </article>
      `,
    )
    .join("");

  return `
    <div>
      <h2 class="section-title">Creator Studio</h2>
      <p class="section-subtitle">Manage your events and go live</p>
    </div>

    <div class="kpis">
      <div class="kpi"><p class="label">Total Events</p><p class="value">${managedEvents.length}</p></div>
      <div class="kpi"><p class="label">Published</p><p class="value">${publishedCount}</p></div>
      <div class="kpi"><p class="label">Live Now</p><p class="value ${liveCount > 0 ? "live" : ""}">${liveCount}</p></div>
    </div>

    <section class="layout" style="margin-top:1.5rem;">
      <article class="panel">
        <h3>Create Event</h3>
        <form id="createEventForm" style="margin-top:0.75rem;">
          <div class="form-grid">
            <label>Title<input name="title" placeholder="Tour Stop Livestream" required /></label>
            <label>Venue<input name="venue" placeholder="Los Angeles, CA" required /></label>
            <label class="span-2">Description<textarea name="description" placeholder="Describe your event..." required></textarea></label>
            <label>Start Time<input name="startsAt" type="datetime-local" value="${getLocalDateTimeInputValue()}" required /></label>
            <label>Duration (min)<input name="durationMin" type="number" value="90" min="30" required /></label>
            <label>Price USD<input name="priceUsd" type="number" value="19.99" step="0.01" min="0" required /></label>
            <label>Replay Hours<input name="replayHours" type="number" value="24" min="0" max="168" required /></label>
            <label class="span-2">Image URL<input name="imageUrl" type="url" placeholder="https://example.com/image.jpg" /></label>
          </div>
          <label style="display:flex;align-items:center;gap:0.5rem;margin-top:0.5rem;cursor:pointer;">
            <input name="published" type="checkbox" checked style="width:auto;margin:0;" /> Publish immediately
          </label>
          <div class="row" style="margin-top:0.85rem;">
            <button class="btn primary" type="submit">Create Event</button>
          </div>
        </form>
      </article>

      <aside class="panel">
        <h3>Your Events</h3>
        <div class="side-stack" style="margin-top:0.75rem;">
          ${cards || `<p class="muted">No events created yet.</p>`}
        </div>
      </aside>
    </section>
  `;
}

/* ── View: Control Room ── */

function controlRoomView(eventId) {
  const event = getControlRoomEvent(eventId);
  if (!event) {
    return `<section class="panel" style="text-align:center;padding:3rem;"><h2>Control Room</h2><p class="muted">Event not found.</p></section>`;
  }

  const bs = event.broadcastState || "offline";
  const canStartRehearsal = bs === "offline";
  const canGoLive = bs === "ready";
  const canEnd = bs === "live";

  return `
    <div style="margin-bottom:1rem;">
      <div class="row" style="justify-content:space-between;align-items:center;">
        <div>
          <h2 class="section-title">${h(event.title)}</h2>
          <p class="section-subtitle" style="margin-bottom:0;">Control Room &middot; ${h(event.venue)}</p>
        </div>
        ${statusBadge(bs)}
      </div>
    </div>

    <div class="stage-grid">
      <div class="stage ${bs === "offline" ? "active" : ""}"><strong>Offline</strong><span>Waiting for setup</span></div>
      <div class="stage ${bs === "ready" ? "active" : ""}"><strong>Ready</strong><span>Rehearsal active</span></div>
      <div class="stage ${bs === "live" ? "active" : ""}"><strong>Live</strong><span>On-air for fans</span></div>
      <div class="stage ${bs === "ended" ? "active" : ""}"><strong>Ended</strong><span>Broadcast closed</span></div>
    </div>

    <section class="layout" style="margin-top:1.25rem;">
      <article class="panel">
        <h3>Ingest Configuration</h3>
        <div style="margin-top:0.75rem;">
          <label>Server URL<input value="${h(event.ingestUrl || "Not yet assigned")}" readonly style="opacity:0.7;cursor:default;" /></label>
          <label>Stream Key<input value="${h(event.streamKey || "Not yet assigned")}" readonly style="opacity:0.7;cursor:default;" type="password" /></label>
        </div>
        <div class="row" style="margin-top:0.5rem;">
          <button class="btn" data-action="copy-ingest" data-id="${h(event.id)}">Copy URL</button>
          <button class="btn" data-action="copy-key" data-id="${h(event.id)}">Copy Key</button>
        </div>
      </article>

      <aside class="panel">
        <h3>Broadcast Controls</h3>
        <div class="side-stack" style="margin-top:0.75rem;gap:0.6rem;">
          <button class="btn primary" data-action="control-start-rehearsal" data-id="${h(event.id)}" ${canStartRehearsal ? "" : "disabled"} style="width:100%;justify-content:center;">Start Rehearsal</button>
          <button class="btn primary" data-action="control-go-live" data-id="${h(event.id)}" ${canGoLive ? "" : "disabled"} style="width:100%;justify-content:center;${canGoLive ? "background:var(--accent);border-color:var(--accent);box-shadow:var(--shadow-glow-accent);" : ""}">Go Live</button>
          <button class="btn warn" data-action="control-end" data-id="${h(event.id)}" ${canEnd ? "" : "disabled"} style="width:100%;justify-content:center;">End Stream</button>
          <hr style="border:none;border-top:1px solid var(--line);margin:0.25rem 0;" />
          <button class="btn ghost" data-action="go-creator" style="width:100%;justify-content:center;">Back to Studio</button>
        </div>
      </aside>
    </section>
  `;
}

/* ── View: Account ── */

function accountView() {
  const isLoggedIn = Boolean(state.user);

  return `
    <div style="max-width:720px;margin:0 auto;">
      <h2 class="section-title" style="text-align:center;">Account</h2>
      <p class="section-subtitle" style="text-align:center;">${
        isLoggedIn
          ? `Signed in as <strong style="color:var(--ink);">${h(state.user.displayName)}</strong> (${h(state.user.role)})`
          : "Sign in or create an account to get started"
      }</p>

      ${isLoggedIn ? `
        <section class="panel" style="margin-bottom:1.25rem;">
          <h3>Settings</h3>
          <form id="apiBaseForm" style="margin-top:0.75rem;">
            <label>API Base URL<input name="apiBase" value="${h(state.apiBase)}" required /></label>
            <div class="row">
              <button class="btn" type="submit">Save</button>
              <button class="btn ghost" data-action="logout">Sign Out</button>
            </div>
          </form>
        </section>
      ` : `
        <section class="layout" style="grid-template-columns:1fr 1fr;">
          <article class="panel">
            <h3>Sign Up</h3>
            <form id="signupForm" style="margin-top:0.75rem;">
              <label>Email<input name="email" type="email" placeholder="you@example.com" required /></label>
              <label>Password<input name="password" type="password" minlength="8" placeholder="Min 8 characters" required /></label>
              <label>Display Name<input name="displayName" placeholder="Your name" required /></label>
              <label>Role
                <select name="role">
                  <option value="fan">Fan</option>
                  <option value="creator">Creator</option>
                  <option value="org_admin">Org Admin</option>
                  <option value="support_admin">Support Admin</option>
                </select>
              </label>
              <label>Organization ID<input name="organizationId" placeholder="Optional" /></label>
              <button class="btn primary" type="submit" style="width:100%;justify-content:center;margin-top:0.25rem;">Create Account</button>
            </form>
          </article>

          <aside class="panel">
            <h3>Login</h3>
            <form id="loginForm" style="margin-top:0.75rem;">
              <label>Email<input name="email" type="email" placeholder="you@example.com" required /></label>
              <label>Password<input name="password" type="password" minlength="8" required /></label>
              <button class="btn primary" type="submit" style="width:100%;justify-content:center;margin-top:0.25rem;">Sign In</button>
            </form>
          </aside>
        </section>
      `}
    </div>
  `;
}

/* ── Routing & Rendering ── */

function renderRouteContent() {
  if (state.route === "discover") return discoverView();
  if (state.route === "event") return eventDetailView(state.routeEventId);
  if (state.route === "library") return libraryView();
  if (state.route === "watch") return watchView(state.routeEventId);
  if (state.route === "creator") return creatorView();
  if (state.route === "control") return controlRoomView(state.routeEventId);
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

function attachEventHandlers() {
  [...app.querySelectorAll("[data-action='go-discover']")].forEach((button) => {
    button.addEventListener("click", async () => {
      await navigateTo("discover");
    });
  });

  [...app.querySelectorAll("[data-action='go-account']")].forEach((button) => {
    button.addEventListener("click", async () => {
      await navigateTo("account");
    });
  });

  [...app.querySelectorAll("[data-action='go-library']")].forEach((button) => {
    button.addEventListener("click", async () => {
      await navigateTo("library");
    });
  });

  [...app.querySelectorAll("[data-action='go-creator']")].forEach((button) => {
    button.addEventListener("click", async () => {
      await navigateTo("creator");
    });
  });

  [...app.querySelectorAll("[data-action='view-event']")].forEach((button) => {
    button.addEventListener("click", async () => {
      await navigateTo("event", { eventId: button.dataset.id });
    });
  });

  // Make entire cards clickable (skip if a button inside was clicked)
  [...app.querySelectorAll("article.card[data-action='view-event']")].forEach((card) => {
    card.addEventListener("click", async (e) => {
      if (e.target.closest("button")) return;
      await navigateTo("event", { eventId: card.dataset.id });
    });
  });

  [...app.querySelectorAll("[data-action='buy']")].forEach((button) => {
    button.addEventListener("click", async () => {
      await onBuy(button.dataset.id);
    });
  });

  [...app.querySelectorAll("[data-action='check-access']")].forEach((button) => {
    button.addEventListener("click", async () => {
      await onCheckAccess(button.dataset.id);
    });
  });

  [...app.querySelectorAll("[data-action='open-control-room']")].forEach((button) => {
    button.addEventListener("click", async () => {
      await onOpenControlRoom(button.dataset.id);
    });
  });

  [...app.querySelectorAll("[data-action='control-start-rehearsal']")].forEach((button) => {
    button.addEventListener("click", async () => {
      await onControlAction(button.dataset.id, "/broadcast/rehearsal/start", "Broadcast moved to READY state.");
    });
  });

  [...app.querySelectorAll("[data-action='control-go-live']")].forEach((button) => {
    button.addEventListener("click", async () => {
      await onControlAction(button.dataset.id, "/broadcast/go-live", "Broadcast is now LIVE.");
    });
  });

  [...app.querySelectorAll("[data-action='control-end']")].forEach((button) => {
    button.addEventListener("click", async () => {
      await onControlAction(button.dataset.id, "/broadcast/end", "Broadcast ended.");
    });
  });

  [...app.querySelectorAll("[data-action='copy-ingest']")].forEach((button) => {
    button.addEventListener("click", () => {
      const event = getControlRoomEvent(button.dataset.id);
      copyText(event?.ingestUrl, "Server URL");
    });
  });

  [...app.querySelectorAll("[data-action='copy-key']")].forEach((button) => {
    button.addEventListener("click", () => {
      const event = getControlRoomEvent(button.dataset.id);
      copyText(event?.streamKey, "Stream key");
    });
  });

  [...app.querySelectorAll("[data-action='chat-send']")].forEach((button) => {
    button.addEventListener("click", () => {
      const eventId = button.dataset.id;
      const input = document.getElementById("chatInput");
      const message = input?.value?.trim();
      if (!message) return;

      state.chat[eventId] = state.chat[eventId] || [];
      state.chat[eventId].push({
        user: state.user ? `@${state.user.displayName}` : "@guest",
        message,
      });
      input.value = "";
      render();
    });
  });

  [...app.querySelectorAll("[data-action='logout']")].forEach((button) => {
    button.addEventListener("click", async () => {
      clearSession();
      setNotice("Signed out.", "success");
      await navigateTo("discover");
    });
  });

  const apiBaseForm = document.getElementById("apiBaseForm");
  if (apiBaseForm) {
    apiBaseForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(apiBaseForm);
      state.apiBase = String(formData.get("apiBase") || "").trim();
      localStorage.setItem("ultra_fan_api_base", state.apiBase);

      setLoading(true);
      try {
        await refreshEvents();
        await refreshLibrary();
        setNotice("API base updated.", "success");
      } catch (err) {
        setNotice(err.message, "error");
      } finally {
        setLoading(false);
        render();
      }
    });
  }

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
      if (imageUrl) body.imageUrl = imageUrl;

      setLoading(true);
      try {
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
}

function render() {
  app.innerHTML = appTemplate();
  attachEventHandlers();
  renderUserIndicator();
  renderLoadingBar();
}

async function init() {
  setLoading(true);
  try {
    await hydrateUser();
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
