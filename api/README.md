# Ultra Fan API (Initial Build Slice)

This service is the first production backend slice for Ultra Fan.

## Included in this slice
- Auth: signup/login and bearer-token auth
- Roles: `fan`, `creator`, `org_admin`, `support_admin`
- Events: creator-owned create/read/update
- Control room: rehearsal, go-live, end broadcast transitions
- Tickets: purchase flow and fan library
- Entitlement: signed short-lived playback token endpoint

## Run
```bash
cd "/Users/mezalonm/Library/Mobile Documents/com~apple~CloudDocs/ultra-fan/api"
npm install
npm run prisma:generate
npm run dev
```

Server default: `http://localhost:4000`

## Environment
Copy `.env.example` values into your shell or environment:
- `PORT`
- `JWT_SECRET`
- `PLAYBACK_SECRET`
- `DATABASE_URL`
- `USE_MEMORY_DB` (`false` uses Postgres+Prisma, `true` uses in-memory repository)

## Quick curl flow
1. Create creator account:
```bash
curl -s -X POST http://localhost:4000/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"creator@example.com","password":"password123","displayName":"Creator","role":"creator"}'
```
2. Create fan account and login similarly.
3. Create event (creator token required):
```bash
curl -s -X POST http://localhost:4000/events \
  -H 'content-type: application/json' \
  -H "authorization: Bearer <CREATOR_TOKEN>" \
  -d '{"title":"Tour Live","description":"Live concert event for remote fans.","venue":"New York, NY","startsAt":"2026-03-14T21:00:00Z","durationMin":90,"priceUsd":14.99,"replayHours":24,"published":true}'
```
4. Fan purchases ticket:
```bash
curl -s -X POST http://localhost:4000/events/<EVENT_ID>/purchase \
  -H "authorization: Bearer <FAN_TOKEN>"
```
5. Fan requests playback token:
```bash
curl -s http://localhost:4000/events/<EVENT_ID>/access-token \
  -H "authorization: Bearer <FAN_TOKEN>"
```

## Postgres setup
1. Start a local Postgres instance.
2. Set `DATABASE_URL` in environment.
3. Run:
```bash
npm run prisma:generate
npm run prisma:migrate -- --name init
```
