const state = {
  route: "discover",
  fan: {
    id: "fan-1",
    name: "Remote Fan",
    purchasedEventIds: ["evt-1"],
  },
  events: [
    {
      id: "evt-1",
      title: "Aster Lane: Skyline Live",
      artist: "Aster Lane",
      startsAt: "2026-03-14T21:00:00-05:00",
      durationMin: 105,
      priceUsd: 14.99,
      status: "published",
      replayHours: 24,
      description:
        "Live from Brooklyn. Full-band set with a post-show acoustic encore for virtual fans.",
      venue: "Brooklyn, NY",
      ingestUrl: "rtmps://ingest.ultrafan.live/app",
      streamKey: "uf_evt1_9xk2_a1b9_live",
      broadcastState: "ready",
      encoderConnected: true,
      rehearsal: false,
      health: {
        audio: true,
        bitrateKbps: 4500,
        keyframeOk: true,
      },
    },
    {
      id: "evt-2",
      title: "Neon Harbor: Night Drive Session",
      artist: "Neon Harbor",
      startsAt: "2026-03-22T20:00:00-08:00",
      durationMin: 90,
      priceUsd: 11.99,
      status: "published",
      replayHours: 0,
      description: "Synth-pop headline show with visuals and fan shout-outs.",
      venue: "Los Angeles, CA",
      ingestUrl: "rtmps://ingest.ultrafan.live/app",
      streamKey: "uf_evt2_7nm4_b4t7_live",
      broadcastState: "offline",
      encoderConnected: false,
      rehearsal: false,
      health: {
        audio: false,
        bitrateKbps: 0,
        keyframeOk: false,
      },
    },
  ],
  chat: {
    "evt-1": [
      { user: "@mia", message: "Audio is clean. Let’s go!" },
      { user: "@leo", message: "Watching from Seattle." },
    ],
  },
};

const app = document.getElementById("app");
const navButtons = [...document.querySelectorAll(".nav-btn")];

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    state.route = btn.dataset.route;
    setActiveNav(btn.dataset.route);
    render();
  });
});

