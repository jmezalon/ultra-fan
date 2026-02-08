import { events, hasTicket, id, nowIso, tickets, users } from "../store.js";
import { Event } from "../types.js";
import { CreateEventInput, CreateTicketInput, CreateUserInput, Repository } from "./types.js";

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
      ingestUrl: "rtmps://ingest.ultrafan.live/app",
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
}
