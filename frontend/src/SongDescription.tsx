import { useId, useLayoutEffect, useRef, useState } from "react";
import { Icon, Modal } from "./Modal";

export const songTextLimit = 50_000;
type Field = "notes" | "lyrics";
type View = { top: number; left: number; start: number; end: number };
const blank = (): View => ({ top: 0, left: 0, start: 0, end: 0 });
const labels = { notes: "Notes", lyrics: "Paroles" };

/** Both surfaces edit the parent's single draft; only caret/scroll positions live here. */
export function SongDescription({
  hidden,
  title,
  notes,
  lyrics,
  editing,
  busy,
  onChange,
  onExpandedChange,
}: {
  hidden: boolean;
  title: string;
  notes: string;
  lyrics: string;
  editing: boolean;
  busy: boolean;
  onChange: (field: Field, value: string) => void;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const id = useId();
  const [field, setField] = useState<Field>("notes");
  const [expanded, setExpanded] = useState(false);
  const text = useRef<Record<Field, HTMLTextAreaElement | null>>({
    notes: null,
    lyrics: null,
  });
  const large = useRef<HTMLTextAreaElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const positions = useRef<Record<Field, View>>({
    notes: blank(),
    lyrics: blank(),
  });
  const expandedView = useRef<View>(blank());
  function capture(el: HTMLTextAreaElement): View {
    return {
      top: el.scrollTop,
      left: el.scrollLeft,
      start: el.selectionStart,
      end: el.selectionEnd,
    };
  }
  function restore(el: HTMLTextAreaElement | null, view: View) {
    if (!el) return;
    el.setSelectionRange(view.start, view.end);
    el.scrollTop = view.top;
    el.scrollLeft = view.left;
  }
  useLayoutEffect(() => {
    if (!hidden)
      restore(
        expanded ? large.current : text.current[field],
        expanded ? expandedView.current : positions.current[field],
      );
  }, [expanded, field, hidden]);
  function choose(next: Field) {
    const current = text.current[field];
    if (current) positions.current[field] = capture(current);
    setField(next);
  }
  function enlarge() {
    const current = text.current[field];
    if (current) positions.current[field] = capture(current);
    expandedView.current = { ...positions.current[field] };
    setExpanded(true);
    onExpandedChange(true);
  }
  const values = { notes, lyrics };
  return (
    <>
      <div className="song-description" hidden={hidden}>
        <div
          className="song-text-tabs"
          role="tablist"
          aria-label="Notes et paroles"
          ref={tabs}
          data-field={field}
        >
          <span className="song-text-indicator" aria-hidden="true" />
          {(["notes", "lyrics"] as const).map((key) => (
            <button
              type="button"
              key={key}
              role="tab"
              id={`${id}-${key}-tab`}
              aria-controls={`${id}-${key}-panel`}
              aria-selected={field === key}
              tabIndex={field === key ? 0 : -1}
              onClick={() => choose(key)}
              onKeyDown={(e) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
                  return;
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? "notes"
                    : e.key === "End"
                      ? "lyrics"
                      : field === "notes"
                        ? "lyrics"
                        : "notes";
                choose(next);
                tabs.current
                  ?.querySelector<HTMLButtonElement>(
                    `[aria-controls="${id}-${next}-panel"]`,
                  )
                  ?.focus({ preventScroll: true });
              }}
            >
              {labels[key]}
            </button>
          ))}
        </div>
        {(["notes", "lyrics"] as const).map((key) => (
          <div
            key={key}
            role="tabpanel"
            id={`${id}-${key}-panel`}
            aria-labelledby={`${id}-${key}-tab`}
            hidden={field !== key}
            className={`song-text-block${editing ? " editing" : ""}`}
          >
            <textarea
              ref={(el) => {
                text.current[key] = el;
              }}
              aria-label={`${labels[key]} du son`}
              value={values[key]}
              aria-invalid={values[key].length > songTextLimit}
              readOnly={!editing}
              disabled={busy}
              spellCheck={editing}
              placeholder={
                key === "notes"
                  ? "Aucune note pour le moment."
                  : "Aucune parole pour le moment."
              }
              onChange={(e) => onChange(key, e.target.value)}
              onScroll={(e) => {
                if (!expanded && field === key && !hidden)
                  positions.current[key] = capture(e.currentTarget);
              }}
              onSelect={(e) => {
                if (!expanded && field === key && !hidden)
                  positions.current[key] = capture(e.currentTarget);
              }}
            />
            <button
              type="button"
              className="icon-button song-text-expand"
              aria-label={`Agrandir les ${key === "notes" ? "notes" : "paroles"}`}
              disabled={busy}
              onClick={enlarge}
            >
              <Icon name="expand" />
            </button>
          </div>
        ))}
      </div>
      {expanded && (
        <Modal
          label={`${labels[field]} agrandies`}
          title={
            <h2>
              {title || "Nouveau son"} · {labels[field]}
            </h2>
          }
          closeLabel="Revenir à la fiche du son"
          className={`song-text-modal${editing ? " editing" : ""}`}
          onClose={() => {
            // Keep the panel's reading position, while carrying back the current caret.
            positions.current[field] = {
              ...positions.current[field],
              start: expandedView.current.start,
              end: expandedView.current.end,
            };
            setExpanded(false);
            onExpandedChange(false);
          }}
        >
          <textarea
            ref={large}
            aria-label={`${labels[field]} du son agrandies`}
            value={values[field]}
            aria-invalid={values[field].length > songTextLimit}
            readOnly={!editing}
            disabled={busy}
            spellCheck={editing}
            placeholder={
              field === "notes"
                ? "Aucune note pour le moment."
                : "Aucune parole pour le moment."
            }
            onChange={(e) => onChange(field, e.target.value)}
            onScroll={(e) => {
              expandedView.current = capture(e.currentTarget);
            }}
            onSelect={(e) => {
              expandedView.current = capture(e.currentTarget);
            }}
          />
          {values[field].length > songTextLimit && (
            <div className="song-text-limit" role="alert">
              50 000 caractères maximum. Le texte reste dans le brouillon.
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
