# Ultra Fan

Ultra Fan is a virtual concert platform where artists run professional livestream events and remote fans purchase tickets to watch live from anywhere.

## Why This Exists
Artists are constrained by venue geography. Ultra Fan extends concert reach and revenue by combining:
- ticketed livestream access for remote fans
- creator-grade live production controls
- secure entitlement-based stream delivery

## Current Project State
This repository currently contains:
- an MVP product requirements document (PRD)
- a clickable prototype for fan and creator flows
- a parallel agent operating model for fast execution

## Repository Structure
- `docs/mvp-prd.md`: detailed MVP PRD and acceptance criteria
- `prototype/index.html`: prototype entry page
- `prototype/styles.css`: prototype styling
- `prototype/app.js`: prototype behavior and creator control-room simulation
- `prototype/README.md`: prototype run instructions
- `agents/`: role-specific agent playbooks and handoff protocol

## MVP Scope (Product)
- fan discovery, checkout, library, and gated playback
- artist event setup and creator control room
- professional go-live workflow (ingest setup, health checks, rehearsal, live state)
- basic chat/reactions and event analytics

## MVP Scope (Technical)
- web-first experience (responsive desktop/mobile)
- managed streaming provider for ingest/transcode/playback
- payment + entitlement gating
- role-based access control for fans/creators/admins
- operational observability for stream health and support

## Authentication and Authorization Direction
Start this now; do not defer.

### Authentication
- Single user model with role claims
- Initial roles: `fan`, `creator`, `org_admin`, `support_admin`
- Access + refresh token strategy (or secure session equivalent)

### Authorization
- Creator permissions scoped to their organization/event ownership
- Fan playback access scoped to valid ticket entitlement and active event window
- Control-room actions (`go-live`, `end-stream`, key rotation) restricted to authorized creator/org roles

### Security
- signed short-lived playback tokens
- stream key rotation support
- device/session limits for entitlement protection

## Run The Prototype
```bash
cd "/Users/mezalonm/Library/Mobile Documents/com~apple~CloudDocs/ultra-fan/prototype"
python3 -m http.server 4173
```
Open: [http://localhost:4173](http://localhost:4173)

## Parallel Team Model (Agents)
Use the playbooks in `agents/` to run workstreams in parallel safely.

Recommended parallel tracks:
1. Architecture + backend contracts
2. UX/UI + creator workflow polish
3. QA + test strategy and automation
4. CI/CD + deployment and release safety
5. Product management + delivery planning and decision logs

## Delivery Principles
- keep MVP vertical slices end-to-end
- protect stream reliability and paid access first
- design for many artists/many events from day one
- enforce explicit ownership and handoffs across workstreams

## Suggested Next Build Slice
1. Implement auth + role model
2. Implement event CRUD + creator ownership checks
3. Implement ticket purchase + entitlement records
4. Implement control-room API state machine (`offline -> ready -> live -> ended`)
5. Implement signed playback-token endpoint

## Contributing Workflow
- create focused branches (prefix with `codex/`)
- keep PRs small and testable
- include acceptance criteria references from `docs/mvp-prd.md`
- require passing CI before merge

## Notes
- This repo is intentionally starting lean.
- The agent framework in this repo is meant to accelerate parallel execution while reducing coordination risk.


## Backend API (Now Added)
- Initial production API scaffold is in `api/`.
- See `api/README.md` for run instructions and endpoint flow.