function setActiveNav(route) {
  navButtons.forEach((b) => b.classList.remove("active"));
  if (route === "discover" || route.startsWith("stream:")) {
    navButtons.find((b) => b.dataset.route === "discover")?.classList.add("active");
    return;
  }
  if (route === "library") {
    navButtons.find((b) => b.dataset.route === "library")?.classList.add("active");
    return;
  }
  navButtons.find((b) => b.dataset.route === "artist")?.classList.add("active");
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

function discoverView() {
  const cards = state.events
    .map((event) => {
      const owned = state.fan.purchasedEventIds.includes(event.id);
      return `
      <article class="card">
        <div class="media"></div>
        <div class="card-body">
          <h3>${event.title}</h3>
          <p class="muted">${event.artist} • ${event.venue}</p>
          <p class="muted">${formatDateTime(event.startsAt)} • $${event.priceUsd}</p>
          <p>${event.description}</p>
          <div class="row">
            <button class="btn ${owned ? "" : "primary"}" data-action="${owned ? "watch" : "buy"}" data-id="${event.id}">
              ${owned ? "Watch Live" : `Buy Virtual Ticket ($${event.priceUsd})`}
            </button>
          </div>
        </div>
      </article>
      `;
    })
    .join("");

  return `
    <section class="hero">
      <h1>Concerts without geography limits</h1>
      <p>Buy access, join live, and support artists from anywhere.</p>
    </section>
    <section class="grid">${cards}</section>
  `;
}

function libraryView() {
  const ownedEvents = state.events.filter((event) =>
    state.fan.purchasedEventIds.includes(event.id),
  );

  if (!ownedEvents.length) {
    return `<p>You have no tickets yet.</p>`;
  }

  const items = ownedEvents
    .map(
      (event) => `
    <article class="card">
      <div class="card-body">
        <h3>${event.title}</h3>
        <p class="muted">${formatDateTime(event.startsAt)} • Replay: ${event.replayHours || 0}h</p>
        <button class="btn primary" data-action="watch" data-id="${event.id}">Enter Stream</button>
      </div>
    </article>
  `,
    )
    .join("");

  return `
    <h2>My Virtual Tickets</h2>
    <div class="grid">${items}</div>
  `;
}

function streamView(eventId) {
  const event = state.events.find((e) => e.id === eventId);
  if (!event) return `<p>Event not found.</p>`;

  const entitled = state.fan.purchasedEventIds.includes(eventId);
  if (!entitled) {
    return `
      <h2>${event.title}</h2>
      <p class="muted">You need a valid ticket to watch this stream.</p>
      <button class="btn primary" data-action="buy" data-id="${event.id}">Buy Ticket</button>
    `;
  }

  const chat = (state.chat[eventId] || [])
    .map((msg) => `<p><strong>${msg.user}</strong> ${msg.message}</p>`)
    .join("");

  const playbackMsg =
    event.broadcastState === "live"
      ? "Live broadcast is active"
      : "Stream is not live yet. Fans can join as soon as artist goes live.";

  return `
    <h2>${event.title}</h2>
    <p class="muted">${event.artist} • ${formatDateTime(event.startsAt)} • ${playbackMsg}</p>
    <section class="layout">
      <div>
        <div class="player">
          <div>
            <p>Live Player Prototype</p>
            <p class="muted">In production: tokenized HLS playback + low latency CDN delivery.</p>
          </div>
        </div>
        <div class="row" style="margin-top:0.75rem;">
          <button class="btn" data-action="react" data-id="${event.id}">Send ❤️</button>
          <button class="btn" data-action="react" data-id="${event.id}">Send 🔥</button>
        </div>
      </div>
      <aside class="chat">
        <h3>Live Chat</h3>
        <div>${chat}</div>
        <input id="chatInput" placeholder="Type a message" />
        <button class="btn primary" data-action="chat-send" data-id="${event.id}">Send</button>
      </aside>
    </section>
  `;
}

function artistView() {
  const sold = state.events.reduce((sum, e) => {
    const base = state.fan.purchasedEventIds.includes(e.id) ? 1 : 0;
    return sum + base;
  }, 0);

  const revenue = state.events
    .filter((e) => state.fan.purchasedEventIds.includes(e.id))
    .reduce((sum, e) => sum + e.priceUsd, 0)
    .toFixed(2);

  const eventRows = state.events
    .map(
      (event) => `
      <article class="card">
        <div class="card-body">
          <div class="row" style="justify-content:space-between;">
            <h3>${event.title}</h3>
            ${statusBadge(event.rehearsal ? "rehearsal" : event.broadcastState)}
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
    <p class="muted">Professional live setup with ingest tools, preflight checks, and go-live controls.</p>

    <section class="kpis">
      <div class="kpi"><p class="muted">Tickets Sold</p><h3>${sold}</h3></div>
      <div class="kpi"><p class="muted">Gross Revenue</p><h3>$${revenue}</h3></div>
      <div class="kpi"><p class="muted">Current Viewers</p><h3>184</h3></div>
      <div class="kpi"><p class="muted">Peak Viewers</p><h3>612</h3></div>
    </section>

    <section class="grid" style="margin-top:1rem;">${eventRows}</section>
  `;
}

function controlRoomView(eventId) {
  const event = state.events.find((e) => e.id === eventId);
  if (!event) return `<p>Control room event not found.</p>`;

  const healthChecks = [
    {
      label: "Encoder connected",
      ok: event.encoderConnected,
    },
    {
      label: "Audio signal detected",
      ok: event.health.audio,
    },
    {
      label: "Bitrate stable (>= 2500 kbps)",
      ok: event.health.bitrateKbps >= 2500,
    },
    {
      label: "Keyframe interval OK",
      ok: event.health.keyframeOk,
    },
  ];

  const checklist = healthChecks
    .map((item) => `<li class="${item.ok ? "ok" : "warn"}">${item.ok ? "PASS" : "FAIL"} • ${item.label}</li>`)
    .join("");

  return `
    <div class="row" style="justify-content:space-between;align-items:flex-start;">
      <div>
        <h2>Control Room: ${event.title}</h2>
        <p class="muted">${event.artist} • ${formatDateTime(event.startsAt)} • ${event.venue}</p>
      </div>
      ${statusBadge(event.rehearsal ? "rehearsal" : event.broadcastState)}
    </div>

    <section class="layout">
      <div>
        <div class="card">
          <div class="card-body">
            <h3>Ingest Setup (OBS / Streamlabs)</h3>
            <label>Server URL<input value="${event.ingestUrl}" readonly /></label>
            <label>Stream Key<input value="${event.streamKey}" readonly /></label>
            <div class="row">
              <button class="btn" data-action="copy-ingest" data-id="${event.id}">Copy Server URL</button>
              <button class="btn" data-action="copy-key" data-id="${event.id}">Copy Stream Key</button>
              <button class="btn" data-action="regen-key" data-id="${event.id}">Regenerate Key</button>
            </div>
          </div>
        </div>

        <div class="card" style="margin-top:1rem;">
          <div class="card-body">
            <h3>Broadcast Controls</h3>
            <div class="row">
              <button class="btn" data-action="simulate-encoder" data-id="${event.id}">
                ${event.encoderConnected ? "Simulate Disconnect" : "Simulate Encoder Connect"}
              </button>
              <button class="btn" data-action="start-rehearsal" data-id="${event.id}">Start Rehearsal</button>
              <button class="btn primary" data-action="go-live" data-id="${event.id}">Go Live</button>
              <button class="btn" data-action="end-live" data-id="${event.id}">End Stream</button>
            </div>
            <p class="muted">Professional workflow: connect encoder -> pass checks -> rehearsal preview -> go live.</p>
          </div>
        </div>
      </div>

      <aside>
        <div class="card">
          <div class="card-body">
            <h3>Preflight Health</h3>
            <ul class="checklist">${checklist}</ul>
            <p class="muted">Current bitrate: ${event.health.bitrateKbps} kbps</p>
          </div>
        </div>

        <div class="card" style="margin-top:1rem;">
          <div class="card-body">
            <h3>Private Preview</h3>
            <div class="player compact">
              <p>${event.rehearsal ? "Rehearsal feed active" : "Preview waiting for rehearsal"}</p>
            </div>
          </div>
        </div>
      </aside>
    </section>
  `;
}

function routeTemplate() {
  if (state.route.startsWith("stream:")) return streamView(state.route.split(":")[1]);
  if (state.route.startsWith("control:")) return controlRoomView(state.route.split(":")[1]);
  if (state.route === "discover") return discoverView();
  if (state.route === "library") return libraryView();
  return artistView();
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

function render() {
  app.innerHTML = routeTemplate();

  [...app.querySelectorAll("[data-action='buy']")].forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (!state.fan.purchasedEventIds.includes(id)) state.fan.purchasedEventIds.push(id);
      alert("Prototype checkout complete. Ticket added to your library.");
      state.route = `stream:${id}`;
      setActiveNav(state.route);
      render();
    });
  });

  [...app.querySelectorAll("[data-action='watch']")].forEach((btn) => {
    btn.addEventListener("click", () => {
      state.route = `stream:${btn.dataset.id}`;
      setActiveNav(state.route);
      render();
    });
  });

  [...app.querySelectorAll("[data-action='open-control-room']")].forEach((btn) => {
    btn.addEventListener("click", () => {
      state.route = `control:${btn.dataset.id}`;
      setActiveNav("artist");
      render();
    });
  });

  [...app.querySelectorAll("[data-action='chat-send']")].forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const input = document.getElementById("chatInput");
      if (!input.value.trim()) return;
      state.chat[id] = state.chat[id] || [];
      state.chat[id].push({ user: "@you", message: input.value.trim() });
      render();
    });
  });

  [...app.querySelectorAll("[data-action='react']")].forEach((btn) => {
    btn.addEventListener("click", () => alert("Reaction sent."));
  });

  [...app.querySelectorAll("[data-action='copy-ingest']")].forEach((btn) => {
    btn.addEventListener("click", () => {
      const event = state.events.find((e) => e.id === btn.dataset.id);
      copyText(event.ingestUrl, "Server URL");
    });
  });

  [...app.querySelectorAll("[data-action='copy-key']")].forEach((btn) => {
    btn.addEventListener("click", () => {
      const event = state.events.find((e) => e.id === btn.dataset.id);
      copyText(event.streamKey, "Stream key");
    });
  });

  [...app.querySelectorAll("[data-action='regen-key']")].forEach((btn) => {
    btn.addEventListener("click", () => {
      const event = state.events.find((e) => e.id === btn.dataset.id);
      event.streamKey = `${event.streamKey.slice(0, 8)}_${Math.random().toString(36).slice(2, 8)}`;
      alert("Stream key regenerated.");
      render();
    });
  });

  [...app.querySelectorAll("[data-action='simulate-encoder']")].forEach((btn) => {
    btn.addEventListener("click", () => {
      const event = state.events.find((e) => e.id === btn.dataset.id);
      event.encoderConnected = !event.encoderConnected;
      event.health.audio = event.encoderConnected;
      event.health.bitrateKbps = event.encoderConnected ? 4200 : 0;
      event.health.keyframeOk = event.encoderConnected;
      if (!event.encoderConnected) {
        event.rehearsal = false;
        if (event.broadcastState === "live") event.broadcastState = "ready";
      } else {
        event.broadcastState = "ready";
      }
      render();
    });
  });

  [...app.querySelectorAll("[data-action='start-rehearsal']")].forEach((btn) => {
    btn.addEventListener("click", () => {
      const event = state.events.find((e) => e.id === btn.dataset.id);
      if (!event.encoderConnected) {
        alert("Connect encoder first.");
        return;
      }
      event.rehearsal = true;
      alert("Rehearsal started. This preview is private.");
      render();
    });
  });

  [...app.querySelectorAll("[data-action='go-live']")].forEach((btn) => {
    btn.addEventListener("click", () => {
      const event = state.events.find((e) => e.id === btn.dataset.id);
      const healthy =
        event.encoderConnected &&
        event.health.audio &&
        event.health.keyframeOk &&
        event.health.bitrateKbps >= 2500;
      if (!healthy) {
        alert("Preflight checks failed. Fix encoder/quality settings before going live.");
        return;
      }
      event.broadcastState = "live";
      event.rehearsal = false;
      alert("Broadcast is now LIVE.");
      render();
    });
  });

  [...app.querySelectorAll("[data-action='end-live']")].forEach((btn) => {
    btn.addEventListener("click", () => {
      const event = state.events.find((e) => e.id === btn.dataset.id);
      event.broadcastState = "ended";
      event.rehearsal = false;
      alert("Broadcast ended.");
      render();
    });
  });
}

render();
