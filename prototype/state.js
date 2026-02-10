export const CREATOR_ROLES = new Set(["creator", "org_admin", "support_admin"]);

const defaultApiBase = (() => {
  const saved = localStorage.getItem("ultra_fan_api_base");
  if (saved) return saved;

  const isLocalHost =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (isLocalHost && window.location.port === "4173") {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }

  return window.location.origin;
})();

export const state = {
  route: "discover",
  routeEventId: null,
  apiBase: defaultApiBase,
  token: localStorage.getItem("ultra_fan_token") || "",
  user: null,
  events: [],
  libraryEvents: [],
  artistProfiles: {},
  artistEvents: {},
  controlRooms: {},
  chat: {},
  chatLoadedByEvent: {},
  streamInfoByEvent: {},
  chatStream: null,
  chatStreamEventId: null,
  loading: false,
  notice: null,
};

export function isCreatorUser() {
  return Boolean(state.user && CREATOR_ROLES.has(state.user.role));
}

export function canManageEvent(event) {
  if (!state.user || !event) return false;
  if (state.user.role === "support_admin") return true;
  if (event.artistUserId && event.artistUserId === state.user.id) return true;
  return Boolean(state.user.organizationId && event.organizationId && state.user.organizationId === event.organizationId);
}

export function listManagedEvents() {
  return state.events.filter(canManageEvent);
}

export function hasTicket(eventId) {
  return state.libraryEvents.some((event) => event.id === eventId);
}

export function normalizeApiError(payload, status) {
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

export async function apiRequest(path, opts = {}) {
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
      cache: "no-store",
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

export async function uploadFile(file) {
  const formData = new FormData();
  formData.append("file", file);

  let response;
  try {
    response = await fetch(`${state.apiBase}/uploads`, {
      method: "POST",
      headers: { authorization: `Bearer ${state.token}` },
      body: formData,
    });
  } catch {
    throw new Error("Could not reach API for file upload.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(normalizeApiError(payload, response.status));
  }
  return payload.url;
}

export function mergeEvent(event) {
  if (!event?.id) return;

  state.events = [event, ...state.events.filter((item) => item.id !== event.id)];
  state.libraryEvents = state.libraryEvents.map((item) => (item.id === event.id ? { ...item, ...event } : item));
}

export function getEvent(eventId) {
  return state.events.find((event) => event.id === eventId) || state.libraryEvents.find((event) => event.id === eventId) || null;
}

export function getControlRoomEvent(eventId) {
  const event = getEvent(eventId);
  if (!event) return null;

  const controlRoom = state.controlRooms[eventId];
  if (!controlRoom) return event;

  return {
    ...event,
    title: controlRoom.title || event.title,
    ingestUrl: controlRoom.ingestUrl || event.ingestUrl,
    streamKey: controlRoom.streamKey || event.streamKey,
    whipUrl: controlRoom.whipUrl || event.whipUrl,
    broadcastState: controlRoom.broadcastState || event.broadcastState,
    rehearsalActive: Boolean(controlRoom.rehearsalActive),
  };
}

export function getArtistProfile(artistUserId) {
  return state.artistProfiles[artistUserId] || null;
}

export function getArtistEvents(artistUserId) {
  return state.artistEvents[artistUserId] || [];
}

export function mergeControlRoom(data) {
  if (!data?.eventId) return;

  state.controlRooms[data.eventId] = data;
  const current = getEvent(data.eventId);
  mergeEvent({
    ...(current || {}),
    id: data.eventId,
    title: data.title || current?.title || "Untitled event",
    ingestUrl: data.ingestUrl || current?.ingestUrl || "",
    streamKey: data.streamKey || current?.streamKey || "",
    whipUrl: data.whipUrl || current?.whipUrl || "",
    broadcastState: data.broadcastState || current?.broadcastState || "offline",
    rehearsalActive: Boolean(data.rehearsalActive),
  });
}

export async function ensureEvent(eventId) {
  const existing = getEvent(eventId);
  if (existing) return existing;

  const data = await apiRequest(`/events/${eventId}`, { auth: false });
  mergeEvent(data.event);
  return data.event;
}

export async function refreshEvent(eventId) {
  const data = await apiRequest(`/events/${eventId}`, { auth: false });
  mergeEvent(data.event);
  return data.event;
}

export async function refreshEvents() {
  const data = await apiRequest("/events", { auth: false });
  const publishedEvents = Array.isArray(data.events) ? data.events : [];
  const localManagedDrafts = state.events.filter((event) => !event.published && canManageEvent(event));
  state.events = [
    ...publishedEvents,
    ...localManagedDrafts.filter((draftEvent) => !publishedEvents.some((event) => event.id === draftEvent.id)),
  ];
}

export async function refreshArtistProfile(artistUserId) {
  const data = await apiRequest(`/artists/${artistUserId}`, { auth: false });
  if (data.artist) {
    state.artistProfiles[artistUserId] = data.artist;
  }
  const events = Array.isArray(data.events) ? data.events : [];
  state.artistEvents[artistUserId] = events;
  for (const event of events) {
    mergeEvent(event);
  }
  return data;
}

export async function refreshLibrary() {
  if (!state.token) {
    state.libraryEvents = [];
    return;
  }

  const data = await apiRequest("/me/library");
  state.libraryEvents = Array.isArray(data.events) ? data.events : [];
}

export async function refreshControlRoom(eventId) {
  const data = await apiRequest(`/events/${eventId}/control-room`);
  mergeControlRoom(data);
}

export async function hydrateUser(onSessionInvalid) {
  if (!state.token) return;

  try {
    const data = await apiRequest("/me");
    state.user = data.user;
  } catch {
    if (onSessionInvalid) onSessionInvalid();
  }
}
