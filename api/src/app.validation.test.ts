import { describe, expect, it } from "vitest";
import {
  buildWhipUpstreamUrl,
  getRequestBaseUrl,
  imageUrlSchema,
  isPayloadTooLargeError,
} from "./app.js";

describe("image URL validation", () => {
  it("accepts a standard absolute URL", () => {
    const parsed = imageUrlSchema.safeParse("https://cdn.example.com/image.png");
    expect(parsed.success).toBe(true);
  });

  it("accepts data URLs for image uploads", () => {
    const parsed = imageUrlSchema.safeParse("data:image/png;base64,aGVsbG8=");
    expect(parsed.success).toBe(true);
  });

  it("accepts legacy /uploads paths", () => {
    const parsed = imageUrlSchema.safeParse("/uploads/legacy-avatar.png");
    expect(parsed.success).toBe(true);
  });

  it("rejects unsupported image URL values", () => {
    const parsed = imageUrlSchema.safeParse("not-a-valid-image-url");
    expect(parsed.success).toBe(false);
  });
});

describe("payload-too-large detection", () => {
  it("matches body parser entity.too.large errors", () => {
    expect(isPayloadTooLargeError({ type: "entity.too.large" })).toBe(true);
  });

  it("matches status-code based payload errors", () => {
    expect(isPayloadTooLargeError({ status: 413 })).toBe(true);
  });

  it("does not flag unrelated errors", () => {
    expect(isPayloadTooLargeError(new Error("boom"))).toBe(false);
  });
});

describe("WHIP URL helpers", () => {
  it("builds upstream WHIP URL with normalized base", () => {
    expect(buildWhipUpstreamUrl("https://media.example.com/", "uf_123")).toBe(
      "https://media.example.com/live/uf_123/whip",
    );
  });

  it("prefers forwarded proto/host when building request base URL", () => {
    const req = {
      protocol: "http",
      header(name: string) {
        if (name === "x-forwarded-proto") return "https";
        if (name === "x-forwarded-host") return "ultra-fan.example.com";
        return undefined;
      },
      get(name: string) {
        if (name === "host") return "localhost:4000";
        return undefined;
      },
    };
    expect(getRequestBaseUrl(req as never)).toBe("https://ultra-fan.example.com");
  });
});
