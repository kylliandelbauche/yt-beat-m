import { useShell } from "./shellContext";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { api } from "./api";
import {
  beatmakerSourceLabel,
  duration,
  externalLink,
  musicalKeyLabel,
} from "./beat";
import type { Beat, BeatDetails } from "./beat";
import { PaneIcon } from "./Shell";
import { KeyPicker } from "./KeyPicker";
import { TagPicker } from "./TagPicker";
import { ProducerPicker, ProducerProfile } from "./Beatmakers";
import { Artwork } from "./Artwork";
import { Icon, Modal } from "./Modal";
import { useTitleMarquee } from "./useTitleMarquee";
import type { ModalClose } from "./useModalLifecycle";
import { MarketplaceDialog } from "./MarketplaceDialog";
import type { MarketField, MarketStatus } from "./MarketplaceDialog";

type Draft = {
  title: string;
  beatmaker: string;
  bpm: string;
  musical_key: string;
  description: string;
  sale_url: string;
  tags: string[];
  created_tags: string[];
  marketplace_fields: MarketField[];
};
function draftFor(beat: BeatDetails): Draft {
  return {
    title: beat.title,
    beatmaker: beat.beatmaker || "",
    bpm: beat.bpm === null ? "" : String(beat.bpm),
    musical_key: beat.musical_key ? musicalKeyLabel(beat.musical_key) : "",
    description: beat.description || "",
    sale_url: beat.links[0]?.url || "",
    created_tags: [],
    marketplace_fields: [],
    tags: beat.tags ?? [...new Set([...beat.styles, ...beat.moods])],
  };
}
function dateLabel(value: string | null, dateOnly = false) {
  if (!value) return "Non renseignée";
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.valueOf())
    ? "Non renseignée"
    : new Intl.DateTimeFormat("fr-BE", {
        day: "numeric",
        month: "short",
        year: "numeric",
        ...(dateOnly ? { timeZone: "UTC" } : {}),
      }).format(date);
}

