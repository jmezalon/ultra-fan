import bcrypt from "bcryptjs";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import fs from "node:fs";
import https from "node:https";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { z } from "zod";
import { signAccessToken, signPlaybackToken, verifyAccessToken } from "./auth.js";
import { AuthedRequest, requireAuth, requireRole } from "./middleware.js";
import { MemoryRepository } from "./repositories/memory-repo.js";
import { Repository } from "./repositories/types.js";
import { nowIso, sanitizeUser } from "./store.js";
import { CreatorProfile, Event, Role } from "./types.js";
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

export const imageUrlSchema = z.union([
  z.string().url(),
  z.string().startsWith("data:image/"),
  z.string().startsWith("/uploads/"),
]);

const createEventSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  venue: z.string().min(2),
  startsAt: z.string().datetime(),
  durationMin: z.number().int().min(30),
  priceUsd: z.number().min(0),
  replayHours: z.number().int().min(0).max(168),
  published: z.boolean().default(false),
  imageUrl: imageUrlSchema.optional(),
});

const updateEventSchema = createEventSchema.partial();

const chatMessageSchema = z.object({
  body: z.string().trim().min(1).max(600),
});

const chatListQuerySchema = z.object({
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(300).default(200),
});

const updateCreatorProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  bio: z.string().trim().max(1200).optional(),
  hometown: z.string().trim().max(80).optional(),
  profileImageUrl: imageUrlSchema.optional(),
  websiteUrl: z.string().url().optional(),
});

const CHAT_RETENTION_HOURS = 24;
const CHAT_KEEPALIVE_MS = 15_000;
const JSON_BODY_LIMIT = "8mb";
const SDP_BODY_LIMIT = "1mb";
const DEFAULT_WHIP_BASE_URL = "http://localhost:8889";

const CREATOR_PROFILE_ROLES: Role[] = ["creator", "org_admin"];

/* Express 4 does not forward errors from async handlers to the error middleware.
   This wrapper catches rejected promises and hands them to next(). */
const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

export function isPayloadTooLargeError(err: unknown) {
  const payloadError = err as { type?: string; status?: number } | null;
  return payloadError?.type === "entity.too.large" || payloadError?.status === 413;
}

export function getRequestBaseUrl(req: Request) {
  const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.header("x-forwarded-host")?.split(",")[0]?.trim();
  const protocol = forwardedProto || req.protocol;
  const host = forwardedHost || req.get("host") || "localhost";
  return `${protocol}://${host}`;
}

export function buildWhipUpstreamUrl(whipBaseUrl: string, streamKey: string) {
  return `${whipBaseUrl.replace(/\/+$/, "")}/live/${streamKey}/whip`;
}

/**
 * Strip H265/HEVC codec lines from an SDP offer.
 * Many browsers advertise H265 decode support but cannot encode it,
 * causing MediaMTX to negotiate H265 and then receive no video packets.
 */
