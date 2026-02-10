import { prisma } from "../db.js";
import { id, nowIso } from "../store.js";
import { BroadcastState, ChatMessage, Event, Role, User } from "../types.js";
import {
  CreateChatMessageInput,
  CreateEventInput,
  CreateTicketInput,
  CreateUserInput,
  ListChatMessagesInput,
  Repository,
  UpdateUserProfileInput,
} from "./types.js";

function mapUser(user: {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
  displayName: string;
  organizationId: string | null;
  bio: string | null;
  hometown: string | null;
  profileImageUrl: string | null;
  websiteUrl: string | null;
  createdAt: Date;
}): User {
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    role: user.role as Role,
    displayName: user.displayName,
    organizationId: user.organizationId,
    bio: user.bio,
    hometown: user.hometown,
    profileImageUrl: user.profileImageUrl,
    websiteUrl: user.websiteUrl,
    createdAt: user.createdAt.toISOString(),
  };
}

function mapEvent(event: {
  id: string;
  artistUserId: string;
  organizationId: string | null;
  title: string;
  description: string;
  venue: string;
  startsAt: Date;
  durationMin: number;
  priceUsd: number;
  replayHours: number;
  published: boolean;
  ingestUrl: string;
  streamKey: string;
  broadcastState: string;
  imageUrl?: string | null;
  rehearsalActive: boolean;
  createdAt: Date;
}): Event {
  return {
    id: event.id,
    artistUserId: event.artistUserId,
    organizationId: event.organizationId,
    title: event.title,
    description: event.description,
    venue: event.venue,
    startsAt: event.startsAt.toISOString(),
    durationMin: event.durationMin,
    priceUsd: event.priceUsd,
    replayHours: event.replayHours,
    published: event.published,
    imageUrl: event.imageUrl ?? null,
    ingestUrl: event.ingestUrl,
    streamKey: event.streamKey,
    broadcastState: event.broadcastState as BroadcastState,
    rehearsalActive: event.rehearsalActive,
    createdAt: event.createdAt.toISOString(),
  };
}

function mapChatMessage(message: {
  id: string;
  eventId: string;
  userId: string;
  userDisplayName: string;
  body: string;
  createdAt: Date;
}): ChatMessage {
  return {
    id: message.id,
    eventId: message.eventId,
    userId: message.userId,
    userDisplayName: message.userDisplayName,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}

export class PrismaRepository implements Repository {
  async findUserByEmail(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    return user ? mapUser(user) : null;
  }

  async findUserById(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return user ? mapUser(user) : null;
  }

  async createUser(input: CreateUserInput) {
    const user = await prisma.user.create({
      data: {
        id: id("usr"),
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role,
        displayName: input.displayName,
        organizationId: input.organizationId,
        bio: null,
        hometown: null,
        profileImageUrl: null,
        websiteUrl: null,
        createdAt: new Date(nowIso()),
      },
    });
    return mapUser(user);
  }

  async updateUserProfile(userId: string, patch: UpdateUserProfileInput) {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) return null;

    const data: Record<string, unknown> = {};
    Object.entries(patch).forEach(([k, v]) => {
      if (v === undefined || k === "id" || k === "email" || k === "role") return;
      data[k] = v;
    });

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
    });
    return mapUser(updated);
  }

  async listPublishedEvents() {
    const rows = await prisma.event.findMany({ where: { published: true }, orderBy: { startsAt: "asc" } });
    return rows.map(mapEvent);
  }

  async listPublishedEventsByArtist(artistUserId: string) {
    const rows = await prisma.event.findMany({
      where: { published: true, artistUserId },
      orderBy: { startsAt: "asc" },
    });
    return rows.map(mapEvent);
  }

  async findEventById(eventId: string) {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    return event ? mapEvent(event) : null;
  }

  async createEvent(input: CreateEventInput) {
    const event = await prisma.event.create({
      data: {
        id: id("evt"),
        artistUserId: input.artistUserId,
        organizationId: input.organizationId,
        title: input.title,
        description: input.description,
        venue: input.venue,
        startsAt: new Date(input.startsAt),
        durationMin: input.durationMin,
        priceUsd: input.priceUsd,
        replayHours: input.replayHours,
        published: input.published,
        imageUrl: input.imageUrl || null,
        ingestUrl: process.env.INGEST_URL ?? "rtmp://localhost:1935/live",
        streamKey: `uf_${id("key")}`,
        broadcastState: "offline",
        rehearsalActive: false,
        createdAt: new Date(nowIso()),
      },
    });
    return mapEvent(event);
  }

  async updateEvent(eventId: string, patch: Partial<Event>) {
    const existing = await prisma.event.findUnique({ where: { id: eventId } });
    if (!existing) return null;

    const data: Record<string, unknown> = {};
    Object.entries(patch).forEach(([k, v]) => {
      if (v === undefined || k === "id") return;
      if (k === "startsAt" || k === "createdAt") {
        data[k] = typeof v === "string" ? new Date(v) : v;
        return;
      }
      data[k] = v;
    });

    const updated = await prisma.event.update({ where: { id: eventId }, data });
    return mapEvent(updated);
  }

  async hasTicket(userId: string, eventId: string) {
    const ticket = await prisma.ticket.findFirst({ where: { userId, eventId } });
    return Boolean(ticket);
  }

  async createTicket(input: CreateTicketInput) {
    await prisma.ticket.create({
      data: {
        id: id("tkt"),
        eventId: input.eventId,
        userId: input.userId,
        purchasedAt: new Date(nowIso()),
      },
    });
  }

  async listLibraryEvents(userId: string) {
    const rows = await prisma.ticket.findMany({
      where: { userId },
      include: { event: true },
      orderBy: { purchasedAt: "desc" },
    });
    return rows.map((t) => mapEvent(t.event));
  }

  async createChatMessage(input: CreateChatMessageInput) {
    const row = await prisma.chatMessage.create({
      data: {
        id: id("msg"),
        eventId: input.eventId,
        userId: input.userId,
        userDisplayName: input.userDisplayName,
        body: input.body,
        createdAt: new Date(nowIso()),
      },
    });
    return mapChatMessage(row);
  }

  async listChatMessages(input: ListChatMessagesInput) {
    const rows = await prisma.chatMessage.findMany({
      where: {
        eventId: input.eventId,
        ...(input.since ? { createdAt: { gte: new Date(input.since) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: input.limit ?? 200,
    });
    return rows.reverse().map(mapChatMessage);
  }

  async deleteChatMessagesOlderThan(cutoffIso: string) {
    const result = await prisma.chatMessage.deleteMany({
      where: { createdAt: { lt: new Date(cutoffIso) } },
    });
    return result.count;
  }
}
