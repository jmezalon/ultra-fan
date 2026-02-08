# Parallel Task Board

## Track 1: Architecture
Owner: Architect Agent
Status: In progress

1. Define auth/authz model with role + ownership policy matrix.
2. Define event/broadcast/ticket/entitlement schema.
3. Define control-room APIs and stream state transitions.

## Track 2: Design
Owner: Design Agent
Status: In progress

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
Status: Pending

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