export function stripH265FromSdp(sdp: string): string {
  const lines = sdp.split(/\r?\n/);

  // Collect H265/HEVC payload types
  const h265Pts = new Set<string>();
  for (const line of lines) {
    const m = line.match(/^a=rtpmap:(\d+)\s+(?:H265|HEVC)\//i);
    if (m) h265Pts.add(m[1]);
  }
  if (h265Pts.size === 0) return sdp;

  // Collect associated rtx payload types
  const rtxPts = new Set<string>();
  for (const line of lines) {
    const m = line.match(/^a=fmtp:(\d+)\s+apt=(\d+)/);
    if (m && h265Pts.has(m[2])) rtxPts.add(m[1]);
  }

  const removePts = new Set([...h265Pts, ...rtxPts]);

  const result: string[] = [];
  for (const line of lines) {
    // Drop rtpmap / fmtp / rtcp-fb lines for removed payload types
    const ptMatch = line.match(/^a=(?:rtpmap|fmtp|rtcp-fb):(\d+)\b/);
    if (ptMatch && removePts.has(ptMatch[1])) continue;

    // Strip removed PTs from m=video line
    if (line.startsWith("m=video")) {
      const parts = line.split(/\s+/);
      // parts: m=video <port> <proto> <pt1> <pt2> ...
      const filtered = parts.filter((p, i) => i < 3 || !removePts.has(p));
      result.push(filtered.join(" "));
      continue;
    }

    result.push(line);
  }

  return result.join("\r\n");
}


export function buildApp(repo: Repository = new MemoryRepository()) {
  const app = express();
  app.set("trust proxy", true);
  app.use(cors());
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  // Prevent browsers from caching API responses (stale broadcastState, etc.)
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  const chatStreams = new Map<string, Set<Response>>();
  const sourceDir = path.dirname(fileURLToPath(import.meta.url));
  const clientDir = path.resolve(sourceDir, "../../prototype");
  const clientIndexPath = path.join(clientDir, "index.html");
  const uploadsDir = path.resolve(sourceDir, "../../uploads");

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  // Compatibility for older image records that still reference /uploads/* paths.
  app.use("/uploads", express.static(uploadsDir));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      cb(null, allowed.includes(file.mimetype));
    },
  });

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

  function isPublicCreatorRole(role: Role) {
    return CREATOR_PROFILE_ROLES.includes(role);
  }

  function toCreatorProfile(user: {
    id: string;
    displayName: string;
    bio: string | null;
    hometown: string | null;
    profileImageUrl: string | null;
    websiteUrl: string | null;
  }): CreatorProfile {
    return {
      userId: user.id,
      displayName: user.displayName,
      bio: user.bio,
      hometown: user.hometown,
      profileImageUrl: user.profileImageUrl,
      websiteUrl: user.websiteUrl,
    };
  }

  function normalizeOptionalText(value: string | undefined) {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  app.post("/uploads", requireAuth, upload.single("file"), (req: AuthedRequest, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No valid image file provided. Accepted types: JPEG, PNG, GIF, WebP." });
      return;
    }
    const base64 = req.file.buffer.toString("base64");
    const url = `data:${req.file.mimetype};base64,${base64}`;
    res.status(201).json({ url });
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "ultra-fan-api", now: nowIso() });
  });

  app.post("/auth/signup", asyncHandler(async (req, res) => {
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
  }));

  app.post("/auth/login", asyncHandler(async (req, res) => {
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
  }));

  app.get("/me", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
    const user = await repo.findUserById(req.auth!.userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ user: sanitizeUser(user) });
  }));

  app.patch(
    "/me/creator-profile",
    requireAuth,
    requireRole("creator", "org_admin"),
    asyncHandler(async (req: AuthedRequest, res) => {
      const parsed = updateCreatorProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }

      const patch = {
        displayName: parsed.data.displayName?.trim(),
        bio: normalizeOptionalText(parsed.data.bio),
        hometown: normalizeOptionalText(parsed.data.hometown),
        profileImageUrl: normalizeOptionalText(parsed.data.profileImageUrl),
        websiteUrl: normalizeOptionalText(parsed.data.websiteUrl),
      };

      const updated = await repo.updateUserProfile(req.auth!.userId, patch);
      if (!updated) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json({ user: sanitizeUser(updated), artist: toCreatorProfile(updated) });
    }),
  );

  app.get("/artists/:artistUserId", asyncHandler(async (req, res) => {
    const artistUserId = String(req.params.artistUserId);
    const user = await repo.findUserById(artistUserId);
    if (!user || !isPublicCreatorRole(user.role)) {
      res.status(404).json({ error: "Artist not found" });
      return;
    }

    const events = await repo.listPublishedEventsByArtist(artistUserId);
    res.json({ artist: toCreatorProfile(user), events });
  }));

  app.get("/events", asyncHandler(async (_req, res) => {
    const published = await repo.listPublishedEvents();
    res.json({ events: published });
  }));

  app.post("/events", requireAuth, requireRole("creator", "org_admin"), asyncHandler(async (req: AuthedRequest, res) => {
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
  }));

  app.get("/events/:eventId", asyncHandler(async (req, res) => {
    const event = await repo.findEventById(String(req.params.eventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json({ event });
  }));

  app.patch("/events/:eventId", requireAuth, requireRole("creator", "org_admin", "support_admin"), asyncHandler(async (req: AuthedRequest, res) => {
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
  }));

  app.post("/events/:eventId/purchase", requireAuth, requireRole("fan", "support_admin", "org_admin", "creator"), asyncHandler(async (req: AuthedRequest, res) => {
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
  }));

  app.get("/me/library", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
    const library = await repo.listLibraryEvents(req.auth!.userId);
    res.json({ events: library });
  }));

  app.get("/events/:eventId/chat/messages", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
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
  }));

  app.post("/events/:eventId/chat/messages", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
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
      userProfileImageUrl: sender.profileImageUrl,
      body: parsedBody.data.body,
    });

    publishChatEvent(event.id, { type: "chat.message", message });
    res.status(201).json({ message });
  }));

  app.get("/events/:eventId/chat/stream", asyncHandler(async (req, res) => {
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
  }));

  app.get("/events/:eventId/control-room", requireAuth, requireRole("creator", "org_admin", "support_admin"), asyncHandler(async (req: AuthedRequest, res) => {
    const event = await repo.findEventById(String(req.params.eventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (!canManageEvent(req.auth, event)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const requestBaseUrl = getRequestBaseUrl(req);

    res.json({
      eventId: event.id,
      title: event.title,
      ingestUrl: event.ingestUrl,
      streamKey: event.streamKey,
      whipUrl: `${requestBaseUrl}/events/${event.id}/whip`,
      broadcastState: event.broadcastState,
      rehearsalActive: event.rehearsalActive,
    });
  }));

  app.post(
    "/events/:eventId/whip",
    requireAuth,
    requireRole("creator", "org_admin", "support_admin"),
    express.text({ type: ["application/sdp", "text/plain"], limit: SDP_BODY_LIMIT }),
    asyncHandler(async (req: AuthedRequest, res) => {
      const event = await repo.findEventById(String(req.params.eventId));
      if (!event) {
        res.status(404).json({ error: "Event not found" });
        return;
      }
      if (!canManageEvent(req.auth, event)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const offerSdp = typeof req.body === "string" ? req.body.trim() : "";
      if (!offerSdp) {
        res.status(400).json({ error: "Missing SDP offer body." });
        return;
      }

      const whipBaseUrl = process.env.WHIP_BASE_URL ?? DEFAULT_WHIP_BASE_URL;
      const upstreamWhipUrl = buildWhipUpstreamUrl(whipBaseUrl, event.streamKey);

      // Strip H265/HEVC — browsers advertise it but often can't encode it.
      const cleanedSdp = stripH265FromSdp(offerSdp);
      // pion/webrtc requires a trailing CRLF; .trim() above strips it.
      const sdpBuffer = Buffer.from(cleanedSdp + "\r\n", "utf-8");
      const url = new URL(upstreamWhipUrl);
      const transport = url.protocol === "https:" ? https : http;

      let upstreamStatus: number;
      let upstreamHeaders: http.IncomingHttpHeaders;
      let upstreamBody: string;
      try {
        ({ status: upstreamStatus, headers: upstreamHeaders, body: upstreamBody } = await new Promise<{
          status: number;
          headers: http.IncomingHttpHeaders;
          body: string;
        }>((resolve, reject) => {
          const proxyReq = transport.request(
            url,
            {
              method: "POST",
              headers: {
                "content-type": "application/sdp",
                "content-length": sdpBuffer.byteLength,
              },
            },
            (proxyRes) => {
              const chunks: Buffer[] = [];
              proxyRes.on("data", (c) => chunks.push(c));
              proxyRes.on("end", () =>
                resolve({
                  status: proxyRes.statusCode ?? 500,
                  headers: proxyRes.headers,
                  body: Buffer.concat(chunks).toString("utf-8"),
                }),
              );
              proxyRes.on("error", reject);
            },
          );
          proxyReq.on("error", reject);
          proxyReq.end(sdpBuffer);
        }));
      } catch {
        res.status(502).json({
          error: "WHIP upstream unreachable. Verify WHIP_BASE_URL and MediaMTX network access.",
        });
        return;
      }

      if (upstreamStatus < 200 || upstreamStatus >= 300) {
        const summary = upstreamBody.trim();
        res.status(upstreamStatus).json({
          error: summary || `WHIP upstream failed (${upstreamStatus}).`,
        });
        return;
      }

      if (upstreamHeaders.location) {
        res.setHeader("Location", upstreamHeaders.location);
      }
      res.type("application/sdp").status(upstreamStatus).send(upstreamBody);
    }),
  );

  app.post("/events/:eventId/broadcast/rehearsal/start", requireAuth, requireRole("creator", "org_admin", "support_admin"), asyncHandler(async (req: AuthedRequest, res) => {
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
  }));

  app.post("/events/:eventId/broadcast/go-live", requireAuth, requireRole("creator", "org_admin", "support_admin"), asyncHandler(async (req: AuthedRequest, res) => {
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
  }));

  app.post("/events/:eventId/broadcast/end", requireAuth, requireRole("creator", "org_admin", "support_admin"), asyncHandler(async (req: AuthedRequest, res) => {
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
  }));

  app.get("/events/:eventId/access-token", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
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
  }));

  if (fs.existsSync(clientIndexPath)) {
    app.use(express.static(clientDir, { etag: true, lastModified: true, maxAge: 0 }));
    app.get("/", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(clientIndexPath);
    });
  }

  // Global error handler – returns a proper JSON response instead of crashing.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (isPayloadTooLargeError(err)) {
      res.status(413).json({ error: `Request payload too large. Keep image data under ${JSON_BODY_LIMIT}.` });
      return;
    }

    const isDbError =
      err.constructor?.name === "PrismaClientInitializationError" ||
      err.constructor?.name === "PrismaClientKnownRequestError" ||
      err.message?.includes("Can't reach database server");

    console.error(isDbError ? "Database error:" : "Unhandled error:", err.message);

    if (isDbError) {
      res.status(503).json({ error: "Service temporarily unavailable" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
