import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "../../../lib/apiClient";
import { adminErrorMessage } from "../../../lib/adminUsers";
import { isValidPrice } from "../../../lib/menuAdmin";
import { menuImageSrc } from "../../../lib/menu";
import { encodeMenuItemImage, encodedFileName, formatBytes, MAX_SOURCE_BYTES } from "../../../lib/imageEncode";
import type { Category, MenuItem } from "../../../types/admin";

interface FormState {
  name: string;
  price: string;
  stockQty: string;
  categoryId: string;
  servingInfo: string;
  servingInfoVisible: boolean;
}

/** A file the admin has picked, already resized and compressed, waiting on save. */
interface PendingImage {
  blob: Blob;
  /** Object URL for the preview. Revoked when replaced or on unmount. */
  previewUrl: string;
  width: number;
  height: number;
}

interface Props {
  /** `null` creates a new item; a MenuItem edits that item. */
  editing: MenuItem | null;
  categories: Category[];
  /** Preselected section when adding from inside a category. */
  defaultCategoryId?: string;
  token: string | null;
  onSaved: () => void;
  onClose: () => void;
}

/**
 * Creating and editing an item both live here, behind a button, rather than in
 * a form permanently parked above the menu. The page's daily job is adjusting
 * stock and visibility; adding an item is a weekly one, and it was taking the
 * whole first screen.
 *
 * The photo is uploaded, not linked. Pasting a URL used to be the only option,
 * and it meant every menu tile depended on someone else's server staying up —
 * images went dead weeks later with nobody watching. Now the file is resized in
 * the browser (see lib/imageEncode.ts) and the bytes are stored in our own
 * database, so a picture that renders today renders forever.
 */
