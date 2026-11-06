import { Floating } from "./Floating";
import { Icon } from "./Modal";

export function SongCoverMenu({
  anchor,
  personal,
  onClose,
  onPick,
  onInherit,
}: {
  anchor: HTMLElement;
  personal: boolean;
  onClose: () => void;
  onPick: () => void;
  onInherit: () => void;
}) {
  function choose(action: () => void) {
    onClose();
    anchor.focus({ preventScroll: true });
    action();
  }
  return (
    <Floating
      anchor={anchor}
      label="Source de la pochette"
      onClose={onClose}
      className="song-cover-menu"
      initialFocus
    >
      <div
        role="menu"
        aria-label="Pochette du son"
        onKeyDown={(event) => {
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const items = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button",
            ),
          ];
          const index = items.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          items[
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    items.length) %
                  items.length
          ]?.focus();
        }}
      >
        <button
          type="button"
          role="menuitemradio"
          aria-checked={personal}
          onClick={() => choose(onPick)}
        >
          <Icon name="image" />
          <span>Choisir une image…</span>
          <span className="song-cover-check">
            {personal && <Icon name="check" />}
          </span>
        </button>
        <button
          type="button"
          role="menuitemradio"
          aria-checked={!personal}
          onClick={() => choose(onInherit)}
        >
          <Icon name="link" />
          <span>Image de la prod</span>
          <span className="song-cover-check">
            {!personal && <Icon name="check" />}
          </span>
        </button>
      </div>
    </Floating>
  );
}
