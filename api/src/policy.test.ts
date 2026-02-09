import { describe, expect, it } from "vitest";
import { canManageEvent, transitionBroadcast } from "./policy.js";
import { Event } from "./types.js";

const event: Event = {
  id: "evt_1",
  artistUserId: "usr_artist",
  organizationId: "org_1",
  title: "Live Show",
  description: "desc",
  venue: "NY",
  imageUrl: null,
  startsAt: "2026-03-14T21:00:00Z",
  durationMin: 90,
  priceUsd: 14.99,
  replayHours: 24,
  published: true,
  ingestUrl: "rtmps://ingest.example/live",
  streamKey: "key",
  broadcastState: "offline",
  rehearsalActive: false,
  createdAt: "2026-01-01T00:00:00Z",
};

describe("authorization policy", () => {
  it("allows creator owner", () => {
    expect(
      canManageEvent(
        { userId: "usr_artist", role: "creator", organizationId: null },
        event,
      ),
    ).toBe(true);
  });

  it("allows org admin for same org", () => {
    expect(
      canManageEvent(
        { userId: "usr_admin", role: "org_admin", organizationId: "org_1" },
        event,
      ),
    ).toBe(true);
  });

  it("denies unrelated creator", () => {
    expect(
      canManageEvent(
        { userId: "usr_other", role: "creator", organizationId: null },
        event,
      ),
    ).toBe(false);
  });

  it("allows support admin globally", () => {
    expect(
      canManageEvent(
        { userId: "usr_support", role: "support_admin", organizationId: null },
        event,
      ),
    ).toBe(true);
  });
});

describe("broadcast transitions", () => {
  it("supports offline -> ready -> live -> ended", () => {
    const ready = transitionBroadcast("offline", "rehearsal");
    const live = transitionBroadcast(ready, "go-live");
    const ended = transitionBroadcast(live, "end");

    expect(ready).toBe("ready");
    expect(live).toBe("live");
    expect(ended).toBe("ended");
  });

  it("rejects invalid go-live from offline", () => {
    expect(() => transitionBroadcast("offline", "go-live")).toThrow(
      "Event must be ready",
    );
  });
});
