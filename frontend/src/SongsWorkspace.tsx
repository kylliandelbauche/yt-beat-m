import { SongStateControl } from "./SongStateControl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "./api";
import { Artwork } from "./Artwork";
import { Icon } from "./Modal";
import { PaneIcon } from "./Shell";
import { ScrollingTitle } from "./ScrollingTitle";
import { SongDetails } from "./SongDetails";
import { SongTagPicker } from "./SongTagPicker";
import type { SongEditor } from "./SongDetails";
import { duration } from "./beat";
import type { ModalClose } from "./useModalLifecycle";
import type { Producer } from "./Beatmakers";
import { useShell } from "./shellContext";
import { songTrack, songStates } from "./song";
import type { FileSelection, Song, SongPage, TagChoice } from "./song";

export type SongsController = {
  open: (id: string) => void;
  guard: (action: () => void) => void;
  blocked: () => boolean;
};
export function SongsWorkspace({
  visible,
  detailActive,
  controllerRef,
  onActivate,
  onClosePane,
  onOpenBeat,
  onPlay,
  onChanged,
  playingId,
  playbackError,
  playbackErrorId,
  onDismissPlaybackError,
  onRetryPlayback,
  connected,
  layout,
  onLayout,
  revision,
  onQueue,
}: {
  visible: boolean;
  detailActive: boolean;
  controllerRef: { current: SongsController | null };
  onActivate: (action: () => void) => void;
  onClosePane: () => void;
  onOpenBeat: (id: string) => void;
  onPlay: (song: Song) => void;
  onChanged: (song: Song, fileChanged: boolean) => void;
  playingId: string | null;
  playbackError: string;
  playbackErrorId: string | null;
  onDismissPlaybackError: () => void;
  onRetryPlayback: () => void;
  connected: boolean;
  layout: "covers" | "horizontal";
  onLayout: (layout: "covers" | "horizontal") => void;
  revision: number;
  onQueue: (songs: Song[]) => void;
}) {
  const shell = useShell();
  const [page, setPage] = useState<SongPage | null>(null);
  const [query, setQuery] = useState("");
  const [state, setState] = useState("");
  const [linked, setLinked] = useState("");
  const [available, setAvailable] = useState("");
  const [profile, setProfile] = useState("");
  const [tagFilters, setTagFilters] = useState<TagChoice[]>([]);
  const [tagMissing, setTagMissing] = useState(false);
  const [tagFilterAnchor, setTagFilterAnchor] = useState<HTMLElement | null>(
    null,
  );
  const [editorDirty, setEditorDirty] = useState(false);
  const [profiles, setProfiles] = useState<Producer[]>([]);
  const [sort, setSort] = useState("added_desc");
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(new Set<string>());
  const [picking, setPicking] = useState(false);
  const [editor, setEditor] = useState<SongEditor | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [opening, setOpening] = useState(false);
  const navigation = useRef<ModalClose | null>(null);
  const dirty = useRef(false);
  const busyEditor = useRef(false);
  const pending = useRef<(() => void) | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const request = useRef(0);
  const mutation = useRef(new Set<string>());
  const retryAction = useRef<(() => void) | null>(null);
  const params = new URLSearchParams({
    q: query,
    sort,
    favorites: String(shell.favorites),
  });
  if (state) params.set("state", state);
  if (linked) params.set("linked", linked);
  if (available) params.set("available", available);
  if (profile) params.set("profile_id", profile);
  tagFilters.forEach((tag) => {
    if (tag.id !== null) params.append("tag_ids", String(tag.id));
  });
  if (tagMissing) params.set("tag_missing", "true");
  const key = params.toString();
  const latest = useRef(key);
  useLayoutEffect(() => {
    latest.current = key;
  }, [key]);
  const queueCallback = useRef(onQueue);
  useLayoutEffect(() => {
    queueCallback.current = onQueue;
  });
  useEffect(() => {
    queueCallback.current(page?.songs || []);
  }, [page]);
  const [observedTagChange, setObservedTagChange] = useState(shell.tagChange);
  if (shell.tagChange !== observedTagChange && shell.tagChange) {
    const change = shell.tagChange;
    setObservedTagChange(change);
    setTagFilters((tags) =>
      tags.flatMap((t) =>
        t.label === change.old_label
          ? change.label
            ? [{ ...t, label: change.label }]
            : []
          : [t],
      ),
    );
  }
  const editorId = editor?.song?.id;
  useEffect(() => {
    if (!connected || !editorId || editorDirty || busyEditor.current) return;
    const c = new AbortController();
    void api<Song>(`/api/songs/${editorId}`, { signal: c.signal })
      .then((song) => {
        if (!c.signal.aborted && !dirty.current && !busyEditor.current)
          setEditor((current) =>
            current?.song?.id === editorId ? { song, file: null } : current,
          );
      })
      .catch(() => {
        /* Keep the existing fiche; explicit reload remains available. */
      });
    return () => c.abort();
  }, [connected, revision, editorId, editorDirty]);
  useEffect(() => {
    if (!connected) return;
    const c = new AbortController();
    async function loadProfiles() {
      const values: Producer[] = [];
      let total = 1;
      while (values.length < total && !c.signal.aborted) {
        const next = await api<{ profiles: Producer[]; total: number }>(
          `/api/beatmakers?limit=100&offset=${values.length}`,
          { signal: c.signal },
        );
        values.push(...next.profiles);
        total = next.total;
        if (!next.profiles.length) break;
      }
      if (!c.signal.aborted) setProfiles(values);
    }
    void loadProfiles().catch(() => {
      /* The song list remains usable if this optional filter fails. */
    });
    return () => c.abort();
  }, [connected, revision]);
  useEffect(() => {
    if (!connected || !visible) return;
    const c = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      api<SongPage>(`/api/songs?${key}`, { signal: c.signal })
        .then((p) => {
          if (!c.signal.aborted) {
            setPage(p);
            setError("");
          }
        })
        .catch((e) => {
          if (!c.signal.aborted) {
            retryAction.current = null;
            setError(e.message);
          }
        })
        .finally(() => {
          if (!c.signal.aborted) setLoading(false);
        });
    }, 150);
    return () => {
      c.abort();
      clearTimeout(timer);
    };
  }, [key, reload, connected, revision, visible]);
  function guard(action: () => void) {
    if (busyEditor.current || picking || opening) return;
    if (dirty.current && detailActive) {
      pending.current = action;
      navigation.current?.();
    } else action();
  }
  function closeEditor() {
    setEditor(null);
    dirty.current = false;
    const action = pending.current;
    pending.current = null;
    if (action) {
      onClosePane();
      action();
    } else {
      onClosePane();
      if (trigger.current?.isConnected)
        trigger.current.focus({ preventScroll: true });
    }
  }
  function open(id: string, force = false) {
    if (!force && editor?.song?.id === id && detailActive) {
      shell.setRight(true);
      return;
    }
    const focus = document.activeElement as HTMLElement;
    guard(() =>
      onActivate(() => {
        trigger.current = focus;
        const sequence = ++request.current;
        setOpening(true);
        setError("");
        api<Song>(`/api/songs/${id}`)
          .then((song) => {
            if (sequence === request.current) {
              setEditor({ song, file: null });
              setEditorKey((n) => n + 1);
              shell.setRight(true);
            }
          })
          .catch((e) => setError(e.message))
          .finally(() => {
            if (sequence === request.current) setOpening(false);
          });
      }),
    );
  }
  useLayoutEffect(() => {
    controllerRef.current = {
      open,
      guard,
      blocked: () => dirty.current || busyEditor.current || picking || opening,
    };
    return () => {
      controllerRef.current = null;
    };
  });
  async function chooseNewFile() {
    setPicking(true);
    setError("");
    try {
      const { selection } = await api<{ selection: FileSelection | null }>(
        "/api/songs/pick-file",
        { method: "POST" },
      );
      if (selection) {
        setEditor({ song: null, file: selection });
        setEditorKey((n) => n + 1);
        shell.setRight(true);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPicking(false);
    }
  }
  function add() {
    const focus = document.activeElement as HTMLElement;
    guard(() =>
      onActivate(() => {
        trigger.current = focus;
        void chooseNewFile();
      }),
    );
  }
  function updated(song: Song, fileChanged = false) {
    setEditor((current) =>
      current && (current.song?.id === song.id || !current.song)
        ? { song, file: null }
        : current,
    );
    setPage(
      (p) =>
        p && { ...p, songs: p.songs.map((s) => (s.id === song.id ? song : s)) },
    );
    onChanged(song, fileChanged);
    setReload((n) => n + 1);
  }
  async function immediate(
    song: Song,
    changes: { state?: Song["state"]; favorite?: boolean },
  ) {
    if (mutation.current.has(song.id)) return;
    mutation.current.add(song.id);
    setWorking(new Set(mutation.current));
    setError("");
    retryAction.current = null;
    try {
      const current = await api<Song>(`/api/songs/${song.id}`);
      const result = await api<Song>(`/api/songs/${song.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...changes,
          expected_revision: current.revision,
        }),
      });
      setPage(
        (p) =>
          p && {
            ...p,
            songs: p.songs.map((s) => (s.id === result.id ? result : s)),
          },
      );
      setEditor((current) =>
        current?.song?.id === song.id ? { song: result, file: null } : current,
      );
      onChanged(result, false);
      setReload((n) => n + 1);
    } catch (e) {
      retryAction.current = () => void immediate(song, changes);
      setError((e as Error).message);
    } finally {
      mutation.current.delete(song.id);
      setWorking(new Set(mutation.current));
    }
  }
  function cardChange(
    song: Song,
    changes: { state?: Song["state"]; favorite?: boolean },
  ) {
    const action = () => void immediate(song, changes);
    if (editor?.song?.id === song.id) guard(action);
    else action();
  }
  async function more() {
    if (!page || loading) return;
    const queryKey = key;
    setLoading(true);
    try {
      const next = await api<SongPage>(
        `/api/songs?${key}&offset=${page.songs.length}`,
      );
      if (latest.current === queryKey)
        setPage(
          (p) => p && { songs: [...p.songs, ...next.songs], total: next.total },
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (latest.current === queryKey) setLoading(false);
    }
  }
  return (
    <>
      <section
        className="library-center songs-center"
        hidden={!visible}
        aria-labelledby="songs-heading"
      >
        <div className="catalog-heading song-heading">
          <h2 id="songs-heading">Mes sons</h2>
          <label className="catalog-search">
            <Icon name="search" />
            <input
              aria-label="Rechercher un son"
              placeholder="Rechercher un son…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button
            className="primary song-add"
            onClick={add}
            disabled={!connected || picking || opening}
            aria-busy={picking}
          >
            <Icon name="plus" />
            Ajouter un son
          </button>
        </div>
        <div className="song-filters">
          <div className="song-filter-fields">
            <label className="song-filter">
              <select
                aria-label="Filtrer les sons par état"
                value={state}
                onChange={(e) => setState(e.target.value)}
              >
                <option value="">État</option>
                {songStates.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <Icon name="chevron" />
            </label>
            <button
              className="song-filter song-tag-filter"
              aria-label="Filtrer les sons par tags"
              aria-expanded={!!tagFilterAnchor}
              aria-pressed={!!tagFilters.length || tagMissing}
              onClick={(e) =>
                setTagFilterAnchor(tagFilterAnchor ? null : e.currentTarget)
              }
            >
              Tags <span>{tagFilters.length + Number(tagMissing) || ""}</span>
              <Icon name="chevron" />
            </button>
            <label className="song-filter">
              <select
                aria-label="Prod associée"
                value={linked}
                onChange={(e) => setLinked(e.target.value)}
              >
                <option value="">Prod associée</option>
                <option value="true">Avec une prod</option>
                <option value="false">Sans prod</option>
              </select>
              <Icon name="chevron" />
            </label>
            <label className="song-filter">
              <select
                aria-label="Beatmaker de la prod associée"
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
              >
                <option value="">Beatmaker</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Icon name="chevron" />
            </label>
            <label className="song-filter">
              <select
                aria-label="Fichier du son"
                value={available}
                onChange={(e) => setAvailable(e.target.value)}
              >
                <option value="">Fichier</option>
                <option value="true">Disponible</option>
                <option value="false">Indisponible</option>
              </select>
              <Icon name="chevron" />
            </label>
          </div>
          <label className="song-filter song-sort">
            <select
              aria-label="Trier les sons"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="added_desc">Ajout · récents</option>
              <option value="added_asc">Ajout · anciens</option>
            </select>
            <Icon name="chevron" />
          </label>
          <div className="layout-switch" aria-label="Disposition des sons">
            <button
              className="icon-button"
              aria-label="Sons en grandes pochettes"
              aria-pressed={layout === "covers"}
              onClick={() => onLayout("covers")}
            >
              <Icon name="grid" />
            </button>
            <button
              className="icon-button"
              aria-label="Sons en cartes horizontales"
              aria-pressed={layout === "horizontal"}
              onClick={() => onLayout("horizontal")}
            >
              <Icon name="rows" />
            </button>
          </div>
        </div>
        <div
          className="song-feedback"
          role={error || playbackError ? "alert" : "status"}
        >
          {!connected ? (
            "Moteur déconnecté. Relance-le pour accéder à tes sons."
          ) : error || playbackError ? (
            <>
              <span>{error || playbackError}</span>
              <button
                onClick={() => {
                  if (!error && playbackError) {
                    onRetryPlayback();
                  } else if (retryAction.current) {
                    const action = retryAction.current;
                    retryAction.current = null;
                    guard(action);
                  } else {
                    setError("");
                    setReload((n) => n + 1);
                  }
                }}
              >
                Réessayer
              </button>
              <button
                aria-label="Masquer le message des sons"
                onClick={() => {
                  setError("");
                  onDismissPlaybackError();
                }}
              >
                <Icon name="close" />
              </button>
            </>
          ) : loading || opening ? (
            "Chargement…"
          ) : (
            ""
          )}
        </div>
        <div className={`song-grid ${layout}`} aria-busy={loading}>
          {page?.songs.map((song) => (
            <article
              key={song.id}
              className={`song-card${editor?.song?.id === song.id && detailActive ? " selected" : ""}${playingId === `song:${song.id}` ? " is-playing" : ""}`}
            >
              <button
                className="song-favorite"
                aria-label={`${song.favorite ? "Retirer des favoris le son" : "Ajouter aux favoris le son"} ${song.title}`}
                aria-pressed={song.favorite}
                disabled={working.has(song.id)}
                onClick={() => cardChange(song, { favorite: !song.favorite })}
              >
                <Icon name="heart" filled={song.favorite} />
              </button>
              <button
                className="song-card-cover"
                aria-label={`${playingId === `song:${song.id}` ? "Mettre en pause" : "Écouter"} le son ${song.title}`}
                disabled={!song.file_available}
                onClick={() => onPlay(song)}
              >
                <Artwork beat={songTrack(song)} />
                <span
                  className={`cover-play${playingId === `song:${song.id}` ? " is-playing" : ""}`}
                >
                  <Icon
                    name={playingId === `song:${song.id}` ? "pause" : "play"}
                    filled
                  />
                </span>
                <span className="cover-duration">
                  {song.file_available
                    ? duration(song.duration_seconds)
                    : "Fichier absent"}
                </span>
              </button>
              <button
                className="song-card-title"
                aria-label={`Détails du son ${song.title}`}
                onClick={() => open(song.id)}
              >
                <ScrollingTitle
                  title={song.title}
                  className="song-title-text"
                />
              </button>
              <div className="song-card-controls">
                <SongStateControl
                  label={`État du son ${song.title}`}
                  value={song.state}
                  disabled={working.has(song.id)}
                  onChange={(value) => cardChange(song, { state: value })}
                />
                <button
                  className="song-prod"
                  title={song.beat_title || "Aucune prod associée"}
                  aria-label={`Prod associée au son ${song.title}`}
                  disabled={!song.beat_id}
                  onClick={() => song.beat_id && onOpenBeat(song.beat_id)}
                >
                  <Icon name="link" />
                </button>
              </div>
              <button
                className="song-card-tags"
                aria-label={`Informations du son ${song.title}`}
                onClick={() => open(song.id)}
              >
                {(song.tags || []).map((tag) => (
                  <span
                    className={`song-tag${tag.inherited ? " inherited" : ""}`}
                    key={tag.id}
                    title={`${tag.label} · ${tag.direct && tag.inherited ? "Prod + son" : tag.inherited ? "Lié à la prod" : "Ajouté au son"}`}
                  >
                    {tag.label}
                  </span>
                ))}
                {!song.tags?.length && <span>Aucun tag</span>}
              </button>
            </article>
          ))}
        </div>
        {!loading && page?.total === 0 && (
          <div className="empty-state">
            <Icon name="music" />
            <h3>
              {query ||
              state ||
              linked ||
              available ||
              profile ||
              tagFilters.length ||
              tagMissing ||
              shell.favorites
                ? "Aucun son ne correspond"
                : "Ton premier son t’attend"}
            </h3>
            <p>Lie un MP3 existant, puis sa prod si tu le souhaites.</p>
            <button
              className="primary"
              disabled={!connected || picking}
              onClick={add}
            >
              Ajouter un son
            </button>
          </div>
        )}
        {page && page.songs.length < page.total && (
          <button disabled={loading} onClick={() => void more()}>
            Afficher plus de sons
          </button>
        )}
      </section>
      {detailActive && !editor && (
        <aside
          className={`detail-sidebar${shell.right ? " expanded" : ""}`}
          aria-label="Volet des sons"
        >
          <nav className="detail-rail">
            <button
              className="icon-button pane-toggle"
              aria-label={shell.right ? "Replier la fiche" : "Ouvrir la fiche"}
              onClick={() => shell.setRight(!shell.right)}
            >
              <PaneIcon side="right" open={shell.right} />
            </button>
          </nav>
          {shell.right && (
            <div className="no-selection" role="status">
              {opening ? "Chargement du son…" : "Aucun son sélectionné"}
            </div>
          )}
        </aside>
      )}
      {detailActive && editor && (
        <SongDetails
          key={editorKey}
          editor={editor}
          externalBusy={!!editor.song && working.has(editor.song.id)}
          onReload={() => editor.song && open(editor.song.id, true)}
          navigationRef={navigation}
          onDirtyChange={(value) => {
            dirty.current = value;
            setEditorDirty(value);
          }}
          onBusyChange={(value) => {
            busyEditor.current = value;
          }}
          onCancelNavigation={() => {
            pending.current = null;
          }}
          onClose={closeEditor}
          onSaved={updated}
          onOpenBeat={onOpenBeat}
          onPlay={onPlay}
          playing={!!editor.song && playingId === `song:${editor.song.id}`}
          playbackError={
            editor.song && playbackErrorId === `song:${editor.song.id}`
              ? playbackError
              : ""
          }
          onDismissPlaybackError={onDismissPlaybackError}
        />
      )}
      {tagFilterAnchor && visible && (
        <SongTagPicker
          anchor={tagFilterAnchor}
          selected={tagFilters}
          filter
          missing={tagMissing}
          onMissing={setTagMissing}
          onChange={setTagFilters}
          onClose={() => setTagFilterAnchor(null)}
        />
      )}
    </>
  );
}
