# Ultra Fan MVP PRD

## 1. Document Control
- Product: Ultra Fan (Virtual Concert Access)
- Version: 1.0 (MVP)
- Date: February 8, 2026
- Owner: Founding Team
- Status: Draft for build kickoff

## 2. Problem Statement
Artists perform in specific locations, but many fans cannot attend due to distance, cost, capacity limits, or visa/travel constraints. Existing livestream options are fragmented and often lack reliable ticket gating, artist-friendly operations, and fan engagement tailored to concerts.

## 3. Product Vision
Enable artists to monetize live concerts beyond venue walls by selling secure virtual tickets to remote fans, delivering a high-quality low-latency livestream experience, and giving artists basic tools to manage events and audience reach.

## 4. MVP Goals and Non-Goals

### Goals
1. Let artists create and publish virtual-access concert events.
2. Let fans purchase virtual tickets and access livestreams only when entitled.
3. Deliver reliable live playback across geographies.
4. Provide a minimal interactive fan layer (chat/reactions).
5. Give artists/admins basic analytics (sales + live viewership).
6. Provide a professional creator control room to start and manage live broadcasts easily.

### Non-Goals
1. Multi-camera live switching studio.
2. Advanced DRM and anti-piracy watermarking.
3. Subscription memberships/fan clubs.
4. Full promoter/venue white-label offering.
5. Native iOS/Android apps (MVP is responsive web).

## 5. Target Users

### Primary Personas
1. Independent and mid-tier musical artists.
2. Fans unable to attend in-person concerts.

### Secondary Persona
1. Artist manager or tour operator acting as event admin.

## 6. Success Metrics (MVP)

### North-Star Metric
- Gross Merchandise Value (GMV) from virtual concert ticket sales.

### Supporting Metrics
1. Event publish-to-live conversion rate.
2. Ticket purchase conversion rate from event page views.
3. Stream start success rate (paid fan reaches playback within 15 seconds).
4. Live stream uptime during event window.
5. Concurrent viewers at peak and median watch time.
6. Refund rate due to technical failure.
7. Creator setup success rate (artist can connect encoder and go live without support).

### Initial Targets (first 90 days)
1. >=95% stream start success rate.
2. >=99.5% livestream availability during scheduled live window.
3. <3% technical-failure refund rate.

## 7. Key User Stories

### Fan
1. As a fan, I can browse upcoming live virtual concerts.
2. As a fan, I can buy a virtual ticket using card payment.
3. As a fan, I can see my purchased events in a simple library.
4. As a fan, I can join the stream during the live window if I purchased access.
5. As a fan, I can use chat/reactions while watching.
6. As a fan, I can view replay for a limited period if event allows it.

### Artist/Admin
1. As an artist, I can create an event with title, date/time, price, and description.
2. As an artist, I can publish/unpublish event pages.
3. As an artist, I can connect payout details.
4. As an artist, I can start a stream using encoder ingest credentials.
5. As an artist, I can see ticket sales and live audience metrics.
6. As an artist, I can set up stream ingest details with one copy/paste setup guide.
7. As an artist, I can verify encoder health and preview feed before going live.
8. As an artist, I can start/end the broadcast with clear stream state indicators.

### Support/Admin
1. As support staff, I can verify fan entitlement and issue refunds.

## 8. Functional Requirements

### 8.1 Authentication and Accounts
1. Email/password sign-up and sign-in for fans and artists.
2. Password reset flow.
3. Role model: `fan`, `artist`, `admin`.

### 8.2 Artist Onboarding
1. Artist profile creation (name, bio, image).
2. Payout onboarding status tracking.
3. Terms acceptance and content rights confirmation checkbox.

### 8.3 Event Management
1. Create event with:
   - Title
   - Artist
   - Scheduled start date/time + timezone
   - Duration estimate
   - Virtual ticket price + currency
   - Optional replay window (hours)
   - Cover image + description
2. Event lifecycle states:
   - `draft`
   - `published`
   - `live`
   - `ended`
3. Public event page with purchase CTA.

### 8.4 Ticketing and Payments
1. Checkout for virtual ticket purchase.
2. Unique entitlement per user per event.
3. Payment success/failure webhook handling.
4. Refund support flow (manual in MVP).

### 8.5 Livestream Access
1. Artist receives ingest key/URL for encoder setup.
2. Fan playback URL issued only when entitlement valid.
3. Time-window gating (live or replay window only).
4. Session controls:
   - short-lived playback token
   - max active devices per account (configurable, default 2)

### 8.5.1 Creator Live Control Room
1. Per-event control room with stream state: `offline`, `ready`, `live`, `ended`.
2. Ingest setup block with server URL + stream key + copy controls.
3. Encoder connection health checks: video bitrate present, audio present, keyframe interval, stream stability.
4. Private rehearsal preview before public go-live.
5. One-click actions:
   - Start rehearsal
   - Go live
   - End stream