export function BeatDetailsPanel({
  identity,
  onOpenSongs,
  navigationRef,
  profileRevision,
  onOpenProfile,
  onProfilesChanged,
  playing,
  playbackError,
  onDismissPlaybackError,
  onTogglePlayback,
  onClose,
  onFavorite,
  onChanged,
  onDirtyChange,
  onCancelNavigation,
}: {
  identity: string;
  onOpenSongs: () => void;
  navigationRef: { current: ModalClose | null };
  profileRevision: number;
  onOpenProfile: (id: string) => void;
  onProfilesChanged: () => void;
  playing: boolean;
  playbackError: string;
  onDismissPlaybackError: () => void;
  onTogglePlayback: (beat: Beat) => void;
  onClose: () => void;
  onFavorite: (beat: Beat) => Promise<boolean>;
  onChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onCancelNavigation: () => void;
}) {
  const shell = useShell();
  const [keyAnchor, setKeyAnchor] = useState<HTMLElement | null>(null);
  const [tagging, setTagging] = useState<HTMLElement | null>(null);
  const closeKey = useCallback(() => setKeyAnchor(null), []);
  const form = useRef<HTMLFormElement>(null);

  const titleInput = useRef<HTMLInputElement>(null);
  const titlePosition = useRef(0);
  // Chromium may reset native input scroll on blur, before the mode button clicks.
  const titleBlurred = useRef(false);
  const saveFocus = useRef<HTMLElement | null>(null);
  const descriptionInput = useRef<HTMLTextAreaElement>(null);
  const view = useRef({
    description: 0,
    descriptionLeft: 0,
    content: 0,
    left: 0,
  });
  const [beat, setBeat] = useState<BeatDetails | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [, setSaveError] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const marketTrigger = useRef<HTMLButtonElement>(null);
  const restoreMarketFocus = useRef(false);
  const deferredMarketRefresh = useRef(false);
  const changeCallback = useRef(onChanged);
  useLayoutEffect(() => {
    changeCallback.current = onChanged;
  });
  useLayoutEffect(() => {
    if (!marketOpen && restoreMarketFocus.current) {
      restoreMarketFocus.current = false;
      queueMicrotask(() =>
        marketTrigger.current?.focus({ preventScroll: true }),
      );
    }
  }, [marketOpen]);
  const editingRef = useRef(false);
  useLayoutEffect(() => {
    editingRef.current = editing;
  }, [editing]);
  const [associated, setAssociated] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  useTitleMarquee(titleInput, Boolean(beat) && !editing, titlePosition);
  useLayoutEffect(() => {
    const description = descriptionInput.current;
    if (description) {
      description.scrollTop = view.current.description;
      description.scrollLeft = view.current.descriptionLeft;
    }
    if (titleInput.current)
      titleInput.current.scrollLeft = titlePosition.current;
    if (form.current) {
      form.current.scrollTop = view.current.content;
      const left = form.current.querySelector(".detail-left");
      if (left) left.scrollTop = view.current.left;
    }
  }, [editing]);
  useLayoutEffect(() => {
    if (!busy && saveFocus.current) {
      if (document.activeElement === document.body) {
        const target = saveFocus.current.isConnected
          ? saveFocus.current
          : form.current
              ?.closest(".beat-details")
              ?.querySelector<HTMLButtonElement>(".edit-save");
        target?.focus({ preventScroll: true });
      }
      saveFocus.current = null;
    }
  }, [busy]);
  function rememberView() {
    const description = descriptionInput.current;
    if (description) {
      view.current.description = description.scrollTop;
      view.current.descriptionLeft = description.scrollLeft;
    }
    if (titleInput.current && !titleBlurred.current)
      titlePosition.current = titleInput.current.scrollLeft;
    view.current.content = form.current?.scrollTop || 0;
    view.current.left =
      form.current?.querySelector(".detail-left")?.scrollTop || 0;
  }
  useEffect(() => {
    const controller = new AbortController();
    api<BeatDetails>(`/api/beats/${identity}`, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setBeat(value);
          if (!editingRef.current) {
            setDraft(draftFor(value));
            setAssociated(value.beatmakers || []);
          }
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Fiche indisponible.",
          );
      });
    return () => controller.abort();
  }, [identity, attempt, profileRevision]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  function marketResolved() {
    if (editingRef.current) {
      deferredMarketRefresh.current = true;
      return;
    }
    setAttempt((n) => n + 1);
    changeCallback.current();
  }
  useEffect(() => {
    if (!editing && deferredMarketRefresh.current) {
      deferredMarketRefresh.current = false;
      setAttempt((n) => n + 1);
      changeCallback.current();
    }
  }, [editing]);
  const marketState = beat?.marketplace?.state;
  useEffect(() => {
    if (!marketState || !["queued", "running"].includes(marketState)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await api<MarketStatus>(
          `/api/beats/${identity}/enrichment`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (["queued", "running"].includes(result.state))
          timer = setTimeout(() => void poll(), 750);
        else marketResolved();
      } catch {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void poll(), 3000);
      }
    }
    timer = setTimeout(() => void poll(), 750);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [identity, marketState]);
  const dirty = !!(
    editing &&
    beat &&
    draft &&
    (JSON.stringify(draft) !== JSON.stringify(draftFor(beat)) ||
      JSON.stringify(associated.map((p) => p.id)) !==
        JSON.stringify((beat.beatmakers || []).map((p) => p.id)))
  );
  const dirtyCallback = useRef(onDirtyChange);
  useLayoutEffect(() => {
    dirtyCallback.current = onDirtyChange;
  }, [onDirtyChange]);
  useLayoutEffect(() => {
    dirtyCallback.current(dirty);
    return () => dirtyCallback.current(false);
  }, [dirty]);
  useLayoutEffect(() => {
    navigationRef.current = (force = false) => {
      if (force || canClose()) {
        cancel();
        onClose();
      }
    };
    return () => {
      navigationRef.current = null;
    };
  });
  function beginEdit() {
    if (!editing && beat) {
      rememberView();
      setDraft(draftFor(beat));
      setEditing(true);
    }
  }
  function update<T extends keyof Draft>(field: T, value: Draft[T]) {
    setError("");
    setSaveError(false);
    setInvalid([]);
    setDraft((current) =>
      current
        ? {
            ...current,
            [field]: value,
            marketplace_fields: current.marketplace_fields.filter(
              (f) => f !== field,
            ),
          }
        : current,
    );
  }
  function canClose() {
    if (busy) return false;
    if (
      editing &&
      beat &&
      draft &&
      (JSON.stringify(draft) !== JSON.stringify(draftFor(beat)) ||
        JSON.stringify(associated.map((p) => p.id)) !==
          JSON.stringify((beat.beatmakers || []).map((p) => p.id)))
    ) {
      setConfirmDiscard(true);
      return false;
    }
    return true;
  }
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        !e.defaultPrevented &&
        shell.right &&
        !document.querySelector("dialog[open]")
      ) {
        e.preventDefault();
        if (canClose()) {
          cancel();
          onClose();
        }
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  });
  function focusEditor() {
    form.current
      ?.closest(".beat-details")
      ?.querySelector<HTMLButtonElement>(".edit-save")
      ?.focus({ preventScroll: true });
  }
  function cancel() {
    rememberView();
    if (beat) {
      setDraft(draftFor(beat));
      setAssociated(beat.beatmakers || []);
    }
    setEditing(false);
    setConfirmDiscard(false);
    setError("");
    setInvalid([]);
    setSaveError(false);
    focusEditor();
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!beat || !draft || !editing || busy) return;
    rememberView();
    const bad = Array.from(
      form.current?.querySelectorAll<HTMLInputElement>("input:invalid") || [],
    );
    if (
      draft.sale_url &&
      !externalLink(draft.sale_url) &&
      !bad.some((input) => input.id === "detail-sale")
    )
      bad.push(form.current!.querySelector<HTMLInputElement>("#detail-sale")!);
    if (bad.length) {
      setInvalid(bad.map((input) => input.id));
      const labels: Record<string, string> = {
        "detail-title": "Titre : indique un titre non vide.",
        "detail-bpm":
          "BPM : indique un nombre supérieur à 0 et inférieur ou égal à 1000.",
        "detail-sale":
          "Page de vente : indique une adresse HTTP ou HTTPS valide.",
      };
      setError(
        bad
          .map(
            (input) => labels[input.id] || "Vérifie les informations saisies.",
          )
          .join(" "),
      );
      setSaveError(false);
      return;
    }
    saveFocus.current = document.activeElement as HTMLElement;
    setBusy(true);
    setError("");
    setNotice("");
    const original = draftFor(beat);
    const patch: Record<string, unknown> = {};
    for (const key of [
      "title",
      "description",
      "beatmaker",
      "musical_key",
    ] as const)
      if (draft[key] !== original[key])
        patch[key] = key === "title" ? draft[key] : draft[key].trim() || null;
    if (
      JSON.stringify(associated.map((p) => p.id)) !==
      JSON.stringify((beat.beatmakers || []).map((p) => p.id))
    ) {
      delete patch.beatmaker;
      patch.beatmaker_ids = associated.map((p) => p.id);
    }
    if (draft.bpm !== original.bpm)
      patch.bpm = draft.bpm.trim() ? Number(draft.bpm) : null;
    for (const key of ["tags"] as const)
      if (JSON.stringify(draft[key]) !== JSON.stringify(original[key]))
        patch[key] = draft[key];
    if (draft.created_tags.some((t) => draft.tags.includes(t)))
      patch.recreate_tags = draft.created_tags.filter((t) =>
        draft.tags.includes(t),
      );
    if (draft.sale_url !== original.sale_url)
      patch.links = [
        ...(draft.sale_url.trim()
          ? [
              {
                url: draft.sale_url.trim(),
                label: beat.links[0]?.label || null,
              },
            ]
          : []),
        ...beat.links.slice(1),
      ];
    if (draft.marketplace_fields.some((f) => f in patch))
      patch.marketplace_fields = draft.marketplace_fields.filter(
        (f) => f in patch,
      );
    try {
      const result = await api<BeatDetails>(`/api/beats/${beat.id}/metadata`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      rememberView();
      setBeat(result);
      setDraft(draftFor(result));
      setAssociated(result.beatmakers || []);
      setEditing(false);
      setConfirmDiscard(false);
      setNotice("Informations enregistrées.");
      onChanged();
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Informations non enregistrées.";
      setError(message);
      setSaveError(true);
      const fields: Record<string, string> = {
        Titre: "detail-title",
        BPM: "detail-bpm",
        Tonalité: "detail-key",
        Beatmaker: "detail-maker",
        Description: "detail-description",
        Liens: "detail-sale",
      };
      setInvalid(
        Object.entries(fields)
          .filter(([label]) => message.includes(`${label} :`))
          .map(([, id]) => id),
      );
    } finally {
      setBusy(false);
    }
  }
  async function favorite() {
    if (!beat) return;
    setBusy(true);
    setError("");
    try {
      const value = await onFavorite(beat);
      setBeat((current) =>
        current ? { ...current, favorite: value } : current,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Favori non enregistré.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function reveal() {
    setRevealing(true);
    setError("");
    try {
      await api(`/api/beats/${identity}/reveal`, { method: "POST" });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Impossible d’afficher le fichier. Réessaie.",
      );
    } finally {
      setRevealing(false);
    }
  }
  const source = externalLink(beat?.source_url || null);
  const saleLink = externalLink(beat?.links[0]?.url || null);
  return (
    <aside
      className={`detail-sidebar${shell.right ? " expanded" : ""}`}
      aria-label="Volet de la prod"
    >
      <nav className="detail-rail" aria-label="Sections de la fiche">
        <button
          className="icon-button pane-toggle"
          aria-label={shell.right ? "Replier la fiche" : "Ouvrir la fiche"}
          aria-expanded={shell.right}
          onClick={() => {
            if (shell.right) {
              if (canClose()) {
                cancel();
                onClose();
              }
            } else shell.setRight(true);
          }}
        >
          <PaneIcon side="right" open={shell.right} />
        </button>
        <button
          title="Informations"
          className="icon-button"
          aria-label="Informations"
          aria-pressed={shell.section === "info"}
          onClick={() => {
            shell.setSection("info");
            shell.setRight(true);
          }}
        >
          <Icon name="info" />
        </button>
        <button
          title="Description"
          className="icon-button"
          aria-label="Description"
          aria-pressed={shell.section === "description"}
          onClick={() => {
            shell.setSection("description");
            shell.setRight(true);
          }}
        >
          <Icon name="description" />
        </button>
        {source && (
          <a
            title="Ouvrir la vidéo"
            className="icon-button"
            aria-label="Ouvrir la vidéo de la prod"
            href={source}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="link" />
          </a>
        )}
        <button
          className="icon-button"
          type="button"
          title="Compléter depuis la page de vente"
          aria-label="Compléter depuis la page de vente"
          ref={marketTrigger}
          disabled={!beat || busy}
          onClick={() => {
            restoreMarketFocus.current = true;
            setMarketOpen(true);
          }}
        >
          <Icon name="refresh" />
        </button>
      </nav>
      <section
        role="region"
        aria-label={beat?.title || "Détails de la prod"}
        className={`beat-details${editing ? " is-editing" : ""}`}
        hidden={!shell.right}
      >
        <header className="detail-header">
          <strong>Fiche prod</strong>
          <button
            className="icon-button cancel-detail"
            type="button"
            title="Annuler les modifications"
            aria-label="Annuler les modifications"
            aria-hidden={!editing}
            tabIndex={editing ? 0 : -1}
            disabled={!editing || busy}
            style={{ visibility: editing ? "visible" : "hidden" }}
            onClick={cancel}
          >
            <Icon name="close" />
          </button>
          <button
            className="icon-button edit-save"
            data-editing={editing}
            disabled={busy || !beat}
            aria-busy={busy && editing}
            aria-label={
              editing ? "Enregistrer les modifications" : "Modifier la prod"
            }
            onClick={() => {
              if (editing) form.current?.requestSubmit();
              else {
                beginEdit();
                setError("");
                setNotice("");
              }
            }}
          >
            <Icon name={editing ? "save" : notice ? "check" : "edit"} />
          </button>
          <button
            className="icon-button details-favorite"
            disabled={busy || !beat}
            aria-label={
              beat?.favorite ? "Retirer des favoris" : "Ajouter aux favoris"
            }
            aria-pressed={beat?.favorite || false}
            onClick={() => {
              void favorite();
            }}
          >
            <Icon name="heart" filled={beat?.favorite} />
          </button>
        </header>
        <div className="detail-feedback" aria-live="polite">
          {notice && (
            <span className="sr-only" role="status">
              {notice}
            </span>
          )}
          {error && (
            <div className="operation-error" role="alert">
              <p id="detail-error-message">{error}</p>
              <button
                type="button"
                onClick={() => {
                  if (editing) form.current?.requestSubmit();
                  else {
                    setError("");
                    setAttempt((n) => n + 1);
                  }
                }}
              >
                Réessayer
              </button>
              <button
                aria-label="Masquer le message d’erreur"
                onClick={() => setError("")}
              >
                ×
              </button>
            </div>
          )}
          {!error && playbackError && (
            <div className="operation-error" role="alert">
              {playbackError}
              <button
                aria-label="Masquer le message d’erreur audio"
                onClick={onDismissPlaybackError}
              >
                ×
              </button>
            </div>
          )}
        </div>
        {!beat && (
          <div className="detail-loading" role="status">
            {error ? "Fiche indisponible" : "Chargement de la fiche…"}
          </div>
        )}
        {beat && draft && (
          <form
            ref={form}
            className="details-content"
            noValidate
            onSubmit={(e) => {
              void save(e);
            }}
          >
            <h2 className="detail-title-input">
              <label className="sr-only" htmlFor="detail-title">
                Titre de la prod
              </label>
              <input
                ref={titleInput}
                id="detail-title"
                required
                maxLength={500}
                readOnly={!editing || busy}
                title={draft.title}
                value={draft.title}
                onFocus={() => {
                  titleBlurred.current = false;
                }}
                onBlur={(e) => {
                  if (e.currentTarget.scrollLeft)
                    titlePosition.current = e.currentTarget.scrollLeft;
                  titleBlurred.current = true;
                  const input = e.currentTarget;
                  requestAnimationFrame(() => {
                    if (input.isConnected && titleBlurred.current)
                      input.scrollLeft = titlePosition.current;
                  });
                }}
                onScroll={(e) => {
                  if (!titleBlurred.current)
                    titlePosition.current = e.currentTarget.scrollLeft;
                }}
                aria-invalid={invalid.includes("detail-title")}
                onChange={(e) => update("title", e.target.value)}
              />
            </h2>
            <div className="detail-cover">
              <Artwork beat={beat} className="detail-artwork" />
              <button
                className="detail-play cover-play"
                type="button"
                aria-label={`${playing ? "Mettre en pause" : "Écouter"} ${beat.title}`}
                onClick={() => onTogglePlayback(beat)}
              >
                <Icon name={playing ? "pause" : "play"} filled />
              </button>
              <span className="cover-duration">
                {duration(beat.duration_seconds)}
              </span>
            </div>
            <div className="detail-producers identity-strip">
              <div className="strip-scroll">
                {associated.length ? (
                  associated.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onOpenProfile(p.id)}
                    >
                      <span className="producer-mini" aria-hidden="true">
                        {(beat.beatmakers || []).find((b) => b.id === p.id)
                          ?.photo_url ? (
                          <img
                            alt=""
                            src={
                              (beat.beatmakers || []).find(
                                (b) => b.id === p.id,
                              )!.photo_url!
                            }
                          />
                        ) : (
                          p.name.slice(0, 2)
                        )}
                      </span>
                      {p.name}
                    </button>
                  ))
                ) : (
                  <span title={beatmakerSourceLabel(beat.beatmaker_source)}>
                    {draft.beatmaker || "Beatmaker non renseigné"}
                  </span>
                )}
              </div>
              <button
                className="strip-action"
                type="button"
                aria-label="Associer des beatmakers"
                title="Associer des beatmakers"
                disabled={busy}
                onClick={() => setPicking(true)}
              >
                <Icon name="link" />
              </button>
            </div>
            <div
              className="detail-info-section"
              hidden={shell.section !== "info"}
            >
              <div className="detail-music">
                <div className="music-cell">
                  <span>Durée</span>
                  <span className="cell-value">
                    {duration(beat.duration_seconds)}
                  </span>
                </div>
                <label className="music-cell" htmlFor="detail-bpm">
                  <span>BPM</span>
                  <input
                    id="detail-bpm"
                    aria-label="BPM"
                    type="number"
                    step="any"
                    min="0.01"
                    max="1000"
                    value={draft.bpm}
                    placeholder="—"
                    readOnly={!editing || busy}
                    aria-invalid={invalid.includes("detail-bpm")}
                    onChange={(e) => update("bpm", e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  id="detail-key"
                  className="music-cell key-cell"
                  aria-label={`Tonalité : ${draft.musical_key || "non renseignée"}`}
                  aria-haspopup="dialog"
                  aria-expanded={!!keyAnchor}
                  disabled={!editing || busy}
                  onClick={(e) => setKeyAnchor(e.currentTarget)}
                >
                  <span>Tonalité</span>
                  <span className="cell-value">{draft.musical_key || "—"}</span>
                  <Icon name="chevron" />
                </button>
              </div>
              <div className="detail-tags identity-strip">
                <div className="strip-scroll">
                  {draft.tags.map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                      <button
                        type="button"
                        aria-label={`Retirer le tag ${tag}`}
                        disabled={busy}
                        onClick={() => {
                          beginEdit();
                          setDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  tags: d.tags.filter((t) => t !== tag),
                                  created_tags: d.created_tags.filter(
                                    (t) => t !== tag,
                                  ),
                                }
                              : d,
                          );
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {!draft.tags.length && (
                    <span className="muted">Aucun tag</span>
                  )}
                </div>
                <button
                  className="strip-action"
                  type="button"
                  aria-label="Choisir mes tags"
                  disabled={busy}
                  aria-expanded={!!tagging}
                  onClick={(e) => {
                    beginEdit();
                    setTagging(tagging ? null : e.currentTarget);
                  }}
                >
                  <Icon name="plus" />
                </button>
              </div>
              <div className="detail-source">
                <div className="info-cell">
                  <span>Vidéo YouTube</span>
                  {source ? (
                    <a href={source} target="_blank" rel="noreferrer">
                      Voir la vidéo ↗
                    </a>
                  ) : (
                    <span className="cell-value">—</span>
                  )}
                </div>
                <div className="info-cell">
                  <span>Source</span>
                  <span className="cell-value">
                    {source ? "YouTube" : "Fichier local"}
                  </span>
                </div>
              </div>
              <div className="detail-dates">
                <div className="info-cell">
                  <span>Publication</span>
                  <span className="cell-value">
                    {dateLabel(beat.published_on, true)}
                  </span>
                </div>
                <div className="info-cell">
                  <span>Ajout</span>
                  <span className="cell-value">{dateLabel(beat.added_at)}</span>
                </div>
              </div>
              <input
                id="detail-maker"
                className="sr-only"
                tabIndex={-1}
                readOnly
                value={draft.beatmaker}
                aria-label="Crédit source du beatmaker"
              />
            </div>
            <div
              className="detail-description"
              hidden={shell.section !== "description"}
            >
              <label className="sr-only" htmlFor="detail-description">
                Description de la prod
              </label>
              <textarea
                ref={descriptionInput}
                id="detail-description"
                aria-label="Description de la prod"
                readOnly={!editing || busy}
                maxLength={100000}
                value={draft.description}
                placeholder="Aucune description disponible."
                onChange={(e) => update("description", e.target.value)}
              />
            </div>
            <footer className="detail-links">
              <button
                className="future-song"
                type="button"
                onClick={onOpenSongs}
              >
                <Icon name="link" />
                Sons liés
              </button>
              <button
                className="reveal-file"
                type="button"
                disabled={revealing}
                aria-busy={revealing}
                onClick={() => {
                  void reveal();
                }}
              >
                <Icon name="folder" />
                Afficher le fichier
              </button>
              <div className="sale-field">
                <input
                  id="detail-sale"
                  type="url"
                  aria-label="Page de vente"
                  placeholder={editing ? "https://…" : "Page de vente"}
                  maxLength={2048}
                  value={draft.sale_url}
                  readOnly={!editing || busy}
                  tabIndex={editing ? 0 : -1}
                  aria-invalid={invalid.includes("detail-sale")}
                  onChange={(e) => update("sale_url", e.target.value)}
                />
                {!editing && (
                  <a
                    className="sale-link"
                    href={saleLink || undefined}
                    aria-disabled={!saleLink}
                    tabIndex={saleLink ? 0 : -1}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icon name="link" />
                    Page de vente
                  </a>
                )}
              </div>
            </footer>
          </form>
        )}
      </section>
      {marketOpen && beat && draft && (
        <MarketplaceDialog
          identity={identity}
          values={{
            bpm: draft.bpm || null,
            musical_key: draft.musical_key || null,
            beatmaker: draft.beatmaker || null,
            tags: draft.tags,
          }}
          onResolved={marketResolved}
          onClose={() => setMarketOpen(false)}
          onUse={(proposals) => {
            beginEdit();
            setDraft((current) => {
              if (!current) return current;
              const next = {
                ...current,
                marketplace_fields: [...current.marketplace_fields],
              };
              for (const proposal of proposals) {
                if (proposal.field === "tags")
                  next.tags = [
                    ...new Set([...next.tags, ...(proposal.value as string[])]),
                  ];
                else next[proposal.field] = String(proposal.value);
                if (!next.marketplace_fields.includes(proposal.field))
                  next.marketplace_fields.push(proposal.field);
              }
              return next;
            });
            setError("");
          }}
        />
      )}
      {keyAnchor && draft && (
        <KeyPicker
          value={draft.musical_key}
          anchor={keyAnchor}
          onClose={closeKey}
          onChange={(v) => update("musical_key", v)}
        />
      )}
      {picking && (
        <ProducerPicker
          selected={associated}
          revision={profileRevision}
          onClose={() => setPicking(false)}
          onCreate={() => setCreating(true)}
          onSelect={(values) => {
            beginEdit();
            setAssociated(values);
            setPicking(false);
          }}
        />
      )}
      {creating && (
        <ProducerProfile
          identity="new"
          revision={0}
          onClose={() => setCreating(false)}
          onChanged={onProfilesChanged}
          onBeat={() => {}}
          onViewBeats={() => {}}
          onPlay={onTogglePlayback}
          playingId={playing ? identity : null}
        />
      )}
      {tagging && draft && (
        <TagPicker
          anchor={tagging}
          tags={draft.tags}
          onClose={() => setTagging(null)}
          onChange={(tags, created) => {
            setDraft((d) =>
              d
                ? {
                    ...d,
                    tags,
                    created_tags: created
                      ? [...new Set([...d.created_tags, created])]
                      : d.created_tags.filter((t) => tags.includes(t)),
                  }
                : d,
            );
          }}
        />
      )}
      {confirmDiscard && (
        <Modal
          label="Modifications non enregistrées"
          title={<h2>Conserver tes modifications ?</h2>}
          closeLabel="Fermer la confirmation et continuer l’édition"
          onClose={() => {
            setConfirmDiscard(false);
            onCancelNavigation?.();
          }}
          className="discard-modal"
        >
          <p>Des modifications ne sont pas enregistrées.</p>
          <button
            onClick={() => {
              setConfirmDiscard(false);
              onCancelNavigation?.();
            }}
          >
            Continuer l’édition
          </button>
          <button
            onClick={() => {
              cancel();
              onClose();
            }}
          >
            Abandonner et continuer
          </button>
        </Modal>
      )}
    </aside>
  );
}
