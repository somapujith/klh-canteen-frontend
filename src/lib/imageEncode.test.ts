import { describe, it, expect, vi, afterEach } from "vitest";
import { encodeMenuItemImage, formatBytes, MAX_SOURCE_BYTES } from "./imageEncode";

/**
 * jsdom has no image codecs and no real canvas, so the encode path itself is
 * only meaningfully exercised in a browser (see the Playwright suite for that).
 * What IS testable here is the gate in front of it: the two rejections that
 * happen before a single byte is decoded, which are also the two an admin is
 * most likely to hit.
 */
describe("encodeMenuItemImage guards", () => {
  it("rejects a file over the 5 MB source cap before attempting to decode it", async () => {
    const oversized = new File([new Uint8Array(MAX_SOURCE_BYTES + 1)], "huge.jpg", { type: "image/jpeg" });

    await expect(encodeMenuItemImage(oversized)).rejects.toThrow(/under 5\.0 MB/);
  });

  it("rejects a non-image file", async () => {
    const notAnImage = new File(["id,name\n1,tea"], "menu.csv", { type: "text/csv" });

    await expect(encodeMenuItemImage(notAnImage)).rejects.toThrow(/not an image/i);
  });

  it("accepts a file exactly at the cap, so the limit is not off by one", async () => {
    const exact = new File([new Uint8Array(MAX_SOURCE_BYTES)], "big.jpg", { type: "image/jpeg" });

    // It still fails — jsdom cannot decode — but on decoding, not on size.
    await expect(encodeMenuItemImage(exact)).rejects.toThrow(/could not be read/);
  });
});

/**
 * jsdom has no `createImageBitmap`, so the decoded-pixel gate needs the
 * global stubbed to hand back a bitmap of a controlled size — the point is
 * to prove the megapixel check runs (and closes the bitmap) before anything
 * downstream, not to exercise a real decode.
 */
describe("encodeMenuItemImage megapixel cap", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a decoded bitmap over the 40 MP cap without drawing to canvas", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 12000, height: 9000, close })) // 108 MP
    );

    const file = new File([new Uint8Array(1024)], "panorama.jpg", { type: "image/jpeg" });

    await expect(encodeMenuItemImage(file)).rejects.toThrow(/too large/i);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("proceeds past the cap check for a bitmap within budget", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })) // 12 MP
    );

    const file = new File([new Uint8Array(1024)], "photo.jpg", { type: "image/jpeg" });

    // It still fails past this point — jsdom's canvas cannot really encode —
    // but the message proves the megapixel gate let it through.
    await expect(encodeMenuItemImage(file)).rejects.not.toThrow(/too large/i);
  });
});

describe("formatBytes", () => {
  it("reads as something an admin can act on", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(90_000)).toBe("88 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
