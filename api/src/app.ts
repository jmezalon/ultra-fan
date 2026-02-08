import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import { z } from "zod";
import { signAccessToken, signPlaybackToken } from "./auth.js";
import { AuthedRequest, requireAuth, requireRole } from "./middleware.js";
import { canManageEvent, transitionBroadcast } from "./policy.js";
import { events, hasTicket, id, nowIso, sanitizeUser, tickets, users } from "./store.js";
import { Event } from "./types.js";

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
});

const updateEventSchema = createEventSchema.partial();

export function buildApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "ultra-fan-api", now: nowIso() });
  });

  app.post("/auth/signup", async (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const exists = users.some((u) => u.email.toLowerCase() === parsed.data.email.toLowerCase());
    if (exists) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const user = {
      id: id("usr"),
      email: parsed.data.email.toLowerCase(),
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      role: parsed.data.role,
      displayName: parsed.data.displayName,
      organizationId: parsed.data.organizationId ?? null,
      createdAt: nowIso(),
    };
    users.push(user);

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

    const user = users.find((u) => u.email === parsed.data.email.toLowerCase());
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

  app.get("/me", requireAuth, (req: AuthedRequest, res) => {
    const user = users.find((u) => u.id === req.auth?.userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ user: sanitizeUser(user) });
  });

  app.get("/events", (_req, res) => {
    res.json({
      events: events.filter((e) => e.published),
    });
  });

  app.post("/events", requireAuth, requireRole("creator", "org_admin"), (req: AuthedRequest, res) => {
    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const event: Event = {
      id: id("evt"),
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
      ingestUrl: "rtmps://ingest.ultrafan.live/app",
      streamKey: `uf_${id("key")}`,
      broadcastState: "offline",
      rehearsalActive: false,
      createdAt: nowIso(),
    };

    events.push(event);
    res.status(201).json({ event });
  });

  app.get("/events/:eventId", (req, res) => {
    const event = events.find((e) => e.id === req.params.eventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json({ event });
  });

  app.patch("/events/:eventId", requireAuth, requireRole("creator", "org_admin", "support_admin"), (req: AuthedRequest, res) => {
    const event = events.find((e) => e.id === req.params.eventId);
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

    Object.assign(event, parsed.data);
    res.json({ event });
  });

  app.post("/events/:eventId/purchase", requireAuth, requireRole("fan", "support_admin", "org_admin", "creator"), (req: AuthedRequest, res) => {
    const event = events.find((e) => e.id === req.params.eventId);
    if (!event || !event.published) {
      res.status(404).json({ error: "Event not available" });
      return;
    }

    const already = hasTicket(req.auth!.userId, event.id);
    if (already) {
      res.status(200).json({ ok: true, message: "Ticket already exists" });
      return;
    }

    tickets.push({
      id: id("tkt"),
      eventId: event.id,
      userId: req.auth!.userId,
      purchasedAt: nowIso(),
    });

    res.status(201).json({ ok: true, eventId: event.id });
  });

  app.get("/me/library", requireAuth, (req: AuthedRequest, res) => {
    const myTickets = tickets.filter((t) => t.userId === req.auth!.userId);
    const library = myTickets
      .map((t) => events.find((e) => e.id === t.eventId))
      .filter((e): e is Event => Boolean(e));
    res.json({ events: library });
  });

  app.get("/events/:eventId/control-room", requireAuth, requireRole("creator", "org_admin", "support_admin"), (req: AuthedRequest, res) => {
    const event = events.find((e) => e.id === req.params.eventId);
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

  app.post("/events/:eventId/broadcast/rehearsal/start", requireAuth, requireRole("creator", "org_admin", "support_admin"), (req: AuthedRequest, res) => {
    const event = events.find((e) => e.id === req.params.eventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (!canManageEvent(req.auth, event)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    try {
      event.broadcastState = transitionBroadcast(event.broadcastState, "rehearsal");
      event.rehearsalActive = true;
      res.json({ broadcastState: event.broadcastState, rehearsalActive: event.rehearsalActive });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post("/events/:eventId/broadcast/go-live", requireAuth, requireRole("creator", "org_admin", "support_admin"), (req: AuthedRequest, res) => {
    const event = events.find((e) => e.id === req.params.eventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (!canManageEvent(req.auth, event)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    try {
      event.broadcastState = transitionBroadcast(event.broadcastState, "go-live");
      event.rehearsalActive = false;
      res.json({ broadcastState: event.broadcastState, rehearsalActive: event.rehearsalActive });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post("/events/:eventId/broadcast/end", requireAuth, requireRole("creator", "org_admin", "support_admin"), (req: AuthedRequest, res) => {
    const event = events.find((e) => e.id === req.params.eventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (!canManageEvent(req.auth, event)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    try {
      event.broadcastState = transitionBroadcast(event.broadcastState, "end");
      event.rehearsalActive = false;
      res.json({ broadcastState: event.broadcastState, rehearsalActive: event.rehearsalActive });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get("/events/:eventId/access-token", requireAuth, (req: AuthedRequest, res) => {
    const event = events.find((e) => e.id === req.params.eventId);
    if (!event || !event.published) {
      res.status(404).json({ error: "Event not available" });
      return;
    }

    const entitlement = hasTicket(req.auth!.userId, event.id);
    if (!entitlement) {
      res.status(403).json({ error: "Ticket required" });
      return;
    }

    const token = signPlaybackToken({
      userId: req.auth!.userId,
      eventId: event.id,
      expiresInSec: 5 * 60,
    });

    res.json({
      playbackToken: token,
      eventId: event.id,
      streamPath: `/hls/${event.id}/index.m3u8`,
      expiresInSec: 300,
    });
  });

  return app;
}
