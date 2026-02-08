# Ultra Fan Prototype

## Run locally
Run API first:

```bash
cd "/Users/mezalonm/Library/Mobile Documents/com~apple~CloudDocs/ultra-fan/api"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ultra_fan" npm run prisma:generate
USE_MEMORY_DB=true npm run dev
```

Then run prototype frontend:

```bash
cd "/Users/mezalonm/Library/Mobile Documents/com~apple~CloudDocs/ultra-fan/prototype"
python3 -m http.server 4173
```

Then open:
- http://localhost:4173

## Included flows
1. Discover concerts
2. Sign up / login against API
3. Buy virtual ticket (API-backed)
4. Request entitlement-gated stream token (API-backed)
5. Creator Studio dashboard with API-backed event creation
6. Per-event Control Room with API-backed rehearsal/go-live/end actions

## Next implementation steps
1. Connect real Postgres instance and run Prisma migrations.
2. Replace mock player with managed HLS playback.
3. Replace local chat demo with realtime backend service.
