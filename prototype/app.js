const state = {
  route: "discover",
  apiBase: localStorage.getItem("ultra_fan_api_base") || "http://localhost:4000",
  token: localStorage.getItem("ultra_fan_token") || "",
  user: null,
  events: [],
  chat: {},
  selectedEventId: null,
  streamInfo: null,
  loading: false,
  error: "",
};

const app = document.getElementById("app");
const navButtons = [...document.querySelectorAll(".nav-btn")];

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    state.route = btn.dataset.route;
    setActiveNav(state.route);
    render();
  });
});

function setActiveNav(route) {
  navButtons.forEach((b) => b.classList.remove("active"));
  if (route.startsWith("stream:") || route === "discover") {
    navButtons.find((b) => b.dataset.route === "discover")?.classList.add("active");
    return;
  }
  if (route.startsWith("control:") || route === "artist") {
    navButtons.find((b) => b.dataset.route === "artist")?.classList.add("active");
    return;
  }
  navButtons.find((b) => b.dataset.route === route)?.classList.add("active");
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusBadge(stateLabel) {
  const tone =
    stateLabel === "live"
      ? "danger"
      : stateLabel === "ready"
        ? "success"
        : stateLabel === "rehearsal"
          ? "warm"
          : "neutral";
  return `<span class="badge ${tone}">${stateLabel.toUpperCase()}</span>`;
}

function setLoading(loading) {
  state.loading = loading;
  render();
}

async function apiRequest(path, opts = {}) {
  const headers = {
    "content-type": "application/json",
    ...(opts.headers || {}),
  };

  const useAuth = opts.auth !== false;
  if (useAuth && state.token) {
    headers.authorization = `Bearer ${state.token}`;
  }

  const res = await fetch(`${state.apiBase}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || `Request failed (${res.status})`);
  }
  return payload;
}

function requireAuthRoute() {
  if (!state.token) {
    state.route = "account";
    setActiveNav("account");
    render();
    return false;
  }
  return true;
}

function authSummary() {
  if (!state.user) {
    return `<p class="muted">Not signed in. Use Account tab to log in.</p>`;
  }
  return `<p class="muted">Signed in as <strong>${state.user.displayName}</strong> (${state.user.role})</p>`;
}

async function refreshEvents() {
  try {
    const data = await apiRequest("/events", { auth: false });
    state.events = data.events || [];
  } catch (err) {
    state.error = err.message;
  }
}

async function hydrateUser() {
  if (!state.token) return;
  try {
    const me = await apiRequest("/me");
    state.user = me.user;
  } catch {
    state.token = "";
    state.user = null;
    localStorage.removeItem("ultra_fan_token");
  }
}

function discoverView() {
  const cards = state.events
    .map((event) => {
      return `
      <article class="card">
        <div class="media"></div>
        <div class="card-body">
          <h3>${event.title}</h3>
          <p class="muted">${event.venue}</p>
          <p class="muted">${formatDateTime(event.startsAt)} • $${event.priceUsd}</p>
          <p>${event.description}</p>
          <div class="row">
            <button class="btn primary" data-action="buy" data-id="${event.id}">Buy Virtual Ticket</button>
            <button class="btn" data-action="watch" data-id="${event.id}">Watch / Check Access</button>
          </div>
        </div>
      </article>
      `;
    })
    .join("");

  return `
    <section class="hero">
      <h1>Concerts without geography limits</h1>
      <p>Real API connected: events, tickets, entitlements, and creator control-room actions.</p>
      ${authSummary()}
      <p class="muted">API: ${state.apiBase}</p>
    </section>
    <section class="grid">${cards || "<p>No published events yet.</p>"}</section>
  `;
}

function libraryView() {
  if (!state.user) {
    return `<p>Please sign in to view your library.</p>`;
  }
  const items = state.events
    .map(
      (event) => `
    <article class="card">
      <div class="card-body">
        <h3>${event.title}</h3>
        <p class="muted">${formatDateTime(event.startsAt)}</p>
        <button class="btn primary" data-action="watch" data-id="${event.id}">Check Stream Access</button>
      </div>
    </article>
  `,
    )
    .join("");

  return `
    <h2>My Library</h2>
    <p class="muted">Uses /me/library and /events/:id/access-token.</p>
    <div class="grid">${items || "<p>No events found.</p>"}</div>
  `;
}

function streamView(eventId) {
  const event = state.events.find((e) => e.id === eventId);
  if (!event) return `<p>Event not found.</p>`;

  const chat = (state.chat[eventId] || [])
    .map((msg) => `<p><strong>${msg.user}</strong> ${msg.message}</p>`)
    .join("");

  const streamMsg = state.streamInfo
    ? `Access granted for ${state.streamInfo.eventId}. Expires in ${state.streamInfo.expiresInSec}s.`
    : "No access token yet. Click Check Access.";

  return `
    <h2>${event.title}</h2>
    <p class="muted">${formatDateTime(event.startsAt)} • ${streamMsg}</p>
    <section class="layout">
      <div>
        <div class="player">
          <div>
            <p>Live Player Prototype</p>
            <p class="muted">${state.streamInfo ? `Stream path: ${state.streamInfo.streamPath}` : "Awaiting entitlement token."}</p>
          </div>
        </div>
        <div class="row" style="margin-top:0.75rem;">
          <button class="btn" data-action="check-access" data-id="${event.id}">Check Access Token</button>
        </div>
      </div>
      <aside class="chat">
        <h3>Live Chat (Local Demo)</h3>
        <div>${chat}</div>
        <input id="chatInput" placeholder="Type a message" />
        <button class="btn primary" data-action="chat-send" data-id="${event.id}">Send</button>
      </aside>
    </section>
  `;
}

function artistView() {
  if (!state.user) {
    return `<p>Sign in as creator/org_admin to use Creator Studio.</p>`;
  }
  if (!["creator", "org_admin", "support_admin"].includes(state.user.role)) {
    return `<p>Your role is <strong>${state.user.role}</strong>. Creator Studio requires creator/admin role.</p>`;
  }

  const eventRows = state.events
    .map(
      (event) => `
      <article class="card">
        <div class="card-body">
          <div class="row" style="justify-content:space-between;">
            <h3>${event.title}</h3>
            ${statusBadge(event.broadcastState)}
          </div>
          <p class="muted">${formatDateTime(event.startsAt)} • ${event.venue}</p>
          <div class="row">
            <button class="btn primary" data-action="open-control-room" data-id="${event.id}">Open Control Room</button>
          </div>
        </div>
      </article>
      `,
    )
    .join("");

  return `
    <h2>Creator Studio</h2>
    ${authSummary()}

    <section class="card" style="margin-bottom:1rem;">
      <div class="card-body">
        <h3>Create Event</h3>
        <form id="createEventForm">
          <label>Title<input name="title" value="New Tour Show" required /></label>
          <label>Description<textarea name="description" required>Live concert event for remote fans.</textarea></label>
          <label>Venue<input name="venue" value="Miami, FL" required /></label>
          <label>Start Time<input name="startsAt" type="datetime-local" required /></label>
          <label>Duration (minutes)<input name="durationMin" type="number" value="90" required /></label>
          <label>Ticket Price (USD)<input name="priceUsd" type="number" step="0.01" value="14.99" required /></label>
          <label>Replay Hours<input name="replayHours" type="number" value="24" required /></label>
          <label><input name="published" type="checkbox" checked /> Published</label>
          <button class="btn primary" type="submit">Create Event</button>
        </form>
      </div>
    </section>

    <section class="grid">${eventRows || "<p>No events yet.</p>"}</section>
  `;
}

function controlRoomView(eventId) {
  const event = state.events.find((e) => e.id === eventId);
  if (!event) return `<p>Control room event not found.</p>`;

  return `
    <div class="row" style="justify-content:space-between;align-items:flex-start;">
      <div>
        <h2>Control Room: ${event.title}</h2>
        <p class="muted">${formatDateTime(event.startsAt)} • ${event.venue}</p>
      </div>
      ${statusBadge(event.broadcastState)}
    </div>

    <section class="layout">
      <div>
        <div class="card">
          <div class="card-body">
            <h3>Ingest Setup</h3>
            <label>Server URL<input value="${event.ingestUrl}" readonly /></label>
            <label>Stream Key<input value="${event.streamKey}" readonly /></label>
            <div class="row">
              <button class="btn" data-action="copy-ingest" data-id="${event.id}">Copy Server URL</button>
              <button class="btn" data-action="copy-key" data-id="${event.id}">Copy Stream Key</button>
            </div>
          </div>
        </div>

        <div class="card" style="margin-top:1rem;">
          <div class="card-body">
            <h3>Broadcast Controls</h3>
            <div class="row">
              <button class="btn" data-action="start-rehearsal" data-id="${event.id}">Start Rehearsal</button>
              <button class="btn primary" data-action="go-live" data-id="${event.id}">Go Live</button>
              <button class="btn" data-action="end-live" data-id="${event.id}">End Stream</button>
            </div>
          </div>
        </div>
      </div>

      <aside>
        <div class="card">
          <div class="card-body">
            <h3>Current State</h3>
            <p class="muted">Broadcast: ${event.broadcastState}</p>
            <p class="muted">Rehearsal: ${event.rehearsalActive ? "Active" : "Off"}</p>
          </div>
        </div>
      </aside>
    </section>
  `;
}

function accountView() {
  return `
    <h2>Account</h2>
    <p class="muted">Connects to real API auth endpoints.</p>
    ${authSummary()}

    <section class="card" style="margin-bottom:1rem;">
      <div class="card-body">
        <h3>API Settings</h3>
        <form id="apiBaseForm">
          <label>API Base URL<input name="apiBase" value="${state.apiBase}" /></label>
          <button class="btn" type="submit">Save API Base</button>
        </form>
      </div>
    </section>

    <section class="grid">
      <article class="card">
        <div class="card-body">
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
      </article>

      <article class="card">
        <div class="card-body">
          <h3>Login</h3>
          <form id="loginForm">
            <label>Email<input name="email" type="email" required /></label>
            <label>Password<input name="password" type="password" minlength="8" required /></label>
            <button class="btn primary" type="submit">Login</button>
          </form>
          <button class="btn" data-action="logout">Logout</button>
        </div>
      </article>
    </section>
  `;
}

function routeTemplate() {
  if (state.route.startsWith("stream:")) return streamView(state.route.split(":")[1]);
  if (state.route.startsWith("control:")) return controlRoomView(state.route.split(":")[1]);
  if (state.route === "discover") return discoverView();
  if (state.route === "library") return libraryView();
  if (state.route === "artist") return artistView();
  return accountView();
}

function copyText(text, label) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      alert(`${label} copied.`);
    });
    return;
  }
  alert(`${label}: ${text}`);
}

async function onBuy(id) {
  if (!requireAuthRoute()) return;
  setLoading(true);
  try {
    await apiRequest(`/events/${id}/purchase`, { method: "POST" });
    alert("Ticket purchased.");
  } catch (err) {
    alert(err.message);
  } finally {
    setLoading(false);
  }
}

async function onCheckAccess(id) {
  if (!requireAuthRoute()) return;
  setLoading(true);
  try {
    const data = await apiRequest(`/events/${id}/access-token`);
    state.streamInfo = data;
    state.route = `stream:${id}`;
    setActiveNav(state.route);
    render();
  } catch (err) {
    alert(err.message);
  } finally {
    setLoading(false);
  }
}

async function onControlAction(id, actionPath) {
  if (!requireAuthRoute()) return;
  setLoading(true);
  try {
    await apiRequest(`/events/${id}${actionPath}`, { method: "POST" });
    await refreshEvents();
    state.route = `control:${id}`;
    render();
  } catch (err) {
    alert(err.message);
  } finally {
    setLoading(false);
  }
}

function attachEventHandlers() {
  [...app.querySelectorAll("[data-action='buy']")].forEach((btn) => {
    btn.addEventListener("click", () => onBuy(btn.dataset.id));
  });

  [...app.querySelectorAll("[data-action='watch']")].forEach((btn) => {
    btn.addEventListener("click", () => onCheckAccess(btn.dataset.id));
  });

  [...app.querySelectorAll("[data-action='check-access']")].forEach((btn) => {
    btn.addEventListener("click", () => onCheckAccess(btn.dataset.id));
  });

  [...app.querySelectorAll("[data-action='open-control-room']")].forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!requireAuthRoute()) return;
      state.selectedEventId = btn.dataset.id;
      state.route = `control:${btn.dataset.id}`;
      setActiveNav("artist");
      render();
    });
  });

  [...app.querySelectorAll("[data-action='copy-ingest']")].forEach((btn) => {
    btn.addEventListener("click", () => {
      const event = state.events.find((e) => e.id === btn.dataset.id);
      if (event) copyText(event.ingestUrl, "Server URL");
    });
  });

  [...app.querySelectorAll("[data-action='copy-key']")].forEach((btn) => {
    btn.addEventListener("click", () => {
      const event = state.events.find((e) => e.id === btn.dataset.id);
      if (event) copyText(event.streamKey, "Stream key");
    });
  });

  [...app.querySelectorAll("[data-action='start-rehearsal']")].forEach((btn) => {
    btn.addEventListener("click", () =>
      onControlAction(btn.dataset.id, "/broadcast/rehearsal/start"),
    );
  });

  [...app.querySelectorAll("[data-action='go-live']")].forEach((btn) => {
    btn.addEventListener("click", () => onControlAction(btn.dataset.id, "/broadcast/go-live"));
  });

  [...app.querySelectorAll("[data-action='end-live']")].forEach((btn) => {
    btn.addEventListener("click", () => onControlAction(btn.dataset.id, "/broadcast/end"));
  });

  [...app.querySelectorAll("[data-action='chat-send']")].forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const input = document.getElementById("chatInput");
      if (!input.value.trim()) return;
      state.chat[id] = state.chat[id] || [];
      state.chat[id].push({ user: state.user ? `@${state.user.displayName}` : "@you", message: input.value.trim() });
      render();
    });
  });

  [...app.querySelectorAll("[data-action='logout']")].forEach((btn) => {
    btn.addEventListener("click", () => {
      state.token = "";
      state.user = null;
      localStorage.removeItem("ultra_fan_token");
      alert("Logged out.");
      render();
    });
  });

  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(signupForm);
      const body = {
        email: String(fd.get("email") || "").trim(),
        password: String(fd.get("password") || ""),
        displayName: String(fd.get("displayName") || "").trim(),
        role: String(fd.get("role") || "fan"),
      };
      const organizationId = String(fd.get("organizationId") || "").trim();
      if (organizationId) body.organizationId = organizationId;

      setLoading(true);
      try {
        const data = await apiRequest("/auth/signup", { method: "POST", body, auth: false });
        state.token = data.accessToken;
        state.user = data.user;
        localStorage.setItem("ultra_fan_token", state.token);
        await refreshEvents();
        state.route = "discover";
        setActiveNav("discover");
        render();
      } catch (err) {
        alert(err.message);
      } finally {
        setLoading(false);
      }
    });
  }

  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(loginForm);
      const body = {
        email: String(fd.get("email") || "").trim(),
        password: String(fd.get("password") || ""),
      };
      setLoading(true);
      try {
        const data = await apiRequest("/auth/login", { method: "POST", body, auth: false });
        state.token = data.accessToken;
        state.user = data.user;
        localStorage.setItem("ultra_fan_token", state.token);
        await refreshEvents();
        state.route = "discover";
        setActiveNav("discover");
        render();
      } catch (err) {
        alert(err.message);
      } finally {
        setLoading(false);
      }
    });
  }

  const apiBaseForm = document.getElementById("apiBaseForm");
  if (apiBaseForm) {
    apiBaseForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(apiBaseForm);
      state.apiBase = String(fd.get("apiBase") || "").trim();
      localStorage.setItem("ultra_fan_api_base", state.apiBase);
      await refreshEvents();
      render();
    });
  }

  const createEventForm = document.getElementById("createEventForm");
  if (createEventForm) {
    createEventForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(createEventForm);
      const localStart = String(fd.get("startsAt") || "");
      const startsAt = localStart ? new Date(localStart).toISOString() : "";
      const body = {
        title: String(fd.get("title") || "").trim(),
        description: String(fd.get("description") || "").trim(),
        venue: String(fd.get("venue") || "").trim(),
        startsAt,
        durationMin: Number(fd.get("durationMin") || 90),
        priceUsd: Number(fd.get("priceUsd") || 0),
        replayHours: Number(fd.get("replayHours") || 0),
        published: Boolean(fd.get("published")),
      };

      setLoading(true);
      try {
        await apiRequest("/events", { method: "POST", body });
        await refreshEvents();
        alert("Event created.");
        render();
      } catch (err) {
        alert(err.message);
      } finally {
        setLoading(false);
      }
    });
  }
}

function render() {
  const errBanner = state.error ? `<p class="muted" style="color:#a32612;">${state.error}</p>` : "";
  const loadingBanner = state.loading ? `<p class="muted">Loading...</p>` : "";
  app.innerHTML = `${loadingBanner}${errBanner}${routeTemplate()}`;
  attachEventHandlers();
}

async function init() {
  await hydrateUser();
  await refreshEvents();
  setActiveNav(state.route);
  render();
}

init();
