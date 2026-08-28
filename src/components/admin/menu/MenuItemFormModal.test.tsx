import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MenuItemFormModal } from "./MenuItemFormModal";
import { apiClient } from "../../../lib/apiClient";
import type { Category, MenuItem } from "../../../types/admin";

// Partial: `ApiClientError` stays real, because adminErrorMessage narrows on it
// to turn a backend error code into admin-facing copy.
vi.mock("../../../lib/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/apiClient")>();
  return {
    ...actual,
    apiClient: { post: vi.fn(), patch: vi.fn(), delete: vi.fn(), upload: vi.fn() },
  };
});

/**
 * The encoder needs real image codecs and a real canvas; jsdom has neither, so
 * it is stubbed to hand back a blob of the shape it would produce in a browser.
 * Its own guards are covered in lib/imageEncode.test.ts — what is under test
 * here is what the modal DOES with the result.
 */
vi.mock("../../../lib/imageEncode", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/imageEncode")>();
  return {
    ...actual,
    encodeMenuItemImage: vi.fn(async () => ({
      blob: new Blob([new Uint8Array(4096)], { type: "image/webp" }),
      width: 960,
      height: 720,
    })),
  };
});

const categories: Category[] = [{ id: "cat-1", name: "Snacks", sortOrder: 0, items: [] }];

const existingItem: MenuItem = {
  id: "item-7",
  name: "Samosa",
  imageUrl: null,
  imageHash: "hash-old",
  price: "20.00",
  stockQty: 12,
  categoryId: "cat-1",
  isAvailable: true,
  sortOrder: 0,
};

function renderModal(editing: MenuItem | null, onSaved = vi.fn()) {
  const utils = render(
    <MenuItemFormModal
      editing={editing}
      categories={categories}
      token="admin-token"
      onSaved={onSaved}
      onClose={vi.fn()}
    />
  );
  return { ...utils, onSaved };
}

function fillNewItem() {
  fireEvent.change(screen.getByLabelText("Item name"), { target: { value: "Vada Pav" } });
  fireEvent.change(screen.getByLabelText("Price (₹)"), { target: { value: "25" } });
  fireEvent.change(screen.getByLabelText("Stock"), { target: { value: "30" } });
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "cat-1" } });
}

async function pickPhoto() {
  const file = new File([new Uint8Array(2048)], "photo.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getByLabelText("Photo"), { target: { files: [file] } });
  // The picker is async (decode + encode), so wait for the preview to land.
  await screen.findByText("New photo ready");
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom ships neither.
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  (apiClient.post as any).mockResolvedValue({ ...existingItem, id: "item-new" });
  (apiClient.patch as any).mockResolvedValue({});
  (apiClient.upload as any).mockResolvedValue({ imageHash: "hash-new" });
  (apiClient.delete as any).mockResolvedValue(undefined);
});

describe("MenuItemFormModal photo upload", () => {
  it("no longer asks for a pasted image URL", () => {
    renderModal(null);
    expect(screen.queryByLabelText("Image URL")).toBeNull();
    expect(screen.getByLabelText("Photo")).toHaveAttribute("type", "file");
  });

  it("creates the item first, then uploads the photo against the id it got back", async () => {
    const { onSaved } = renderModal(null);
    fillNewItem();
    await pickPhoto();

    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    // Step 1: text fields only. imageUrl must NOT be sent — the item is created
    // imageless and the picture arrives separately.
    expect(apiClient.post).toHaveBeenCalledWith(
      "/admin/menu-items",
      { name: "Vada Pav", price: "25", stockQty: 30, categoryId: "cat-1" },
      "admin-token"
    );
    expect((apiClient.post as any).mock.calls[0][1]).not.toHaveProperty("imageUrl");

    // Step 2: the encoded bytes, addressed to the brand-new id.
    const [path, body, token] = (apiClient.upload as any).mock.calls[0];
    expect(path).toBe("/admin/menu-items/item-new/image");
    expect(token).toBe("admin-token");
    expect(body).toBeInstanceOf(FormData);
    const part = (body as FormData).get("file");
    expect(part).toBeInstanceOf(File);
    // The filename is what makes the server see a File instead of a string.
    expect((part as File).name).toBe("menu-item.webp");
    expect((part as File).type).toBe("image/webp");
  });

  it("keeps the created item and retries the photo without creating a duplicate", async () => {
    (apiClient.upload as any).mockRejectedValueOnce(new Error("Network down"));
    const { onSaved } = renderModal(null);
    fillNewItem();
    await pickPhoto();

    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

    // The item saved; only the picture did not. The modal says so and stays open.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/item is saved/i);
    expect(onSaved).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    // The retry PATCHed the item it already created rather than POSTing a second one.
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.patch).toHaveBeenCalledWith(
      "/admin/menu-items/item-new",
      expect.objectContaining({ name: "Vada Pav" }),
      "admin-token"
    );
    expect(apiClient.upload).toHaveBeenCalledTimes(2);
  });

  it("touches no image endpoint when editing an item and leaving its photo alone", async () => {
    const { onSaved } = renderModal(existingItem);
    fireEvent.change(screen.getByLabelText("Price (₹)"), { target: { value: "22" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(apiClient.patch).toHaveBeenCalledWith(
      "/admin/menu-items/item-7",
      expect.objectContaining({ price: "22" }),
      "admin-token"
    );
    expect(apiClient.upload).not.toHaveBeenCalled();
    expect(apiClient.delete).not.toHaveBeenCalled();
  });

  it("deletes the stored image only on save, so Remove is undoable", async () => {
    const { onSaved } = renderModal(existingItem);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(apiClient.delete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(apiClient.delete).toHaveBeenCalledWith("/admin/menu-items/item-7/image", "admin-token");
  });

  it("shows the encoder's own message and saves nothing when a file is rejected", async () => {
    const { encodeMenuItemImage } = await import("../../../lib/imageEncode");
    (encodeMenuItemImage as any).mockRejectedValueOnce(new Error("That photo is 9.4 MB. Pick one under 5.0 MB."));

    renderModal(null);
    fireEvent.change(screen.getByLabelText("Photo"), {
      target: { files: [new File(["x"], "huge.jpg", { type: "image/jpeg" })] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("That photo is 9.4 MB. Pick one under 5.0 MB.");
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("does not double-POST when handleSubmit fires twice before the first call yields state", async () => {
    // setSaving(true) is not synchronous, so the button's `disabled` attribute
    // cannot be what stops a second overlapping call — the guard under test
    // is the synchronous ref inside handleSubmit itself. Firing submit twice
    // back-to-back, with no `await` between, reproduces two invocations that
    // both start before either has committed a state update.
    let resolvePost!: (item: MenuItem) => void;
    (apiClient.post as any).mockReturnValueOnce(
      new Promise<MenuItem>((resolve) => {
        resolvePost = resolve;
      })
    );

    const { onSaved } = renderModal(null);
    fillNewItem();

    const submitButton = screen.getByRole("button", { name: "Add item" });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    resolvePost({ ...existingItem, id: "item-new" });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  it("renders an existing uploaded photo from the content-addressed URL", () => {
    renderModal(existingItem);
    const img = document.querySelector("img");
    expect(img?.getAttribute("src")).toBe(
      `${import.meta.env.VITE_API_URL}/menu/items/item-7/image/hash-old`
    );
    expect(screen.getByText("Current photo")).toBeInTheDocument();
  });
});
