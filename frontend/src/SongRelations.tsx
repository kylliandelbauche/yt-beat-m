import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Beat } from "./beat";
import { Artwork } from "./Artwork";
import { Icon, Modal } from "./Modal";
import type { ModalClose } from "./useModalLifecycle";
import type { Song, SongPage } from "./song";
import { songTrack } from "./song";

export function ProdPicker({
  onClose,
  onSelect,
  selected,
}: {
  onClose: () => void;
  onSelect: (beat: Beat | null) => void;
  selected: string | null;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState<{ beats: Beat[]; total: number } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const close = useRef<ModalClose | null>(null);
  const choice = useRef<Beat | null | undefined>(undefined);
  const latestQuery = useRef(q);
  useLayoutEffect(() => {
    latestQuery.current = q;
  }, [q]);
  useEffect(() => {
    const c = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true);
      api<{ beats: Beat[]; total: number }>(
        `/api/beats?limit=40&q=${encodeURIComponent(q)}`,
        { signal: c.signal },
      )
        .then((p) => {
          if (!c.signal.aborted) {
            setPage(p);
            setError("");
          }
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!c.signal.aborted) setBusy(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [q, retry]);
  function choose(beat: Beat | null) {
    choice.current = beat;
    close.current?.(true);
  }
  async function more() {
    if (!page || busy) return;
    const query = q;
    setBusy(true);
    try {
      const next = await api<{ beats: Beat[]; total: number }>(
        `/api/beats?limit=40&offset=${page.beats.length}&q=${encodeURIComponent(query)}`,
      );
      if (latestQuery.current === query)
        setPage(
          (p) => p && { beats: [...p.beats, ...next.beats], total: next.total },
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      label="Choisir une prod"
      title="Prod associée"
      closeLabel="Fermer le choix de prod"
      closeRef={close}
      onClose={() => {
        onClose();
        if (choice.current !== undefined) onSelect(choice.current);
      }}
      className="song-relation-modal"
    >
      <label className="catalog-search">
        <Icon name="search" />
        <input
          aria-label="Rechercher une prod à associer"
          placeholder="Rechercher une prod…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(null);
          }}
        />
      </label>
      <div className="relation-feedback" role={error ? "alert" : "status"}>
        {error ? (
          <>
            {error}{" "}
            <button onClick={() => setRetry((n) => n + 1)}>Réessayer</button>
          </>
        ) : busy ? (
          "Recherche…"
        ) : (
          ""
        )}
      </div>
      <div className="relation-list" aria-busy={busy}>
        <button
          className="relation-row"
          onClick={() => choose(null)}
          aria-pressed={!selected}
        >
          <Icon name="close" />
          <span>Aucune prod</span>
        </button>
        {page?.beats.map((beat) => (
          <button
            key={beat.id}
            className="relation-row"
            onClick={() => choose(beat)}
            aria-pressed={beat.id === selected}
          >
            <Artwork beat={beat} />
            <span>{beat.title}</span>
            {beat.id === selected && <Icon name="check" />}
          </button>
        ))}
        {page?.total === 0 && <p>Aucune prod ne correspond.</p>}
        {page && page.beats.length < page.total && (
          <button disabled={busy} onClick={() => void more()}>
            Afficher plus de prods
          </button>
        )}
      </div>
    </Modal>
  );
}

export function LinkedSongs({
  beatId,
  onClose,
  onOpen,
}: {
  beatId: string;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const [page, setPage] = useState<SongPage | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const close = useRef<ModalClose | null>(null);
  const choice = useRef<string | null>(null);
  useEffect(() => {
    const c = new AbortController();
    api<SongPage>(`/api/beats/${beatId}/songs`, { signal: c.signal })
      .then((p) => {
        setPage(p);
        setError("");
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [beatId, retry]);
  async function more() {
    if (!page || busy) return;
    setBusy(true);
    try {
      const p = await api<SongPage>(
        `/api/beats/${beatId}/songs?offset=${page.songs.length}`,
      );
      setPage(
        (current) =>
          current && { songs: [...current.songs, ...p.songs], total: p.total },
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      label="Sons liés à cette prod"
      title="Sons liés"
      closeLabel="Fermer les sons liés"
      closeRef={close}
      onClose={() => {
        onClose();
        if (choice.current) onOpen(choice.current);
      }}
      className="song-relation-modal"
    >
      <div className="relation-feedback" role={error ? "alert" : "status"}>
        {error ? (
          <>
            {error}{" "}
            <button onClick={() => setRetry((n) => n + 1)}>Réessayer</button>
          </>
        ) : !page ? (
          "Chargement…"
        ) : (
          `${page.total} son(s)`
        )}
      </div>
      <div className="relation-list">
        {page?.songs.map((song: Song) => (
          <button
            key={song.id}
            className="relation-row"
            onClick={() => {
              choice.current = song.id;
              close.current?.(true);
            }}
          >
            <Artwork beat={songTrack(song)} />
            <span>
              {song.title}
              <small>{song.state}</small>
            </span>
            <Icon name="link" />
          </button>
        ))}
        {page?.total === 0 && (
          <p>Aucun son lié. Choisis cette prod depuis la fiche d’un son.</p>
        )}
        {page && page.songs.length < page.total && (
          <button disabled={busy} onClick={() => void more()}>
            Afficher plus de sons
          </button>
        )}
      </div>
    </Modal>
  );
}