6. Fallback UX when encoder disconnects during live: warning banner + auto-reconnect timer.

### 8.6 Live Engagement
1. Event-level chat room.
2. Rate-limited reactions.
3. Basic moderation: mute user, remove message.

### 8.7 Analytics and Reporting
1. Artist dashboard metrics:
   - Tickets sold
   - Revenue (gross and net estimate)
   - Live viewers (current, peak)
2. Admin panel view for troubleshooting access failures.

### 8.8 Notifications
1. Purchase receipt email.
2. Event reminder email (24h and 15m before start).
3. “Live now” notification email.

## 9. Non-Functional Requirements
1. Performance: first player frame under 5 seconds on broadband for 95th percentile.
2. Reliability: player availability 99.5% during event windows.
3. Security:
   - signed playback URLs
   - encrypted transport (HTTPS)
   - PCI scope minimized via hosted payment flows
4. Scalability: support at least 10,000 concurrent viewers in MVP.
5. Accessibility: WCAG 2.1 AA baseline for major user journeys.
6. Observability:
   - centralized logs
   - event-level monitoring and alerting

## 10. Assumptions and Constraints
1. Managed streaming provider is used for MVP to reduce infra complexity.
2. Stripe (or equivalent) used for payments and payouts.
3. Geographic licensing handled contractually by artist; platform enforces optional geo-restriction flag only if needed.
4. Team size is small, so support tooling remains minimal/manual in MVP.

## 11. Risks and Mitigations
1. Stream instability
   - Mitigation: managed video provider, pre-show health checks, redundant ingest guidance.
2. Account sharing/piracy
   - Mitigation: short-lived tokens, concurrent session limits, IP/device heuristics.
3. Chargebacks/refunds
   - Mitigation: clear policies, failure event logs, quick support workflow.
4. Licensing/legal disputes
   - Mitigation: rights attestation on event creation and explicit content policy.

## 12. Dependencies
1. Payment gateway and payout onboarding provider.
2. Video ingest/transcode/playback provider.
3. Email delivery provider.
4. Cloud hosting and CDN.
5. Realtime signaling channel for creator studio health events.

## 13. Data Model (MVP)
1. `users` (id, role, email, password_hash, created_at)
2. `artists` (id, user_id, display_name, bio, payout_status)
3. `events` (id, artist_id, title, starts_at, duration_min, price_cents, status, replay_hours)
4. `tickets` (id, event_id, user_id, purchase_status, payment_id)
5. `entitlements` (id, ticket_id, valid_from, valid_until, device_limit)
6. `stream_sessions` (id, user_id, event_id, started_at, ended_at, ip, device_id)
7. `chat_messages` (id, event_id, user_id, body, created_at, moderated)
8. `broadcasts` (id, event_id, ingest_url, stream_key_hash, state, started_at, ended_at)
9. `broadcast_health_events` (id, broadcast_id, level, code, payload, created_at)

## 14. API Surface (Representative)
1. `POST /auth/signup`
2. `POST /auth/login`
3. `POST /artists/onboard`
4. `POST /events`
5. `GET /events`
6. `GET /events/:id`
7. `POST /events/:id/purchase`
8. `GET /events/:id/access-token`
9. `GET /me/library`
10. `GET /artists/:id/dashboard`
11. `GET /events/:id/control-room`
12. `POST /events/:id/broadcast/rehearsal/start`
13. `POST /events/:id/broadcast/go-live`
14. `POST /events/:id/broadcast/end`
15. `GET /events/:id/broadcast/health`

## 15. UX Scope (MVP Screens)
1. Marketing/home + event discovery
2. Event detail + purchase
3. Checkout success
4. Fan library
5. Livestream player page (chat/reactions)
6. Artist dashboard (events + metrics)
7. Artist event editor
8. Creator control room (ingest setup, rehearsal preview, health monitor, go-live controls)

## 16. Release Plan

### Milestone 1 (Weeks 1-2)
1. Product specs finalized
2. Clickable prototype approved
3. Vendor selection complete

### Milestone 2 (Weeks 3-6)
1. Authentication, event CRUD, checkout, entitlement logic
2. Stream player integration
3. Basic dashboards

### Milestone 3 (Weeks 7-8)
1. Beta hardening and load tests
2. Incident playbook and support workflows
3. Closed beta launch with pilot artists

## 17. Acceptance Criteria (MVP Exit)
1. Artist can publish event and sell virtual tickets.
2. Fan can purchase and access live stream with valid entitlement.
3. Unauthorized users cannot access playback manifest URL.
4. Artist dashboard shows sales and live audience metrics.
5. Support can process refunds and resolve access tickets.
6. Artist can connect OBS/RTMP encoder and pass pre-live checks from control room.
7. Artist can move stream through offline -> ready -> live -> ended states without operator help.
