import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import { z } from "zod";
import { signAccessToken, signPlaybackToken } from "./auth.js";
import { AuthedRequest, requireAuth, requireRole } from "./middleware.js";
import { MemoryRepository } from "./repositories/memory-repo.js";
import { Repository } from "./repositories/types.js";
import { nowIso, sanitizeUser } from "./store.js";
import { Event } from "./types.js";
import { canManageEvent, transitionBroadcast } from "./policy.js";

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

export function buildApp(repo: Repository = new MemoryRepository()) {
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

    res.json({
      playbackToken: token,
      eventId: event.id,
      streamPath: `/hls/${event.id}/index.m3u8`,
      expiresInSec: 300,
    });
  });

  return app;
}
