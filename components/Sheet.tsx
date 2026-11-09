"use client";

import { useEffect, useId, useRef } from "react";

// Accessible bottom sheet: role="dialog", closes on Escape or backdrop tap,
// moves focus into the sheet and back to where it was on close, keeps Tab
// inside the sheet, and stops the page behind from scrolling.
export default function Sheet({
  open,
  onClose,
  title,
  children,
  labelledBy,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  labelledBy?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const autoId = useId();
  const titleId = labelledBy || (title ? `${autoId}-title` : undefined);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const node = ref.current;
    const focusables = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
        ) || []
      );
    // focus the first field if there is one, otherwise the sheet itself
    const first = focusables().find((el) => el.tagName === "INPUT") || node;
    first?.focus({ preventScroll: true });

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "Tab") {
        const els = focusables();
        if (els.length === 0) return;
        const a = els[0];
        const z = els[els.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
      >
        <div className="sheet-handle" aria-hidden="true" />
        {title && (
          <h2 id={titleId} className="center">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}
