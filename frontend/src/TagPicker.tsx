import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { api } from "./api";
import type { FilterOptions } from "./filterState";
export function TagPicker({
  tags,
  onChange,
  onClose,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  onClose: () => void;
}) {
  const [options, setOptions] = useState(tags),
    [values, setValues] = useState(tags),
    [query, setQuery] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    void api<FilterOptions>("/api/catalog/filters", { signal: c.signal })
      .then((v) => setOptions(v.tags))
      .catch(() => {
        if (!c.signal.aborted)
          setError(
            "Chargement des tags impossible. Ferme puis rouvre le sélecteur.",
          );
      });
    return () => c.abort();
  }, []);
  return (
    <Modal
      label="Choisir mes tags"
      title={<h2>Choisir mes tags</h2>}
      closeLabel="Fermer les tags"
      onClose={onClose}
      className="tag-picker"
    >
      <input
        type="search"
        aria-label="Rechercher un tag"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Chercher ou créer un tag…"
      />
      <div className="tag-options">
        {[...new Set([...options, ...values])]
          .filter((v) =>
            v.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
          )
          .map((v) => (
            <label key={v}>
              <input
                type="checkbox"
                checked={values.includes(v)}
                onChange={(e) =>
                  setValues((s) =>
                    e.target.checked ? [...s, v] : s.filter((t) => t !== v),
                  )
                }
              />
              {v}
            </label>
          ))}
      </div>
      <div className="tag-create">
        <button
          disabled={
            !query.trim() || [...options, ...values].includes(query.trim())
          }
          onClick={() => {
            const v = query.trim();
            if (v.length > 80) {
              setError("Un tag contient au maximum 80 caractères.");
              return;
            }
            setValues((s) => [...new Set([...s, v])]);
            setQuery("");
            setError("");
          }}
        >
          Créer « {query.trim() || "…"} »
        </button>
        <button className="primary" onClick={() => onChange(values)}>
          Utiliser la sélection
        </button>
      </div>
      <div className="tag-error" role="alert">
        {error}
      </div>
    </Modal>
  );
}