export function MenuItemFormModal({ editing, categories, defaultCategoryId, token, onSaved, onClose }: Props) {
  const [form, setForm] = useState<FormState>(() => ({
    name: editing?.name ?? "",
    price: editing?.price ?? "",
    stockQty: editing ? String(editing.stockQty) : "",
    categoryId: editing?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? "",
    servingInfo: editing?.servingInfo ?? "",
    servingInfoVisible: editing?.servingInfoVisible ?? false,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [picked, setPicked] = useState<PendingImage | null>(null);
  const [encoding, setEncoding] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** Set by the Remove button; the DELETE only fires on save, so it is undoable. */
  const [removeImage, setRemoveImage] = useState(false);
  const [existingBroken, setExistingBroken] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * The id of an item this modal created. Step 2 (the upload) can fail after
   * step 1 (the item) succeeded; without this, hitting Save again would create a
   * second copy of the item instead of retrying the photo on the first one.
   */
  const createdIdRef = useRef<string | null>(null);

  /**
   * Guards against two overlapping `handleSubmit` calls, not just sequential
   * retries. The Save button's `disabled` attribute is driven by `saving`
   * state, and state updates are not synchronous — so two invocations that
   * both start before either has committed a state update can both read
   * `itemId` as unset and both POST a new item. A ref is checked and flipped
   * synchronously, before any `await`, so the second call always sees the
   * first one already in flight.
   */
  const submittingRef = useRef(false);

  const existingSrc = editing ? menuImageSrc(editing, editing.id) : null;
  const hasStoredImage = Boolean(editing?.imageHash);
  const isLegacyLink = Boolean(!editing?.imageHash && editing?.imageUrl);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  // Object URLs are held by the document until explicitly released; a few
  // replacements in one sitting otherwise pin several megabytes of blob.
  useEffect(() => {
    if (!picked) return;
    return () => URL.revokeObjectURL(picked.previewUrl);
  }, [picked]);

  async function acceptFile(file: File | undefined | null) {
    if (!file) return;
    setError(null);
    setEncoding(true);
    try {
      const encoded = await encodeMenuItemImage(file);
      setPicked({
        blob: encoded.blob,
        previewUrl: URL.createObjectURL(encoded.blob),
        width: encoded.width,
        height: encoded.height,
      });
      setRemoveImage(false);
      setExistingBroken(false);
    } catch (err) {
      // encodeMenuItemImage throws messages written for this exact surface.
      setError(err instanceof Error ? err.message : "That photo could not be prepared.");
    } finally {
      setEncoding(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    setDragging(false);
    if (saving || encoding) return;
    void acceptFile(e.dataTransfer.files?.[0]);
  }

  function clearImage() {
    if (picked) {
      setPicked(null);
      return;
    }
    setRemoveImage(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Synchronous, before any await: this is what closes the window a
    // React-state-driven `disabled` attribute cannot, between two overlapping
    // invocations that both start before `saving` has committed.
    if (submittingRef.current) return;
    if (!isValidPrice(form.price)) {
      setError("Enter a price like 20 or 20.50.");
      return;
    }
    if (encoding) {
      setError("The photo is still being prepared — try again in a second.");
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    setError(null);

    try {
      // `imageUrl` is deliberately absent. The API treats it as optional now, so
      // omitting it leaves a legacy link on an old item exactly as it was rather
      // than blanking it, and new items simply start with no link at all.
      const body = {
        name: form.name.trim(),
        price: form.price.trim(),
        stockQty: Number(form.stockQty || 0),
        categoryId: form.categoryId,
        servingInfo: form.servingInfo.trim() || null,
        servingInfoVisible: form.servingInfoVisible,
      };

      // Step 1 — the text fields. An image can only be addressed by item id, so
      // the item has to exist before the upload can be attempted.
      let itemId = editing?.id ?? createdIdRef.current;
      try {
        if (itemId) {
          await apiClient.patch(`/admin/menu-items/${itemId}`, body, token ?? undefined);
        } else {
          // New items append to the end of their category's list — matches
          // AdminMenuPage's own `categories.length` default for a new category.
          const targetCategory = categories.find((c) => c.id === form.categoryId);
          const created = await apiClient.post<MenuItem>(
            "/admin/menu-items",
            { ...body, sortOrder: targetCategory?.items.length ?? 0 },
            token ?? undefined
          );
          itemId = created.id;
          createdIdRef.current = created.id;
        }
      } catch (err) {
        setError(adminErrorMessage(err, "Could not save this item"));
        setSaving(false);
        return;
      }

      // Step 2 — the photo.
      try {
        if (picked) {
          const payload = new FormData();
          // The filename is load-bearing: a multipart part without one arrives at
          // the server as a plain string field, not a File, and is rejected.
          payload.append("file", picked.blob, encodedFileName(picked.blob));
          await apiClient.upload(`/admin/menu-items/${itemId}/image`, payload, token ?? undefined);
        } else if (removeImage && hasStoredImage) {
          await apiClient.delete(`/admin/menu-items/${itemId}/image`, token ?? undefined);
        }
      } catch (err) {
        // The item itself saved and is already visible on the menu — only the
        // picture is missing. Say that, and stay open: the retry patches the item
        // we just created rather than adding a second one.
        setError(`${adminErrorMessage(err, "The photo could not be uploaded")}. The item is saved — try the photo again.`);
        setSaving(false);
        return;
      }

      setSaving(false);
      onSaved();
    } finally {
      submittingRef.current = false;
    }
  }

  const set = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const preview: { src: string; title: string; detail: string } | null = picked
    ? {
        src: picked.previewUrl,
        title: "New photo ready",
        detail: `${picked.width}×${picked.height} · ${formatBytes(picked.blob.size)} · uploads on save`,
      }
    : !removeImage && existingSrc && !existingBroken
      ? {
          src: existingSrc,
          title: hasStoredImage ? "Current photo" : "Linked photo",
          detail: hasStoredImage
            ? "Stored on our server"
            : "From an external link — upload a file to keep it for good",
        }
      : null;

  const busy = saving || encoding;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={saving ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-item-modal-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="menu-item-modal-title" className="text-lg font-bold text-gray-900">
          {editing ? "Edit item" : "Add item"}
        </h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <Field label="Item name">
            <input
              required
              autoFocus
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              className={INPUT_CLASS}
            />
          </Field>

          {/* Not wrapped in <Field>: that renders a <label>, and a label
              containing buttons forwards every click to the file input, so
              "Remove" would reopen the picker. */}
          <div>
            <span className="mb-1 block text-xs font-bold text-gray-500" id="menu-item-photo-label">
              Photo
            </span>

            {preview ? (
              <div className="flex items-center gap-3 rounded-xl bg-surface-muted p-2.5 ring-1 ring-gray-200">
                <img
                  src={preview.src}
                  alt=""
                  // Only the remote image can fail; a local object URL cannot.
                  onError={picked ? undefined : () => setExistingBroken(true)}
                  className="h-16 w-16 shrink-0 rounded-lg bg-surface object-cover ring-1 ring-gray-200"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-gray-800">{preview.title}</p>
                  <p className="mt-0.5 text-xs leading-snug text-gray-500">{preview.detail}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button type="button" disabled={busy} onClick={() => fileInputRef.current?.click()} className={CHIP_BUTTON}>
                    Replace
                  </button>
                  {(picked || hasStoredImage) && (
                    <button type="button" disabled={busy} onClick={clearImage} className={CHIP_BUTTON_DANGER}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                aria-describedby="menu-item-photo-hint"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={`flex h-24 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60 ${
                  dragging
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-gray-300 bg-surface-muted/60 text-gray-500 hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-700"
                }`}
              >
                {encoding ? (
                  <span className="text-xs font-bold text-gray-500">Optimising photo…</span>
                ) : (
                  <>
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 16.5V4m0 0L7.5 8.5M12 4l4.5 4.5M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16"
                      />
                    </svg>
                    <span className="text-xs font-bold">
                      {removeImage ? "Add a different photo" : "Choose a photo"}
                    </span>
                    <span className="text-[0.7rem] text-gray-400">or drop one here</span>
                  </>
                )}
              </button>
            )}

            {/* The real control. Hidden visually, not from assistive tech. */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              aria-labelledby="menu-item-photo-label"
              className="sr-only"
              onChange={(e) => {
                void acceptFile(e.target.files?.[0]);
                // Reset so re-picking the same file still fires a change event.
                e.target.value = "";
              }}
            />

            <p id="menu-item-photo-hint" className="mt-1 text-xs text-gray-400">
              {removeImage
                ? "The current photo will be removed when you save."
                : existingBroken
                  ? "This photo couldn't be loaded — try uploading again."
                  : isLegacyLink && !picked
                    ? "This item still points at an external link. Upload a photo to store it for good."
                    : `JPG, PNG, or WebP up to ${formatBytes(MAX_SOURCE_BYTES)}. Resized and stored on our server.`}
              {removeImage && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => setRemoveImage(false)}
                    className="font-bold text-brand-600 underline underline-offset-2 transition-colors hover:text-brand-700"
                  >
                    Undo
                  </button>
                </>
              )}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (₹)">
              <input
                required
                inputMode="decimal"
                placeholder="20.00"
                value={form.price}
                onChange={(e) => set({ price: e.target.value })}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Stock">
              <input
                required
                type="number"
                min={0}
                value={form.stockQty}
                onChange={(e) => set({ stockQty: e.target.value })}
                className={INPUT_CLASS}
              />
            </Field>
          </div>

          <Field label="Category">
            <select
              required
              value={form.categoryId}
              onChange={(e) => set({ categoryId: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="">Select a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">Serving info</span>
              <label className="flex cursor-pointer items-center gap-1.5">
                <span className="text-[0.7rem] font-bold text-gray-500">
                  {form.servingInfoVisible ? "Shown to students" : "Hidden from students"}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.servingInfoVisible}
                  aria-label="Show serving info on the student menu"
                  onClick={() => set({ servingInfoVisible: !form.servingInfoVisible })}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    form.servingInfoVisible ? "bg-emerald-500" : "bg-gray-300"
                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${
                      form.servingInfoVisible ? "left-[1.375rem]" : "left-0.5"
                    }`}
                  />
                </button>
              </label>
            </div>
            <input
              value={form.servingInfo}
              placeholder="e.g. 500g or 6 pcs"
              maxLength={80}
              onChange={(e) =>
                set({ servingInfo: e.target.value.replace(/[^a-zA-Z0-9 .,/-]/g, "") })
              }
              className={INPUT_CLASS}
            />
            <p className="mt-1 text-xs text-gray-400">
              Free text you write yourself — not tracked as stock. The toggle controls whether it appears on the menu.
            </p>
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="h-11 flex-1 rounded-xl bg-brand-600 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : encoding ? "Preparing photo…" : editing ? "Save changes" : "Add item"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-11 rounded-xl px-4 text-sm font-bold text-gray-700 ring-1 ring-gray-300 transition-colors hover:bg-surface-hover"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

const INPUT_CLASS =
  "h-11 w-full rounded-xl bg-surface px-3 text-sm font-medium text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-brand-500";

const CHIP_BUTTON =
  "rounded-lg bg-surface px-2.5 py-1 text-[0.7rem] font-bold text-gray-700 ring-1 ring-gray-300 transition-colors hover:bg-surface-hover hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50";

const CHIP_BUTTON_DANGER =
  "rounded-lg bg-surface px-2.5 py-1 text-[0.7rem] font-bold text-red-600 ring-1 ring-red-200 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-gray-500">{label}</span>
      {children}
    </label>
  );
}
