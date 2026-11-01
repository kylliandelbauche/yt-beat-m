import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { bpmError } from "./filterState";
import type { Filters, FilterOptions } from "./filterState";
import { Icon } from "./Modal";
import { useShell } from "./shellContext";
import { Floating } from "./Floating";

function normalized(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
function FilterMenu({
  label,
  count,
  children,
  onClose,
}: {
  label: string;
  count: number;
  children: ReactNode;
  onClose?: () => void;
}) {
  const place = (details: HTMLDetailsElement) => {
    const r = details.querySelector("summary")!.getBoundingClientRect();
    const p = details.querySelector<HTMLDivElement>(".filter-popover")!;
    p.style.left = `${Math.max(12, Math.min(innerWidth - 300, r.left))}px`;
    p.style.top = `${r.bottom + 8}px`;
  };
  return (
    <details
      className="filter-menu"
      name="catalog-filter"
      onToggle={(e) => {
        if (!e.currentTarget.open) {
          onClose?.();
          return;
        }
        place(e.currentTarget);
      }}
    >
      <summary
        data-active={count > 0}
        onClick={(e) => {
          const details = e.currentTarget.parentElement as HTMLDetailsElement;
          if (!details.open) place(details);
        }}
      >
        <span>{label}</span>
        <span className="filter-indicator" aria-hidden="true">
          <Icon name="chevron" />
          <span className="filter-count">{count}</span>
        </span>
        {count > 0 && (
          <span className="sr-only">
            , {count} filtre{count > 1 ? "s" : ""} actif{count > 1 ? "s" : ""}
          </span>
        )}
      </summary>
      {children}
    </details>
  );
}
function Heading({ label, clear }: { label: string; clear: () => void }) {
  return (
    <div className="filter-menu-heading">
      <strong>{label}</strong>
      <button type="button" onClick={clear}>
        Effacer
      </button>
    </div>
  );
}
function Missing({
  checked,
  onChange,
  label = "Non renseigné",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="filter-option filter-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
function Choices({
  label,
  choices,
  selected,
  missing,
  onValues,
  onMissing,
  onClear,
}: {
  label: string;
  choices: string[];
  selected: string[];
  missing: boolean;
  onValues: (v: string[]) => void;
  onMissing: (v: boolean) => void;
  onClear: () => void;
}) {
  const shell = useShell();
  const [search, setSearch] = useState("");
  const options = [...new Set([...choices, ...selected])].filter((v) =>
    normalized(v).includes(normalized(search)),
  );
  return (
    <FilterMenu label={label} count={selected.length + Number(missing)}>
      <div
        className={`filter-popover choices-popover${label === "Tags" ? " tags-filter" : ""}`}
      >
        <Heading
          label={label}
          clear={() => {
            setSearch("");
            onClear();
          }}
        />
        <label className="filter-search">
          <span className="sr-only">Chercher dans {label.toLowerCase()}</span>
          <Icon name="search" />
          <input
            type="search"
            aria-label={`Chercher dans ${label.toLowerCase()}`}
            placeholder={
              label === "Tags" ? "Rechercher un tag…" : "Rechercher…"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <Missing
          checked={missing}
          onChange={onMissing}
          label={label === "Tags" ? "Sans tag" : "Non renseigné"}
        />
        <div className="filter-choices">
          {options.map((v) => (
            <label className="filter-option" key={v}>
              <input
                type="checkbox"
                checked={selected.includes(v)}
                onChange={(e) =>
                  onValues(
                    e.target.checked
                      ? [...selected, v]
                      : selected.filter((x) => x !== v),
                  )
                }
              />
              {v}
            </label>
          ))}
          {!options.length && (
            <p className="filter-empty">Aucune valeur disponible.</p>
          )}
        </div>
        {label === "Tags" ? (
          <div className="filter-menu-hint tag-filter-footer">
            <span>
              {selected.length + Number(missing)} sélection
              {selected.length + Number(missing) > 1 ? "s" : ""}
            </span>
            <button
              className="manage-tags"
              onClick={(e) => {
                const details = e.currentTarget.closest("details");
                details
                  ?.querySelector("summary")
                  ?.focus({ preventScroll: true });
                details?.removeAttribute("open");
                shell.setSettings("tags");
              }}
            >
              Gérer les tags
            </button>
          </div>
        ) : (
          <p className="filter-menu-hint">
            Sélection immédiate <span>Échap</span>
          </p>
        )}
      </div>
    </FilterMenu>
  );
}
function BpmFields({
  min,
  max,
  apply,
}: {
  min: string;
  max: string;
  apply: (a: string, b: string) => void;
}) {
  const [error, setError] = useState(""),
    id = useId();
  return (
    <form
      className="bpm-range"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget),
          a = String(f.get("min") || ""),
          b = String(f.get("max") || "");
        const problem = bpmError(a, b);
        setError(problem);
        if (!problem) apply(a, b);
      }}
    >
      <div className="edit-columns">
        <label>
          Minimum
          <input
            aria-label="BPM minimum"
            type="number"
            step="any"
            name="min"
            defaultValue={min}
            onInput={() => setError("")}
          />
        </label>
        <label>
          Maximum
          <input
            aria-label="BPM maximum"
            type="number"
            step="any"
            name="max"
            defaultValue={max}
            aria-invalid={!!error}
            aria-describedby={id}
            onInput={() => setError("")}
          />
        </label>
      </div>
      <p
        className="range-help"
        style={{ visibility: error ? "hidden" : "visible" }}
      >
        Bornes incluses · même valeur = BPM exact.
      </p>
      <p className="filter-error-slot" id={id} role="alert">
        {error}
      </p>
      <button
        type="submit"
        className="range-apply primary"
        aria-label="Appliquer les BPM"
      >
        Appliquer
      </button>
    </form>
  );
}
const notes = [
  "C",
  "C#",
  "Db",
  "D",
  "D#",
  "Eb",
  "E",
  "F",
  "F#",
  "Gb",
  "G",
  "G#",
  "Ab",
  "A",
  "A#",
  "Bb",
  "B",
];
export function CatalogFilters({
  value,
  options,
  onChange,
}: {
  value: Filters;
  options: FilterOptions;
  onChange: (v: Filters) => void;
}) {
  useEffect(() => {
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent
          ? e.key !== "Escape"
          : e.target instanceof Element && e.target.closest(".filter-menu")
      )
        return;
      const interactive =
        e instanceof PointerEvent &&
        e.target instanceof Element &&
        e.target.closest("button,input,select,textarea,a,[tabindex]");
      const menus =
        document.querySelectorAll<HTMLDetailsElement>(".filter-menu[open]");
      if (e instanceof KeyboardEvent && menus.length) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      menus.forEach((menu) => {
        menu.open = false;
        if (!interactive) {
          if (e instanceof PointerEvent) e.preventDefault();
          menu.querySelector("summary")?.focus({ preventScroll: true });
        }
      });
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  const [bpmReset, setBpmReset] = useState(0),
    [note, setNote] = useState("C"),
    [mode, setMode] = useState("minor"),
    [choice, setChoice] = useState<{
      kind: "mode" | "note";
      anchor: HTMLElement;
    } | null>(null);
  const [keyNotice, setKeyNotice] = useState("");
  const drag = useRef<{ x: number; left: number } | null>(null);
  function select(kind: "mode" | "note", anchor: HTMLElement) {
    setChoice((c) => (c?.kind === kind ? null : { kind, anchor }));
  }
  const categories = [
    ["makers", "maker_missing", "Beatmaker"],
    ["tags", "tag_missing", "Tags"],
    ["channels", "channel_missing", "Chaîne"],
  ] as const;
  return (
    <>
      <FilterMenu
        label="BPM"
        count={
          Number(!!(value.bpm_min || value.bpm_max)) + Number(value.bpm_missing)
        }
      >
        <div className="filter-popover bpm-popover">
          <Heading
            label="BPM"
            clear={() => {
              setBpmReset((n) => n + 1);
              onChange({
                ...value,
                bpm_min: "",
                bpm_max: "",
                bpm_missing: false,
              });
            }}
          />
          <BpmFields
            key={`${value.bpm_min}/${value.bpm_max}/${bpmReset}`}
            min={value.bpm_min}
            max={value.bpm_max}
            apply={(a, b) => onChange({ ...value, bpm_min: a, bpm_max: b })}
          />
          <Missing
            checked={value.bpm_missing}
            onChange={(v) => onChange({ ...value, bpm_missing: v })}
          />
        </div>
      </FilterMenu>
      <FilterMenu
        label="Tonalité"
        count={value.keys.length + Number(value.key_missing)}
        onClose={() => setChoice(null)}
      >
        <div className="filter-popover keys-popover">
          <Heading
            label="Tonalité"
            clear={() => {
              onChange({ ...value, keys: [], key_missing: false });
              setKeyNotice("");
            }}
          />
          <div className="key-composer">
            <div>
              <span>Mode</span>
              <button
                type="button"
                aria-label="Mode du filtre tonalité"
                aria-haspopup="listbox"
                aria-expanded={choice?.kind === "mode"}
                onClick={(e) => select("mode", e.currentTarget)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    select("mode", e.currentTarget);
                  }
                }}
              >
                {mode}
                <Icon name="chevron" />
              </button>
            </div>
            <div>
              <span>Note</span>
              <button
                type="button"
                aria-label="Note du filtre tonalité"
                aria-haspopup="listbox"
                aria-expanded={choice?.kind === "note"}
                onClick={(e) => select("note", e.currentTarget)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    select("note", e.currentTarget);
                  }
                }}
              >
                {note}
                <Icon name="chevron" />
              </button>
            </div>
          </div>
          <button
            className="key-add primary"
            disabled={value.keys.includes(`${note} ${mode}`)}
            onClick={() => {
              const key = `${note} ${mode}`;
              if (!value.keys.includes(key)) {
                onChange({ ...value, keys: [...value.keys, key] });
                setKeyNotice(`${key} ajoutée.`);
              } else setKeyNotice(`${key} déjà sélectionnée.`);
            }}
          >
            Ajouter cette tonalité
          </button>
          <div
            onPointerDown={(e) => {
              if ((e.target as Element).closest("button") || e.button !== 0)
                return;
              drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (drag.current) {
                e.currentTarget.scrollLeft =
                  drag.current.left + drag.current.x - e.clientX;
                e.preventDefault();
              }
            }}
            onPointerUp={(e) => {
              drag.current = null;
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            className="key-combinations"
            aria-label="Tonalités sélectionnées"
          >
            {value.keys.map((k) => (
              <span className="key-combination" key={k}>
                {k}
                <button
                  aria-label={`Retirer la tonalité ${k}`}
                  onClick={(e) => {
                    const group = e.currentTarget.closest(".keys-popover");
                    onChange({
                      ...value,
                      keys: value.keys.filter((v) => v !== k),
                    });
                    setKeyNotice(`${k} retirée.`);
                    group
                      ?.querySelector<HTMLButtonElement>(".key-composer button")
                      ?.focus({ preventScroll: true });
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <Missing
            checked={value.key_missing}
            onChange={(v) => onChange({ ...value, key_missing: v })}
          />
          <p className="filter-menu-hint">
            {value.keys.length} tonalité{value.keys.length > 1 ? "s" : ""}
            <span>Échap</span>
          </p>
          <span className="sr-only" role="status">
            {keyNotice}
          </span>
          {choice && (
            <Floating
              anchor={choice.anchor}
              align="start"
              label={
                choice.kind === "mode" ? "Modes du filtre" : "Notes du filtre"
              }
              className="filter-select-menu"
              initialFocus
              onClose={() => setChoice(null)}
            >
              <div
                role="listbox"
                aria-label={choice.kind === "mode" ? "Modes" : "Notes"}
              >
                {(choice.kind === "mode" ? ["minor", "major"] : notes).map(
                  (v, i) => (
                    <button
                      type="button"
                      role="option"
                      key={v}
                      tabIndex={i === 0 ? 0 : -1}
                      aria-selected={
                        v === (choice.kind === "mode" ? mode : note)
                      }
                      onClick={() => {
                        choice.anchor.focus({ preventScroll: true });
                        if (choice.kind === "mode") setMode(v);
                        else setNote(v);
                        setChoice(null);
                      }}
                      onKeyDown={(e) => {
                        const options = Array.from(
                          e.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                            "button",
                          ),
                        );
                        if (
                          ["ArrowDown", "ArrowUp", "Home", "End"].includes(
                            e.key,
                          )
                        ) {
                          e.preventDefault();
                          const n = options.indexOf(e.currentTarget);
                          options[
                            e.key === "Home"
                              ? 0
                              : e.key === "End"
                                ? options.length - 1
                                : (n +
                                    (e.key === "ArrowDown"
                                      ? 1
                                      : options.length - 1)) %
                                  options.length
                          ].focus();
                        }
                      }}
                    >
                      {v}
                    </button>
                  ),
                )}
              </div>
            </Floating>
          )}
        </div>
      </FilterMenu>
      {categories.map(([key, missing, label]) => (
        <Choices
          key={key}
          label={label}
          choices={options[key]}
          selected={value[key]}
          missing={value[missing]}
          onValues={(v) => onChange({ ...value, [key]: v })}
          onMissing={(v) => onChange({ ...value, [missing]: v })}
          onClear={() => onChange({ ...value, [key]: [], [missing]: false })}
        />
      ))}
    </>
  );
}
export function ActiveFilters({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (v: Filters) => void;
}) {
  const labels: Record<string, string> = {
    keys: "Tonalité",
    makers: "Beatmaker",
    channels: "Chaîne",
    tags: "Tag",
    bpm_missing: "BPM",
    key_missing: "Tonalité",
    maker_missing: "Beatmaker",
    channel_missing: "Chaîne",
    tag_missing: "Tag",
  };
  return (
    <div className="active-filters" aria-label="Filtres actifs">
      {(filters.bpm_min || filters.bpm_max) && (
        <button
          onClick={() => onChange({ ...filters, bpm_min: "", bpm_max: "" })}
        >
          BPM : {filters.bpm_min || "…"} – {filters.bpm_max || "…"} ×
        </button>
      )}
      {Object.entries(filters).flatMap(([key, value]) =>
        Array.isArray(value)
          ? value.map((v) => (
              <button
                key={key + v}
                onClick={() =>
                  onChange({ ...filters, [key]: value.filter((x) => x !== v) })
                }
              >
                {labels[key]} : {v} ×
              </button>
            ))
          : typeof value === "boolean" && value
            ? [
                <button
                  key={key}
                  onClick={() => onChange({ ...filters, [key]: false })}
                >
                  {labels[key]} : non renseigné ×
                </button>,
              ]
            : [],
      )}
    </div>
  );
}
