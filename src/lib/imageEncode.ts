/**
 * Client-side image optimiser for menu photos.
 *
 * An admin picks a 4 MB photo straight off a phone; the server will only store
 * 512 KB. Rather than reject that (or ship 4 MB over the counter's wifi and let
 * the server decide), we decode, contain-fit, and re-encode in the browser, and
 * upload roughly 60-90 KB of WebP. The upload is then fast enough to feel
 * instant even on a bad connection, and the stored bytes are small enough that
 * every student's menu load stays cheap.
 *
 * Re-encoding through a canvas also strips EXIF, deliberately: raw phone photos
 * carry GPS coordinates, and those would otherwise be served to every student
 * who opens the menu. Canvas output has no metadata at all, so the leak is
 * closed by construction rather than by a scrubbing pass we could forget.
 */

/** Biggest file we will even attempt to decode. Above this, decoding a photo can lock up a phone. */
export const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

/**
 * Ceiling for what we hand to the server. The server's hard cap is 512 KB; the
 * headroom means a blob that passes here cannot come back as a confusing 413.
 */
export const MAX_ENCODED_BYTES = 500 * 1024;

/** Longest edge of the stored image. A menu tile is ~300 CSS px, so this covers 3x displays. */
const MAX_EDGE = 960;

/**
 * Decoded-pixel ceiling, checked against `bitmap.width * bitmap.height` right
 * after decode. `MAX_SOURCE_BYTES` bounds the file on disk, not what the
 * browser inflates it to — a 4.9 MB JPEG can still be a 100+ megapixel phone
 * panorama, and `createImageBitmap` allocates the full RGBA surface up front
 * (108 MP -> ~432 MB) regardless of how small the file was. 40 MP comfortably
 * covers any real food/menu photo, including modern phone cameras, while
 * still catching the pathological ones before we draw to canvas.
 */
const MAX_SOURCE_MEGAPIXELS = 40_000_000;

/** How long we give a single decode or encode step before giving up on it. */
const STEP_TIMEOUT_MS = 15_000;

/**
 * Tried in order; the first result under `MAX_ENCODED_BYTES` wins. Attempt one
 * is what essentially every real photo takes. The rest exist for the pathological
 * case — a high-entropy image (dense text, heavy noise) that stays large at 960px —
 * where shrinking beats failing.
 */
const ATTEMPTS: { edge: number; quality: number }[] = [
  { edge: MAX_EDGE, quality: 0.8 },
  { edge: MAX_EDGE, quality: 0.62 },
  { edge: 720, quality: 0.6 },
  { edge: 560, quality: 0.55 },
];

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type ImageFormat = "image/webp" | "image/jpeg";

export interface EncodedImage {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Resizes and compresses `file` into something the upload endpoint accepts.
 *
 * Every rejection throws an `Error` whose message is written for the admin, not
 * for a log — callers render `err.message` straight into the form.
 */
export async function encodeMenuItemImage(file: File): Promise<EncodedImage> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error(
      `That photo is ${formatBytes(file.size)}. Pick one under ${formatBytes(MAX_SOURCE_BYTES)}.`
    );
  }
  // First pass only. A file can lie about its type, so the real verdict is
  // whether the browser's decoder accepts the bytes, below.
  if (!file.type.startsWith("image/")) {
    throw new Error("That file is not an image. Choose a JPG, PNG, or WebP photo.");
  }

  const bitmap = await decode(file);
  try {
    return await encodeWithinBudget(bitmap);
  } finally {
    // Bitmaps hold decoded pixels off-heap; without this a few edits in one
    // session can hold tens of megabytes that GC will not reclaim promptly.
    bitmap.close();
  }
}

/**
 * `imageOrientation: "from-image"` is the point of using createImageBitmap over
 * `new Image()`. Phone cameras store portrait shots as landscape pixels plus an
 * EXIF rotation flag; a canvas draw that ignores the flag uploads every portrait
 * photo lying on its side, permanently, because the re-encode then bakes the
 * wrong orientation in.
 *
 * The decode itself is raced against a timeout: a stalled decode would
 * otherwise leave the caller's `finally` never settling, which is the one
 * thing standing between the modal and a permanently disabled Save/Cancel.
 * The timeout can't reclaim memory a slow browser already allocated, but it
 * does guarantee this function always resolves or rejects.
 */
