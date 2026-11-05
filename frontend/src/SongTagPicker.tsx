import { useEffect, useState } from "react";
import { api } from "./api";
import { Floating } from "./Floating";
import { Icon } from "./Modal";
import type { CatalogTag, TagChoice } from "./song";

export function SongTagPicker({
  anchor,
  selected,
  onChange,
  onClose,
  filter,
  missing = false,
  onMissing,
}: {
  anchor: HTMLElement;
  selected: TagChoice[];
  onChange: (tags: TagChoice[]) => void;
  onClose: () => void;
  filter?: boolean;
  missing?: boolean;
  onMissing?: (value: boolean) => void;
}) {
  const [options, setOptions] = useState<CatalogTag[]>([]);
  const [draftOptions, setDraftOptions] = useState(selected);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [validation, setValidation] = useState("");
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const c = new AbortController();
    void api<{ tags: CatalogTag[] }>("/api/catalog/tags", { signal: c.signal })
      .then((v) => {
        if (!c.signal.aborted) {
          setOptions(v.tags);
          setError("");
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setError("Chargement des tags impossible.");
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [retry]);
  const normalize = (v: string) =>
    v.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const same = (a: TagChoice, b: TagChoice) =>
    a.id !== null && b.id !== null
      ? a.id === b.id
      : a.id === b.id && a.label === b.label;
  const all: TagChoice[] = [...options];
  for (const tag of [...draftOptions, ...selected]) {
    if (!all.some((t) => same(t, tag))) all.push(tag);
  }
  const label = query.trim().replace(/\s+/g, " ");
  const canCreate =
    !filter &&
    !loading &&
    !error &&
    !!label &&
    !all.some((t) => t.label === label);
  function create() {
    if (!canCreate) return;
    if (label.length > 80 || /\p{C}/u.test(label)) {
      setValidation("80 caractères lisibles maximum.");
      return;
    }
    const tag = { id: null, label };
    setValidation("");
    setDraftOptions((tags) => [...tags, tag]);
    onChange([...selected, tag]);
  }
  return (
    <Floating
      anchor={anchor}
      label={filter ? "Filtrer les sons par tags" : "Choisir les tags du son"}
      onClose={onClose}
      className="prod-tag-picker song-tag-picker"
      initialFocus
    >
      <h3>{filter ? "Tags des sons" : "Tags ajoutés au son"}</h3>
      <label className="prod-tag-search">
        <Icon name="search" />
        <input
          type="search"
          aria-label="Rechercher un tag"
          placeholder="Rechercher un tag…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setValidation("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              create();
            }
          }}
        />
      </label>
      <div className="prod-tag-options" aria-busy={loading}>
        {filter && (
          <label className="filter-option">
            <input
              type="checkbox"
              checked={missing}
              onChange={(e) => onMissing?.(e.target.checked)}
            />
            <span>Sans tag</span>
          </label>
        )}
        {canCreate && (
          <button
            type="button"
            className="prod-tag-create"
            aria-label={`Créer « ${label} »`}
            onClick={create}
          >
            <Icon name="plus" />
            <span>
              <span>Créer « {label} »</span>
              <small>et l’ajouter à ce son</small>
            </span>
          </button>
        )}
        {all
          .filter((t) => normalize(t.label).includes(normalize(query)))
          .map((tag) => (
            <label
              className="filter-option"
              key={tag.id === null ? `new:${tag.label}` : tag.id}
            >
              <input
                type="checkbox"
                checked={selected.some((t) => same(t, tag))}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...selected, tag]
                      : selected.filter((t) => !same(t, tag)),
                  )
                }
              />
              <span title={tag.label}>
                {tag.label}
                {tag.id !== null &&
                  !loading &&
                  !error &&
                  !options.some((t) => t.id === tag.id) && (
                    <small> · supprimé</small>
                  )}
              </span>
            </label>
          ))}
      </div>
      <div
        className="prod-tag-error"
        role={error || validation ? "alert" : "status"}
      >
        {error || validation || (loading ? "Chargement…" : "")}
        {error && (
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setRetry((n) => n + 1);
            }}
          >
            Réessayer
          </button>
        )}
      </div>
    </Floating>
  );
}
