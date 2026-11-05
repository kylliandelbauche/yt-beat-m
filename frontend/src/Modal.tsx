import { useRef } from "react";
import type { MouseEvent, PointerEvent, ReactNode, Ref } from "react";
import { useModalLifecycle } from "./useModalLifecycle";
import type { ModalClose } from "./useModalLifecycle";

export function Modal({
  label,
  title,
  closeLabel,
  onClose,
  canClose,
  closeRef,
  actions,
  className = "",
  children,
}: {
  label: string;
  title: ReactNode;
  closeLabel: string;
  onClose: () => void;
  canClose?: () => boolean;
  closeRef?: Ref<ModalClose>;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const pressedOutside = useRef(false);
  const { dialog, phase, requestClose } = useModalLifecycle(
    onClose,
    canClose,
    closeRef,
  );
  function outside(
    event: MouseEvent<HTMLDialogElement> | PointerEvent<HTMLDialogElement>,
  ) {
    if (event.target !== event.currentTarget) return false;
    const bounds = event.currentTarget.getBoundingClientRect();
    return (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    );
  }
  return (
    <dialog
      ref={dialog}
      data-state={phase}
      aria-label={label}
      className={`app-modal ${className}`}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onPointerDown={(event) => {
        pressedOutside.current =
          event.isPrimary && event.button === 0 && outside(event);
      }}
      onPointerCancel={() => {
        pressedOutside.current = false;
      }}
      onClick={(event) => {
        const dismiss = pressedOutside.current && outside(event);
        pressedOutside.current = false;
        if (dismiss) requestClose();
      }}
    >
      <header className="modal-header">
        <div className="modal-title">{title}</div>
        <div className="modal-actions">
          {actions}
          <button
            className="icon-button modal-close"
            autoFocus
            aria-label={closeLabel}
            onClick={() => requestClose()}
          >
            <Icon name="close" />
          </button>
        </div>
      </header>
      {children}
    </dialog>
  );
}

export function Icon({
  name,
  filled = false,
}: {
  name:
    | "trash"
    | "tag"
    | "heart"
    | "edit"
    | "save"
    | "close"
    | "grid"
    | "rows"
    | "refresh"
    | "check"
    | "play"
    | "pause"
    | "search"
    | "chevron"
    | "folder"
    | "diagnostic"
    | "music"
    | "person"
    | "plus"
    | "settings"
    | "info"
    | "description"
    | "link"
    | "volume"
    | "mute"
    | "previous"
    | "next"
    | "expand";
  filled?: boolean;
}) {
  const paths = {
    expand:
      "M8 3H3V8M16 3H21V8M21 16V21H16M8 21H3V16M3 3L9 9M21 3L15 9M21 21L15 15M3 21L9 15",
    tag: "M3 3h8l10 10-8 8L3 11ZM7 7h.01",
    trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
    person: "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21v-3a8 8 0 0 1 16 0v3",
    plus: "M12 5v14M5 12h14",
    settings:
      "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
    info: "M12 7h.01M12 11v6M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
    description: "M4 6h16M4 10h16M4 14h11M4 18h8",
    link: "M10 14l4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0",
    volume: "M11 4L5 9H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14",
    mute: "M11 4L5 9H2v6h3l6 5ZM16 9l6 6M22 9l-6 6",
    previous: "M6 4v16M20 4L7 12l13 8Z",
    next: "M18 4v16M4 4l13 8-13 8Z",
    search: "M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM16 16L21 21",
    chevron: "M6 9L12 15L18 9",
    folder: "M3 7V5H9L12 8H21V20H3ZM3 8H12",
    diagnostic: "M3 12H7L10 4L14 20L17 12H21",
    music:
      "M9 18V5L20 3V16M9 8L20 6M9 18a3 2 0 1 1-3-2 3 2 0 0 1 3 2ZM20 16a3 2 0 1 1-3-2 3 2 0 0 1 3 2Z",
    play: "M7 4L21 12L7 20Z",
    pause: "M6 4H10V20H6ZM14 4H18V20H14Z",
    heart:
      "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
    edit: "M15 4L20 9M4 15L15 4a3.5 3.5 0 0 1 5 5L9 20L3 21Z",
    save: "M5 3H17L21 7V21H3V3ZM7 3V9H16V3M7 21V14H17V21",
    close: "M6 6L18 18M6 18L18 6",
    grid: "M3 3H9V9H3ZM15 3H21V9H15ZM3 15H9V21H3ZM15 15H21V21H15Z",
    rows: "M3 4H9V10H3ZM12 5H21M12 9H21M3 14H9V20H3ZM12 15H21M12 19H21",
    check: "M5 12L10 17L20 6",
    refresh: "M20 8a8 8 0 1 0 0 8M20 2V8H14",
  };
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-icon={name}
    >
      <path
        d={paths[name]}
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
