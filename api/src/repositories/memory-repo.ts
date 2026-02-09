import { chatMessages, events, hasTicket, id, nowIso, tickets, users } from "../store.js";
import { ChatMessage, Event } from "../types.js";
import {
  CreateChatMessageInput,
  CreateEventInput,
  CreateTicketInput,
  CreateUserInput,
  ListChatMessagesInput,
  Repository,
} from "./types.js";

export class MemoryRepository implements Repository {
  async findUserByEmail(email: string) {
    return users.find((u) => u.email === email) ?? null;
  }

  async findUserById(userId: string) {
    return users.find((u) => u.id === userId) ?? null;
  }

  async createUser(input: CreateUserInput) {
    const user = {
      id: id("usr"),
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role,
      displayName: input.displayName,
      organizationId: input.organizationId,
      createdAt: nowIso(),
    };
    users.push(user);
    return user;
  }

  async listPublishedEvents() {
    return events.filter((e) => e.published);
  }

  async findEventById(eventId: string) {
    return events.find((e) => e.id === eventId) ?? null;
  }

  async createEvent(input: CreateEventInput) {
    const event: Event = {
      id: id("evt"),
      artistUserId: input.artistUserId,
      organizationId: input.organizationId,
      title: input.title,
      description: input.description,
      venue: input.venue,
      startsAt: input.startsAt,
      durationMin: input.durationMin,
      priceUsd: input.priceUsd,
      replayHours: input.replayHours,
      published: input.published,
      imageUrl: input.imageUrl || null,
      ingestUrl: process.env.INGEST_URL ?? "rtmp://localhost:1935/live",
      streamKey: `uf_${id("key")}`,
      broadcastState: "offline",
      rehearsalActive: false,
      createdAt: nowIso(),
    };
    events.push(event);
    return event;
  }

  async updateEvent(eventId: string, patch: Partial<Event>) {
    const event = events.find((e) => e.id === eventId);
    if (!event) return null;
    Object.assign(event, patch);
    return event;
  }

  async hasTicket(userId: string, eventId: string) {
    return hasTicket(userId, eventId);
  }

  async createTicket(input: CreateTicketInput) {
    tickets.push({
      id: id("tkt"),
      eventId: input.eventId,
      userId: input.userId,
      purchasedAt: nowIso(),
    });
  }

  async listLibraryEvents(userId: string) {
    const myTickets = tickets.filter((t) => t.userId === userId);
    return myTickets
      .map((t) => events.find((e) => e.id === t.eventId))
      .filter((e): e is Event => Boolean(e));
  }

  async createChatMessage(input: CreateChatMessageInput) {
    const message: ChatMessage = {
      id: id("msg"),
      eventId: input.eventId,
      userId: input.userId,
      userDisplayName: input.userDisplayName,
      body: input.body,
      createdAt: nowIso(),
    };
    chatMessages.push(message);
    return message;
  }

  async listChatMessages(input: ListChatMessagesInput) {
    const sinceMs = input.since ? Date.parse(input.since) : Number.NEGATIVE_INFINITY;
    const limit = input.limit ?? 200;
    return chatMessages
      .filter((m) => m.eventId === input.eventId && Date.parse(m.createdAt) >= sinceMs)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .slice(-limit);
  }

  async deleteChatMessagesOlderThan(cutoffIso: string) {
    const cutoff = Date.parse(cutoffIso);
    const before = chatMessages.length;
    const kept = chatMessages.filter((m) => Date.parse(m.createdAt) >= cutoff);
    chatMessages.splice(0, chatMessages.length, ...kept);
    return before - kept.length;
  }
}
