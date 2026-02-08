import { prisma } from "../db.js";
import { id, nowIso } from "../store.js";
import { BroadcastState, Event, Role, User } from "../types.js";
import { CreateEventInput, CreateTicketInput, CreateUserInput, Repository } from "./types.js";

function mapUser(user: {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
  displayName: string;
  organizationId: string | null;
  createdAt: Date;
}): User {
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    role: user.role as Role,
    displayName: user.displayName,
    organizationId: user.organizationId,
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
    ingestUrl: event.ingestUrl,
    streamKey: event.streamKey,
    broadcastState: event.broadcastState as BroadcastState,
    rehearsalActive: event.rehearsalActive,
    createdAt: event.createdAt.toISOString(),
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
        createdAt: new Date(nowIso()),
      },
    });
    return mapUser(user);
  }

  async listPublishedEvents() {
    const rows = await prisma.event.findMany({ where: { published: true }, orderBy: { startsAt: "asc" } });
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
        ingestUrl: "rtmps://ingest.ultrafan.live/app",
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
}
