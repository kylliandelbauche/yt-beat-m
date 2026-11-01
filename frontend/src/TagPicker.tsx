import { useEffect, useState } from "react";
import { Floating } from "./Floating";
import { Icon } from "./Modal";
import { api } from "./api";
import type { FilterOptions } from "./filterState";
const normalized = (v: string) =>
  v.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export function TagPicker({
  anchor,
  tags,
  onChange,
  onClose,
}: {
  anchor: HTMLElement;
  tags: string[];
  onChange: (tags: string[], created?: string) => void;
  onClose: () => void;
}) {
  const [options, setOptions] = useState(tags),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    void api<FilterOptions>("/api/catalog/filters", { signal: c.signal })
      .then((v) => {
        setOptions(v.tags);
        setError("");
      })
      .catch(() => {
        if (!c.signal.aborted) setError("Chargement impossible.");
      });
    return () => c.abort();
  }, [attempt]);
  const all = [...new Set([...options, ...tags])];
  const label = query.trim();
  const canCreate = !!label && !all.includes(label);
  function create() {
    if (!canCreate) return;
    if (label.length > 80 || /\p{C}/u.test(label)) {
      setError("80 caractères lisibles maximum.");
      return;
    }
    onChange([...tags, label], label);
    setQuery(label);
    setError("");
  }
  return (
    <Floating
      anchor={anchor}
      label="Choisir mes tags"
      onClose={onClose}
      className="prod-tag-picker"
      initialFocus
    >
      <h3>Tags de la prod</h3>
      <label className="prod-tag-search">
        <Icon name="search" />
        <input
          type="search"
          aria-label="Rechercher un tag"
          value={query}
          placeholder="Rechercher un tag…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              create();
            }
          }}
        />
      </label>
      <div className="prod-tag-options">
        {canCreate && (
          <button
            className="prod-tag-create"
            aria-label={`Créer « ${label} »`}
            onClick={create}
          >
            <Icon name="plus" />
            <span>
              <span>Créer « {label} »</span>
              <small>et l’ajouter à cette prod</small>
            </span>
          </button>
        )}
        {all
          .filter((v) => normalized(v).includes(normalized(query)))
          .map((v) => (
            <label className="filter-option" key={v}>
              <input
                type="checkbox"
                checked={tags.includes(v)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...tags, v]
                      : tags.filter((t) => t !== v),
                  )
                }
              />
              <span title={v}>{v}</span>
            </label>
          ))}
      </div>
      {error && (
        <div className="prod-tag-error" role="alert">
          {error}
          <button onClick={() => setAttempt((n) => n + 1)}>Réessayer</button>
        </div>
      )}
    </Floating>
  );
}
