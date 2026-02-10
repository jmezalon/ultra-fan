# Parallel Task Board

## Track 1: Architecture
Owner: Architect Agent
Status: In progress (backend foundation + realtime chat persistence added; creator image upload reliability hardened; camera ingest WHIP proxy path added)

1. Define auth/authz model with role + ownership policy matrix.
2. Define event/broadcast/ticket/entitlement schema.
3. Define control-room APIs and stream state transitions.

## Track 2: Design
Owner: Design Agent
Status: In progress (professional-grade client UX shell implemented; avatar reliability + chat identity polish added; fan live-player wake-lock hardening added; validation/polish pending)

1. Produce creator control-room UX for pro setup.
2. Produce fan states for entitlement, waiting room, live, replay ended.
3. Define incident and degraded-stream UI copy.

## Track 3: Testing
Owner: Test Agent
Status: Pending

1. Build test plan focused on authz, payments, and broadcast state machine.
2. Define automated minimum suite for MVP release.
3. Define manual live-event rehearsal checklist.

## Track 4: CI/CD
Owner: CI/CD Agent
Status: In progress (Heroku release wiring in progress)

1. Implement baseline CI workflow gates.
2. Define staged deployment strategy.
3. Add rollback and release safety checks.

## Track 5: Product Management
Owner: Product Manager Agent
Status: In progress

1. Convert PRD into sprint-ready backlog items.
2. Maintain dependency map across tracks.
3. Issue go/no-go rubric for MVP release.

## Integration Rules
1. No track can change shared API contracts without Architect approval.
2. No release proceeds without Test + CI/CD signoff.
3. PM agent resolves scope conflicts within 24 hours.

## Decision Log
- 2026-02-08: Added Creator Control Room as MVP-critical surface.
- 2026-02-08: Prioritized auth/authz planning before backend feature expansion.
- 2026-02-08: Started API implementation slice with auth, role checks, event ownership, ticket purchase, and control-room transitions.
- 2026-02-09: Connected prototype client to API-first fan and creator flows (`/me/library`, `/events/:id/access-token`, `/events/:id/control-room`, broadcast transition actions), including resilient error handling and route-aware data loading.
- 2026-02-09: Replaced prototype UI shell with professional, flow-led client experience featuring explicit fan/creator journeys, stateful control-room timeline, responsive layout, and API-backed operational messaging.
- 2026-02-09: Added entitlement/ownership-gated event chat backend with realtime SSE fan-out and persistent message storage (`ChatMessage`) retained for a minimum 24-hour replay window.
- 2026-02-10: Added public artist profile support (`/artists/:artistUserId`) and creator-editable profile metadata, then integrated fan-facing host information on event pages plus a dedicated artist profile page.
- 2026-02-10: Started CI/CD deployment track implementation with Heroku runtime wiring so one service can serve both API and the professional client UI from a shared production origin.
- 2026-02-10: Added social metadata in the prototype client (`twitter:card` and Open Graph tags), shipped a branded Twitter card image, and set the Ultra Fan logo as favicon/app icon.
- 2026-02-10: Fixed portrait rendering fallbacks across account/profile surfaces, added navbar avatar image support with initial fallback, and surfaced chat participant avatars next to names.
- 2026-02-10: Handoff note (Design -> Architecture): Added optional chat payload enrichment (`userProfileImageUrl`) so chat UI can render participant avatars when available without relaxing authz/entitlement checks.
- 2026-02-10: Fixed creator profile image upload reliability by increasing JSON payload limit for base64 image submissions, returning HTTP 413 for oversized payloads, and restoring `/uploads/*` compatibility in image validation + static serving for legacy stored paths.
- 2026-02-10: Fixed control-room camera start failures by proxying WHIP ingest through an authz-checked API endpoint (`/events/:eventId/whip`), returning same-origin `whipUrl` from control-room payload, and surfacing upstream WHIP errors in client toasts for faster operator diagnosis.
- 2026-02-10: Added fan watch-player wake-lock handling so supported browsers request `screen` wake lock while live video is playing and release it on pause/end/rerender/visibility changes to reduce unintended device sleep during active streams.
