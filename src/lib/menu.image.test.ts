import { describe, it, expect } from "vitest";
import { menuImageSrc } from "./menu";

const API_URL = import.meta.env.VITE_API_URL as string;

describe("menuImageSrc", () => {
  it("prefers the uploaded image, even when a legacy link is also present", () => {
    const src = menuImageSrc({ imageUrl: "https://example.com/old.jpg", imageHash: "abc123" }, "item-1");

    expect(src).toBe(`${API_URL}/menu/items/item-1/image/abc123`);
    // The point of the whole feature: once bytes are ours, we stop asking
    // someone else's server for the picture.
    expect(src).not.toContain("example.com");
  });

  it("falls back to the legacy pasted link when nothing has been uploaded", () => {
    expect(menuImageSrc({ imageUrl: "https://example.com/old.jpg", imageHash: null }, "item-1")).toBe(
      "https://example.com/old.jpg"
    );
  });

  it("treats a missing imageHash field the same as a null one", () => {
    // Order lines and menu summaries type it optional, not nullable.
    expect(menuImageSrc({ imageUrl: "https://example.com/old.jpg" }, "item-1")).toBe(
      "https://example.com/old.jpg"
    );
  });

  it("returns null when there is no image at all, so callers draw a placeholder", () => {
    expect(menuImageSrc({ imageUrl: null, imageHash: null }, "item-1")).toBeNull();
  });

  it("ignores empty strings rather than emitting a src that resolves to the current page", () => {
    // An <img src=""> re-requests the document itself, which is a wasted round
    // trip and renders as a broken image.
    expect(menuImageSrc({ imageUrl: "", imageHash: "" }, "item-1")).toBeNull();
  });

  it("escapes the id and hash it is given", () => {
    expect(menuImageSrc({ imageUrl: null, imageHash: "a/b" }, "it em")).toBe(
      `${API_URL}/menu/items/it%20em/image/a%2Fb`
    );
  });
});
