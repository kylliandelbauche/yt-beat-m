import { useShell } from "./shellContext";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "./api";
import { PaneIcon } from "./Shell";
import { Player } from "./Player";
import { ImportPanel } from "./ImportPanel";
import { BeatDetailsPanel } from "./BeatDetailsPanel";
import { ScrollingTitle } from "./ScrollingTitle";
import { duration, makerLabel } from "./beat";
import { Artwork } from "./Artwork";
import { Icon } from "./Modal";
import type { Beat } from "./beat";
import { BeatmakersPage, ProducerProfile, Avatar } from "./Beatmakers";
import type { Producer } from "./Beatmakers";
import type { ModalClose } from "./useModalLifecycle";
import { ActiveFilters, CatalogFilters } from "./CatalogFilters";
import { emptyFilters, emptyOptions, filterQuery } from "./filterState";
import type { Filters, FilterOptions } from "./filterState";
type BeatPage = { beats: Beat[]; total: number };
type Selection = { beat: Beat; play: boolean };
type Scan = {
  added: number;
  skipped: number;
  errors: { name: string; message: string }[];
  library: { beat_count: number };
};
const unavailableAudio =
  "Fichier audio indisponible ou illisible. Vérifie le disque.";

export function BeatGallery({
  view,
  onView,
  onIndexed,
  heading,
  libraryName,
  connected,
  onRetry,
  onDiagnostic,
  onLibrary,
}: {
  view: "prods" | "beatmakers";
  onView: (view: "prods" | "beatmakers") => void;
  onIndexed: (count: number) => void;
  heading: (count?: number) => ReactNode;
  tools: ReactNode;
  libraryName: string;
  connected: boolean;
  onRetry: () => void;
  onDiagnostic: () => void;
  onLibrary: () => void;
}) {
  const shell = useShell();
  const setRight = shell.setRight;
  const dirtyDetails = useRef(false);
  const pendingAction = useRef<(() => void) | null>(null);
  const lastTrigger = useRef<HTMLElement | null>(null);
  function openDetails(id: string) {
    const trigger = document.activeElement as HTMLElement;
    const action = () => {
      lastTrigger.current = trigger;
      detailsRef.current = id;
      setDetails(id);
      shell.setRight(true);
    };
    if (dirtyDetails.current && detailsRef.current !== id) {
      pendingAction.current = action;
      detailNavigation.current?.();
    } else action();
  }
  const [producer, setProducer] = useState<string | null>(null);
  const producerRef = useRef<string | null>(null);
  function openProducer(id: string) {
    producerRef.current = id;
    setProducer(id);
  }
  function closeProducer() {
    producerRef.current = null;
    setProducer(null);
    if (!detailsRef.current) closeDetails();
  }
  const [producerRevision, setProducerRevision] = useState(0);
  const [profileFilter, setProfileFilter] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [unassigned, setUnassigned] = useState(false);
  const [layout, setLayout] = useState<"covers" | "horizontal">(() => {
    try {
      return localStorage.getItem("beat-m-layout") === "covers"
        ? "covers"
        : "horizontal";
    } catch {
      return "covers";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("beat-m-layout", layout);
    } catch {
      /* The layout remains usable when storage is unavailable. */
    }
  }, [layout]);
  const [page, setPage] = useState<BeatPage | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState("");
  const [playbackError, setPlaybackError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const favoritesOnly = shell.favorites,
    setFavoritesOnly = shell.setFavorites;
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [options, setOptions] = useState<FilterOptions>(emptyOptions);
  const [sort, setSort] = useState("added_desc");
  const [details, setDetails] = useState<string | null>(null);
  const detailNavigation = useRef<ModalClose | null>(null);
  const detailsRef = useRef<string | null>(null);
  useEffect(() => {
    detailsRef.current = details;
  }, [details]);
  const pendingDetails = useRef<{ identity: string; onShown: () => void }[]>(
    [],
  );
  const showImported = useCallback(
    (identity: string, onShown: () => void) => {
      if (producerRef.current || dirtyDetails.current) {
        const queued = pendingDetails.current.find(
          (item) => item.identity === identity,
        );
        if (queued) {
          const previous = queued.onShown;
          queued.onShown = () => {
            previous();
            onShown();
          };
        } else pendingDetails.current.push({ identity, onShown });
      } else {
        detailsRef.current = identity;
        setDetails(identity);
        setRight(true);
        onShown();
      }
    },
    [setRight],
  );
  function closeDetails() {
    if (pendingAction.current) {
      const action = pendingAction.current;
      pendingAction.current = null;
      action();
      return;
    }
    const next = pendingDetails.current.shift();
    if (next) {
      detailsRef.current = next.identity;
      setDetails(next.identity);
      shell.setRight(true);
      next.onShown();
    } else {
      shell.setRight(false);
      if (lastTrigger.current?.isConnected)
        lastTrigger.current.focus({ preventScroll: true });
    }
  }
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [favoriteBusy, setFavoriteBusy] = useState(new Set<string>());
  const audio = useRef<HTMLAudioElement>(null);
  const audioPreferences = useRef(
    (() => {
      try {
        const p = JSON.parse(localStorage.getItem("beat-m-audio") || "null");
        if (p && Number.isFinite(p.volume) && p.volume >= 0 && p.volume <= 1)
          return { volume: Number(p.volume), muted: !!p.muted };
      } catch {
        /* Optional preference. */
      }
      return { volume: 1, muted: false };
    })(),
  );
  const [playingId, setPlayingId] = useState<string | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const stageContent = useRef<HTMLDivElement>(null);
  const [stageHeight, setStageHeight] = useState(144);
  const recoveryFocus = useRef(false);
  useEffect(() => {
    if (connected && recoveryFocus.current) {
      recoveryFocus.current = false;
      if (document.activeElement === document.body)
        document
          .querySelector<HTMLInputElement>(".catalog-search input")
          ?.focus({ preventScroll: true });
    }
  }, [connected]);
  useEffect(() => {
    const content = stageContent.current;
    if (!content) return;
    let shape = "";
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height > 0) {
        const next = `${entry.contentRect.width}/${content.querySelector(".beat-grid")?.className}`;
        const changed = next !== shape;
        shape = next;
        setStageHeight((height) =>
          changed
            ? entry.contentRect.height
            : Math.max(height, entry.contentRect.height),
        );
      }
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);
  const params = filterQuery(filters);
  if (profileFilter) params.set("profile_ids", profileFilter.id);
  if (unassigned) params.set("unassigned_profiles", "true");
  params.set("q", query);
  params.set("favorites", String(favoritesOnly));
  params.set("sort", sort);
  const catalogQuery = params.toString();
  const activeQuery = useRef(catalogQuery);
  useEffect(() => {
    activeQuery.current = catalogQuery;
  }, [catalogQuery]);
  const hasFilters = Boolean(
    query ||
      favoritesOnly ||
      profileFilter ||
      unassigned ||
      filterQuery(filters).size,
  );
  const refreshImported = useCallback(async () => {
    setReload((value) => value + 1);
    const status = await api<{ library: { beat_count: number } | null }>(
      "/api/library",
    );
    if (status.library) onIndexed(status.library.beat_count);
  }, [onIndexed]);

  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    void api<FilterOptions>("/api/catalog/filters", {
      signal: controller.signal,
    })
      .then(setOptions)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Filtres indisponibles.",
          );
      });
    return () => controller.abort();
  }, [reload, connected]);

  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api<BeatPage>(`/api/beats?${catalogQuery}`, {
        signal: controller.signal,
      })
        .then((result) => {
          if (controller.signal.aborted) return;
          setPage(result);
          setError("");
          setSelection(
            (current) =>
              current ||
              (result.beats[0] ? { beat: result.beats[0], play: false } : null),
          );
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted)
            setError(
              cause instanceof Error
                ? cause.message
                : "Catalogue indisponible.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [catalogQuery, reload, connected]);

  useEffect(() => {
    const player = audio.current;
    if (!player) return;
    const preference = { ...audioPreferences.current };
    player.volume = preference.volume;
    player.muted = preference.muted;
    if (selection?.play) startPlayback(player, selection.beat.id);
  }, [selection]);

  function startPlayback(player: HTMLAudioElement, identity: string) {
    void player.play().catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (audio.current === player) {
        setPlayingId(null);
        setPlaybackError({
          id: identity,
          message: player.error
            ? unavailableAudio
            : "La lecture n’a pas pu démarrer. Utilise le bouton du lecteur.",
        });
      }
    });
  }

  function togglePlayback(beat: Beat) {
    setError("");
    setPlaybackError(null);
    const player = audio.current;
    if (selection?.beat.id === beat.id && player) {
      if (!player.paused && !player.ended) player.pause();
      else {
        if (player.error) player.load();
        else if (player.ended) player.currentTime = 0;
        startPlayback(player, beat.id);
      }
    } else {
      setPlayingId(null);
      setSelection({ beat, play: true });
    }
  }

  async function scan() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<
        Scan & {
          beatmakers: { updated: number; preserved: number };
          musical_keys?: { updated: number };
        }
      >("/api/library/refresh", { method: "POST" });
      await refreshImported();
      setNotice(
        `${result.added} ajouté(s) · ${result.skipped} déjà présent(s) · ${result.beatmakers.updated} beatmaker(s) actualisé(s) · ${result.beatmakers.preserved} correction(s) conservée(s) · ${result.musical_keys?.updated ?? 0} tonalité(s) complétée(s).${result.errors.length ? ` ${result.errors.length} fichier(s) illisible(s) : ${result.errors.map((item) => item.name).join(", ")}.` : ""}`,
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Indexage impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function more() {
    if (!page) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<BeatPage>(
        `/api/beats?${catalogQuery}&offset=${page.beats.length}`,
      );
      setPage((current) =>
        current === page && activeQuery.current === catalogQuery
          ? { beats: [...page.beats, ...next.beats], total: next.total }
          : current,
      );
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Chargement impossible.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavorite(beat: Beat) {
    setFavoriteBusy((current) => new Set(current).add(beat.id));
    try {
      const result = await api<{ favorite: boolean }>(
        `/api/beats/${beat.id}/favorite`,
        { method: "PATCH", body: JSON.stringify({ favorite: !beat.favorite }) },
      );
      setPage((current) =>
        current
          ? {
              beats:
                favoritesOnly && !result.favorite
                  ? current.beats.filter((item) => item.id !== beat.id)
                  : current.beats.map((item) =>
                      item.id === beat.id
                        ? { ...item, favorite: result.favorite }
                        : item,
                    ),
              total:
                current.total -
                (favoritesOnly &&
                !result.favorite &&
                current.beats.some((item) => item.id === beat.id)
                  ? 1
                  : 0),
            }
          : current,
      );
      return result.favorite;
    } finally {
      setFavoriteBusy((current) => {
        const next = new Set(current);
        next.delete(beat.id);
        return next;
      });
    }
  }

  const activeBeat =
    page?.beats.find((beat) => beat.id === selection?.beat.id) ||
    selection?.beat;

  function filtersChanged() {
    setStageHeight(
      Math.max(144, stage.current?.getBoundingClientRect().height || 144),
    );
    setLoading(true);
    setError("");
  }
  function focusSearch() {
    document
      .querySelector<HTMLInputElement>(".catalog-search input")
      ?.focus({ preventScroll: true });
  }
  function resetFilters() {
    filtersChanged();
    setFavoritesOnly(false);
    setFilters(emptyFilters);
    setProfileFilter(null);
    setUnassigned(false);
    focusSearch();
  }

  return (
    <div className="beat-collection">
      <section className="library-center" hidden={view !== "prods"}>
        <div className="catalog-heading">
          {heading(page?.total)}
          <label className="catalog-search">
            <span className="sr-only">Rechercher une prod</span>
            <Icon name="search" />
            <input
              type="search"
              value={query}
              placeholder="Rechercher une prod…"
              disabled={!connected}
              onChange={(e) => {
                filtersChanged();
                setQuery(e.target.value);
              }}
            />
          </label>
        </div>
        <div
          className="catalog-filters"
          inert={!connected}
          aria-disabled={!connected}
        >
          <div className="filters-scroll">
            <CatalogFilters
              value={filters}
              options={options}
              onChange={(next) => {
                filtersChanged();
                setFilters(next);
              }}
            />
            <button
              className="catalog-favorites"
              aria-pressed={favoritesOnly}
              onClick={() => {
                filtersChanged();
                setFavoritesOnly(!favoritesOnly);
              }}
              aria-label="Favoris uniquement"
            >
              <Icon name="heart" filled={favoritesOnly} />
              Favoris
            </button>
          </div>
          <div className="catalog-order">
            <label className="catalog-sort">
              <span className="sr-only">Trier les prods</span>
              <select
                value={sort}
                onChange={(e) => {
                  filtersChanged();
                  setSort(e.target.value);
                }}
              >
                <option value="added_desc">Ajout · récentes</option>
                <option value="added_asc">Ajout · anciennes</option>
                <option value="published_desc">Publication · récentes</option>
                <option value="published_asc">Publication · anciennes</option>
              </select>
            </label>
            <div
              className="layout-selector"
              role="group"
              aria-label="Disposition de la bibliothèque"
            >
              <button
                className="icon-button"
                aria-label="Grandes pochettes"
                aria-pressed={layout === "covers"}
                onClick={() => setLayout("covers")}
              >
                <Icon name="grid" />
              </button>
              <button
                className="icon-button"
                aria-label="Cartes horizontales"
                aria-pressed={layout === "horizontal"}
                onClick={() => setLayout("horizontal")}
              >
                <Icon name="rows" />
              </button>
            </div>
          </div>
        </div>
        <div className="catalog-feedback">
          <span className="catalog-status" role="status">
            {connected && loading ? "Recherche…" : ""}
          </span>
          {sort.startsWith("published") && (
            <span className="sr-only" role="status">
              Tri par publication · publications inconnues à la fin
            </span>
          )}
          <div className="catalog-filter-actions" inert={!connected}>
            {profileFilter && (
              <button
                className="text-filter-chip"
                onClick={() => {
                  setProfileFilter(null);
                  filtersChanged();
                }}
              >
                Profil : {profileFilter.name} ×
              </button>
            )}
            {unassigned && (
              <button
                className="text-filter-chip"
                onClick={() => {
                  setUnassigned(false);
                  filtersChanged();
                }}
              >
                Sans profil ×
              </button>
            )}
            <ActiveFilters
              filters={filters}
              onChange={(next) => {
                filtersChanged();
                setFilters(next);
                focusSearch();
              }}
            />
            {query && (
              <button
                className="text-filter-chip"
                onClick={() => {
                  filtersChanged();
                  setQuery("");
                  focusSearch();
                }}
              >
                Recherche : {query} ×
              </button>
            )}
            {hasFilters && (
              <button
                onClick={() => {
                  resetFilters();
                  setQuery("");
                }}
              >
                Effacer les filtres
              </button>
            )}
          </div>
          {connected && (error || playbackError || notice) && (
            <div
              className="catalog-operation-feedback"
              role={error || playbackError ? "alert" : "status"}
            >
              {error || playbackError?.message || notice}
              {error && !page && (
                <button
                  onClick={() => {
                    setError("");
                    setLoading(true);
                    setReload((n) => n + 1);
                  }}
                >
                  Réessayer
                </button>
              )}
              <button
                aria-label="Masquer le message"
                onClick={() => {
                  setError("");
                  setPlaybackError(null);
                  setNotice("");
                }}
              >
                ×
              </button>
            </div>
          )}
        </div>
        <div
          className="catalog-stage"
          ref={stage}
          style={{ minHeight: stageHeight }}
        >
          {!connected && (
            <div
              onFocusCapture={() => {
                recoveryFocus.current = true;
              }}
              onBlurCapture={(event) => {
                if (
                  event.relatedTarget &&
                  !event.currentTarget.contains(event.relatedTarget)
                )
                  recoveryFocus.current = false;
              }}
            >
              <EngineOffline retry={onRetry} diagnostic={onDiagnostic} />
            </div>
          )}
          <div ref={stageContent} hidden={!connected}>
            {loading && !page && (
              <div
                className="loading-grid"
                role="status"
                aria-label="Chargement des prods"
              >
                <span />
                <span />
                <span />
              </div>
            )}

            {!loading && page?.total === 0 && (
              <div className="empty-state">
                <span className="empty-mark" aria-hidden="true">
                  <Icon name={hasFilters ? "search" : "folder"} />
                </span>
                <h3>
                  {hasFilters
                    ? "Aucune prod ne correspond"
                    : "Ta première prod t’attend"}
                </h3>
                <p>
                  {hasFilters
                    ? "Essaie un autre titre ou retire un filtre."
                    : "Ajoute un lien YouTube depuis la navigation."}
                </p>
                <div className="empty-actions">
                  {hasFilters ? (
                    <>
                      <button
                        disabled={!query}
                        onClick={() => {
                          filtersChanged();
                          setQuery("");
                          focusSearch();
                        }}
                      >
                        Effacer la recherche
                      </button>
                      <button
                        disabled={!favoritesOnly && !filterQuery(filters).size}
                        onClick={resetFilters}
                      >
                        Réinitialiser les filtres
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="primary"
                        onClick={() =>
                          document
                            .getElementById("youtube-url")
                            ?.focus({ preventScroll: true })
                        }
                      >
                        Importer une prod
                      </button>
                      <button onClick={onLibrary}>
                        Ouvrir une bibliothèque
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
            {page && (
              <div
                aria-busy={loading}
                className={`beat-grid ${layout === "horizontal" ? "horizontal-grid" : "covers-grid"}`}
              >
                {page?.beats.map((beat) => (
                  <article
                    className={`beat-card${details === beat.id ? " selected" : ""}${playingId === beat.id ? " is-playing" : ""}`}
                    key={beat.id}
                  >
                    <button
                      className="beat-favorite"
                      disabled={favoriteBusy.has(beat.id)}
                      aria-pressed={beat.favorite}
                      aria-label={`${beat.favorite ? "Retirer des favoris" : "Ajouter aux favoris"} ${beat.title}`}
                      onClick={() => {
                        void toggleFavorite(beat).catch((cause: unknown) =>
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : "Favori non enregistré.",
                          ),
                        );
                      }}
                    >
                      <Icon name="heart" filled={beat.favorite} />
                    </button>
                    <button
                      className={
                        layout === "horizontal"
                          ? "horizontal-cover"
                          : "beat-select"
                      }
                      aria-label={`${playingId === beat.id ? "Mettre en pause" : "Écouter"} ${beat.title}`}
                      onClick={() => togglePlayback(beat)}
                    >
                      <span className="card-cover">
                        <Artwork beat={beat} />
                        <span
                          className={`cover-play${playingId === beat.id ? " is-playing" : ""}`}
                          aria-hidden="true"
                        >
                          <Icon
                            name={playingId === beat.id ? "pause" : "play"}
                            filled
                          />
                        </span>
                        <span className="cover-duration">
                          {duration(beat.duration_seconds)}
                        </span>
                      </span>
                    </button>
                    <button
                      className={
                        layout === "horizontal"
                          ? "horizontal-details"
                          : "beat-card-info"
                      }
                      aria-label={`Détails de ${beat.title}`}
                      onClick={() => openDetails(beat.id)}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                          e.preventDefault();
                          e.currentTarget
                            .querySelector(".card-tags")
                            ?.scrollBy({
                              left: e.key === "ArrowRight" ? 48 : -48,
                            });
                        }
                      }}
                    >
                      <ScrollingTitle
                        className={
                          layout === "horizontal"
                            ? "horizontal-title"
                            : "large-title"
                        }
                        title={beat.title}
                      />
                      <span
                        className={
                          layout === "horizontal"
                            ? "horizontal-maker"
                            : "large-maker"
                        }
                        title={makerLabel(beat)}
                      >
                        <Avatar
                          profile={{
                            name: makerLabel(beat),
                            photo_url: beat.beatmakers?.[0]?.photo_url || null,
                          }}
                        />
                        {makerLabel(beat)}
                      </span>
                      <span className="card-tags">
                        {(
                          beat.tags ?? [
                            ...new Set([
                              ...(beat.styles || []),
                              ...(beat.moods || []),
                            ]),
                          ]
                        ).map((tag, i) => (
                          <span className="tag" key={i}>
                            {tag}
                          </span>
                        ))}
                        {!(
                          beat.tags ?? [
                            ...(beat.styles || []),
                            ...(beat.moods || []),
                          ]
                        ).length && (
                          <span className="empty-tags">Aucun tag</span>
                        )}
                      </span>
                    </button>
                  </article>
                ))}
              </div>
            )}
            {page && page.beats.length < page.total && (
              <button
                disabled={busy || loading}
                onClick={() => {
                  void more();
                }}
              >
                Afficher plus de prods
              </button>
            )}
          </div>
        </div>
        <div className="collection-toolbar">
          <p>
            <Icon name="folder" />
            {libraryName}
          </p>
        </div>
      </section>
      {shell.navImport &&
        createPortal(
          <>
            <h3>Ajouter une prod</h3>
            <ImportPanel
              onImported={refreshImported}
              onShowBeat={showImported}
              connected={connected}
            />
            <div className="import-or">ou</div>
            <button className="future-import" disabled>
              Importer un MP3 <small>Bientôt</small>
            </button>
          </>,
          shell.navImport,
        )}
      {shell.navTools &&
        createPortal(
          <button
            disabled={busy || !connected}
            aria-busy={busy}
            aria-label="Actualiser"
            onClick={() => {
              void scan();
            }}
          >
            <Icon name="refresh" />
            <span>Actualiser</span>
          </button>,
          shell.navTools,
        )}
      {view === "beatmakers" && (
        <section className="library-center beatmakers-center">
          {connected ? (
            <BeatmakersPage
              revision={producerRevision + reload}
              onOpen={openProducer}
              onUnassigned={() => {
                setQuery("");
                setFilters(emptyFilters);
                setFavoritesOnly(false);
                setProfileFilter(null);
                setUnassigned(true);
                filtersChanged();
                onView("prods");
              }}
            />
          ) : (
            <EngineOffline retry={onRetry} diagnostic={onDiagnostic} />
          )}
        </section>
      )}
      {producer && (
        <ProducerProfile
          key={producer}
          identity={producer}
          revision={producerRevision + reload}
          onClose={closeProducer}
          onChanged={() => {
            setProducerRevision((n) => n + 1);
            setReload((n) => n + 1);
          }}
          onBeat={(b) => {
            if (detailsRef.current && detailsRef.current !== b.id) {
              openDetails(b.id);
            } else openDetails(b.id);
          }}
          onViewBeats={(p: Producer) => {
            setQuery("");
            setFilters(emptyFilters);
            setFavoritesOnly(false);
            setUnassigned(false);
            setProfileFilter({ id: p.id, name: p.name });
            filtersChanged();
            onView("prods");
          }}
          onPlay={togglePlayback}
          playingId={playingId}
        />
      )}
      {details && (
        <BeatDetailsPanel
          key={details}
          identity={details}
          navigationRef={detailNavigation}
          profileRevision={producerRevision}
          onOpenProfile={openProducer}
          onProfilesChanged={() => {
            setProducerRevision((n) => n + 1);
            setReload((n) => n + 1);
          }}
          onCancelNavigation={() => {
            pendingAction.current = null;
          }}
          onDirtyChange={(dirty) => {
            dirtyDetails.current = dirty;
          }}
          playing={playingId === details}
          playbackError={
            playbackError?.id === details ? playbackError.message : ""
          }
          onDismissPlaybackError={() => setPlaybackError(null)}
          onTogglePlayback={togglePlayback}
          onClose={closeDetails}
          onFavorite={toggleFavorite}
          onChanged={() => {
            setReload((value) => value + 1);
          }}
        />
      )}
      {!details && (
        <aside
          className={`detail-sidebar${shell.right ? " expanded" : ""}`}
          aria-label="Volet de la prod"
        >
          <nav className="detail-rail">
            <button
              className="icon-button pane-toggle"
              aria-label={shell.right ? "Replier la fiche" : "Ouvrir la fiche"}
              aria-expanded={shell.right}
              onClick={() => shell.setRight(!shell.right)}
            >
              <PaneIcon side="right" open={shell.right} />
            </button>
          </nav>
          {shell.right && (
            <div className="no-selection">
              <Icon name="info" />
              <p>Aucune prod sélectionnée</p>
            </div>
          )}
        </aside>
      )}
      {selection &&
        activeBeat &&
        createPortal(
          <Player
            failed={playbackError?.id === activeBeat?.id}
            onLevel={(volume, muted) => {
              if (audio.current) {
                audio.current.volume = volume;
                audio.current.muted = muted;
              }
            }}
            onSeek={(seconds) => {
              if (audio.current) audio.current.currentTime = seconds;
            }}
            beat={activeBeat}
            audio={audio}
            playing={playingId === activeBeat.id}
            onToggle={() => togglePlayback(activeBeat)}
            onDetails={() => openDetails(activeBeat.id)}
            previous={
              page && page.beats.findIndex((b) => b.id === activeBeat.id) > 0
                ? () =>
                    togglePlayback(
                      page.beats[
                        page.beats.findIndex((b) => b.id === activeBeat.id) - 1
                      ],
                    )
                : undefined
            }
            next={
              page &&
              page.beats.findIndex((b) => b.id === activeBeat.id) >= 0 &&
              page.beats.findIndex((b) => b.id === activeBeat.id) <
                page.beats.length - 1
                ? () =>
                    togglePlayback(
                      page.beats[
                        page.beats.findIndex((b) => b.id === activeBeat.id) + 1
                      ],
                    )
                : undefined
            }
          >
            <audio
              key={selection.beat.id}
              ref={audio}
              src={selection.beat.audio_url}
              preload="metadata"
              aria-label={`Lecteur : ${selection.beat.title}`}
              onVolumeChange={(event) => {
                if (audio.current === event.currentTarget) {
                  audioPreferences.current = {
                    volume: event.currentTarget.volume,
                    muted: event.currentTarget.muted,
                  };
                  try {
                    localStorage.setItem(
                      "beat-m-audio",
                      JSON.stringify(audioPreferences.current),
                    );
                  } catch {
                    /* Optional preference. */
                  }
                }
              }}
              onPlay={(event) => {
                if (audio.current === event.currentTarget) {
                  setPlayingId(selection.beat.id);
                  setPlaybackError(null);
                }
              }}
              onPause={(event) => {
                if (audio.current === event.currentTarget) setPlayingId(null);
              }}
              onEnded={(event) => {
                if (audio.current === event.currentTarget) setPlayingId(null);
              }}
              onError={(event) => {
                if (audio.current === event.currentTarget) {
                  setPlayingId(null);
                  setPlaybackError({
                    id: selection.beat.id,
                    message: unavailableAudio,
                  });
                }
              }}
            />
          </Player>,
          document.body,
        )}
      {!selection &&
        createPortal(
          <Player
            onLevel={(volume, muted) => {
              if (audio.current) {
                audio.current.volume = volume;
                audio.current.muted = muted;
              }
            }}
            onSeek={(seconds) => {
              if (audio.current) audio.current.currentTime = seconds;
            }}
            beat={null}
            audio={audio}
            playing={false}
            onToggle={() => {}}
            onDetails={() => {}}
          >
            <audio ref={audio} aria-label="Lecteur sans prod sélectionnée" />
          </Player>,
          document.body,
        )}
    </div>
  );
}

function EngineOffline({
  retry,
  diagnostic,
}: {
  retry: () => void;
  diagnostic: () => void;
}) {
  return (
    <div className="empty-state engine-offline" role="status">
      <Icon name="diagnostic" />
      <h3>Le moteur local ne répond pas</h3>
      <p>Relance Beat m, puis réessaie. Tes fichiers restent sur ton disque.</p>
      <div className="empty-actions">
        <button className="primary" onClick={retry}>
          Réessayer
        </button>
        <button onClick={diagnostic}>Ouvrir le diagnostic</button>
      </div>
    </div>
  );
}
