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

function setLoading(loading) {
  state.loading = loading;
}

function setNotice(message, tone = "info") {
  if (!message) {
    state.notice = null;
    return;
  }
  state.notice = { message, tone };
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
  setNotice("Sign in first to continue this step.", "info");
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

function renderHero() {
  const roleLabel = state.user ? `${h(state.user.displayName)} (${h(state.user.role)})` : "Guest";

  return `
    <section class="hero">
      <h1>Clear fan and creator journeys, powered by your live API.</h1>
      <p>
        Fan flow: discover -> event details -> purchase -> library -> watch.
        Creator flow: event setup -> control room -> rehearsal -> live -> ended.
      </p>
      <p class="muted">Session: ${roleLabel} | API: ${h(state.apiBase)}</p>
      ${state.loading ? `<p class="loading">Loading latest state...</p>` : ""}
      ${
        state.notice
          ? `<div class="notice ${h(state.notice.tone)}">${h(state.notice.message)}</div>`
          : ""
      }
    </section>
  `;
}

function fanJourneyPanel() {
  const eventStepActive = state.route === "event" || state.route === "watch";
  return `
    <article class="panel">
      <h2>Fan Journey</h2>
      <p class="muted">Each step is explicit so users never wonder what to do next.</p>
      <div class="stage-grid">
        <div class="stage ${state.route === "discover" ? "active" : ""}">
          <strong>1. Discover</strong>
          <span>Browse published events.</span>
        </div>
        <div class="stage ${eventStepActive ? "active" : ""}">
          <strong>2. Event Detail</strong>
          <span>Confirm timing, price, and access state.</span>
        </div>
        <div class="stage ${state.route === "library" ? "active" : ""}">
          <strong>3. Library</strong>
          <span>See your purchased events.</span>
        </div>
        <div class="stage ${state.route === "watch" ? "active" : ""}">
          <strong>4. Watch</strong>
          <span>Request entitlement token and enter stream.</span>
        </div>
      </div>
    </article>
  `;
}

function creatorJourneyPanel() {
  const routeActive = state.route === "creator" || state.route === "control";
  return `
    <aside class="panel">
      <h3>Creator Operations</h3>
      <p class="muted">Control room transitions follow API policy: offline -> ready -> live -> ended.</p>
      <ul class="rail-list">
        <li><strong>${routeActive ? "Active" : "Ready"}</strong>: creator dashboard and event setup</li>
        <li><strong>Pre-live</strong>: ingest details + rehearsal checks in control room</li>
        <li><strong>Broadcast</strong>: go live once ready, then end stream deterministically</li>
      </ul>
      <div class="row">
        <button class="btn ghost" data-action="go-discover">Fan View</button>
        <button class="btn ghost" data-action="go-creator">Creator View</button>
      </div>
    </aside>
  `;
}

function discoverView() {
  const publishedEvents = state.events.filter((event) => event.published !== false);
  const cards = publishedEvents
    .map((event) => {
      const ticketLabel = hasTicket(event.id) ? "Ticketed" : "Not Ticketed";
      return `
        <article class="card">
          <div class="media"></div>
          <div class="card-body">
            <div class="row" style="justify-content:space-between;">
              <h3>${h(event.title)}</h3>
              ${statusBadge(event.broadcastState)}
            </div>
            <p class="muted">${h(event.venue)} | ${h(formatDateTime(event.startsAt))}</p>
            <p class="muted">${h(formatMoney(event.priceUsd))} | ${ticketLabel}</p>
            <p>${h(event.description)}</p>
            <div class="row">
              <button class="btn primary" data-action="view-event" data-id="${h(event.id)}">Open Event</button>
              <button class="btn" data-action="buy" data-id="${h(event.id)}">Buy Ticket</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  return `
    <section class="grid">
      ${cards || `<article class="panel"><p>No published events yet.</p></article>`}
    </section>
  `;
}

function eventDetailView(eventId) {
  const event = getEvent(eventId);
  if (!event) {
    return `<section class="panel"><p>Event not found.</p></section>`;
  }

  const userHasTicket = hasTicket(event.id);

  return `
    <section class="layout">
      <article class="panel">
        <div class="row" style="justify-content:space-between;">
          <h2>${h(event.title)}</h2>
          ${statusBadge(event.broadcastState)}
        </div>
        <p class="muted">${h(formatDateTime(event.startsAt))} | ${h(event.venue)}</p>
        <p>${h(event.description)}</p>
        <p><strong>Ticket:</strong> ${h(formatMoney(event.priceUsd))}</p>
        <div class="row">
          <button class="btn primary" data-action="buy" data-id="${h(event.id)}">${userHasTicket ? "Buy Again (No-op)" : "Buy Ticket"}</button>
          <button class="btn" data-action="check-access" data-id="${h(event.id)}">Request Access Token</button>
          <button class="btn" data-action="go-library">Go To Library</button>
          ${canManageEvent(event) ? `<button class="btn" data-action="open-control-room" data-id="${h(event.id)}">Open Control Room</button>` : ""}
        </div>
      </article>

      <aside class="panel">
        <h3>What Happens Next</h3>
        <ul class="rail-list">
          <li>Buy ticket to create entitlement record.</li>
          <li>Use access token check to validate stream permission.</li>
          <li>Watch stream from player page with explicit status messaging.</li>
        </ul>
        ${state.user ? `<p class="muted">Signed in as ${h(state.user.displayName)}.</p>` : `<p class="muted">Sign in before purchase or playback access.</p>`}
        <div class="row">
          <button class="btn ghost" data-action="go-discover">Back To Discover</button>
          ${!state.user ? `<button class="btn" data-action="go-account">Sign In</button>` : ""}
        </div>
      </aside>
    </section>
  `;
}

function libraryView() {
  if (!state.user) {
    return `
      <section class="panel">
        <h2>My Library</h2>
        <p>Sign in to load purchased events.</p>
        <button class="btn primary" data-action="go-account">Go To Account</button>
      </section>
    `;
  }

  const cards = state.libraryEvents
    .map(
      (event) => `
        <article class="card">
          <div class="card-body">
            <h3>${h(event.title)}</h3>
            <p class="muted">${h(formatDateTime(event.startsAt))} | ${h(event.venue)}</p>
            <div class="row">
              <button class="btn" data-action="view-event" data-id="${h(event.id)}">Event Detail</button>
              <button class="btn primary" data-action="check-access" data-id="${h(event.id)}">Enter Stream</button>
            </div>
          </div>
        </article>
      `,
    )
    .join("");

  return `
    <section class="panel">
      <h2>My Library</h2>
      <p class="muted">Source: <code>/me/library</code></p>
    </section>
    <section class="grid">${cards || `<article class="panel"><p>No ticketed events yet.</p></article>`}</section>
  `;
}

function watchView(eventId) {
  const event = getEvent(eventId);
  if (!event) {
    return `<section class="panel"><p>Event not found for playback.</p></section>`;
  }

  const streamInfo = state.streamInfoByEvent[eventId];
  const playerMessage = streamInfo
    ? `Access granted. Path: ${streamInfo.streamPath}. Token expiry: ${streamInfo.expiresInSec}s.`
    : "No playback token yet. Use Request Access Token.";

  const incidentCopy =
    event.broadcastState === "offline"
      ? "Broadcast has not started. Stay on this page and retry access after go-live."
      : event.broadcastState === "ready"
        ? "Creator rehearsal is active. Public stream is opening soon."
        : event.broadcastState === "ended"
          ? "Broadcast ended. Replay access depends on event replay window."
          : "Live stream is active.";

  const chatItems = (state.chat[eventId] || [])
    .map((item) => `<p><strong>${h(item.user)}</strong> ${h(item.message)}</p>`)
    .join("");

  return `
    <section class="layout">
      <article class="panel">
        <div class="row" style="justify-content:space-between;">
          <h2>${h(event.title)}</h2>
          ${statusBadge(event.broadcastState)}
        </div>
        <p class="muted">${h(formatDateTime(event.startsAt))} | ${h(event.venue)}</p>
        <div class="player">
          <div>
            <h3>Playback Surface</h3>
            <p>${h(playerMessage)}</p>
            <p class="muted">${h(incidentCopy)}</p>
          </div>
        </div>
        <div class="row" style="margin-top:0.8rem;">
          <button class="btn primary" data-action="check-access" data-id="${h(event.id)}">Request Access Token</button>
          <button class="btn" data-action="view-event" data-id="${h(event.id)}">Event Detail</button>
        </div>
      </article>

      <aside class="panel side-stack">
        <div>
          <h3>Live Chat (Local Demo)</h3>
          <div>${chatItems || `<p class="muted">No messages yet.</p>`}</div>
        </div>
        <div>
          <input id="chatInput" placeholder="Type message" />
          <button class="btn" data-action="chat-send" data-id="${h(event.id)}">Send</button>
        </div>
      </aside>
    </section>
  `;
}

function creatorView() {
  if (!state.user) {
    return `
      <section class="panel">
        <h2>Creator Studio</h2>
        <p>Sign in as <code>creator</code> or <code>org_admin</code> to manage events.</p>
        <button class="btn primary" data-action="go-account">Go To Account</button>
      </section>
    `;
  }

  if (!isCreatorUser()) {
    return `
      <section class="panel">
        <h2>Creator Studio</h2>
        <p>Your role is <strong>${h(state.user.role)}</strong>. Creator access requires creator/admin role.</p>
      </section>
    `;
  }

  const managedEvents = listManagedEvents();
  const liveCount = managedEvents.filter((event) => event.broadcastState === "live").length;
  const publishedCount = managedEvents.filter((event) => event.published).length;

  const cards = managedEvents
    .map(
      (event) => `
        <article class="card">
          <div class="card-body">
            <div class="row" style="justify-content:space-between;">
              <h4>${h(event.title)}</h4>
              ${statusBadge(event.broadcastState)}
            </div>
            <p class="muted">${h(formatDateTime(event.startsAt))} | ${h(event.venue)}</p>
            <div class="row">
              <button class="btn primary" data-action="open-control-room" data-id="${h(event.id)}">Open Control Room</button>
              <button class="btn" data-action="view-event" data-id="${h(event.id)}">View Fan Page</button>
            </div>
          </div>
        </article>
      `,
    )
    .join("");

  return `
    <section class="panel">
      <h2>Creator Studio Dashboard</h2>
      <p class="muted">Focused operations view for setup, rehearsal, and go-live.</p>
      <div class="kpis">
        <div class="kpi"><p class="label">Managed Events</p><p class="value">${managedEvents.length}</p></div>
        <div class="kpi"><p class="label">Published</p><p class="value">${publishedCount}</p></div>
        <div class="kpi"><p class="label">Live Now</p><p class="value">${liveCount}</p></div>
      </div>
    </section>

    <section class="layout">
      <article class="panel">
        <h3>Create Event</h3>
        <form id="createEventForm">
          <div class="form-grid">
            <label>Title<input name="title" value="Tour Stop Livestream" required /></label>
            <label>Venue<input name="venue" value="Los Angeles, CA" required /></label>
            <label class="span-2">Description<textarea name="description" required>High-energy live set for global fans.</textarea></label>
            <label>Start Time<input name="startsAt" type="datetime-local" value="${getLocalDateTimeInputValue()}" required /></label>
            <label>Duration (min)<input name="durationMin" type="number" value="90" min="30" required /></label>
            <label>Price USD<input name="priceUsd" type="number" value="19.99" step="0.01" min="0" required /></label>
            <label>Replay Hours<input name="replayHours" type="number" value="24" min="0" max="168" required /></label>
          </div>
          <label><input name="published" type="checkbox" checked /> Publish immediately</label>
          <div class="row" style="margin-top:0.45rem;">
            <button class="btn primary" type="submit">Create Event</button>
          </div>
        </form>
      </article>

      <aside class="panel">
        <h3>Managed Events</h3>
        <p class="muted">Open control room to run state transitions.</p>
        <div class="side-stack">
          ${cards || `<p>No managed events visible yet.</p>`}
        </div>
      </aside>
    </section>
  `;
}

function controlRoomView(eventId) {
  const event = getControlRoomEvent(eventId);
  if (!event) {
    return `
      <section class="panel">
        <h2>Control Room</h2>
        <p>Event not found. Open from Creator Studio.</p>
      </section>
    `;
  }

  const broadcastState = event.broadcastState || "offline";
  const canStartRehearsal = broadcastState === "offline";
  const canGoLive = broadcastState === "ready";
  const canEnd = broadcastState === "live";

  return `
    <section class="panel">
      <div class="row" style="justify-content:space-between;">
        <h2>Control Room: ${h(event.title)}</h2>
        ${statusBadge(broadcastState)}
      </div>
      <p class="muted">${h(formatDateTime(event.startsAt))} | ${h(event.venue)}</p>
      <div class="stage-grid">
        <div class="stage ${broadcastState === "offline" ? "active" : ""}"><strong>OFFLINE</strong><span>Event created, waiting for rehearsal.</span></div>
        <div class="stage ${broadcastState === "ready" ? "active" : ""}"><strong>READY</strong><span>Rehearsal active and pre-live checks passing.</span></div>
        <div class="stage ${broadcastState === "live" ? "active" : ""}"><strong>LIVE</strong><span>Public stream is on-air for entitled fans.</span></div>
        <div class="stage ${broadcastState === "ended" ? "active" : ""}"><strong>ENDED</strong><span>Broadcast closed; replay depends on policy.</span></div>
      </div>
    </section>

    <section class="layout">
      <article class="panel">
        <h3>Ingest Setup</h3>
        <label>Server URL<input value="${h(event.ingestUrl || "")}" readonly /></label>
        <label>Stream Key<input value="${h(event.streamKey || "")}" readonly /></label>
        <div class="row">
          <button class="btn" data-action="copy-ingest" data-id="${h(event.id)}">Copy Server URL</button>
          <button class="btn" data-action="copy-key" data-id="${h(event.id)}">Copy Stream Key</button>
        </div>
      </article>

      <aside class="panel">
        <h3>Broadcast Controls</h3>
        <p class="muted">Policy-enforced transitions only.</p>
        <div class="side-stack">
          <button class="btn" data-action="control-start-rehearsal" data-id="${h(event.id)}" ${canStartRehearsal ? "" : "disabled"}>Start Rehearsal</button>
          <button class="btn primary" data-action="control-go-live" data-id="${h(event.id)}" ${canGoLive ? "" : "disabled"}>Go Live</button>
          <button class="btn warn" data-action="control-end" data-id="${h(event.id)}" ${canEnd ? "" : "disabled"}>End Stream</button>
          <button class="btn ghost" data-action="go-creator">Back To Creator Studio</button>
        </div>
      </aside>
    </section>
  `;
}

function accountView() {
  return `
    <section class="layout">
      <article class="panel">
        <h2>Account</h2>
        <p class="muted">Authenticate against API endpoints for role-specific experiences.</p>
        <p>${
          state.user
            ? `Signed in as <strong>${h(state.user.displayName)}</strong> (${h(state.user.role)})`
            : "Not signed in"
        }</p>

        <form id="apiBaseForm">
          <label>API Base URL<input name="apiBase" value="${h(state.apiBase)}" required /></label>
          <button class="btn" type="submit">Save API Base</button>
        </form>

        <div class="row" style="margin-top:1rem;">
          <button class="btn" data-action="logout">Logout</button>
          <button class="btn ghost" data-action="go-discover">Return To Discover</button>
        </div>
      </article>

      <aside class="panel side-stack">
        <div>
          <h3>Sign Up</h3>
          <form id="signupForm">
            <label>Email<input name="email" type="email" required /></label>
            <label>Password<input name="password" type="password" minlength="8" required /></label>
            <label>Display Name<input name="displayName" required /></label>
            <label>Role
              <select name="role">
                <option value="fan">fan</option>
                <option value="creator">creator</option>
                <option value="org_admin">org_admin</option>
                <option value="support_admin">support_admin</option>
              </select>
            </label>
            <label>Organization ID (optional)<input name="organizationId" /></label>
            <button class="btn primary" type="submit">Create Account</button>
          </form>
        </div>

        <div>
          <h3>Login</h3>
          <form id="loginForm">
            <label>Email<input name="email" type="email" required /></label>
            <label>Password<input name="password" type="password" minlength="8" required /></label>
            <button class="btn primary" type="submit">Login</button>
          </form>
        </div>
      </aside>
    </section>
  `;
}

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
    <section class="top-grid">
      ${fanJourneyPanel()}
      ${creatorJourneyPanel()}
    </section>
    ${renderRouteContent()}
  `;
}

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
      setNotice("Logged out.", "success");
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
