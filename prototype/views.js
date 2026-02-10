import {
  state,
  isCreatorUser,
  canManageEvent,
  listManagedEvents,
  hasTicket,
  getEvent,
  getControlRoomEvent,
  getArtistProfile,
  getArtistEvents,
} from "./state.js";
import {
  h,
  formatDateTime,
  formatMoney,
  getLocalDateTimeInputValue,
  statusBadge,
  renderAvatarMarkup,
} from "./utils.js";
import { renderChatMessagesMarkup } from "./chat.js";
import { getCameraStream } from "./media.js";

export function renderHero() {
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

export function discoverView() {
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

export function eventDetailView(eventId) {
  const event = getEvent(eventId);
  if (!event) {
    return `<section class="panel" style="text-align:center;padding:3rem;"><p class="muted">Event not found.</p></section>`;
  }

  const userHasTicket = hasTicket(event.id);
  const artist = getArtistProfile(event.artistUserId);
  const artistName = artist?.displayName || "Featured Artist";
  const artistBio =
    artist?.bio ||
    "Creator profile coming soon. Check back for artist updates and story.";
  const artistImage = artist?.profileImageUrl;

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
        <h3>Hosted By</h3>
        <div style="display:flex;gap:0.75rem;align-items:center;margin-top:0.75rem;">
          ${renderAvatarMarkup({
            displayName: artistName,
            imageUrl: artistImage,
            className: "avatar avatar-host",
            alt: `${artistName} profile picture`,
          })}
          <div>
            <p style="font-weight:700;color:var(--ink);">${h(artistName)}</p>
            <p class="muted" style="font-size:0.83rem;">${artist?.hometown ? h(artist.hometown) : "Global livestream artist"}</p>
          </div>
        </div>
        <p class="muted" style="margin-top:0.7rem;font-size:0.86rem;line-height:1.45;">${h(artistBio)}</p>
        <div class="row" style="margin-top:0.75rem;">
          <button class="btn" data-action="view-artist" data-id="${h(event.artistUserId)}">View Artist Page</button>
          ${
            artist?.websiteUrl
              ? `<a class="btn ghost" href="${h(artist.websiteUrl)}" target="_blank" rel="noreferrer">Official Site</a>`
              : ""
          }
        </div>
        <hr style="border:none;border-top:1px solid var(--line);margin:1rem 0;" />
        <h3 style="font-size:1rem;">Event Info</h3>
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

export function artistProfileView(artistUserId) {
  const artist = getArtistProfile(artistUserId);
  if (!artist) {
    return `
      <section class="panel" style="text-align:center;padding:3rem;">
        <h2>Artist Profile</h2>
        <p class="muted">Artist profile not found.</p>
        <button class="btn" data-action="go-discover">Back to Discover</button>
      </section>
    `;
  }

  const events = getArtistEvents(artistUserId);
  const cards = events
    .map(
      (event) => `
        <article class="card">
          <div class="media">
            ${event.imageUrl ? `<img src="${h(event.imageUrl)}" alt="${h(event.title)}" />` : ""}
            <div class="card-badge">${statusBadge(event.broadcastState)}</div>
          </div>
          <div class="card-body">
            <h3>${h(event.title)}</h3>
            <p class="card-meta">${h(event.venue)} &middot; ${h(formatDateTime(event.startsAt))}</p>
            <p class="card-price">${formatMoney(event.priceUsd)}</p>
            <div class="card-actions">
              <button class="btn primary" data-action="view-event" data-id="${h(event.id)}">View Event</button>
              <button class="btn" data-action="buy" data-id="${h(event.id)}">Get Ticket</button>
            </div>
          </div>
        </article>
      `,
    )
    .join("");

  return `
    <section class="hero" style="${artist.profileImageUrl ? `background-image:linear-gradient(rgba(10,10,15,0.55),rgba(10,10,15,0.78)),url('${h(artist.profileImageUrl)}');background-size:cover;background-position:center;` : ""}">
      <h1>${h(artist.displayName)}</h1>
      <p class="hero-subtitle">${h(artist.hometown || "Global livestream artist")}</p>
      <p class="hero-subtitle" style="max-width:760px;">${h(artist.bio || "This artist has not added a bio yet.")}</p>
      <div class="hero-cta">
        ${artist.websiteUrl ? `<a class="btn" href="${h(artist.websiteUrl)}" target="_blank" rel="noreferrer">Official Website</a>` : ""}
        <button class="btn ghost" data-action="go-discover">Back to Discover</button>
      </div>
    </section>

    <div style="margin-top:1.5rem;">
      <h2 class="section-title">Upcoming and Live Events</h2>
      <p class="section-subtitle">${events.length} event${events.length === 1 ? "" : "s"} from this artist</p>
    </div>
    <section class="grid">
      ${cards || `<article class="panel" style="grid-column:1/-1;text-align:center;padding:3rem;"><p class="muted">No published events for this artist yet.</p></article>`}
    </section>
  `;
}

export function libraryView() {
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

export function watchView(eventId) {
  const event = getEvent(eventId);
  if (!event) {
    return `<section class="panel" style="text-align:center;padding:3rem;"><p class="muted">Event not found.</p></section>`;
  }

  const streamInfo = state.streamInfoByEvent[eventId];
  const hasAccess = Boolean(streamInfo);

  let playerContent;
  if (event.broadcastState === "live" && hasAccess) {
    playerContent = `
      <video
        id="hlsPlayer"
        class="hls-video"
        controls
        autoplay
        playsinline
      ></video>
      <div class="player-overlay" id="playerOverlay">
        <p class="player-status">Connecting to stream...</p>
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

  const chatItems = renderChatMessagesMarkup(eventId);
  const chatHint = state.token
    ? "Realtime and synced across devices."
    : "Sign in with a ticketed account to join live chat.";

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
        <p class="muted" style="font-size:0.8rem;margin:0 0 0.5rem 0;">${h(chatHint)}</p>
        <div id="chatMessages" class="chat-messages">${chatItems}</div>
        <div class="chat-input-row">
          <input id="chatInput" placeholder="Say something..." ${state.token ? "" : "disabled"} />
          <button class="btn" data-action="chat-send" data-id="${h(event.id)}" ${state.token ? "" : "disabled"}>Send</button>
        </div>
      </aside>
    </section>
  `;
}

export function creatorView() {
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
            <label class="span-2">Or upload from device<input name="imageFile" type="file" accept="image/jpeg,image/png,image/gif,image/webp" /></label>
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

export function controlRoomView(eventId) {
  const event = getControlRoomEvent(eventId);
  if (!event) {
    return `<section class="panel" style="text-align:center;padding:3rem;"><h2>Control Room</h2><p class="muted">Event not found.</p></section>`;
  }

  const cameraStream = getCameraStream();
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
      <article>
        <div class="panel" style="margin-bottom:1rem;">
          <h3>Camera Preview</h3>
          <div class="camera-preview" id="cameraPreviewContainer" style="margin-top:0.75rem;">
            <video id="cameraPreview" class="hls-video" autoplay playsinline muted></video>
            <div class="player-overlay" id="cameraOverlay">
              <p class="player-status">Click "Start Camera" to begin</p>
            </div>
          </div>
          <div class="row" style="margin-top:0.75rem;">
            <button class="btn primary" data-action="start-camera" ${cameraStream ? "disabled" : ""}>Start Camera</button>
            <button class="btn warn" data-action="stop-camera" ${cameraStream ? "" : "disabled"}>Stop Camera</button>
          </div>
        </div>
        <details class="panel">
          <summary style="cursor:pointer;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:0.95rem;color:var(--ink);">OBS / External Ingest</summary>
          <div style="margin-top:0.75rem;">
            <label>Server URL<input value="${h(event.ingestUrl || "Not yet assigned")}" readonly style="opacity:0.7;cursor:default;" /></label>
            <label>Stream Key<input value="${h(event.streamKey || "Not yet assigned")}" readonly style="opacity:0.7;cursor:default;" type="password" /></label>
          </div>
          <div class="row" style="margin-top:0.5rem;">
            <button class="btn" data-action="copy-ingest" data-id="${h(event.id)}">Copy URL</button>
            <button class="btn" data-action="copy-key" data-id="${h(event.id)}">Copy Key</button>
          </div>
        </details>
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

export function accountView() {
  if (!state.user) {
    return signInView();
  }

  const canEditCreatorProfile = ["creator", "org_admin"].includes(state.user.role);

  const roleLabels = { fan: "Fan", creator: "Creator", org_admin: "Org Admin", support_admin: "Support Admin" };
  const roleLabel = roleLabels[state.user.role] || state.user.role;

  return `
    <div style="max-width:720px;margin:0 auto;">
      <section class="panel" style="margin-bottom:1.25rem;">
        <div style="display:flex;align-items:center;gap:1rem;">
          ${renderAvatarMarkup({
            displayName: state.user.displayName || "User",
            imageUrl: state.user.profileImageUrl,
            className: "avatar avatar-xl",
            alt: `${state.user.displayName || "User"} profile picture`,
          })}
          <div style="min-width:0;">
            <h2 style="margin:0;font-size:1.25rem;color:var(--ink);">${h(state.user.displayName)}</h2>
            <p class="muted" style="margin:0.15rem 0 0;">${h(state.user.email || "")}</p>
            <span style="display:inline-block;margin-top:0.35rem;padding:0.15rem 0.55rem;border-radius:999px;font-size:0.75rem;font-weight:600;background:var(--surface-3);color:var(--ink-secondary);">${h(roleLabel)}</span>
          </div>
        </div>
        <div style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--line);">
          <button class="btn ghost" data-action="logout" style="width:100%;justify-content:center;">Sign Out</button>
        </div>
      </section>

      ${
        canEditCreatorProfile
          ? `
      <section class="panel">
        <h3>Artist Profile</h3>
        <p class="muted" style="margin-top:0.4rem;">Fans will see this information on your artist page and event details.</p>
        <form id="creatorProfileForm" style="margin-top:0.75rem;">
          <label>Display Name<input name="displayName" value="${h(state.user.displayName || "")}" required /></label>
          <label>Bio<textarea name="bio" placeholder="Tell fans your story and music style...">${h(state.user.bio || "")}</textarea></label>
          <label>Hometown<input name="hometown" value="${h(state.user.hometown || "")}" placeholder="City, Country" /></label>
          <label>Profile Image
            ${
              state.user.profileImageUrl
                ? `<div style="margin:0.35rem 0;">${renderAvatarMarkup({
                    displayName: state.user.displayName || "User",
                    imageUrl: state.user.profileImageUrl,
                    className: "avatar avatar-xl",
                    alt: "Current profile image",
                  })}</div>`
                : ""
            }
            <input name="profileImageFile" type="file" accept="image/jpeg,image/png,image/gif,image/webp" />
          </label>
          <label>Website URL<input name="websiteUrl" type="url" value="${h(state.user.websiteUrl || "")}" placeholder="https://..." /></label>
          <button class="btn primary" type="submit">Save Artist Profile</button>
        </form>
      </section>
      `
          : ""
      }
    </div>
  `;
}

export function signInView() {
  return `
    <div style="max-width:520px;margin:0 auto;">
      <section class="panel">
        <h2 class="section-title" style="text-align:center;">Sign In</h2>
        <p class="section-subtitle" style="text-align:center;">Welcome back. Access your events and library.</p>
        <form id="loginForm" style="margin-top:0.75rem;">
          <label>Email<input name="email" type="email" placeholder="you@example.com" required /></label>
          <label>Password<input name="password" type="password" minlength="8" required /></label>
          <button class="btn primary" type="submit" style="width:100%;justify-content:center;margin-top:0.25rem;">Sign In</button>
        </form>
        <div class="row" style="justify-content:center;margin-top:0.85rem;">
          <span class="muted">New here?</span>
          <button class="btn ghost" data-action="go-signup">Create Account</button>
        </div>
      </section>
    </div>
  `;
}

export function signUpView() {
  return `
    <div style="max-width:620px;margin:0 auto;">
      <section class="panel">
        <h2 class="section-title" style="text-align:center;">Create Account</h2>
        <p class="section-subtitle" style="text-align:center;">Set up your fan or creator profile.</p>
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
        <div class="row" style="justify-content:center;margin-top:0.85rem;">
          <span class="muted">Already have an account?</span>
          <button class="btn ghost" data-action="go-signin">Sign In</button>
        </div>
      </section>
    </div>
  `;
}
