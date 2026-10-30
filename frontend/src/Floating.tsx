import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
export function Floating({
  anchor,
  label,
  onClose,
  children,
  className = "",
  above = false,
  align = "end",
}: {
  anchor: HTMLElement;
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  above?: boolean;
  align?: "start" | "end" | "center";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      el.style.left = `${Math.min(innerWidth - el.offsetWidth - 12, Math.max(12, align === "end" ? r.right - el.offsetWidth : align === "center" ? r.left + (r.width - el.offsetWidth) / 2 : r.left))}px`;
      el.style.top = `${Math.max(8, Math.min(innerHeight - el.offsetHeight - 12, above ? r.top - el.offsetHeight - 12 : r.bottom + 8))}px`;
    };
    el.showPopover();
    place();
    const outside = (e: PointerEvent) => {
      if (!el.contains(e.target as Node) && !anchor.contains(e.target as Node))
        closeRef.current();
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeRef.current();
        anchor.focus({ preventScroll: true });
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keys, true);
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      el.hidePopover();
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keys, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [anchor, above, align]);
  return (
    <div
      popover="manual"
      ref={ref}
      role="dialog"
      aria-label={label}
      className={`floating ${className}`}
    >
      {children}
    </div>
  );
}
