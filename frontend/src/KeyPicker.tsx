import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Floating } from "./Floating";
import { Icon } from "./Modal";
const minor = [
  "C",
  "C#",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "Bb",
  "B",
  "",
];
const major = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
  "",
];
export function KeyPicker({
  value,
  onChange,
  anchor,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const match = value.match(/^([A-G][#b]?)\s+(minor|major)$/),
    [mode, setMode] = useState(match?.[2] || "minor"),
    [note, setNote] = useState(match?.[1] || "");
  const [list, setList] = useState<"mode" | "note" | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const menu = listRef.current;
    if (!menu) return;
    const place = () => {
      const control = menu
        .parentElement!.querySelector("button")!
        .getBoundingClientRect();
      const below = innerHeight - control.bottom - 12,
        above = control.top - 12;
      const needed = Math.min(184, menu.scrollHeight + 2);
      const up = below < needed && above > below;
      menu.style.top = up ? "auto" : "44px";
      menu.style.bottom = up ? "44px" : "auto";
      menu.style.maxHeight = `${Math.min(184, Math.max(40, up ? above : below))}px`;
    };
    place();
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [list]);
  const close = useCallback(() => onClose(), [onClose]);
  function choose(kind: "mode" | "note", v: string) {
    if (kind === "mode") {
      setMode(v);
      if (note) onChange(`${note} ${v}`);
    } else {
      setNote(v);
      onChange(v ? `${v} ${mode}` : "");
    }
    setList(null);
  }
  return (
    <Floating
      anchor={anchor}
      label="Modifier la tonalité"
      onClose={close}
      className="key-picker"
    >
      {(["mode", "note"] as const).map((kind) => (
        <div className={`key-choice ${kind}`} key={kind}>
          <button
            type="button"
            aria-label={
              kind === "mode" ? "Mode de la tonalité" : "Note de la tonalité"
            }
            aria-haspopup="listbox"
            aria-expanded={list === kind}
            onClick={() => setList(list === kind ? null : kind)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                const button = e.currentTarget;
                setList(kind);
                requestAnimationFrame(() =>
                  button.nextElementSibling
                    ?.querySelector<HTMLButtonElement>("button")
                    ?.focus(),
                );
              }
            }}
          >
            {kind === "mode" ? mode : note || "—"}
            <Icon name="chevron" />
          </button>
          {list === kind && (
            <div
              ref={listRef}
              role="listbox"
              aria-label={kind === "mode" ? "Modes" : "Notes"}
            >
              {(kind === "mode"
                ? ["minor", "major"]
                : mode === "minor"
                  ? minor
                  : major
              ).map((v) => (
                <button
                  type="button"
                  key={v}
                  role="option"
                  title={v || "Non renseignée"}
                  aria-selected={(kind === "mode" ? mode : note) === v}
                  onClick={(e) => {
                    const control = e.currentTarget
                      .closest(".key-choice")
                      ?.querySelector<HTMLButtonElement>("button");
                    control?.focus({ preventScroll: true });
                    choose(kind, v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                      e.preventDefault();
                      const buttons = Array.from(
                        e.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                          "button",
                        ),
                      );
                      buttons[
                        (buttons.indexOf(e.currentTarget) +
                          (e.key === "ArrowDown" ? 1 : buttons.length - 1)) %
                          buttons.length
                      ].focus();
                    }
                  }}
                >
                  {v || "Non renseignée"}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </Floating>
  );
}
