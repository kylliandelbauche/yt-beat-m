import { SongStateControl } from "./SongStateControl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "./api";
import { Artwork } from "./Artwork";
import { duration } from "./beat";
import type { Beat } from "./beat";
import { Icon, Modal } from "./Modal";
import { PaneIcon } from "./Shell";
import { useShell } from "./shellContext";
import { useTitleMarquee } from "./useTitleMarquee";
import type { ModalClose } from "./useModalLifecycle";
import { ProdPicker } from "./SongRelations";
import { SongTagPicker } from "./SongTagPicker";
import { SongDescription, songTextLimit } from "./SongDescription";
import { SongCoverMenu } from "./SongCoverMenu";
import { songTrack } from "./song";
import type {
  Song,
  FileSelection,
  SongState,
  CatalogTag,
  TagChoice,
} from "./song";

export type SongEditor = { song: Song | null; file: FileSelection | null };
type Draft = {
  title: string;
  state: SongState;
  favorite: boolean;
  created_on: string;
  released_on: string;
  beat_id: string | null;
  beat_title: string | null;
  artwork_url: string | null;
  beat_artwork_url: string | null;
  cover: string | null | undefined;
  file: FileSelection | null;
  direct_tags: TagChoice[];
  inherited_tags: CatalogTag[];
  notes: string;
  lyrics: string;
};
function draftFor(editor: SongEditor): Draft {
  const s = editor.song;
  return {
    title: s?.title || editor.file?.name.replace(/\.mp3$/i, "") || "",
    state: s?.state || "Topline",
    favorite: s?.favorite || false,
    created_on: s?.created_on || "",
    released_on: s?.released_on || "",
    beat_id: s?.beat_id || null,
    beat_title: s?.beat_title || null,
    artwork_url: s?.artwork_url || null,
    beat_artwork_url: s?.beat_artwork_url || null,
    cover: undefined,
    file: editor.file,
    direct_tags: (s?.tags || [])
      .filter((t) => t.direct)
      .map(({ id, label }) => ({ id, label })),
    inherited_tags: (s?.tags || [])
      .filter((t) => t.inherited)
      .map(({ id, label }) => ({ id, label })),
    notes: s?.notes || "",
    lyrics: s?.lyrics || "",
  };
}
function dateLabel(value: string) {
  return value
    ? new Intl.DateTimeFormat("fr-BE", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value))
    : "Non renseignée";
}
export function SongDetails({
  editor,
  externalBusy,
  onReload,
  navigationRef,
  onDirtyChange,
  onBusyChange,
  onClose,
  onCancelNavigation,
  onSaved,
  onOpenBeat,
  onPlay,
  playing,
  playbackError,
  onDismissPlaybackError,
}: {
  editor: SongEditor;
  externalBusy: boolean;
  onReload: () => void;
  navigationRef: { current: ModalClose | null };
  onDirtyChange: (value: boolean) => void;
  onBusyChange: (value: boolean) => void;
  onClose: () => void;
  onCancelNavigation: () => void;
  onSaved: (song: Song, fileChanged: boolean) => void;
  onOpenBeat: (id: string) => void;
  onPlay: (song: Song) => void;
  playing: boolean;
  playbackError: string;
  onDismissPlaybackError: () => void;
}) {
  const shell = useShell();
  const [draft, setDraft] = useState(() => draftFor(editor));
  const [editing, setEditing] = useState(!editor.song);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickingCover, setPickingCover] = useState(false);
  const [coverMenu, setCoverMenu] = useState<HTMLElement | null>(null);
  const coverButton = useRef<HTMLButtonElement>(null);
  const restoreCoverFocus = useRef(false);
  const [choosingProd, setChoosingProd] = useState(false);
  const [tagging, setTagging] = useState<HTMLElement | null>(null);
  const [section, setSection] = useState<"info" | "description">("info");
  const [textExpanded, setTextExpanded] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const discardModal = useRef<ModalClose | null>(null);
  const discardConfirmed = useRef(false);
  const title = useRef<HTMLInputElement>(null);
  const titlePosition = useRef(0);
  const editButton = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const dirty =
    editing &&
    (!editor.song ||
      JSON.stringify(draft) !== JSON.stringify(draftFor(editor)));
  const work = busy || picking || pickingCover || externalBusy;
  const blocking = work || textExpanded;
  const textValidation =
    draft.notes.length > songTextLimit || draft.lyrics.length > songTextLimit
      ? "Notes et Paroles : 50 000 caractères maximum par champ. Le texte reste dans le brouillon."
      : "";
  const callbacks = useRef({ onDirtyChange, onBusyChange });
  useLayoutEffect(() => {
    callbacks.current = { onDirtyChange, onBusyChange };
  });
  useLayoutEffect(() => {
    callbacks.current.onDirtyChange(dirty);
    return () => callbacks.current.onDirtyChange(false);
  }, [dirty]);
  useLayoutEffect(() => {
    callbacks.current.onBusyChange(blocking);
    return () => callbacks.current.onBusyChange(false);
  }, [blocking]);
  useTitleMarquee(title, !editing, titlePosition);
  useLayoutEffect(() => {
    if (!pickingCover && restoreCoverFocus.current) {
      restoreCoverFocus.current = false;
      coverButton.current?.focus({ preventScroll: true });
    }
  }, [pickingCover]);
  useEffect(() => {
    if (saved && !busy) editButton.current?.focus({ preventScroll: true });
  }, [saved, busy]);
  useLayoutEffect(() => {
    if (title.current) title.current.scrollLeft = titlePosition.current;
  }, [editing]);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [saved]);
  const [observedEditor, setObservedEditor] = useState(editor);
  if (observedEditor !== editor) {
    setObservedEditor(editor);
    if (!editing) setDraft(draftFor(editor));
  }
  function patch<T extends keyof Draft>(key: T, value: Draft[T]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setError("");
    setSaved(false);
  }
  function cancel() {
    setTagging(null);
    setCoverMenu(null);
    setDraft(draftFor(editor));
    setEditing(false);
    setError("");
    setConfirm(false);
    editButton.current?.focus({ preventScroll: true });
  }
  function requestClose(force = false) {
    if (blocking) return;
    if (!force && dirty) {
      setConfirm(true);
      return;
    }
    onClose();
  }
  useLayoutEffect(() => {
    navigationRef.current = requestClose;
    return () => {
      navigationRef.current = null;
    };
  });
  useEffect(() => {
    function escape(e: KeyboardEvent) {
      if (
        e.key === "Escape" &&
        !e.defaultPrevented &&
        shell.right &&
        !document.querySelector("dialog[open]")
      ) {
        e.preventDefault();
        requestClose();
      }
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  });
  async function pickFile() {
    if (work) return;
    setPicking(true);
    setError("");
    try {
      const { selection } = await api<{ selection: FileSelection | null }>(
        "/api/songs/pick-file",
        { method: "POST" },
      );
      if (selection) {
        patch("file", selection);
        setEditing(true);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPicking(false);
    }
  }
  async function save() {
    if (textValidation) return;
    if (work || !editing || !form.current?.reportValidity()) return;
    setBusy(true);
    setError("");
    const previous = editor.song;
    const payload: Record<string, unknown> = previous
      ? { expected_revision: previous.revision }
      : {};
    for (const key of [
      "title",
      "state",
      "favorite",
      "created_on",
      "released_on",
      "beat_id",
      "notes",
      "lyrics",
    ] as const) {
      const value = ["created_on", "released_on"].includes(key)
        ? draft[key] || null
        : draft[key];
      if (!previous || value !== previous[key]) payload[key] = value;
    }
    if (draft.file) payload.selection_id = draft.file.selection_id;
    if (draft.cover !== undefined) payload.cover = draft.cover;
    if (
      !previous ||
      JSON.stringify(draft.direct_tags) !==
        JSON.stringify(draftFor(editor).direct_tags)
    ) {
      payload.tag_ids = draft.direct_tags
        .filter((t) => t.id !== null)
        .map((t) => t.id);
      payload.new_tags = draft.direct_tags
        .filter((t) => t.id === null)
        .map((t) => t.label);
      payload.recreate_tags = payload.new_tags;
    }
    try {
      const result = await api<Song>(
        previous ? `/api/songs/${previous.id}` : "/api/songs",
        { method: previous ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      setEditing(false);
      setTagging(null);
      setCoverMenu(null);
      setSaved(true);
      onSaved(result, !!draft.file);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function pickCover() {
    if (work) return;
    restoreCoverFocus.current = true;
    setPickingCover(true);
    setError("");
    try {
      const { image } = await api<{
        image: { data: string; media_type: string } | null;
      }>("/api/songs/pick-cover", { method: "POST" });
      if (image) {
        setDraft((d) => ({
          ...d,
          cover: image.data,
          artwork_url: `data:${image.media_type};base64,${image.data}`,
        }));
        setEditing(true);
        setSaved(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPickingCover(false);
    }
  }
  const preview: Beat = songTrack({
    ...(editor.song || {
      id: "new",
      added_at: "",
      revision: 0,
      audio_url: "",
      file_available: false,
      tags: [],
      cover_source: "prod",
    }),
    ...draft,
    duration_seconds:
      draft.file?.duration_seconds || editor.song?.duration_seconds || 0,
    created_on: draft.created_on || null,
    released_on: draft.released_on || null,
  });
  return (
    <aside
      className={`detail-sidebar song-sidebar${shell.right ? " expanded" : ""}`}
      aria-label="Fiche du son"
    >
      <nav className="detail-rail" aria-label="Rubriques du son">
        <button
          className="icon-button pane-toggle"
          aria-label={shell.right ? "Replier la fiche" : "Ouvrir la fiche"}
          aria-expanded={shell.right}
          onClick={() => shell.setRight(!shell.right)}
        >
          <PaneIcon side="right" open={shell.right} />
        </button>
        <button
          className="icon-button"
          aria-label="Informations du son"
          aria-current={section === "info" ? "page" : undefined}
          onClick={() => {
            setSection("info");
            shell.setRight(true);
          }}
        >
          <Icon name="info" />
        </button>
        <button
          className="icon-button"
          aria-label="Description du son"
          title="Notes et paroles"
          aria-current={section === "description" ? "page" : undefined}
          onClick={() => {
            setSection("description");
            shell.setRight(true);
          }}
        >
          <Icon name="description" />
        </button>
      </nav>
      <section className="song-details" hidden={!shell.right}>
        <header className="detail-header">
          <strong>{editor.song ? "Fiche son" : "Nouveau son"}</strong>
          <button
            type="button"
            className="icon-button cancel-detail"
            style={{ visibility: editing ? "visible" : "hidden" }}
            disabled={work}
            aria-label="Annuler les modifications du son"
            onClick={() => (editor.song ? cancel() : requestClose())}
          >
            <Icon name="close" />
          </button>
          <button
            ref={editButton}
            className={`icon-button edit-save${editing ? " primary" : ""}`}
            type="button"
            aria-label={editing ? "Enregistrer le son" : "Modifier le son"}
            aria-busy={busy}
            data-editing={editing}
            disabled={work}
            onClick={() => {
              if (editing) void save();
              else {
                setEditing(true);
                setSaved(false);
                setError("");
              }
            }}
          >
            <Icon
              name={
                busy ? "refresh" : saved ? "check" : editing ? "save" : "edit"
              }
            />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Favori du son"
            aria-pressed={draft.favorite}
            disabled={work}
            onClick={() => {
              patch("favorite", !draft.favorite);
              setEditing(true);
            }}
          >
            <Icon name="heart" filled={draft.favorite} />
          </button>
        </header>
        <form
          ref={form}
          className={`song-detail-form${editing ? " editing" : ""}`}
          data-section={section}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h2 className="song-title-container">
            <input
              ref={title}
              className="song-detail-title"
              aria-label="Titre du son"
              value={draft.title}
              required
              maxLength={500}
              readOnly={!editing}
              disabled={work}
              onChange={(e) => patch("title", e.target.value)}
              onScroll={(e) => {
                titlePosition.current = e.currentTarget.scrollLeft;
              }}
            />
          </h2>
          <div className="song-info-fields" hidden={section !== "info"}>
            <div className="song-detail-cover">
              <button
                type="button"
                className="song-cover-play"
                aria-label={`${playing ? "Mettre en pause" : "Écouter"} le son ${editor.song?.title || draft.title}`}
                disabled={!editor.song?.file_available}
                onClick={() => editor.song && onPlay(editor.song)}
              >
                <Artwork beat={preview} />
                <span className={`cover-play${playing ? " is-playing" : ""}`}>
                  <Icon name={playing ? "pause" : "play"} filled />
                </span>
              </button>
              <button
                type="button"
                ref={coverButton}
                className="icon-button song-cover-change"
                aria-label="Changer la pochette du son"
                aria-haspopup="menu"
                aria-expanded={!!coverMenu}
                aria-busy={pickingCover}
                disabled={work}
                onClick={(e) =>
                  setCoverMenu(coverMenu ? null : e.currentTarget)
                }
              >
                <Icon name={pickingCover ? "refresh" : "image"} />
              </button>
              <span className="cover-duration">
                {duration(preview.duration_seconds)}
              </span>
            </div>
            <div className="song-detail-controls">
              <SongStateControl
                label="État du son dans la fiche"
                value={draft.state}
                disabled={!editing || work}
                onChange={(value) => patch("state", value)}
              />
              <button
                type="button"
                className="song-prod"
                aria-label={
                  editing
                    ? "Choisir ou retirer la prod associée"
                    : "Ouvrir la prod associée"
                }
                title={draft.beat_title || "Aucune prod associée"}
                disabled={work || (!editing && !draft.beat_id)}
                onClick={() =>
                  editing
                    ? setChoosingProd(true)
                    : draft.beat_id && onOpenBeat(draft.beat_id)
                }
              >
                Prod
                <Icon name="link" />
              </button>
            </div>
            <div className="song-detail-tags" aria-label="Tags du son">
              <div>
                <small>
                  <button
                    type="button"
                    className="song-inherited-link"
                    aria-label="Modifier les tags de la prod associée"
                    title="Les tags hérités se modifient dans la prod"
                    disabled={!draft.beat_id || work}
                    onClick={() => draft.beat_id && onOpenBeat(draft.beat_id)}
                  >
                    <Icon name="link" />
                    Liés à la prod
                  </button>
                </small>
                <div
                  className="song-tags-line"
                  tabIndex={0}
                  aria-label="Tags liés à la prod"
                >
                  {draft.inherited_tags.map((tag) => (
                    <span
                      className="song-tag inherited"
                      key={tag.id}
                      title={tag.label}
                    >
                      {tag.label}
                      {draft.direct_tags.some((t) => t.id === tag.id) && (
                        <span className="song-tag-origin">Prod + son</span>
                      )}
                    </span>
                  ))}
                  {!draft.inherited_tags.length && (
                    <span className="song-tags-empty">Aucun tag lié</span>
                  )}
                </div>
              </div>
              <div className="song-direct-tags">
                <small>Ajoutés au son</small>
                <div
                  className="song-tags-line"
                  tabIndex={0}
                  aria-label="Tags ajoutés au son"
                >
                  {draft.direct_tags
                    .filter(
                      (tag) =>
                        !draft.inherited_tags.some(
                          (t) => t.id === tag.id && tag.id !== null,
                        ),
                    )
                    .map((tag) => (
                      <span
                        className="song-tag"
                        key={tag.id ?? `new:${tag.label}`}
                        title={tag.label}
                      >
                        {tag.label}
                      </span>
                    ))}
                  {!draft.direct_tags.some(
                    (tag) => !draft.inherited_tags.some((t) => t.id === tag.id),
                  ) && <span className="song-tags-empty">Aucun autre tag</span>}
                </div>
                <button
                  type="button"
                  className="icon-button song-add-tag"
                  aria-label="Choisir les tags du son"
                  aria-expanded={!!tagging}
                  disabled={work}
                  onClick={(e) => {
                    setEditing(true);
                    setSaved(false);
                    setTagging(tagging ? null : e.currentTarget);
                  }}
                >
                  <Icon name="plus" />
                </button>
              </div>
            </div>
            <div className="song-dates">
              {(
                [
                  ["created_on", "Date de création"],
                  ["released_on", "Date de sortie"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <small>{label}</small>
                  <span className="song-date-field">
                    <span
                      aria-hidden="true"
                      style={{ visibility: editing ? "hidden" : "visible" }}
                    >
                      {dateLabel(draft[key])}
                    </span>
                    <input
                      aria-label={label}
                      type="date"
                      min="0001-01-01"
                      max="9999-12-31"
                      value={draft[key]}
                      readOnly={!editing}
                      disabled={work || !editing}
                      style={{ visibility: editing ? "visible" : "hidden" }}
                      onChange={(e) => patch(key, e.target.value)}
                    />
                  </span>
                </label>
              ))}
            </div>
            <div className="song-added">
              <span>Ajout à la bibliothèque</span>
              <span>
                {editor.song
                  ? dateLabel(editor.song.added_at)
                  : "À l’enregistrement"}
              </span>
            </div>
            <div className="song-file-actions">
              <div className="song-file-status" role="status">
                {draft.file
                  ? draft.file.name
                  : editor.song?.file_available
                    ? "MP3 lié"
                    : "Fichier indisponible · reconnecter le MP3"}
              </div>
              <button
                type="button"
                disabled={!editor.song?.file_available || work}
                onClick={() => {
                  setError("");
                  setBusy(true);
                  void api(`/api/songs/${editor.song!.id}/reveal`, {
                    method: "POST",
                  })
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                <Icon name="folder" />
                Afficher le fichier
              </button>
              <button
                type="button"
                disabled={work}
                onClick={() => void pickFile()}
                aria-busy={picking}
              >
                <Icon name="link" />
                Changer le fichier lié
              </button>
            </div>
          </div>
        </form>
        <SongDescription
          hidden={section !== "description"}
          title={draft.title}
          notes={draft.notes}
          lyrics={draft.lyrics}
          editing={editing}
          busy={work}
          onChange={(field, value) => patch(field, value)}
          onExpandedChange={setTextExpanded}
        />
        {(error || textValidation || playbackError) && (
          <div className="song-detail-feedback" role="alert">
            <span>{error || textValidation || playbackError}</span>
            {error && editor.song && (
              <button type="button" onClick={onReload} disabled={work}>
                Recharger la fiche
              </button>
            )}
            {(error || playbackError) && (
              <button
                className="icon-button"
                aria-label="Masquer l’erreur du son"
                onClick={() => {
                  setError("");
                  onDismissPlaybackError();
                }}
              >
                <Icon name="close" />
              </button>
            )}
          </div>
        )}
        <span className="sr-only" role="status">
          {saved ? "Son enregistré" : ""}
        </span>
      </section>
      {coverMenu && (
        <SongCoverMenu
          anchor={coverMenu}
          personal={
            draft.cover !== undefined
              ? draft.cover !== null
              : editor.song?.cover_source === "personal"
          }
          onClose={() => setCoverMenu(null)}
          onPick={() => void pickCover()}
          onInherit={() => {
            setDraft((d) => ({
              ...d,
              cover: null,
              artwork_url: d.beat_artwork_url,
            }));
            setEditing(true);
            setSaved(false);
            setError("");
          }}
        />
      )}
      {choosingProd && (
        <ProdPicker
          selected={draft.beat_id}
          onClose={() => setChoosingProd(false)}
          onSelect={(beat) => {
            const apply = (tags: CatalogTag[]) => {
              setDraft((d) => ({
                ...d,
                beat_id: beat?.id || null,
                beat_title: beat?.title || null,
                beat_artwork_url: beat?.artwork_url || null,
                artwork_url: (
                  d.cover !== undefined
                    ? d.cover !== null
                    : editor.song?.cover_source === "personal"
                )
                  ? d.artwork_url
                  : beat?.artwork_url || null,
                inherited_tags: tags,
              }));
              setError("");
            };
            if (!beat) {
              apply([]);
              return;
            }
            setBusy(true);
            void api<{ catalog_tags: CatalogTag[] }>(`/api/beats/${beat.id}`)
              .then((details) => apply(details.catalog_tags))
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        />
      )}
      {tagging && (
        <SongTagPicker
          anchor={tagging}
          selected={draft.direct_tags}
          onClose={() => setTagging(null)}
          onChange={(tags) => patch("direct_tags", tags)}
        />
      )}
      {confirm && (
        <Modal
          label="Modifications du son non enregistrées"
          title="Garder tes modifications ?"
          closeLabel="Continuer l’édition du son"
          closeRef={discardModal}
          onClose={() => {
            setConfirm(false);
            if (discardConfirmed.current) {
              discardConfirmed.current = false;
              requestClose(true);
            } else onCancelNavigation();
          }}
          className="discard-modal"
        >
          <p>Le brouillon de ce son n’est pas enregistré.</p>
          <div className="empty-actions">
            <button onClick={() => discardModal.current?.()}>
              Continuer l’édition
            </button>
            <button
              className="danger"
              onClick={() => {
                discardConfirmed.current = true;
                discardModal.current?.(true);
              }}
            >
              Abandonner et continuer
            </button>
          </div>
        </Modal>
      )}
    </aside>
  );
}