async function decode(file: File): Promise<ImageBitmap> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await withTimeout(
      createImageBitmap(file, { imageOrientation: "from-image" }),
      "Decoding this photo is taking too long. Try a smaller photo."
    );
  } catch (err) {
    if (err instanceof TimeoutError) throw err;
    throw new Error("That image could not be read. It may be corrupt or in a format this browser cannot open.");
  }

  // Checked before anything else touches the bitmap: drawing a 100+ MP surface
  // to canvas is the expensive part we are trying to avoid, so the reject has
  // to happen before that, not after.
  if (bitmap.width * bitmap.height > MAX_SOURCE_MEGAPIXELS) {
    bitmap.close();
    throw new Error("Image is too large — try a smaller photo.");
  }

  return bitmap;
}

class TimeoutError extends Error {}

/** Races `promise` against a fixed timer so a stalled decode/encode cannot hang the caller forever. */
function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(message)), STEP_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function encodeWithinBudget(bitmap: ImageBitmap): Promise<EncodedImage> {
  let format: ImageFormat = "image/webp";

  for (const attempt of ATTEMPTS) {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, attempt.edge);
    let blob = await render(bitmap, width, height, format, attempt.quality);

    // Some browsers accept an unsupported `type` silently and hand back PNG,
    // which is 5-10x larger and would blow the server's cap for no visible
    // reason. Detect it by what came out, not by feature-sniffing, and switch
    // to JPEG for this and every later attempt.
    if (blob.type !== format && format === "image/webp") {
      format = "image/jpeg";
      blob = await render(bitmap, width, height, format, attempt.quality);
    }
    if (blob.type !== format) {
      throw new Error("This browser could not compress the photo. Try a different browser or a smaller image.");
    }

    if (blob.size <= MAX_ENCODED_BYTES) return { blob, width, height };
  }

  throw new Error(
    `This photo is too detailed to compress under ${formatBytes(MAX_ENCODED_BYTES)}. ` +
      "Try a simpler or less noisy picture."
  );
}

/** Contain-fit: preserves aspect ratio, never upscales, never crops. */
function fitWithin(width: number, height: number, edge: number): { width: number; height: number } {
  const scale = Math.min(1, edge / width, edge / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function render(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  format: ImageFormat,
  quality: number
): Promise<Blob> {
  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);

  // JPEG has no alpha: a transparent PNG logo would composite against black.
  // WebP keeps the alpha channel, so it is left untouched there.
  if (format === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);

  // Same reasoning as the decode timeout: without this, a stalled encoder
  // leaves the modal's `encoding` state stuck true forever, since it only
  // clears in a `finally` that needs this promise to settle.
  return withTimeout(toBlob(canvas, format, quality), "Compressing this photo is taking too long. Try a smaller photo.");
}

/**
 * OffscreenCanvas where available — it keeps the work off the DOM and its
 * `convertToBlob` is a real promise. Safari only shipped it in 17, and this is a
 * phone-heavy student app, so the DOM canvas fallback is not optional.
 */
function createCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * The two context types are structurally identical for the three calls this
 * file makes (fillStyle, fillRect, drawImage), so they are unified behind one
 * cast rather than branching every drawing call.
 */
function context2d(canvas: AnyCanvas): CanvasRenderingContext2D {
  const ctx = canvas instanceof HTMLCanvasElement
    ? canvas.getContext("2d")
    : (canvas.getContext("2d") as CanvasRenderingContext2D | null);
  if (!ctx) throw new Error("This browser could not prepare the photo for upload.");
  return ctx;
}

function toBlob(canvas: AnyCanvas, format: ImageFormat, quality: number): Promise<Blob> {
  if (canvas instanceof HTMLCanvasElement) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("This browser could not compress the photo."))),
        format,
        quality
      );
    });
  }
  return canvas.convertToBlob({ type: format, quality });
}

/** File name for the multipart part. Hono only sees a File when a filename is present. */
export function encodedFileName(blob: Blob): string {
  return blob.type === "image/jpeg" ? "menu-item.jpg" : "menu-item.webp";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
