import type { ReactNode } from "react";
import { TONE_PILL_CLASSES } from "../../lib/orderStatus";
import type { OrderTone } from "../../lib/orderStatus";

export interface BadgeProps {
  children: ReactNode;
  /** Semantic colour, resolved through lib/orderStatus so pills match everywhere. */
  tone?: OrderTone;
  /**
   * Escape hatch for a caller that already holds ready-made classes — notably
   * `statusPresentation(status).pillClass`. When set it REPLACES the tone's
   * colours rather than appending to them, so the two cannot fight over which
   * background wins by utility source order.
   */
  className?: string;
  size?: "sm" | "md";
}

const SIZES = {
  sm: "px-2 py-0.5 text-[11px]",
  md: "px-2.5 py-0.5 text-xs",
} as const;

/**
 * A status/label pill.
 *
 * Colour is never the only carrier of meaning here: the badge always renders
 * its label as text, so a pill is legible to someone who cannot distinguish
 * the amber from the green.
 */
export function Badge({ children, tone, className, size = "md" }: BadgeProps) {
  const colours = className ?? TONE_PILL_CLASSES[tone ?? "neutral"];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap ${SIZES[size]} ${colours}`}
    >
      {children}
    </span>
  );
}
