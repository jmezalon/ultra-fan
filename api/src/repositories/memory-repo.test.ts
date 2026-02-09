import { describe, expect, it } from "vitest";
import { resetStore } from "../store.js";
import { MemoryRepository } from "./memory-repo.js";

describe("MemoryRepository chat", () => {
  it("stores, lists, and prunes chat messages", async () => {
    resetStore();
    const repo = new MemoryRepository();

    const creator = await repo.createUser({
      email: "creator@example.com",
      passwordHash: "hash",
      role: "creator",
      displayName: "Creator",
      organizationId: null,
    });

    const event = await repo.createEvent({
      artistUserId: creator.id,
      organizationId: null,
      title: "Live Set",
      description: "A live set for testing chat storage.",
      venue: "Austin, TX",
      startsAt: new Date(Date.now() + 3600_000).toISOString(),
      durationMin: 90,
      priceUsd: 9.99,
      replayHours: 24,
      published: true,
    });

    await repo.createChatMessage({
      eventId: event.id,
      userId: creator.id,
      userDisplayName: creator.displayName,
      body: "First",
    });
    await repo.createChatMessage({
      eventId: event.id,
      userId: creator.id,
      userDisplayName: creator.displayName,
      body: "Second",
    });

    const listed = await repo.listChatMessages({ eventId: event.id, limit: 10 });
    expect(listed).toHaveLength(2);
    expect(listed[0].body).toBe("First");
    expect(listed[1].body).toBe("Second");

    const deleted = await repo.deleteChatMessagesOlderThan(new Date(Date.now() + 10_000).toISOString());
    expect(deleted).toBe(2);

    const empty = await repo.listChatMessages({ eventId: event.id });
    expect(empty).toHaveLength(0);
  });
});
