import { describe, expect, it } from "vitest";
import { chatMessages, events, hasTicket, resetStore, tickets, users } from "./store.js";

describe("store helpers", () => {
  it("resets all in-memory collections", () => {
    users.push({
      id: "usr_x",
      email: "x@example.com",
      passwordHash: "h",
      role: "fan",
      displayName: "X",
      organizationId: null,
      createdAt: new Date().toISOString(),
    });

    events.push({
      id: "evt_x",
      artistUserId: "usr_x",
      organizationId: null,
      title: "title",
      description: "description",
      venue: "venue",
      imageUrl: null,
      startsAt: new Date().toISOString(),
      durationMin: 60,
      priceUsd: 10,
      replayHours: 24,
      published: true,
      ingestUrl: "rtmps://example",
      streamKey: "key",
      broadcastState: "offline",
      rehearsalActive: false,
      createdAt: new Date().toISOString(),
    });

    tickets.push({
      id: "tkt_x",
      eventId: "evt_x",
      userId: "usr_x",
      purchasedAt: new Date().toISOString(),
    });

    chatMessages.push({
      id: "msg_x",
      eventId: "evt_x",
      userId: "usr_x",
      userDisplayName: "X",
      body: "hello world",
      createdAt: new Date().toISOString(),
    });

    expect(users.length).toBe(1);
    expect(events.length).toBe(1);
    expect(tickets.length).toBe(1);
    expect(chatMessages.length).toBe(1);
    expect(hasTicket("usr_x", "evt_x")).toBe(true);

    resetStore();

    expect(users.length).toBe(0);
    expect(events.length).toBe(0);
    expect(tickets.length).toBe(0);
    expect(chatMessages.length).toBe(0);
  });
});
