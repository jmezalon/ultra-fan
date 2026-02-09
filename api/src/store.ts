import crypto from "node:crypto";
import { ChatMessage, Event, Ticket, User } from "./types.js";

export const users: User[] = [];
export const events: Event[] = [];
export const tickets: Ticket[] = [];
export const chatMessages: ChatMessage[] = [];

export function id(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function hasTicket(userId: string, eventId: string): boolean {
  return tickets.some((t) => t.userId === userId && t.eventId === eventId);
}

export function sanitizeUser(user: User) {
  const { passwordHash, ...safe } = user;
  return safe;
}

export function resetStore() {
  users.splice(0, users.length);
  events.splice(0, events.length);
  tickets.splice(0, tickets.length);
  chatMessages.splice(0, chatMessages.length);
}
