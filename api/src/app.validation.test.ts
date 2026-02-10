import { describe, expect, it } from "vitest";
import { imageUrlSchema, isPayloadTooLargeError } from "./app.js";

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
