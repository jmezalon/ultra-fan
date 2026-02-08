import { describe, expect, it } from "vitest";
import { signAccessToken, signPlaybackToken, verifyAccessToken } from "./auth.js";

describe("token auth", () => {
  it("signs and verifies access tokens with expected claims", () => {
    const token = signAccessToken({
      sub: "usr_1",
      role: "creator",
      organizationId: "org_1",
    });

    const claims = verifyAccessToken(token);

    expect(claims.sub).toBe("usr_1");
    expect(claims.role).toBe("creator");
    expect(claims.organizationId).toBe("org_1");
  });

  it("issues playback token payload", () => {
    const token = signPlaybackToken({
      userId: "usr_2",
      eventId: "evt_9",
      expiresInSec: 60,
    });

    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
  });
});
