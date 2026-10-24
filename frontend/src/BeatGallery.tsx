import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from './api'
import './BeatGallery.css'
import { ImportPanel } from './ImportPanel'
import { BeatDetailsPanel } from './BeatDetailsPanel'
import { duration } from './beat'
import type { Beat } from './beat'
type BeatPage = { beats: Beat[]; total: number }
type Selection = { beat: Beat; play: boolean }
type Scan = { added: number; skipped: number; errors: { name: string; message: string }[]; library: { beat_count: number } }

function Artwork({ beat }: { beat: Beat }) {
  const [failed, setFailed] = useState(false)
  return <div className="beat-artwork">
    {beat.artwork_url && !failed
      ? <img src={beat.artwork_url} alt={`Pochette de ${beat.title}`} loading="lazy" onError={() => setFailed(true)} />
      : <><span className="cover-note" aria-hidden="true">♫</span><span className="cover-label">AUDIO LOCAL</span></>}
  </div>
}

export function BeatGallery({ onIndexed }: { onIndexed: (count: number) => void }) {
  const [page, setPage] = useState<BeatPage | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [details, setDetails] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [favoriteBusy, setFavoriteBusy] = useState(new Set<string>())
  const audio = useRef<HTMLAudioElement>(null)
  const catalogQuery = new URLSearchParams({ q: query, favorites: String(favoritesOnly) }).toString()

  const refreshImported = useCallback(async () => {
    const [result, status] = await Promise.all([
      api<BeatPage>(`/api/beats?${catalogQuery}`),
      api<{ library: { beat_count: number } | null }>('/api/library'),
    ])
    setPage(result)
    setSelection((current) => current || (result.beats[0] ? { beat: result.beats[0], play: false } : null))
    if (status.library) onIndexed(status.library.beat_count)
  }, [onIndexed, catalogQuery])

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => { void api<BeatPage>(`/api/beats?${catalogQuery}`, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return
        setPage(result)
        setSelection((current) => current || (result.beats[0] ? { beat: result.beats[0], play: false } : null))
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Catalogue indisponible.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 180)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [catalogQuery, reload])

  useEffect(() => {
    if (selection?.play) {
      void audio.current?.play().catch(() => setError('La lecture n’a pas pu démarrer. Utilise le bouton du lecteur.'))
    }
  }, [selection])

  async function scan() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await api<Scan>('/api/library/scan', { method: 'POST' })
      await refreshImported()
      setNotice(`${result.added} ajouté(s) · ${result.skipped} déjà présent(s).${result.errors.length ? ` ${result.errors.length} fichier(s) illisible(s) : ${result.errors.map((item) => item.name).join(', ')}.` : ''}`)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Indexage impossible.')
    } finally { setBusy(false) }
  }

  async function more() {
    if (!page) return
    setBusy(true)
    setError('')
    try {
      const next = await api<BeatPage>(`/api/beats?${catalogQuery}&offset=${page.beats.length}`)
      setPage((current) => current === page ? { beats: [...page.beats, ...next.beats], total: next.total } : current)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Chargement impossible.')
    } finally { setBusy(false) }
  }

  async function toggleFavorite(beat: Beat) {
    setFavoriteBusy((current) => new Set(current).add(beat.id))
    try {
      const result = await api<{ favorite: boolean }>(`/api/beats/${beat.id}/favorite`, { method: 'PATCH', body: JSON.stringify({ favorite: !beat.favorite }) })
      setPage((current) => current ? {
        beats: favoritesOnly && !result.favorite ? current.beats.filter((item) => item.id !== beat.id) : current.beats.map((item) => item.id === beat.id ? { ...item, favorite: result.favorite } : item),
        total: current.total - (favoritesOnly && !result.favorite && current.beats.some((item) => item.id === beat.id) ? 1 : 0),
      } : current)
      return result.favorite
    } finally { setFavoriteBusy((current) => { const next = new Set(current); next.delete(beat.id); return next }) }
  }

  function filtersChanged() { setLoading(true); setError('') }

  return <div className="beat-collection">
    <ImportPanel onImported={refreshImported} onShowBeat={setDetails} />
    <div className="catalog-filters">
      <label><span className="sr-only">Rechercher une prod</span><input type="search" value={query} placeholder="Titre, beatmaker ou chaîne…" onChange={(event) => { filtersChanged(); setQuery(event.target.value) }} /></label>
      <button aria-pressed={favoritesOnly} onClick={() => { filtersChanged(); setFavoritesOnly((value) => !value) }}>♥ Favoris uniquement</button>
      {(query || favoritesOnly) && <button onClick={() => { filtersChanged(); setQuery(''); setFavoritesOnly(false) }}>Effacer les filtres</button>}
    </div>
    <div className="collection-toolbar">
      <p>Les MP3 de ton dossier <strong>audio</strong>, à portée d’écoute.</p>
      <button disabled={busy} onClick={() => { void scan() }}>{busy ? 'Un instant…' : 'Actualiser les fichiers'}</button>
    </div>
    {error && <p className="library-error" role="alert">{error}</p>}
    {notice && <p className="scan-notice" role="status">{notice}</p>}
    {loading && <div className="loading-grid" role="status" aria-label="Chargement des prods"><span /><span /><span /></div>}
    {!loading && !page && error && <button onClick={() => { setError(''); setLoading(true); setReload((value) => value + 1) }}>Réessayer</button>}
    {!loading && page?.total === 0 && <div className="empty-state">
      <span className="empty-mark" aria-hidden="true">♫</span>
      <h3>{query || favoritesOnly ? 'Aucune prod ne correspond à ces filtres.' : 'Une place pour tes premières prods.'}</h3>
      <p>{query || favoritesOnly ? 'Essaie une autre recherche ou efface les filtres.' : 'Colle un lien YouTube ou dépose un MP3 dans le dossier audio.'}</p>
    </div>}
    {!loading && <div className="beat-grid">{page?.beats.map((beat) => <article className={`beat-card${selection?.beat.id === beat.id ? ' selected' : ''}`} key={beat.id}>
      <button className="beat-favorite" disabled={favoriteBusy.has(beat.id)} aria-pressed={beat.favorite} aria-label={`${beat.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} ${beat.title}`} onClick={() => { void toggleFavorite(beat).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Favori non enregistré.')) }}>{beat.favorite ? '♥' : '♡'}</button>
      <button className="beat-select" aria-label={`Écouter ${beat.title}`} onClick={() => { setError(''); setSelection({ beat, play: true }) }}>
        <Artwork beat={beat} />
        <span className="beat-card-info"><span className="beat-title">{beat.title}</span><span className="beat-subtitle">{beat.beatmaker || (beat.channel ? `Chaîne : ${beat.channel}` : 'Fichier local')}<span>{duration(beat.duration_seconds)}</span></span></span>
        <span className="listen-label">▶ Écouter</span>
      </button>
      <button className="beat-details-button" aria-label={`Détails de ${beat.title}`} onClick={() => setDetails(beat.id)}>Détails ↗</button>
    </article>)}</div>}
    {!loading && page && page.beats.length < page.total && <button disabled={busy} onClick={() => { void more() }}>Afficher plus de prods</button>}
    {details && <BeatDetailsPanel key={details} identity={details} onClose={() => setDetails(null)} onFavorite={toggleFavorite} />}
    {selection && createPortal(<aside className="local-player glass" aria-label="Lecteur audio">
      <div className="player-description"><span className="player-note" aria-hidden="true">♫</span><div><p>{selection.beat.title}</p><span>{selection.beat.beatmaker || 'Audio local'} · {duration(selection.beat.duration_seconds)}</span></div></div>
      <audio key={selection.beat.id} ref={audio} src={selection.beat.audio_url} controls preload="metadata" aria-label={`Lecteur : ${selection.beat.title}`} onError={() => setError('Fichier audio indisponible ou illisible. Vérifie le disque.')} />
    </aside>, document.body)}
  </div>
}
