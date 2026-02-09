import { BroadcastState, Event } from "./types.js";

export interface AuthContext {
  userId: string;
  role: "fan" | "creator" | "org_admin" | "support_admin";
  organizationId: string | null;
}

export function canManageEvent(auth: AuthContext | undefined, event: Event): boolean {
  if (!auth) return false;
  if (auth.role === "support_admin") return true;
  if (auth.role === "org_admin" && auth.organizationId) {
    return auth.organizationId === event.organizationId;
  }
  return auth.userId === event.artistUserId;
}

export function canAccessEventChat(auth: AuthContext | undefined, event: Event, hasEntitlement: boolean): boolean {
  if (!auth) return false;
  return canManageEvent(auth, event) || hasEntitlement;
}

export function transitionBroadcast(current: BroadcastState, action: "rehearsal" | "go-live" | "end") {
  if (action === "rehearsal") {
    if (current === "offline" || current === "ready") return "ready" as const;
    throw new Error("Cannot start rehearsal in current state");
  }
  if (action === "go-live") {
    if (current === "ready") return "live" as const;
    throw new Error("Event must be ready before going live");
  }
  if (current === "live" || current === "ready") return "ended" as const;
  throw new Error("Cannot end in current state");
}
