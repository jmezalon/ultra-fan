import bcrypt from "bcryptjs";
import cors from "cors";
import express, { Request, Response } from "express";
import { z } from "zod";
import { signAccessToken, signPlaybackToken, verifyAccessToken } from "./auth.js";
import { AuthedRequest, requireAuth, requireRole } from "./middleware.js";
import { MemoryRepository } from "./repositories/memory-repo.js";
import { Repository } from "./repositories/types.js";
import { nowIso, sanitizeUser } from "./store.js";
import { Event } from "./types.js";
import { canAccessEventChat, canManageEvent, transitionBroadcast } from "./policy.js";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2),
  role: z.enum(["fan", "creator", "org_admin", "support_admin"]),
  organizationId: z.string().min(2).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const createEventSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  venue: z.string().min(2),
  startsAt: z.string().datetime(),
  durationMin: z.number().int().min(30),
  priceUsd: z.number().min(0),
  replayHours: z.number().int().min(0).max(168),
  published: z.boolean().default(false),
  imageUrl: z.string().url().optional(),
});

const updateEventSchema = createEventSchema.partial();

const chatMessageSchema = z.object({
  body: z.string().trim().min(1).max(600),
});

const chatListQuerySchema = z.object({
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(300).default(200),
});

const CHAT_RETENTION_HOURS = 24;
const CHAT_KEEPALIVE_MS = 15_000;

