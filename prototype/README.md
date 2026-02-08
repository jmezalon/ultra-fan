# Ultra Fan Prototype

## Run locally
From the workspace root:

```bash
cd "/Users/mezalonm/Library/Mobile Documents/com~apple~CloudDocs/ultra-fan/prototype"
python3 -m http.server 4173
```

Then open:
- http://localhost:4173

## Included flows
1. Discover concerts
2. Buy virtual ticket (mocked)
3. Access gated stream page
4. Send chat message/reactions (mocked)
5. Creator Studio dashboard
6. Per-event Control Room: ingest URL/key, preflight checks, rehearsal, go-live/end-live

## Next implementation steps
1. Replace mocked ticket purchase with Stripe Checkout.
2. Replace mocked stream player with managed HLS provider playback.
3. Add backend API for events, entitlements, and chat.
