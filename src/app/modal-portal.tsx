"use client";

import { createPortal } from "react-dom";
import type { MouseEventHandler, ReactNode } from "react";

/** Viewport-fixed backdrop; portals to `document.body` so parent `filter`/`backdrop-blur` cannot offset centering. */
export const modalBackdropClass =
  "fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-gradient-to-b from-black/70 via-black/55 to-black/70 p-4 backdrop-blur-md";

/** Stacked modal above {@link modalBackdropClass} (e.g. listing history inside SB API). */
export const stackedModalBackdropClass =
  "fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto overscroll-contain bg-gradient-to-b from-black/75 via-black/60 to-black/75 p-4 backdrop-blur-md";

type ModalPortalProps = {
  children: ReactNode;
  onBackdropMouseDown?: MouseEventHandler<HTMLDivElement>;
  className?: string;
};

export function ModalPortal({ children, onBackdropMouseDown, className }: ModalPortalProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={className ?? modalBackdropClass}
      role="presentation"
      onMouseDown={onBackdropMouseDown}
    >
      {children}
    </div>,
    document.body,
  );
}
