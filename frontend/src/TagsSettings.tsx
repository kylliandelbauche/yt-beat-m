import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Icon } from "./Modal";
import { useShell } from "./shellContext";
type Tag = { id: number; label: string; beat_count: number };
export function TagsSettings({ onBusy }: { onBusy: (busy: boolean) => void }) {
  const shell = useShell();
  const [tags, setTags] = useState<Tag[]>([]),
    [query, setQuery] = useState(""),
    [editing, setEditing] = useState<Tag | null>(null),
    [name, setName] = useState(""),
    [removing, setRemoving] = useState<Tag | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [attempt, setAttempt] = useState(0),
    [loading, setLoading] = useState(true);
  const root = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  const live = useRef(true),
    inflight = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    const c = new AbortController();
    void api<{ tags: Tag[] }>("/api/catalog/tags", { signal: c.signal })
      .then((v) => {
        setTags(v.tags);
        setEditing((e) =>
          e ? v.tags.find((t) => t.id === e.id) || null : null,
        );
        setRemoving((e) =>
          e ? v.tags.find((t) => t.id === e.id) || null : null,
        );
        setError("");
      })
      .catch((e) => {
        if (!c.signal.aborted)
          setError(e instanceof Error ? e.message : "Liste indisponible.");
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [attempt]);
  useEffect(() => {
    if (editing) input.current?.focus({ preventScroll: true });
  }, [editing]);
  function focus(id: number, action = "rename") {
    requestAnimationFrame(() => {
      const el = root.current?.querySelector<HTMLButtonElement>(
        `[data-tag="${id}"] [data-action="${action}"]`,
      );
      (
        el ||
        root.current?.querySelector<HTMLInputElement>('input[type="search"]')
      )?.focus({ preventScroll: true });
    });
  }
  function cancel() {
    const target = editing || removing;
    setEditing(null);
    setRemoving(null);
    setError("");
    if (target) focus(target.id);
  }
  async function mutate(tag: Tag, label: string | null) {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ old_label: string; label: string | null }>(
        `/api/catalog/tags/${tag.id}`,
        {
          method: label === null ? "DELETE" : "PATCH",
          body: JSON.stringify({
            expected_label: tag.label,
            ...(label === null ? {} : { label }),
          }),
        },
      );
      if (!live.current) return;
      setTags((ts) =>
        label === null
          ? ts.filter((t) => t.id !== tag.id)
          : ts.map((t) =>
              t.id === tag.id ? { ...t, label: result.label! } : t,
            ),
      );
      setEditing(null);
      setRemoving(null);
      setNotice(label === null ? "Tag supprimé." : "Tag renommé.");
      shell.setTagChange({
        ...result,
        version: (shell.tagChange?.version || 0) + 1,
      });
      focus(tag.id);
    } catch (e) {
      if (live.current)
        setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      inflight.current = false;
      if (live.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  }
  const normalize = (v: string) =>
    v.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const visible = tags.filter(
    (t) =>
      t.id === editing?.id || normalize(t.label).includes(normalize(query)),
  );
  return (
    <div className="catalog-tags" ref={root} aria-busy={busy || loading}>
      <h3>Tags</h3>
      <p
        className="catalog-tags-intro"
        title="Renommer et supprimer les tags de la bibliothèque."
      >
        Renommer et supprimer les tags de la bibliothèque.
      </p>
      <label className="catalog-tags-search">
        <Icon name="search" />
        <input
          type="search"
          aria-label="Rechercher dans les tags"
          placeholder="Rechercher un tag…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={busy}
        />
      </label>
      <div className="catalog-tags-list">
        {visible.map((t) => (
          <div className="catalog-tag-row" key={t.id} data-tag={t.id}>
            {editing?.id === t.id ? (
              <input
                ref={input}
                aria-label="Nom du tag"
                value={name}
                maxLength={80}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void mutate(editing, name);
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    cancel();
                  }
                }}
              />
            ) : (
              <span
                className="catalog-tag-label"
                title={`${t.label} · ${t.beat_count} prod${t.beat_count > 1 ? "s" : ""}`}
              >
                {t.label}
              </span>
            )}
            <button
              className={editing?.id === t.id ? "tag-row-save" : ""}
              data-action="rename"
              disabled={
                busy || !!(editing && editing.id !== t.id) || !!removing
              }
              aria-label={
                editing?.id === t.id
                  ? `Enregistrer le tag ${t.label}`
                  : `Renommer ${t.label}`
              }
              onClick={() => {
                if (editing?.id === t.id) {
                  void mutate(editing, name);
                } else {
                  setEditing(t);
                  setName(t.label);
                  setNotice("");
                  setError("");
                }
              }}
            >
              <Icon name={editing?.id === t.id ? "check" : "edit"} />
            </button>
            <button
              data-action="delete"
              disabled={
                busy || !!(editing && editing.id !== t.id) || !!removing
              }
              aria-label={
                editing?.id === t.id
                  ? `Annuler le renommage de ${t.label}`
                  : `Supprimer ${t.label}`
              }
              onClick={() => {
                if (editing?.id === t.id) cancel();
                else {
                  setRemoving(t);
                  setNotice("");
                  setError("");
                }
              }}
            >
              <Icon name={editing?.id === t.id ? "close" : "trash"} />
            </button>
          </div>
        ))}
        {!loading && !visible.length && (
          <p className="catalog-tags-empty">
            {query
              ? "Aucun tag correspondant."
              : "Aucun tag dans la bibliothèque."}
          </p>
        )}
      </div>
      <div className="catalog-tags-feedback">
        {removing && (
          <>
            <strong>Supprimer « {removing.label} » ?</strong>
            <p>Retire le tag des associations, jamais les prods.</p>
            <div className="catalog-tags-confirm">
              <button disabled={busy} onClick={cancel}>
                Annuler
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void mutate(removing, null)}
              >
                Supprimer
              </button>
            </div>
          </>
        )}
        <div role={error ? "alert" : "status"} className="catalog-tags-message">
          {error ||
            notice ||
            (busy ? "Enregistrement…" : loading ? "Chargement…" : "")}
        </div>
        {error && (
          <button
            className="catalog-tags-retry"
            disabled={busy}
            onClick={() => {
              setLoading(true);
              setAttempt((n) => n + 1);
            }}
          >
            Actualiser la liste
          </button>
        )}
      </div>
    </div>
  );
}
