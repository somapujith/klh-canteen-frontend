import { useEffect, useState } from "react";
import { menuImageSrc, type MenuImageRef } from "../lib/menu";

interface Props {
  item: MenuImageRef & { id: string; name: string };
  /**
   * Owned by the card, not by this component: aspect ratio, hover transform,
   * sold-out desaturation. Applied to the photo AND to the placeholder so the
   * grid never reflows depending on whether an item has a picture.
   */
  className?: string;
}

/**
 * The photo on a student/guest menu tile.
 *
 * Exists as a component rather than an inline `<img>` because the fallback
 * needs per-card state: an item can have no image at all, and a legacy pasted
 * link can be dead on arrival. Both used to render as the browser's broken-image
 * glyph in the middle of an otherwise finished card, which reads as a bug in the
 * app rather than a missing picture.
 */
export function MenuCardImage({ item, className = "" }: Props) {
  const src = menuImageSrc(item, item.id);
  const [failed, setFailed] = useState(false);

  // A new source — a fresh upload arriving over SSE, say — is worth another try.
  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        aria-hidden="true"
        className={`flex items-center justify-center bg-surface-muted text-gray-300 ${className}`}
      >
        {/* Sized as a fraction of its box so the same placeholder reads right in
            a 40px admin thumbnail and a full-width menu tile. */}
        <svg
          className="h-2/5 max-h-10 min-h-4 w-2/5 max-w-10 min-w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={item.name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
