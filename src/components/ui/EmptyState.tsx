import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** Rendered inside the grey disc. Decorative — the title carries the meaning. */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Usually a <Button> or a <Link>. An empty state without a way out is a dead end. */
  action?: ReactNode;
  className?: string;
}

/**
 * The shared "there is nothing here" block, lifted from the shape StudentMenuPage
 * had already settled on (16px disc, grey icon, medium-weight line).
 *
 * `action` is strongly encouraged, not required: an empty cart or an empty order
 * history is a place users land by accident, and the old bare grey box told them
 * the situation without offering a single thing to do about it.
 */
export function EmptyState({ icon, title, description, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`py-12 px-4 text-center ${className}`}>
      {icon && (
        <div
          className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400"
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <p className="text-gray-700 font-semibold">{title}</p>
      {description && (
        <p className="mt-1.5 text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
