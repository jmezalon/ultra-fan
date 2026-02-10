import { state, apiRequest } from "./state.js";
import { h, renderAvatarMarkup } from "./utils.js";
import { setNotice } from "./ui.js";

export function normalizeChatMessage(raw) {
  const profileImageUrl = raw?.userProfileImageUrl ?? raw?.user?.profileImageUrl ?? null;
  return {
    id: String(raw?.id || ""),
    eventId: String(raw?.eventId || ""),
    userId: String(raw?.userId || ""),
    userDisplayName: String(raw?.userDisplayName || raw?.user || "Guest"),
    userProfileImageUrl: profileImageUrl ? String(profileImageUrl) : null,
    body: String(raw?.body || raw?.message || ""),
    createdAt: String(raw?.createdAt || new Date().toISOString()),
  };
}

export function mergeChatMessages(eventId, incomingMessages) {
  const normalized = incomingMessages
    .map(normalizeChatMessage)
    .filter((m) => m.body.length > 0);

  const existing = state.chat[eventId] || [];
  const byId = new Map();
  for (const message of existing) {
    const key = message.id || `${message.userId}:${message.createdAt}:${message.body}`;
    byId.set(key, message);
  }
  for (const message of normalized) {
    const key = message.id || `${message.userId}:${message.createdAt}:${message.body}`;
    byId.set(key, message);
  }

  state.chat[eventId] = [...byId.values()].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}

export function renderChatMessagesMarkup(eventId) {
  const messages = state.chat[eventId] || [];
  if (!messages.length) {
    return `<p class="muted" style="font-size:0.85rem;">No messages yet. Be the first!</p>`;
  }

  return messages
    .map(
      (item) => `
        <div class="chat-message">
          ${renderAvatarMarkup({
            displayName: item.userDisplayName,
            imageUrl: item.userProfileImageUrl,
            className: "avatar avatar-chat",
            alt: `${item.userDisplayName} profile picture`,
          })}
          <div class="chat-message-content">
            <strong>${h(item.userDisplayName)}</strong>
            <p>${h(item.body)}</p>
          </div>
        </div>
      `,
    )
    .join("");
}

export function updateWatchChatPanel(eventId) {
  if (state.route !== "watch" || state.routeEventId !== eventId) return;
  const container = document.getElementById("chatMessages");
  if (!container) return;
  container.innerHTML = renderChatMessagesMarkup(eventId);
}

export function closeChatStream() {
  if (state.chatStream) {
    state.chatStream.close();
    state.chatStream = null;
    state.chatStreamEventId = null;
  }
}

export async function loadChatHistory(eventId) {
  if (!state.token) return;
  const data = await apiRequest(`/events/${eventId}/chat/messages?limit=200`);
  const messages = Array.isArray(data.messages) ? data.messages : [];
  state.chat[eventId] = messages.map(normalizeChatMessage);
  state.chatLoadedByEvent[eventId] = true;
}

export function ensureChatStream(eventId) {
  if (!state.token) return;
  if (state.chatStream && state.chatStreamEventId === eventId) return;
  if (typeof EventSource === "undefined") {
    setNotice("This browser does not support realtime chat streaming.", "error");
    return;
  }

  closeChatStream();
  const streamUrl = `${state.apiBase}/events/${encodeURIComponent(
    eventId,
  )}/chat/stream?token=${encodeURIComponent(state.token)}`;
  const source = new EventSource(streamUrl);
  state.chatStream = source;
  state.chatStreamEventId = eventId;

  source.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload?.type === "chat.snapshot") {
        mergeChatMessages(eventId, Array.isArray(payload.messages) ? payload.messages : []);
        state.chatLoadedByEvent[eventId] = true;
        updateWatchChatPanel(eventId);
        return;
      }
      if (payload?.type === "chat.message" && payload.message) {
        mergeChatMessages(eventId, [payload.message]);
        updateWatchChatPanel(eventId);
      }
    } catch {
      // Ignore malformed SSE payloads.
    }
  };

  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) {
      closeChatStream();
    }
  };
}
