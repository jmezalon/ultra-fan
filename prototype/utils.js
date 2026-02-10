export function h(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatDateTime(iso) {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatMoney(amount) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(amount || 0));
}

export function getLocalDateTimeInputValue(hoursAhead = 48) {
  const date = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function statusBadge(stateLabel) {
  const label = ["offline", "ready", "live", "ended"].includes(stateLabel) ? stateLabel : "offline";
  return `<span class="badge ${label}">${label.toUpperCase()}</span>`;
}