export function buildApp(repo: Repository = new MemoryRepository()) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  const chatStreams = new Map<string, Set<Response>>();

  const chatCutoffIso = () =>
    new Date(Date.now() - CHAT_RETENTION_HOURS * 60 * 60 * 1000).toISOString();

  async function enforceChatRetentionWindow() {
    await repo.deleteChatMessagesOlderThan(chatCutoffIso());
  }

  function openChatStream(eventId: string, res: Response) {
    const subscribers = chatStreams.get(eventId) ?? new Set<Response>();
    subscribers.add(res);
    chatStreams.set(eventId, subscribers);
  }

  function closeChatStream(eventId: string, res: Response) {
    const subscribers = chatStreams.get(eventId);
    if (!subscribers) return;
    subscribers.delete(res);
    if (subscribers.size === 0) {
      chatStreams.delete(eventId);
    }
  }

  function publishChatEvent(eventId: string, payload: unknown) {
    const subscribers = chatStreams.get(eventId);
    if (!subscribers?.size) return;
    const frame = `data: ${JSON.stringify(payload)}\n\n`;
    for (const stream of subscribers) {
      stream.write(frame);
    }
  }

  async function canUseChat(auth: NonNullable<AuthedRequest["auth"]>, event: Event) {
    const entitlement = await repo.hasTicket(auth.userId, event.id);
    return canAccessEventChat(auth, event, entitlement);
  }

  function readSseAuth(req: Request): AuthedRequest["auth"] | null {
    const header = req.header("authorization");
    const queryToken = typeof req.query.token === "string" ? req.query.token : null;
    const bearerToken = header?.startsWith("Bearer ")
      ? header.slice("Bearer ".length)
      : null;
    const token = bearerToken ?? queryToken;
    if (!token) return null;
    try {
      const claims = verifyAccessToken(token);
      return {
        userId: claims.sub,
        role: claims.role,
        organizationId: claims.organizationId,
      };
    } catch {
      return null;
    }
  }

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "ultra-fan-api", now: nowIso() });
  });

  app.post("/auth/signup", async (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const email = parsed.data.email.toLowerCase();
    const exists = await repo.findUserByEmail(email);
    if (exists) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const user = await repo.createUser({
      email,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      role: parsed.data.role,
      displayName: parsed.data.displayName,
      organizationId: parsed.data.organizationId ?? null,
    });

    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role,
      organizationId: user.organizationId,
    });

    res.status(201).json({ user: sanitizeUser(user), accessToken });
  });

  app.post("/auth/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const user = await repo.findUserByEmail(parsed.data.email.toLowerCase());
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role,
      organizationId: user.organizationId,
    });

    res.json({ user: sanitizeUser(user), accessToken });
  });

  app.get("/me", requireAuth, async (req: AuthedRequest, res) => {
    const user = await repo.findUserById(req.auth!.userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ user: sanitizeUser(user) });
  });

  app.get("/events", async (_req, res) => {
    const published = await repo.listPublishedEvents();
    res.json({ events: published });
  });

  app.post("/events", requireAuth, requireRole("creator", "org_admin"), async (req: AuthedRequest, res) => {
    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const event = await repo.createEvent({
      artistUserId: req.auth!.userId,
      organizationId: req.auth!.organizationId,
      title: parsed.data.title,
      description: parsed.data.description,
      venue: parsed.data.venue,
      startsAt: parsed.data.startsAt,
      durationMin: parsed.data.durationMin,
      priceUsd: parsed.data.priceUsd,
      replayHours: parsed.data.replayHours,
      published: parsed.data.published,
      imageUrl: parsed.data.imageUrl,
    });

    res.status(201).json({ event });
  });

  app.get("/events/:eventId", async (req, res) => {
    const event = await repo.findEventById(String(req.params.eventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json({ event });
  });

  app.patch("/events/:eventId", requireAuth, requireRole("creator", "org_admin", "support_admin"), async (req: AuthedRequest, res) => {
    const event = await repo.findEventById(String(req.params.eventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (!canManageEvent(req.auth, event)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const parsed = updateEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const updated = await repo.updateEvent(event.id, parsed.data as Partial<Event>);
    res.json({ event: updated });
  });

  app.post("/events/:eventId/purchase", requireAuth, requireRole("fan", "support_admin", "org_admin", "creator"), async (req: AuthedRequest, res) => {
    const event = await repo.findEventById(String(req.params.eventId));
    if (!event || !event.published) {
      res.status(404).json({ error: "Event not available" });
      return;
    }

    const already = await repo.hasTicket(req.auth!.userId, event.id);
    if (already) {
      res.status(200).json({ ok: true, message: "Ticket already exists" });
      return;
    }

    await repo.createTicket({ userId: req.auth!.userId, eventId: event.id });

    res.status(201).json({ ok: true, eventId: event.id });
  });

  app.get("/me/library", requireAuth, async (req: AuthedRequest, res) => {
    const library = await repo.listLibraryEvents(req.auth!.userId);
    res.json({ events: library });
  });

  app.get("/events/:eventId/chat/messages", requireAuth, async (req: AuthedRequest, res) => {
    const event = await repo.findEventById(String(req.params.eventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const allowed = await canUseChat(req.auth!, event);
    if (!allowed) {
      res.status(403).json({ error: "Ticket required for chat access" });
      return;
    }

    const parsed = chatListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    await enforceChatRetentionWindow();

    const cutoff = chatCutoffIso();
    const since =
      parsed.data.since && Date.parse(parsed.data.since) > Date.parse(cutoff)
        ? parsed.data.since
        : cutoff;
    const messages = await repo.listChatMessages({
      eventId: event.id,
      since,
      limit: parsed.data.limit,
    });

    res.json({ eventId: event.id, retentionHours: CHAT_RETENTION_HOURS, messages });
  });

  app.post("/events/:eventId/chat/messages", requireAuth, async (req: AuthedRequest, res) => {
    const parsedBody = chatMessageSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: parsedBody.error.flatten() });
      return;
    }

    const event = await repo.findEventById(String(req.params.eventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const allowed = await canUseChat(req.auth!, event);
    if (!allowed) {
      res.status(403).json({ error: "Ticket required for chat access" });
      return;
    }

    const sender = await repo.findUserById(req.auth!.userId);
    if (!sender) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await enforceChatRetentionWindow();

    const message = await repo.createChatMessage({
      eventId: event.id,
      userId: sender.id,
      userDisplayName: sender.displayName,
      body: parsedBody.data.body,
    });

    publishChatEvent(event.id, { type: "chat.message", message });
    res.status(201).json({ message });
  });

  app.get("/events/:eventId/chat/stream", async (req, res) => {
    const auth = readSseAuth(req);
    if (!auth) {
      res.status(401).json({ error: "Missing or invalid token" });
      return;
    }

    const event = await repo.findEventById(String(req.params.eventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const allowed = await canUseChat(auth, event);
    if (!allowed) {
      res.status(403).json({ error: "Ticket required for chat access" });
      return;
    }

    await enforceChatRetentionWindow();
    const messages = await repo.listChatMessages({
      eventId: event.id,
      since: chatCutoffIso(),
      limit: 200,
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const snapshot = { type: "chat.snapshot", messages };
    res.write(`data: ${JSON.stringify(snapshot)}\n\n`);

    openChatStream(event.id, res);
    const keepalive = setInterval(() => {
      res.write(": keepalive\n\n");
    }, CHAT_KEEPALIVE_MS);

    req.on("close", () => {
      clearInterval(keepalive);
      closeChatStream(event.id, res);
      res.end();
    });
  });

  app.get("/events/:eventId/control-room", requireAuth, requireRole("creator", "org_admin", "support_admin"), async (req: AuthedRequest, res) => {
    const event = await repo.findEventById(String(req.params.eventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (!canManageEvent(req.auth, event)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.json({
      eventId: event.id,
      title: event.title,
      ingestUrl: event.ingestUrl,
      streamKey: event.streamKey,
      broadcastState: event.broadcastState,
      rehearsalActive: event.rehearsalActive,
    });
  });

  app.post("/events/:eventId/broadcast/rehearsal/start", requireAuth, requireRole("creator", "org_admin", "support_admin"), async (req: AuthedRequest, res) => {
    const event = await repo.findEventById(String(req.params.eventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (!canManageEvent(req.auth, event)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    try {
      const updated = await repo.updateEvent(event.id, {
        broadcastState: transitionBroadcast(event.broadcastState, "rehearsal"),
        rehearsalActive: true,
      });
      res.json({ broadcastState: updated?.broadcastState, rehearsalActive: updated?.rehearsalActive });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post("/events/:eventId/broadcast/go-live", requireAuth, requireRole("creator", "org_admin", "support_admin"), async (req: AuthedRequest, res) => {
    const event = await repo.findEventById(String(req.params.eventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (!canManageEvent(req.auth, event)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    try {
      const updated = await repo.updateEvent(event.id, {
        broadcastState: transitionBroadcast(event.broadcastState, "go-live"),
        rehearsalActive: false,
      });
      res.json({ broadcastState: updated?.broadcastState, rehearsalActive: updated?.rehearsalActive });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post("/events/:eventId/broadcast/end", requireAuth, requireRole("creator", "org_admin", "support_admin"), async (req: AuthedRequest, res) => {
    const event = await repo.findEventById(String(req.params.eventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (!canManageEvent(req.auth, event)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    try {
      const updated = await repo.updateEvent(event.id, {
        broadcastState: transitionBroadcast(event.broadcastState, "end"),
        rehearsalActive: false,
      });
      res.json({ broadcastState: updated?.broadcastState, rehearsalActive: updated?.rehearsalActive });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get("/events/:eventId/access-token", requireAuth, async (req: AuthedRequest, res) => {
    const event = await repo.findEventById(String(req.params.eventId));
    if (!event || !event.published) {
      res.status(404).json({ error: "Event not available" });
      return;
    }

    const entitlement = await repo.hasTicket(req.auth!.userId, event.id);
    if (!entitlement) {
      res.status(403).json({ error: "Ticket required" });
      return;
    }

    const token = signPlaybackToken({
      userId: req.auth!.userId,
      eventId: event.id,
      expiresInSec: 5 * 60,
    });

    const hlsBaseUrl = process.env.HLS_BASE_URL ?? "http://localhost:8888";

    res.json({
      playbackToken: token,
      eventId: event.id,
      hlsUrl: `${hlsBaseUrl}/live/${event.streamKey}/index.m3u8`,
      streamPath: `/live/${event.streamKey}/index.m3u8`,
      expiresInSec: 300,
    });
  });

  return app;
}
