import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { api } from "./api";
import type { FilterOptions } from "./filterState";
export function TagPicker({
  styles,
  moods,
  onChange,
  onClose,
}: {
  styles: string[];
  moods: string[];
  onChange: (styles: string[], moods: string[]) => void;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<{ styles: string[]; moods: string[] }>(
      { styles, moods },
    ),
    [error, setError] = useState("");
  const [values, setValues] = useState({ styles, moods }),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState<"styles" | "moods">("styles");
  useEffect(() => {
    const c = new AbortController();
    void api<FilterOptions>("/api/catalog/filters", { signal: c.signal })
      .then(setOptions)
      .catch(() => {
        if (!c.signal.aborted)
          setError(
            "Les tags disponibles n’ont pas pu être chargés. Tu peux réessayer en rouvrant ce sélecteur.",
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
      <div className="tag-kinds" role="group" aria-label="Catégorie de tag">
        <button
          aria-pressed={kind === "styles"}
          onClick={() => setKind("styles")}
        >
          Styles
        </button>
        <button
          aria-pressed={kind === "moods"}
          onClick={() => setKind("moods")}
        >
          Ambiances
        </button>
      </div>
      <div className="tag-options">
        {[...new Set([...options[kind], ...values[kind]])]
          .filter((v) => v.toLowerCase().includes(query.toLowerCase()))
          .map((v) => (
            <label key={v}>
              <input
                type="checkbox"
                checked={values[kind].includes(v)}
                onChange={(e) =>
                  setValues((s) => ({
                    ...s,
                    [kind]: e.target.checked
                      ? [...s[kind], v]
                      : s[kind].filter((x) => x !== v),
                  }))
                }
              />
              {v}
            </label>
          ))}
      </div>
      <div className="tag-create">
        <button
          disabled={!query.trim()}
          onClick={() => {
            const v = query.trim();
            if (v.length > 80) {
              setError("Un tag contient au maximum 80 caractères.");
              return;
            }
            setValues((s) => ({ ...s, [kind]: [...new Set([...s[kind], v])] }));
            setQuery("");
          }}
        >
          Créer « {query.trim() || "…"} »
        </button>
        <button
          className="primary"
          onClick={() => onChange(values.styles, values.moods)}
        >
          Utiliser la sélection
        </button>
      </div>
      <div className="tag-error" role="alert">
        {error}
      </div>
    </Modal>
  );
}
