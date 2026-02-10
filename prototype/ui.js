import { state } from "./state.js";

export function showToast(message, tone = "info") {
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

export function renderLoadingBar() {
  const existing = document.querySelector(".loading-bar");
  if (state.loading && !existing) {
    const bar = document.createElement("div");
    bar.className = "loading-bar";
    document.body.appendChild(bar);
  } else if (!state.loading && existing) {
    existing.remove();
  }
}

export function setLoading(loading) {
  state.loading = loading;
  renderLoadingBar();
}

export function setNotice(message, tone = "info") {
  if (!message) {
    state.notice = null;
    return;
  }
  state.notice = { message, tone };
  showToast(message, tone);
}

export function setActiveNav(route) {
  const navButtons = [...document.querySelectorAll(".nav-btn")];
  navButtons.forEach((button) => button.classList.remove("active"));

  let navRoute = route;
  if (route === "event" || route === "watch" || route === "artist") navRoute = "discover";
  if (route === "control") navRoute = "creator";
  if (route === "signin" || route === "signup") navRoute = "account";

  navButtons.find((button) => button.dataset.route === navRoute)?.classList.add("active");
}
